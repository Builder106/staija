/**
 * resolveReferrerName — anonymous HTTP lookup of a referrer's
 * display name.
 *
 * Backs the personalised /stay-connected hero ("Alice sent you here.")
 * when a visitor lands with `?ref=u-<uid>`. The page is public, so it
 * can't read arbitrary `users/<uid>` docs through the Firestore rule
 * layer (which gates user-doc reads to the owner / staff / admin /
 * authenticated mentor-lookup paths). This function reads via the
 * Admin SDK and returns *only* the display name — never email, never
 * role, never any other field — so opening it to anonymous traffic
 * doesn't leak anything that isn't already public on the site.
 *
 * Validation: uid must match the same shape Firebase Auth mints (28
 * chars, alphanumeric); a non-matching input returns 404 instead of
 * issuing the read. Caps blast radius on a fuzzer.
 *
 * Cache: 1 hour at the edge. Display names are stable on the hour
 * scale; if a referrer renames themselves the change propagates after
 * the cache window without us having to invalidate. Anonymous referrer
 * ids (`a-<short>`) are never accepted here — those have no associated
 * profile.
 */

import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { isAllowedOrigin } from './cors'

// Firebase Auth uids are 28-character alphanumeric strings. Anything
// outside that shape isn't a real uid and we bail before the read.
const UID_RE = /^[A-Za-z0-9]{20,40}$/

export const resolveReferrerName = onRequest(
  {
    memory: '256MiB',
    timeoutSeconds: 15,
  },
  async (req, res) => {
    const origin = req.header('origin') || ''
    if (isAllowedOrigin(origin)) {
      res.set('Access-Control-Allow-Origin', origin)
      res.set('Vary', 'Origin')
      res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
      res.set('Access-Control-Allow-Headers', 'Content-Type')
    }

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    if (req.method !== 'GET') {
      res.status(405).send('Method not allowed')
      return
    }

    const rawUid = req.query.uid
    const uid = typeof rawUid === 'string' ? rawUid : ''
    if (!UID_RE.test(uid)) {
      res.status(404).json({ error: 'Not found.' })
      return
    }

    try {
      const snap = await getFirestore().collection('users').doc(uid).get()
      if (!snap.exists) {
        res.status(404).json({ error: 'Not found.' })
        return
      }
      const data = snap.data() as { displayName?: string | null; directoryHidden?: boolean | null }
      // Respect the directory-hidden flag — if the user opted out of
      // appearing in any directory, we don't surface their name here
      // either. The visitor still gets a useful page; the hero just
      // falls back to the generic copy.
      if (data.directoryHidden === true) {
        res.status(404).json({ error: 'Not found.' })
        return
      }
      const displayName =
        typeof data.displayName === 'string' && data.displayName.trim().length > 0
          ? data.displayName.trim()
          : null
      if (!displayName) {
        res.status(404).json({ error: 'Not found.' })
        return
      }

      res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600')
      res.status(200).json({ displayName })
    } catch (err) {
      console.error(
        '[resolveReferrerName] read failed',
        err instanceof Error ? err.message : String(err),
        { uid },
      )
      res.status(500).json({ error: 'Lookup failed.' })
    }
  },
)
