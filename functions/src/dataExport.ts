/**
 * GDPR / CCPA-style data export.
 *
 * Bundles every user-owned record we hold — Firestore profile,
 * applications, donations (theirs only), connection edges, mentor
 * assignments, audit log entries, and a list of Storage object
 * references — into a single JSON payload. The client downloads it.
 *
 * Files themselves aren't inlined; they'd push the response well past
 * the callable's 10MB return limit. Instead we list each Storage path
 * with a 7-day signed URL the user can fetch directly.
 *
 * Auth: required. App Check: enforced.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

interface FileEntry {
  path: string
  size: number
  contentType: string | undefined
  signedUrl: string
}

export const exportUserData = onCall<Record<string, never>>(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.')
    }
    const uid = request.auth.uid
    const db = getFirestore()
    const bucket = getStorage().bucket()

    const [
      profileSnap,
      applicationsSnap,
      donationsSnap,
      eventRegSnap,
      notificationsSnap,
      alumniStoriesSnap,
      auditSnap,
      tutorSessionsSnap,
      tutorMemorySnap,
    ] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('applications').where('userId', '==', uid).get(),
      db.collection('donations').where('donorUid', '==', uid).get(),
      db.collection('event_registrations').where('userId', '==', uid).get(),
      db.collection('notifications').where('userId', '==', uid).get(),
      db.collection('alumni_stories').where('authorUid', '==', uid).get(),
      db.collection('audit_logs').where('userId', '==', uid).orderBy('timestamp', 'desc').limit(500).get(),
      db.collection('tutor_sessions').where('userId', '==', uid).get(),
      db.collection('tutor_memory').doc(uid).get(),
    ])

    const connectionEdges = await Promise.all(
      ['senderUid', 'recipientUid', 'fromUid', 'toUid'].flatMap((field) => [
        db.collection('connections').where(field, '==', uid).get(),
        db.collection('connection_requests').where(field, '==', uid).get(),
      ]),
    )

    const mentorAssignments = await Promise.all([
      db.collection('mentor_assignments').where('mentorUid', '==', uid).get(),
      db.collection('mentor_assignments').where('studentUid', '==', uid).get(),
    ])

    // Storage: all objects under applications/{uid}/* plus reference
    // letters keyed by application id (we own the application, not the
    // file directly, but the letter is about us).
    const fileEntries: FileEntry[] = []
    const expires = Date.now() + 7 * 24 * 60 * 60 * 1000
    const collectFiles = async (prefix: string) => {
      const [files] = await bucket.getFiles({ prefix })
      for (const f of files) {
        const [signedUrl] = await f.getSignedUrl({ action: 'read', expires })
        fileEntries.push({
          path: f.name,
          size: Number(f.metadata.size ?? 0),
          contentType: f.metadata.contentType,
          signedUrl,
        })
      }
    }
    await collectFiles(`applications/${uid}/`)
    for (const appDoc of applicationsSnap.docs) {
      await collectFiles(`references/${appDoc.id}/`)
    }
    await collectFiles(`avatars/${uid}/`)

    // De-dupe the connection edges (a single doc may match more than one
    // field-name query, e.g. a row with senderUid=uid AND recipientUid=uid
    // theoretically wouldn't happen but de-duping is cheap insurance).
    const seen = new Set<string>()
    const dedupe = (snap: FirebaseFirestore.QuerySnapshot) =>
      snap.docs.filter((d) => {
        if (seen.has(d.ref.path)) return false
        seen.add(d.ref.path)
        return true
      })

    const payload = {
      generatedAt: new Date().toISOString(),
      uid,
      profile: profileSnap.exists ? { id: profileSnap.id, ...profileSnap.data() } : null,
      applications: applicationsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      donations: donationsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      eventRegistrations: eventRegSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      notifications: notificationsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      alumniStories: alumniStoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      auditLogs: auditSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      tutorSessions: tutorSessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      tutorMemory: tutorMemorySnap.exists ? tutorMemorySnap.data() : null,
      connections: connectionEdges.flatMap((snap) =>
        dedupe(snap).map((d) => ({ collection: d.ref.parent.id, id: d.id, ...d.data() })),
      ),
      mentorAssignments: mentorAssignments.flatMap((snap) =>
        snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      ),
      files: fileEntries,
      notes: {
        signedUrlTtlDays: 7,
        retainedForCompliance: [
          'Donations are kept (anonymized) after account deletion for tax records.',
          'Audit logs are kept for compliance.',
          'Mentor feedback you wrote about students is retained as a program record.',
        ],
      },
    }

    return payload
  },
)
