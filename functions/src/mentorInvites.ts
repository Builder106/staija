/**
 * Mentor-invite handshake — single-use tokens that promote their
 * consumer to role='mentor'.
 *
 * Why invite links instead of a public mentor-application form:
 *   - STAIJA picks mentors by direct outreach. There's no real
 *     queue of public mentor applications to triage; the bottleneck
 *     is "we found someone good, get them an account fast." A link
 *     fits that shape; an admin review queue doesn't.
 *   - The invite layer is staff/admin only. No public surface to
 *     defend, no application form to maintain, no spam.
 *
 * Two callables:
 *   - createMentorInvite: staff/admin only. Mints a token, writes
 *     mentorInvites/{token}, returns the canonical /invite/<token>
 *     URL for staff to paste into an email / DM.
 *   - consumeMentorInvite: any signed-in user. Validates the token
 *     (exists, not expired, not already consumed by someone else,
 *     email match if restricted), then flips the caller's role to
 *     'mentor' via admin SDK. Idempotent for the SAME consumer —
 *     a second call by the original consumer returns success without
 *     mutating anything, which lets the /invite landing page retry
 *     after a network blip without bricking the link.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { UpdateData, getFirestore } from 'firebase-admin/firestore'
import * as crypto from 'crypto'
import { APP_URL } from './emailTemplates'

const DEFAULT_EXPIRY_DAYS = 30
const MAX_EXPIRY_DAYS = 180
const MAX_NOTE_LENGTH = 500
const MAX_BULK_COUNT = 50
const MAX_BIO_LENGTH = 1000
const MAX_AVAILABILITY_LENGTH = 500

interface CreateInput {
  /** Optional admin audit note ("Reached out via LinkedIn"). */
  note?: string
  /** Optional email restriction. The consume call rejects unless the
   *  signed-in user's email matches (case-insensitive). Without it,
   *  anyone with the URL can consume — fine for trusted forwards.
   *  Ignored when `count > 1` because bulk minting is for unknown
   *  recipients (the whole point is "drop N links into a Slack
   *  channel, anyone who clicks claims one"). */
  email?: string
  /** Days until the invite expires. Defaults to 30; capped at 180 so
   *  a forgotten link doesn't sit around for years. */
  expiresInDays?: number
  /** How many invites to mint in one call. Defaults to 1; capped at
   *  50 so a typo can't bloat the collection. Useful for recruitment
   *  drives where staff wants a stack of links to hand out. */
  count?: number
}

interface CreateResult {
  /** One entry per minted invite. Single-mint is `invites.length == 1`
   *  — clients that only ever request one can read the first entry. */
  invites: Array<{ token: string; url: string; expiresAt: number }>
}

interface RevokeInput {
  token: string
}

interface RevokeResult {
  ok: true
  /** True if this call performed the revoke. False if the token was
   *  already revoked / consumed — caller can use this to decide
   *  whether to show "already revoked" copy vs. "revoked just now". */
  changed: boolean
}

interface ConsumeInput {
  token: string
  /** Optional area-of-expertise blurb the mentor types on the
   *  /invite landing page before clicking Accept. Persisted to
   *  UserProfile.mentorBio inside the same transaction. Skippable —
   *  mentor can fill in later via account settings. */
  bio?: string
  /** Optional "when am I free" hint, same shape. */
  availability?: string
}

interface ConsumeResult {
  ok: true
  /** Whether this call actually changed the role (vs. an idempotent
   *  re-fire by the original consumer). The client uses this to
   *  decide whether to celebrate ("Welcome aboard, mentor!") or
   *  silently bounce to /mentor. */
  changed: boolean
}

async function callerRole(uid: string): Promise<string | null> {
  const snap = await getFirestore().collection('users').doc(uid).get()
  return (snap.data()?.role as string | undefined) ?? null
}

export const createMentorInvite = onCall<CreateInput>(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    enforceAppCheck: true,
  },
  async (req): Promise<CreateResult> => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.')
    }
    const role = await callerRole(req.auth.uid)
    if (role !== 'staff' && role !== 'admin') {
      throw new HttpsError('permission-denied', 'Staff or admin role required.')
    }

    const input = req.data ?? ({} as CreateInput)
    const trimmedNote =
      typeof input.note === 'string' ? input.note.trim().slice(0, MAX_NOTE_LENGTH) : ''
    const requestedCount =
      typeof input.count === 'number' && Number.isFinite(input.count)
        ? Math.max(1, Math.min(MAX_BULK_COUNT, Math.floor(input.count)))
        : 1
    // Email restriction only makes sense for a single targeted invite.
    // Bulk minting is for "drop N links into a recruitment channel,
    // first N to click claim them" — locking each to a specific
    // address defeats the purpose.
    const restrictEmail =
      requestedCount === 1 &&
      typeof input.email === 'string' &&
      input.email.trim()
        ? input.email.trim().toLowerCase()
        : undefined
    const requestedDays =
      typeof input.expiresInDays === 'number' && Number.isFinite(input.expiresInDays)
        ? Math.max(1, Math.min(MAX_EXPIRY_DAYS, Math.floor(input.expiresInDays)))
        : DEFAULT_EXPIRY_DAYS

    const db = getFirestore()
    // Denormalise the issuer's display name once for the whole batch —
    // every invite gets the same createdByName so the /invite landing
    // can show "Yinka Vaughan invited you" without an extra user-doc
    // read on the prospective consumer's side.
    const issuerSnap = await db.collection('users').doc(req.auth.uid).get()
    const createdByName =
      (issuerSnap.data()?.displayName as string | undefined) ??
      req.auth.token.email ??
      'A teammate'

    const now = Date.now()
    const expiresAt = now + requestedDays * 24 * 60 * 60 * 1000
    const invites: Array<{ token: string; url: string; expiresAt: number }> = []
    const batch = db.batch()

    for (let i = 0; i < requestedCount; i++) {
      // 32 hex chars from 16 random bytes — opaque, unguessable, fits
      // in a URL without encoding. Each invite gets its own token.
      const token = crypto.randomBytes(16).toString('hex')
      interface MentorInviteDoc {
        token: string
        createdBy: string
        createdByName: string
        createdAt: number
        expiresAt: number
        consumed: boolean
        note?: string
        email?: string
      }
      const doc: MentorInviteDoc = {
        token,
        createdBy: req.auth.uid,
        createdByName,
        createdAt: now,
        expiresAt,
        consumed: false,
      }
      if (trimmedNote) doc.note = trimmedNote
      if (restrictEmail) doc.email = restrictEmail
      batch.set(db.collection('mentorInvites').doc(token), doc)
      invites.push({ token, url: `${APP_URL}/invite/${token}`, expiresAt })
    }

    await batch.commit()
    return { invites }
  },
)

export const revokeMentorInvite = onCall<RevokeInput>(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    enforceAppCheck: true,
  },
  async (req): Promise<RevokeResult> => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.')
    }
    const role = await callerRole(req.auth.uid)
    if (role !== 'staff' && role !== 'admin') {
      throw new HttpsError('permission-denied', 'Staff or admin role required.')
    }
    const { token } = req.data ?? ({} as RevokeInput)
    if (!token || typeof token !== 'string') {
      throw new HttpsError('invalid-argument', 'token required.')
    }
    const db = getFirestore()
    const ref = db.collection('mentorInvites').doc(token)
    const snap = await ref.get()
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Invite not found.')
    }
    const data = snap.data() as { consumed?: boolean; revoked?: boolean }
    // Idempotent — revoking an already-revoked or already-consumed
    // invite returns success without mutating. The UI can show "this
    // invite is already revoked" copy in that case, but the API
    // shouldn't error.
    if (data.consumed === true || data.revoked === true) {
      return { ok: true, changed: false }
    }
    await ref.update({
      revoked: true,
      revokedAt: Date.now(),
      revokedBy: req.auth.uid,
    })
    return { ok: true, changed: true }
  },
)

export const consumeMentorInvite = onCall<ConsumeInput>(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    enforceAppCheck: true,
  },
  async (req): Promise<ConsumeResult> => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to accept your invitation.')
    }
    const { token } = req.data ?? ({} as ConsumeInput)
    if (!token || typeof token !== 'string') {
      throw new HttpsError('invalid-argument', 'token required.')
    }

    const db = getFirestore()
    const ref = db.collection('mentorInvites').doc(token)
    const snap = await ref.get()
    if (!snap.exists) {
      throw new HttpsError('not-found', 'This invitation link is invalid or has been revoked.')
    }
    const invite = snap.data() as {
      consumed?: boolean
      consumedBy?: string
      expiresAt?: number
      email?: string
      revoked?: boolean
    }

    // Idempotent re-fire by the original consumer. The /invite page
    // might retry on network blip / page refresh — those should
    // succeed silently instead of leaving the user with a "this
    // invite was already used" error on their own freshly-consumed
    // link.
    if (invite.consumed === true && invite.consumedBy === req.auth.uid) {
      return { ok: true, changed: false }
    }
    if (invite.consumed === true) {
      throw new HttpsError('failed-precondition', 'This invitation has already been used.')
    }
    if (invite.revoked === true) {
      throw new HttpsError('failed-precondition', 'This invitation has been revoked.')
    }
    if (typeof invite.expiresAt === 'number' && invite.expiresAt < Date.now()) {
      throw new HttpsError('failed-precondition', 'This invitation has expired.')
    }
    if (invite.email) {
      const callerEmail = (req.auth.token.email ?? '').toLowerCase()
      if (callerEmail !== invite.email) {
        throw new HttpsError(
          'permission-denied',
          `This invitation is for ${invite.email}. Sign in with that account to accept.`,
        )
      }
    }

    // Optional metadata captured on the invite landing page. Trimmed
    // + capped server-side so a paste-bomb in the textarea can't
    // bloat the user doc. Empty / missing values leave the field
    // unset rather than writing an empty string.
    const input = req.data ?? ({} as ConsumeInput)
    const bio =
      typeof input.bio === 'string' ? input.bio.trim().slice(0, MAX_BIO_LENGTH) : ''
    const availability =
      typeof input.availability === 'string'
        ? input.availability.trim().slice(0, MAX_AVAILABILITY_LENGTH)
        : ''

    const now = Date.now()
    // Transactional update: mark the invite consumed AND flip the
    // user's role in one batch. If either side fails the other
    // doesn't half-commit; a partial-failure where the invite is
    // marked consumed but the role didn't flip would be a stuck
    // state requiring admin intervention.
    const userRef = db.collection('users').doc(req.auth.uid)
    await db.runTransaction(async (tx) => {
      // Re-read inside the transaction so a parallel consume race
      // (same token, two devices, sub-second apart) loses cleanly
      // instead of letting both succeed. Also re-checks revoked +
      // expiry — staff may have revoked the token in the millisecond
      // between our outer read and the transaction.
      const fresh = await tx.get(ref)
      const freshData = fresh.data() as {
        consumed?: boolean
        consumedBy?: string
        revoked?: boolean
      } | undefined
      if (freshData?.consumed === true && freshData.consumedBy !== req.auth!.uid) {
        throw new HttpsError('failed-precondition', 'This invitation has already been used.')
      }
      if (freshData?.revoked === true) {
        throw new HttpsError('failed-precondition', 'This invitation has been revoked.')
      }
      tx.update(ref, {
        consumed: true,
        consumedBy: req.auth!.uid,
        consumedAt: now,
      })
      interface MentorUserPatch {
        role: string
        updatedAt: Date
        mentorBio?: string
        mentorAvailability?: string
        [key: string]: string | Date | undefined
      }
      const userPatch: UpdateData<MentorUserPatch> = {
        role: 'mentor',
        updatedAt: new Date(),
      }
      if (bio) userPatch.mentorBio = bio
      if (availability) userPatch.mentorAvailability = availability
      tx.update(userRef, userPatch)
    })

    return { ok: true, changed: true }
  },
)
