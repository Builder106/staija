/**
 * Self-service account deletion.
 *
 * Triggered by the user from the Settings page. Cascades through every
 * collection that holds user-owned data, then deletes the Auth user. We
 * cannot make this fully atomic across Auth + Firestore + Storage, so the
 * destructive Auth delete runs LAST — if anything earlier fails, the user
 * still exists and can retry.
 *
 * Retained for compliance / business records:
 *   - audit_logs       (regulatory trail)
 *   - donations        (anonymized, not deleted — tax records)
 *   - mentor_feedback  (program record about a student, not user-owned data)
 *
 * Blocked roles: staff, admin. Those have to be deleted by another admin
 * to prevent self-sabotage of the system.
 *
 * Secrets: MAILGUN_API_KEY, MAILGUN_DOMAIN (confirmation email).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import { sendMailgun, accountDeletedEmail } from './emailTemplates'

const MAILGUN_API_KEY = defineSecret('MAILGUN_API_KEY')
const MAILGUN_DOMAIN = defineSecret('MAILGUN_DOMAIN')

const SELF_DELETABLE_ROLES = new Set(['applicant', 'student', 'alumni', 'mentor'])

export const deleteAccount = onCall<Record<string, never>>(
  {
    secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN],
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
    const storage = getStorage().bucket()

    // Look up the user profile so we know their role and email before we
    // start tearing things down. If the doc is missing we still allow the
    // delete — they may have already been partially cleaned up.
    const userSnap = await db.collection('users').doc(uid).get()
    const userData = userSnap.data() as { role?: string; email?: string; displayName?: string } | undefined
    const role = userData?.role
    const email = userData?.email ?? request.auth.token.email
    const displayName = userData?.displayName

    if (role && !SELF_DELETABLE_ROLES.has(role)) {
      throw new HttpsError(
        'permission-denied',
        'Staff and admin accounts must be deleted by another admin. Contact contact@staija.org.',
      )
    }

    const errors: string[] = []
    const safe = async <T>(label: string, op: () => Promise<T>) => {
      try {
        await op()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[deleteAccount] ${label} failed for ${uid}`, err)
        errors.push(`${label}: ${msg}`)
      }
    }

    // 1. Applications owned by this user, plus their reference letter files.
    await safe('applications', async () => {
      const apps = await db.collection('applications').where('userId', '==', uid).get()
      for (const doc of apps.docs) {
        await safe(`storage references/${doc.id}`, async () => {
          await storage.deleteFiles({ prefix: `references/${doc.id}/` })
        })
        await safe(`application doc ${doc.id}`, async () => {
          await doc.ref.delete()
        })
      }
    })

    // 2. Application Storage files (transcripts, IDs) under applications/{uid}/*.
    await safe('storage applications/{uid}', async () => {
      await storage.deleteFiles({ prefix: `applications/${uid}/` })
    })

    // 3. Per-user collections: delete every doc tied to this uid.
    const ownedQueries: Array<{ col: string; field: string }> = [
      { col: 'notifications', field: 'userId' },
      { col: 'event_registrations', field: 'userId' },
      { col: 'alumni_stories', field: 'authorUid' },
      { col: 'mentor_assignments', field: 'mentorUid' },
      { col: 'mentor_assignments', field: 'studentUid' },
    ]
    for (const { col, field } of ownedQueries) {
      await safe(`${col} where ${field}`, async () => {
        const snap = await db.collection(col).where(field, '==', uid).get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
      })
    }

    // 4. Connections — uid lives in either `senderUid` or `recipientUid`,
    //    so two queries.
    for (const field of ['senderUid', 'recipientUid', 'fromUid', 'toUid']) {
      await safe(`connection_requests where ${field}`, async () => {
        const snap = await db.collection('connection_requests').where(field, '==', uid).get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
      })
      await safe(`connections where ${field}`, async () => {
        const snap = await db.collection('connections').where(field, '==', uid).get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
      })
    }

    // 5. Donations: keep the financial record but anonymize the donor.
    await safe('donations anonymize', async () => {
      const snap = await db.collection('donations').where('donorUid', '==', uid).get()
      const batch = db.batch()
      for (const doc of snap.docs) {
        batch.update(doc.ref, {
          donorUid: FieldValue.delete(),
          donorName: '(deleted user)',
          donorEmail: FieldValue.delete(),
        })
      }
      if (!snap.empty) await batch.commit()
    })

    // 6. The user profile doc itself.
    await safe('users/{uid}', async () => {
      await db.collection('users').doc(uid).delete()
    })

    // 7. Auth user — last, because once this is gone the user can't retry.
    await safe('auth user', async () => {
      await getAuth().deleteUser(uid)
    })

    // 8. Confirmation email. Best-effort.
    if (email) {
      const firstName = (displayName ?? '').trim().split(/\s+/)[0] || 'there'
      const { html, text } = accountDeletedEmail({ firstName })
      await safe('confirmation email', async () =>
        sendMailgun({
          apiKey: MAILGUN_API_KEY.value(),
          domain: MAILGUN_DOMAIN.value(),
          to: email,
          subject: 'Your STAIJA account has been deleted',
          text,
          html,
        }),
      )
    }

    return { ok: true, partialFailures: errors.length > 0 ? errors : undefined }
  },
)
