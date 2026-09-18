/**
 * sendInterestSegmentEmail — admin/staff callable that fans out an
 * email to /stay-connected subscribers segmented by `interestTag`.
 *
 * Powers the drip surface attached to the augmented newsletter:
 *
 *   - `next-cycle-opened`  → nextCycleOpenedEmail to `stepup-next` /
 *                            `dynamerge-next` subscribers
 *   - `mentor-intro`       → mentorIntroEmail to `mentor` subscribers
 *   - `notify-me-welcome`  → notifyMeWelcomeEmail (used for any tag
 *                            when sending a fresh welcome / re-orient)
 *
 * Pagination: Mailgun's mailing-list members endpoint returns 1000
 * members per page. We page through, filter members whose
 * `vars.interestTag` matches the segment, and send individually so
 * the per-recipient subject + body stays personalized.
 *
 * Idempotency: not enforced. Re-running the same announcement re-sends.
 * The admin UI guards with a confirmation prompt and we log a one-line
 * audit entry to `announcements/{id}` for every send so a double-fire
 * is auditable.
 *
 * Secrets:
 *   - MAILGUN_API_KEY
 *   - MAILGUN_DOMAIN
 *   - MAILGUN_LIST_ADDRESS  (same mailing list used by subscribeNewsletter)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { sendMailgun } from './emailTemplates'
import {
  nextCycleOpenedEmail,
  mentorIntroEmail,
  notifyMeWelcomeEmail,
  type InterestTag,
  type RenderedEmail,
} from './newsletterTemplates'

const MAILGUN_API_KEY = defineSecret('MAILGUN_API_KEY')
const MAILGUN_DOMAIN = defineSecret('MAILGUN_DOMAIN')
const MAILGUN_LIST_ADDRESS = defineSecret('MAILGUN_LIST_ADDRESS')

const ALLOWED_TAGS = new Set<InterestTag>([
  'stepup-next',
  'dynamerge-next',
  'mentor',
  'general',
])

type TemplateName = 'next-cycle-opened' | 'mentor-intro' | 'notify-me-welcome'
const ALLOWED_TEMPLATES = new Set<TemplateName>([
  'next-cycle-opened',
  'mentor-intro',
  'notify-me-welcome',
])

interface NextCycleOpenedContext {
  programLabel: string
  applyUrl: string
  applicationEnd?: string
}

interface MentorIntroContext {
  inviteUrl?: string
}

interface RequestPayload {
  interestTag?: InterestTag | string
  templateName?: TemplateName | string
  /** Optional subject override. When absent the template's built-in
   *  subject is used — preferred, since the template author tunes the
   *  subject line alongside the body. */
  subjectOverride?: string
  context?:
    | NextCycleOpenedContext
    | MentorIntroContext
    | Record<string, string | number | boolean | null | undefined>
  /** When true, build everything and return the projected recipient
   *  count without actually sending. Used by the admin UI's "Preview"
   *  button to surface the audience size before the irreversible
   *  send. */
  dryRun?: boolean
}

interface MailgunListMember {
  address: string
  subscribed: boolean
  vars?: Record<string, string | number | boolean | null | undefined>
}

interface MailgunMembersPage {
  items: MailgunListMember[]
  paging?: { next?: string; first?: string; last?: string; previous?: string }
}

async function fetchListMembers(opts: {
  apiKey: string
  listAddress: string
}): Promise<MailgunListMember[]> {
  const auth = Buffer.from(`api:${opts.apiKey}`).toString('base64')
  const baseUrl = `https://api.mailgun.net/v3/lists/${encodeURIComponent(opts.listAddress)}/members/pages?limit=1000&subscribed=yes`

  const all: MailgunListMember[] = []
  let next: string | null = baseUrl
  while (next) {
    const res = await fetch(next, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
    })
    if (!res.ok) {
      const detail = await res.text()
      throw new Error(`Mailgun list page ${res.status}: ${detail}`)
    }
    const page = (await res.json()) as MailgunMembersPage
    for (const member of page.items ?? []) {
      if (member.subscribed) all.push(member)
    }
    // Mailgun's `paging.next` keeps pointing at the same URL once
    // we're past the end — exit when the cursor stops moving. The
    // earlier "items.length < limit" heuristic exited one page too
    // early when the list size was an exact multiple of the limit.
    const nextUrl = page.paging?.next
    if (!nextUrl || nextUrl === next) {
      next = null
    } else {
      next = nextUrl
    }
  }
  return all
}

function buildEmail(opts: {
  templateName: TemplateName
  interestTag: InterestTag
  context: RequestPayload['context']
}): RenderedEmail {
  if (opts.templateName === 'next-cycle-opened') {
    const ctx = (opts.context ?? {}) as Partial<NextCycleOpenedContext>
    if (!ctx.programLabel || !ctx.applyUrl) {
      throw new HttpsError(
        'invalid-argument',
        'next-cycle-opened requires programLabel and applyUrl.',
      )
    }
    return nextCycleOpenedEmail({
      programLabel: ctx.programLabel,
      applyUrl: ctx.applyUrl,
      applicationEnd: ctx.applicationEnd,
    })
  }
  if (opts.templateName === 'mentor-intro') {
    const ctx = (opts.context ?? {}) as Partial<MentorIntroContext>
    return mentorIntroEmail({ inviteUrl: ctx.inviteUrl })
  }
  // notify-me-welcome
  return notifyMeWelcomeEmail({ interestTag: opts.interestTag })
}

export const sendInterestSegmentEmail = onCall<RequestPayload>(
  {
    secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_LIST_ADDRESS],
    memory: '512MiB',
    timeoutSeconds: 540,
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.')
    }
    const callerUid = request.auth.uid
    const db = getFirestore()
    const callerSnap = await db.collection('users').doc(callerUid).get()
    const callerRole = (callerSnap.data() as { role?: string } | undefined)?.role
    if (callerRole !== 'admin' && callerRole !== 'staff') {
      throw new HttpsError('permission-denied', 'Admin or staff role required.')
    }

    const { interestTag, templateName, subjectOverride, context, dryRun } = request.data

    if (typeof interestTag !== 'string' || !ALLOWED_TAGS.has(interestTag as InterestTag)) {
      throw new HttpsError(
        'invalid-argument',
        `interestTag must be one of: ${[...ALLOWED_TAGS].join(', ')}.`,
      )
    }
    if (typeof templateName !== 'string' || !ALLOWED_TEMPLATES.has(templateName as TemplateName)) {
      throw new HttpsError(
        'invalid-argument',
        `templateName must be one of: ${[...ALLOWED_TEMPLATES].join(', ')}.`,
      )
    }

    const tag = interestTag as InterestTag
    const tmpl = templateName as TemplateName

    const apiKey = MAILGUN_API_KEY.value()
    const domain = MAILGUN_DOMAIN.value()
    const listAddress = MAILGUN_LIST_ADDRESS.value()

    const members = await fetchListMembers({ apiKey, listAddress })
    const segment = members.filter((m) => {
      const t = m.vars?.interestTag
      return typeof t === 'string' && t === tag
    })

    // Build once when context is global (same for every recipient).
    // All current templates are recipient-independent — they don't
    // personalize on member email or vars — so we can compile a
    // single { html, text, subject } and send it across the segment.
    let rendered: RenderedEmail
    try {
      rendered = buildEmail({ templateName: tmpl, interestTag: tag, context })
    } catch (err) {
      if (err instanceof HttpsError) throw err
      throw new HttpsError(
        'invalid-argument',
        err instanceof Error ? err.message : 'Failed to render the announcement.',
      )
    }

    const finalSubject = subjectOverride?.trim() || rendered.subject

    // Dry-run: skip Mailgun sends entirely, just return audience size +
    // a preview of the resolved subject so admin can sanity-check.
    if (dryRun === true) {
      return {
        ok: true,
        segmentSize: segment.length,
        sent: 0,
        failed: 0,
        dryRun: true,
        subject: finalSubject,
      }
    }

    let sent = 0
    let failed = 0
    const failures: { to: string; error: string }[] = []

    for (const member of segment) {
      try {
        await sendMailgun({
          apiKey,
          domain,
          to: member.address,
          subject: finalSubject,
          text: rendered.text,
          html: rendered.html,
        })
        sent += 1
      } catch (err) {
        failed += 1
        const message = err instanceof Error ? err.message : String(err)
        // Cap the per-failure error log so a 1000-recipient blowup
        // doesn't bloat the audit doc.
        if (failures.length < 25) {
          failures.push({ to: member.address, error: message.slice(0, 200) })
        }
      }
    }

    // Audit log — single doc per announcement so admin can review
    // what was sent, by whom, when, and how it landed.
    try {
      await db.collection('announcements').add({
        interestTag: tag,
        templateName: tmpl,
        subject: finalSubject,
        subjectOverride: subjectOverride?.trim() || null,
        context: context ?? null,
        segmentSize: segment.length,
        sent,
        failed,
        failureSample: failures,
        sentBy: callerUid,
        sentAt: FieldValue.serverTimestamp(),
      })
    } catch (err) {
      console.warn(
        '[sendInterestSegmentEmail] audit write failed',
        err instanceof Error ? err.message : String(err),
      )
    }

    // Per-program "last announced" stamp so the admin UI can warn
    // before re-firing the same template at the same audience.
    // Stamped only when the interest tag maps to a specific program
    // (mentor/general are program-agnostic).
    const programSlug =
      tag === 'stepup-next' ? 'stepup-scholars' :
      tag === 'dynamerge-next' ? 'dynamerge' :
      null
    if (programSlug && sent > 0) {
      try {
        const programsSnap = await db
          .collection('programs')
          .where('slug', '==', programSlug)
          .limit(1)
          .get()
        const programDoc = programsSnap.docs[0]
        if (programDoc) {
          await programDoc.ref.set(
            {
              lastAnnouncedAt: {
                [tmpl]: FieldValue.serverTimestamp(),
              },
            },
            { merge: true },
          )
        }
      } catch (err) {
        console.warn(
          '[sendInterestSegmentEmail] lastAnnouncedAt write failed',
          err instanceof Error ? err.message : String(err),
          { programSlug, template: tmpl },
        )
      }
    }

    return {
      ok: true,
      segmentSize: segment.length,
      sent,
      failed,
      subject: finalSubject,
    }
  },
)
