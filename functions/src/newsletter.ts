/**
 * Newsletter signup via Mailgun mailing list.
 *
 * Public HTTP endpoint that adds an email to STAIJA's Mailgun mailing
 * list. Configure the list with "subscription confirmation" enabled in
 * Mailgun for double opt-in (Decision in PRD §4.11).
 *
 * Secrets:
 *   - MAILGUN_API_KEY     — same key used by transactional email
 *   - MAILGUN_LIST_ADDRESS — e.g. newsletter@mg.staija.org
 *
 * Light protection:
 *   - CORS restricted to staija.org + localhost
 *   - Email format validation
 *   - Honeypot field rejected if filled (basic spam shield)
 *   - In-memory sliding-window rate limit per IP + per email
 *
 * The rate limit is best-effort. Fluid Compute keeps function instances
 * warm across requests, so a steady abuser gets caught on the same
 * instance; an attacker that fans out across instances (cold starts)
 * gets a fresh window each time. For the scale this endpoint is at,
 * that's an acceptable floor — Mailgun's own per-recipient suppression
 * lists and the referral-counter double-count guard above defend the
 * downstream damage.
 */

import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { isAllowedOrigin } from './cors'

const MAILGUN_API_KEY = defineSecret('MAILGUN_API_KEY')
const MAILGUN_LIST_ADDRESS = defineSecret('MAILGUN_LIST_ADDRESS')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// --- Rate limiting --------------------------------------------------
//
// Per-IP and per-email sliding windows kept in-memory on the function
// instance. Limits are intentionally generous — a real person almost
// never trips them, but a scripted abuser submitting hundreds per
// second hits them hard. Reset implicitly on cold start; the bounded
// Map size + 60s expiry keeps memory flat across long-warm instances.

interface RateBucket {
  windowStart: number
  count: number
}
const ipBuckets = new Map<string, RateBucket>()
const emailBuckets = new Map<string, RateBucket>()
const IP_WINDOW_MS = 60_000
const IP_WINDOW_MAX = 20  // 20 requests / minute per IP
const EMAIL_WINDOW_MS = 5 * 60_000
const EMAIL_WINDOW_MAX = 3  // 3 attempts / 5 minutes per email
const BUCKET_CAP = 5000  // hard cap on Map size — evict oldest if breached

function pruneOnInsert(bucket: Map<string, RateBucket>): void {
  if (bucket.size < BUCKET_CAP) return
  // Cheap-ish eviction: drop the first 10% of inserted keys. Map
  // iteration order is insertion order, so the first entries are the
  // oldest.
  const toRemove = Math.floor(BUCKET_CAP * 0.1)
  let removed = 0
  for (const key of bucket.keys()) {
    if (removed >= toRemove) break
    bucket.delete(key)
    removed += 1
  }
}

/** Returns true when the key is *within* the limit (request allowed),
 *  false when it should be rejected. */
function takeFromBucket(
  bucket: Map<string, RateBucket>,
  key: string,
  windowMs: number,
  maxInWindow: number,
): boolean {
  const now = Date.now()
  const existing = bucket.get(key)
  if (!existing || now - existing.windowStart > windowMs) {
    pruneOnInsert(bucket)
    bucket.set(key, { windowStart: now, count: 1 })
    return true
  }
  existing.count += 1
  if (existing.count > maxInWindow) return false
  return true
}

/** Extract the most useful client IP from the request. Cloud Functions
 *  v2 sits behind Google's load balancer, which sets `X-Forwarded-For`
 *  with the original client IP first. Falls back to req.ip then to a
 *  fixed sentinel so an absent header doesn't crash the limiter. */
function clientIp(req: {
  ip?: string
  headers: Record<string, string | string[] | undefined>
}): string {
  const xff = req.headers['x-forwarded-for']
  const xffStr = Array.isArray(xff) ? xff[0] : typeof xff === 'string' ? xff : ''
  if (xffStr) {
    const first = xffStr.split(',')[0]?.trim()
    if (first) return first
  }
  return typeof req.ip === 'string' && req.ip ? req.ip : '0.0.0.0'
}

export const subscribeNewsletter = onRequest(
  {
    secrets: [MAILGUN_API_KEY, MAILGUN_LIST_ADDRESS],
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req, res) => {
    const origin = req.header('origin') || ''
    if (isAllowedOrigin(origin)) {
      res.set('Access-Control-Allow-Origin', origin)
      res.set('Vary', 'Origin')
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.set('Access-Control-Allow-Headers', 'Content-Type')
    }

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed')
      return
    }

    const body = req.body as {
      email?: string | null
      source?: string | null
      trap?: string | null
      interestTag?: string | null
      program?: string | null
      referrerId?: string | null
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const source = typeof body.source === 'string' ? body.source : 'unknown'
    // interestTag is the audience segment the subscriber selected on
    // /stay-connected (e.g. 'stepup-next', 'dynamerge-next', 'mentor',
    // 'general'). Footer signups don't send it; treat absent as
    // 'general'. Mailgun stores it under the member's `vars` so future
    // drip campaigns can segment by tag.
    const ALLOWED_TAGS = new Set(['stepup-next', 'dynamerge-next', 'mentor', 'general'])
    const interestTag =
      typeof body.interestTag === 'string' && ALLOWED_TAGS.has(body.interestTag)
        ? body.interestTag
        : 'general'
    // Optional program hint when the signup came from an apply-flow
    // fallback (e.g. ?from=stepup&reason=closed). Useful for follow-up
    // emails that should reference the specific program the visitor
    // was looking at.
    const ALLOWED_PROGRAMS = new Set(['stepup-scholars', 'dynamerge'])
    const program =
      typeof body.program === 'string' && ALLOWED_PROGRAMS.has(body.program)
        ? body.program
        : undefined
    // Referral attribution. The client mints the id and embeds it in
    // share links; we accept only the same shape it mints
    // (`a-<short>` for anonymous, `u-<uid>` for signed-in) so the
    // counter docs stay clean. Cap length at 64 to bound storage and
    // index key size.
    const REFERRER_RE = /^[A-Za-z0-9-]{1,64}$/
    const referrerId =
      typeof body.referrerId === 'string' && REFERRER_RE.test(body.referrerId)
        ? body.referrerId
        : undefined

    // Honeypot: real users won't fill this hidden field.
    if (typeof body.trap === 'string' && body.trap.length > 0) {
      res.status(200).json({ ok: true }) // pretend success, drop the request
      return
    }

    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email.' })
      return
    }

    // Rate limit: per-IP first (catches a flood from one source), then
    // per-email (catches a flood that fans out IPs but reuses the same
    // address). Both return the same Retry-After hint so a polite
    // client can back off without parsing the body.
    const ip = clientIp({ ip: req.ip, headers: req.headers })
    if (!takeFromBucket(ipBuckets, ip, IP_WINDOW_MS, IP_WINDOW_MAX)) {
      res.set('Retry-After', '60')
      res.status(429).json({ error: 'Too many requests. Try again in a minute.' })
      return
    }
    if (!takeFromBucket(emailBuckets, email, EMAIL_WINDOW_MS, EMAIL_WINDOW_MAX)) {
      res.set('Retry-After', '300')
      res.status(429).json({ error: 'Too many attempts for that email. Try again in a few minutes.' })
      return
    }

    try {
      const auth = Buffer.from(`api:${MAILGUN_API_KEY.value()}`).toString('base64')
      const listAddress = MAILGUN_LIST_ADDRESS.value()

      // Pre-check: is this email already a member of the list? Mailgun's
      // upsert path returns 200 on a re-submit too, which left us unable
      // to distinguish "first signup" from "tag-update re-submit" — the
      // referral counter bumped on both, inflating the leaderboard with
      // duplicates. One extra GET per signup, but it makes attribution
      // accurate. A 404 means "new member, count it"; a 200 means
      // "already on the list, just update vars."
      const memberLookup = await fetch(
        `https://api.mailgun.net/v3/lists/${encodeURIComponent(listAddress)}/members/${encodeURIComponent(email)}`,
        {
          method: 'GET',
          headers: { Authorization: `Basic ${auth}` },
        },
      )
      // Mailgun returns 404 for a non-member, 200 for a member, and 5xx
      // when the list itself is misconfigured. Anything other than 200
      // we treat as "we don't know, assume new" so a Mailgun outage
      // doesn't lock out legitimate new signups. Worst case during a
      // 5xx we count a re-subscriber as new — strictly better than
      // missing a real new signup.
      const isExistingMember = memberLookup.status === 200

      const form = new URLSearchParams()
      form.set('address', email)
      form.set('subscribed', 'yes')
      form.set('upsert', 'yes')
      form.set(
        'vars',
        JSON.stringify({
          source,
          interestTag,
          ...(program ? { program } : {}),
          ...(referrerId ? { referrerId } : {}),
          signed_up_at: new Date().toISOString(),
        }),
      )

      const mgRes = await fetch(
        `https://api.mailgun.net/v3/lists/${encodeURIComponent(listAddress)}/members`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        },
      )

      if (!mgRes.ok) {
        const detail = await mgRes.text()
        console.error('[subscribeNewsletter] Mailgun rejected', mgRes.status, detail, { email, source, interestTag })
        res.status(502).json({ error: 'Subscription service is having trouble. Try again in a minute.' })
        return
      }

      // Referral attribution: bump the per-referrer counter so a
      // future leaderboard can read it without paginating the whole
      // Mailgun list. Skip the increment when the email was already
      // subscribed — re-submits update tags but don't create new
      // attribution. Best-effort write: a Firestore hiccup here
      // shouldn't poison the subscriber's success state (they're
      // already on the list at this point).
      if (referrerId && !isExistingMember) {
        try {
          const ref = getFirestore().collection('referralStats').doc(referrerId)
          await ref.set(
            {
              signupCount: FieldValue.increment(1),
              lastSignupAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          )
        } catch (err) {
          console.warn(
            '[subscribeNewsletter] referral counter bump failed',
            err instanceof Error ? err.message : String(err),
            { referrerId },
          )
        }
      }

      res.status(200).json({ ok: true, alreadySubscribed: isExistingMember })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[subscribeNewsletter] Failed', msg, { email, source, interestTag })
      res.status(500).json({ error: 'Subscription failed. Try again in a minute.' })
    }
  },
)
