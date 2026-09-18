/**
 * respondToOffer — applicant-initiated callable for the three-way
 * handshake after staff has accepted the application: accept the
 * offered spot, decline it, or defer to the next cycle.
 *
 * Why a server callable instead of a direct Firestore write. The
 * applicant is the only party who can flip this field, but they have
 * no other write-access to a status='accepted' application doc (the
 * Firestore rule lets staff/admin write the review fields; the
 * applicant's own write paths are gated on status='draft' /
 * 'submitted'). Adding a fourth rule path just for this confirmation
 * would be load-bearing security surface for a single enum. Routing
 * through admin SDK avoids that, and gives us a natural hook for
 * future side-effects (notify staff, fire next-cycle reminder,
 * analytics) without revisiting the rule layer.
 *
 * Changes are allowed. An applicant who accepts then realises they
 * can't make it can flip to 'declined' or 'deferred' without
 * emailing staff to undo the previous response — the latest write
 * wins. Staff's queue surface reflects the current state in real
 * time via the existing watcher pattern, so a flip from accepted
 * back to deferred shows up before the next refresh.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { FieldValue, Firestore, getFirestore } from 'firebase-admin/firestore'
import { sendMailgun, spotReOfferedEmail } from './emailTemplates'

const MAILGUN_API_KEY = defineSecret('MAILGUN_API_KEY')
const MAILGUN_DOMAIN = defineSecret('MAILGUN_DOMAIN')

function programLabel(program: string): string {
  if (program === 'stepup_scholars') return 'StepUp Scholars'
  if (program === 'dynamerge') return 'Dynamerge'
  return 'STAIJA'
}

type SpotResponse = 'accepted' | 'declined' | 'deferred'

interface RespondInput {
  applicationId: string
  response: SpotResponse
  /** Optional free-text reason the applicant leaves when declining
   *  or deferring. Capped at 1000 chars server-side so a runaway
   *  paste can't bloat the doc. Blank for accept. */
  note?: string
}

interface RespondResult {
  ok: true
  response: SpotResponse
  /** Ms epoch the server wrote — handy for the client to display
   *  without a roundtrip back to Firestore. */
  spotRespondedAt: number
}

const VALID_RESPONSES: ReadonlySet<SpotResponse> = new Set(['accepted', 'declined', 'deferred'])
const MAX_NOTE_LENGTH = 1000

export const respondToOffer = onCall<RespondInput>(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    enforceAppCheck: true,
  },
  async (req): Promise<RespondResult> => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.')
    }
    const input = req.data ?? ({} as RespondInput)
    if (!input.applicationId || typeof input.applicationId !== 'string') {
      throw new HttpsError('invalid-argument', 'applicationId required.')
    }
    if (!VALID_RESPONSES.has(input.response)) {
      throw new HttpsError(
        'invalid-argument',
        `response must be one of: ${Array.from(VALID_RESPONSES).join(', ')}.`,
      )
    }
    const trimmedNote =
      typeof input.note === 'string' ? input.note.trim().slice(0, MAX_NOTE_LENGTH) : ''

    const db = getFirestore()
    const ref = db.collection('applications').doc(input.applicationId)
    const snap = await ref.get()
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Application not found.')
    }
    const data = snap.data() as { userId?: string; status?: string; program?: string }
    if (data.userId !== req.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        "You can only respond to your own application's offer.",
      )
    }
    if (data.status !== 'accepted') {
      throw new HttpsError(
        'failed-precondition',
        'Only accepted applications can be responded to.',
      )
    }

    const spotRespondedAt = Date.now()
    // Build the patch explicitly so we control which fields land —
    // an empty note shouldn't clobber a previously-stored one (a
    // declining applicant who first hit decline with a note, then
    // accidentally re-fired accept without a note, would otherwise
    // lose the declining context). Skip the note field when blank.
    const patch: Record<string, string | number | boolean | Date | FieldValue | null> = {
      spotResponse: input.response,
      spotRespondedAt,
      updatedAt: new Date(),
    }
    if (trimmedNote) {
      patch.spotResponseNote = trimmedNote
    } else if (input.response === 'accepted') {
      // Accept is one-click — clear any stale note from a previous
      // decline / defer so the staff queue doesn't show a misleading
      // "they had a reason last time" note next to a fresh accept.
      patch.spotResponseNote = FieldValue.delete()
    }

    await ref.update(patch)

    // Decline rollback. If staff had already enrolled the applicant
    // (which the new enrollStudent guards prevent for fresh enrolls,
    // but the rule layer still lets through for admins overriding,
    // and pre-existing enrollments from before the guard shipped are
    // out there), unwind the enrollment so the LMS doesn't keep
    // serving course content to someone who said no.
    //
    // Scope:
    //   - Only enrollments whose cohort.program matches the declined
    //     application's program get withdrawn. A student in *another*
    //     program's cohort isn't affected by this decline.
    //   - Role flips back to 'applicant' only when no other active
    //     enrollments remain. A multi-program student keeps role='student'.
    //
    // Best-effort: errors are logged, not thrown. The applicant's
    // decline already landed (the patch above committed) — failing
    // the call would leave the user thinking the decline didn't go
    // through. The state we care about (UI + permission gate) is
    // role + enrollment.status; both can be re-reconciled by an
    // admin script if this branch errors out.
    if (input.response === 'declined' && data.program) {
      try {
        await withdrawEnrollmentsForProgram({
          db,
          studentId: req.auth.uid,
          program: data.program,
        })
      } catch (err) {
        console.error(
          '[respondToOffer] decline-rollback failed',
          err instanceof Error ? err.message : String(err),
          { applicationId: input.applicationId, program: data.program },
        )
      }
    }

    return { ok: true, response: input.response, spotRespondedAt }
  },
)

/**
 * Withdraw every active enrollment the student holds in cohorts of
 * the given program, mirror the change on mentor_assignments, then
 * revert the user's role to 'applicant' if no active enrollments
 * remain in any program.
 *
 * Pulled out of respondToOffer so the same path can be reused if we
 * ever add a staff-side "withdraw this student" admin action.
 *
 * Idempotent — running it twice on a clean state is a no-op (no
 * active enrollments → nothing to flip; role already 'applicant' →
 * skipped).
 */
async function withdrawEnrollmentsForProgram(opts: {
  db: Firestore
  studentId: string
  program: string
}): Promise<void> {
  const { db, studentId, program } = opts
  const enrollSnap = await db
    .collection('enrollments')
    .where('studentId', '==', studentId)
    .where('program', '==', program)
    .where('status', '==', 'active')
    .get()

  const now = new Date()
  for (const doc of enrollSnap.docs) {
    await doc.ref.update({
      status: 'withdrawn',
      withdrawnAt: now,
      withdrawnReason: 'applicant_declined',
      updatedAt: now,
    })
    // Mirror onto mentor_assignments so the mentor's "your students"
    // list stops showing this row.
    const assignmentRef = db.collection('mentor_assignments').doc(doc.id)
    const assignmentSnap = await assignmentRef.get()
    if (assignmentSnap.exists) {
      await assignmentRef.update({
        status: 'ended',
        endedAt: now,
        notes: 'Auto-withdrawn: applicant declined the offer.',
      })
    }
  }

  // Revert role only if zero active enrollments remain across all
  // programs. A student enrolled in both StepUp and Dynamerge who
  // declines just one keeps role='student'.
  const remainingSnap = await db
    .collection('enrollments')
    .where('studentId', '==', studentId)
    .where('status', '==', 'active')
    .limit(1)
    .get()
  if (!remainingSnap.empty) return

  const userRef = db.collection('users').doc(studentId)
  const userSnap = await userRef.get()
  if (!userSnap.exists) return
  const role = (userSnap.data() as { role?: string }).role
  if (role !== 'student') return
  await userRef.update({
    role: 'applicant',
    updatedAt: now,
  })
}

/**
 * reOfferToDeferredApplicant — staff-initiated reset of a deferred
 * response so the applicant gets a fresh accept/decline/defer
 * handshake. Used when the new cycle opens and staff is converting
 * the deferred queue back into a live offer.
 *
 * Clears spotResponse / spotRespondedAt / spotResponseNote on the
 * application. On the applicant's next visit to their Status page,
 * the three CTAs render again because spotResponse is undefined —
 * same code path as a freshly-accepted application that hasn't
 * been responded to yet.
 *
 * Does NOT send an email here — that's a separate concern. Staff
 * usually pairs this action with a manual "we're opening the new
 * cycle, here's your spot" outreach. A "your spot is open again"
 * automated email would be a sensible Phase 2 if the workflow ever
 * runs without manual outreach.
 *
 * Constrained to deferred responses only — re-offering a declined
 * applicant would override their explicit "no thanks", and
 * re-offering an accepted applicant is meaningless. Both cases
 * throw a precondition error.
 */
interface ReOfferInput {
  applicationId: string
}

interface ReOfferResult {
  ok: true
  /** Whether the response was actually cleared. False if the
   *  application had no spotResponse to begin with — idempotent
   *  re-fires are no-ops. */
  changed: boolean
}

async function callerRole(uid: string): Promise<string | null> {
  const snap = await getFirestore().collection('users').doc(uid).get()
  return (snap.data()?.role as string | undefined) ?? null
}

export const reOfferToDeferredApplicant = onCall<ReOfferInput>(
  {
    secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN],
    memory: '256MiB',
    timeoutSeconds: 30,
    enforceAppCheck: true,
  },
  async (req): Promise<ReOfferResult> => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.')
    }
    const role = await callerRole(req.auth.uid)
    if (role !== 'staff' && role !== 'admin') {
      throw new HttpsError('permission-denied', 'Staff or admin role required.')
    }

    const { applicationId } = req.data ?? ({} as ReOfferInput)
    if (!applicationId || typeof applicationId !== 'string') {
      throw new HttpsError('invalid-argument', 'applicationId required.')
    }

    const db = getFirestore()
    const ref = db.collection('applications').doc(applicationId)
    const snap = await ref.get()
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Application not found.')
    }
    const data = snap.data() as {
      status?: string
      spotResponse?: string
      program?: string
      userId?: string
      personalInfo?: { firstName?: string; email?: string }
    }
    if (data.status !== 'accepted') {
      throw new HttpsError(
        'failed-precondition',
        'Re-offer only applies to accepted applications.',
      )
    }
    // Idempotent — if there's nothing to clear, exit clean. No email
    // fires in this branch either; the applicant already received
    // the original acceptance email.
    if (!data.spotResponse) {
      return { ok: true, changed: false }
    }
    // Restrict to deferred. Re-opening a decline overrides the
    // applicant's explicit "no thanks"; re-opening an accept is
    // meaningless. Staff has the admin User Management surface if
    // they genuinely need to force one of those flows.
    if (data.spotResponse !== 'deferred') {
      throw new HttpsError(
        'failed-precondition',
        `Re-offer only applies to deferred applicants. This one is ${data.spotResponse}.`,
      )
    }

    await ref.update({
      spotResponse: FieldValue.delete(),
      spotRespondedAt: FieldValue.delete(),
      spotResponseNote: FieldValue.delete(),
      updatedAt: new Date(),
    })

    // Fire the "your spot is open again" email. Best-effort — a
    // Mailgun outage shouldn't fail the re-offer call (the state
    // change already happened, the applicant will discover the
    // open offer next time they visit the dashboard). Recipient
    // address falls back to the user-doc email if personalInfo
    // wasn't populated for some legacy reason.
    try {
      let to = data.personalInfo?.email
      if (!to && data.userId) {
        const userSnap = await db.collection('users').doc(data.userId).get()
        to = (userSnap.data()?.email as string | undefined) ?? undefined
      }
      if (to) {
        const firstName = data.personalInfo?.firstName?.trim() || 'there'
        const { html, text } = spotReOfferedEmail({
          firstName,
          programLabel: programLabel(data.program ?? ''),
          applicationId,
        })
        await sendMailgun({
          apiKey: MAILGUN_API_KEY.value(),
          domain: MAILGUN_DOMAIN.value(),
          to,
          subject: `Your ${programLabel(data.program ?? '')} spot is open again`,
          text,
          html,
        })
      } else {
        console.warn(
          `[reOfferToDeferredApplicant] no email on file for application ${applicationId}; state changed but no email sent`,
        )
      }
    } catch (err) {
      console.error('[reOfferToDeferredApplicant] email send failed', err)
    }

    return { ok: true, changed: true }
  },
)
