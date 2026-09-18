/**
 * getPublicMentors — anonymous HTTP read of the opted-in mentor subset.
 *
 * Powers the public mentor showcase on /stay-connected, which has to
 * render for unauthenticated visitors. Firestore rules currently keep
 * mentor user docs behind authentication; rather than relax that rule
 * (which would expose `email`, `emailPreferences`, etc. to anonymous
 * reads), this function reads via the Admin SDK and returns only the
 * sanitized public subset for mentors who flipped
 * `mentorPublicProfile: true` in account settings.
 *
 * Defaults to closed: a mentor without the flag set never appears.
 *
 * Response is cached at the edge for 5 minutes — mentor opt-in status
 * doesn't change often, and a stale cache window is acceptable for a
 * showcase whose only signal is "are these people real". On the
 * front-end, the showcase swallows fetch failures into an empty state
 * so the rest of /stay-connected always renders.
 */

import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { isAllowedOrigin } from './cors'

export interface PublicMentor {
  uid: string
  displayName: string
  photoURL: string | null
  avatarSlot: number | null
  mentorBio: string
  mentorAvailability: string
}

export const getPublicMentors = onRequest(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
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

    try {
      const db = getFirestore()
      const snap = await db
        .collection('users')
        .where('role', '==', 'mentor')
        .where('mentorPublicProfile', '==', true)
        .get()

      const mentors: PublicMentor[] = []
      for (const doc of snap.docs) {
        interface MentorDocData {
          directoryHidden?: boolean
          displayName?: string
          photoURL?: string | null
          avatarSlot?: number | null
          mentorBio?: string
          mentorAvailability?: string
          [key: string]: string | number | boolean | null | undefined
        }
        const data = doc.data() as MentorDocData
        // Belt-and-braces: skip anyone who has the directory-hidden
        // flag on, even though that flag is primarily an alumni
        // concept. If a mentor toggles it for any reason, honor it.
        if (data.directoryHidden === true) continue
        const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : ''
        if (!displayName) continue // no name → don't surface a "Mentor" placeholder
        mentors.push({
          uid: doc.id,
          displayName,
          photoURL: typeof data.photoURL === 'string' && data.photoURL ? data.photoURL : null,
          avatarSlot:
            typeof data.avatarSlot === 'number' ? data.avatarSlot : null,
          mentorBio: typeof data.mentorBio === 'string' ? data.mentorBio : '',
          mentorAvailability:
            typeof data.mentorAvailability === 'string' ? data.mentorAvailability : '',
        })
      }

      mentors.sort((a, b) => a.displayName.localeCompare(b.displayName))

      res.set('Cache-Control', 'public, max-age=300, s-maxage=300')
      res.status(200).json({ mentors })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[getPublicMentors] Failed', msg)
      res.status(500).json({ error: 'Could not load mentors.' })
    }
  },
)
