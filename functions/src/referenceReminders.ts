/**
 * Reference reminder cron.
 *
 * Runs daily at 09:00 Africa/Lagos. For each submitted application whose
 * references were invited >= 14 days ago, sends a one-time reminder to
 * any referee whose status is still `invited` (i.e. invite delivered but
 * letter not received). Idempotent via a per-index timestamp written
 * back to `referenceReminderSentAt[i]` — referees only ever get one
 * reminder, no matter how many times the cron runs.
 *
 * The token in the reminder is freshly minted (90-day TTL) so it's
 * comfortably valid even if the original invite is close to expiring.
 *
 * Secrets: REFERENCE_TOKEN_SECRET, MAILGUN_API_KEY, MAILGUN_DOMAIN
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { APP_URL, sendMailgun, referenceReminderEmail } from './emailTemplates'
import { mintToken } from './references'

const REFERENCE_TOKEN_SECRET = defineSecret('REFERENCE_TOKEN_SECRET')
const MAILGUN_API_KEY = defineSecret('MAILGUN_API_KEY')
const MAILGUN_DOMAIN = defineSecret('MAILGUN_DOMAIN')

const REMINDER_AGE_DAYS = 14

interface ApplicationRef {
  name?: string
  email?: string
  institution?: string
  relationship?: string
  status?: 'pending' | 'invited' | 'received'
}

interface ApplicationDocForReminder {
  status?: string
  program?: 'stepup_scholars' | 'dynamerge'
  personalInfo?: { firstName?: string; lastName?: string }
  references?: ApplicationRef[]
  referenceReminderSentAt?: Record<string, Timestamp | Date | number | string>
}

function programLabel(p?: ApplicationDocForReminder['program']): string {
  if (p === 'stepup_scholars') return 'StepUp Scholars'
  if (p === 'dynamerge') return 'Dynamerge'
  return 'STAIJA'
}

export const sendReferenceReminders = onSchedule(
  {
    // See applicationDraftsCron.ts for rationale — Scheduler can't
    // create jobs in africa-south1 for this project.
    region: 'me-central1',
    schedule: 'every day 09:00',
    timeZone: 'Africa/Lagos',
    secrets: [REFERENCE_TOKEN_SECRET, MAILGUN_API_KEY, MAILGUN_DOMAIN],
  },
  async () => {
    const db = getFirestore()
    const cutoff = Timestamp.fromDate(
      new Date(Date.now() - REMINDER_AGE_DAYS * 24 * 60 * 60 * 1000),
    )

    const snap = await db
      .collection('applications')
      .where('status', '==', 'submitted')
      .where('referencesInvitedAt', '<=', cutoff)
      .get()

    if (snap.empty) {
      console.log('[referenceReminders] no applications past the reminder window')
      return
    }

    const tokenSecret = REFERENCE_TOKEN_SECRET.value()
    const apiKey = MAILGUN_API_KEY.value()
    const domain = MAILGUN_DOMAIN.value()

    let sent = 0
    for (const doc of snap.docs) {
      const app = doc.data() as ApplicationDocForReminder
      const refs = app.references ?? []
      const reminderTimestamps = app.referenceReminderSentAt ?? {}
      const applicantName =
        [app.personalInfo?.firstName, app.personalInfo?.lastName].filter(Boolean).join(' ') ||
        'a STAIJA applicant'
      const program = programLabel(app.program)

      for (let i = 0; i < refs.length; i++) {
        const r = refs[i]
        if (r.status !== 'invited') continue
        if (reminderTimestamps[String(i)]) continue
        if (!r.email) continue

        const token = mintToken(doc.id, i, tokenSecret)
        const url = `${APP_URL}/refs/${token}`

        const { html, text } = referenceReminderEmail({
          refName: r.name ?? 'there',
          applicantName,
          programLabel: program,
          relationship: r.relationship ?? '',
          institution: r.institution ?? '',
          uploadUrl: url,
        })

        try {
          await sendMailgun({
            apiKey,
            domain,
            to: r.email,
            subject: `Reminder: ${applicantName} is waiting on your reference`,
            text,
            html,
          })
          await doc.ref.update({
            [`referenceReminderSentAt.${i}`]: FieldValue.serverTimestamp(),
          })
          sent += 1
        } catch (err) {
          console.error('[referenceReminders] send failed', err, {
            applicationId: doc.id,
            refIndex: i,
          })
        }
      }
    }

    console.log(`[referenceReminders] sent ${sent} reminder(s)`)
  },
)
