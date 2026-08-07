/**
 * STAIJA Firebase Functions entrypoint.
 *
 * - contentfulWebhook → src/contentful.ts: mirror Contentful → Firestore
 * - paystackWebhook   → src/paystack.ts:   record donations idempotently
 *
 * Deployment:
 *   1. cd functions && npm install
 *   2. firebase functions:secrets:set CONTENTFUL_WEBHOOK_SECRET
 *   3. firebase functions:secrets:set PAYSTACK_SECRET_KEY
 *   4. firebase deploy --only functions
 *   5. Configure webhooks in Contentful + Paystack dashboards
 *      (see docs/M2-CHECKLIST.md and docs/M3-CHECKLIST.md).
 */

import * as admin from 'firebase-admin'
import { setGlobalOptions } from 'firebase-functions/v2'

admin.initializeApp()

// Co-locate Functions with Firestore (already in africa-south1) and the
// bulk of our user base (Nigeria / West Africa). Eliminates the
// cross-region trigger hop that was firing the deploy-time warning on
// onApplicationStatusChange, inviteReferencesOnSubmit, onUserCreated.
// Individual function definitions used to set `region: 'us-central1'`
// explicitly; those declarations have been removed so this global is
// the single source of truth.
setGlobalOptions({ region: 'africa-south1' })

export { contentfulWebhook } from './contentful'
export { onApplicationStatusChange, retryApplicationEmail } from './email'
export {
  inviteReferencesOnSubmit,
  validateReferenceToken,
  submitReferenceLetter,
} from './references'
export { onUserCreated } from './welcome'
export { sendReferenceReminders } from './referenceReminders'
export { reapApplicationDraftTombstones } from './applicationDraftsCron'
export { reapApplicationStagedFiles } from './applicationStagedFilesCron'
export { deleteAccount } from './account'

// First-admin bootstrap for a fresh Firebase project. Callable; refuses
// after the first successful run (sentinel doc + defensive admins-exist
// check). Replaces the previous "edit users/{uid}.role manually in the
// Firebase Console" operator step. See bootstrapAdmin.ts.
export { bootstrapAdmin } from './bootstrapAdmin'
export { adminListUsers } from './adminUsers'
export { signOutEverywhere } from './security'
export { exportUserData } from './dataExport'

// LMS callables (Phase 1 & Phase 2).
export { enrollStudent, completeLesson, submitAssignment, gradeSubmission, submitQuiz } from './lms'
export { scheduleSession, rsvpSession } from './sessions'

// AI-powered course outliner (Groq-backed). Requires GROQ_API_KEY,
// CONTENTFUL_MANAGEMENT_TOKEN, and CONTENTFUL_SPACE_ID in Secret Manager.
export { outlineCourse } from './aiOutline'

// AI lesson media enrichment (Groq-backed). Suggests YouTube/image
// search queries, a narration script, and key-concept bullets — staff
// curates from there. Only requires GROQ_API_KEY.
export { lessonMediaAssist } from './aiLessonMedia'

// Server-side proxy for every Contentful Management API call the admin
// LMS surface makes. Replaces the previous client-side path that
// exposed the management token in the browser bundle. Requires
// CONTENTFUL_MANAGEMENT_TOKEN and CONTENTFUL_SPACE_ID in Secret Manager.
export { lmsContentAdmin } from './lmsContentAdmin'

// Asset upload bridge: client stages bytes in Firebase Storage at
// cms/<uid>/..., then calls this function to copy them into Contentful
// as a published Asset. Uses the same secrets as lmsContentAdmin.
export { lmsAssetUpload } from './lmsAssetUpload'

// Application submit finalize: copies staged uploads
// (`applicationStaging/<uid>/<program>/...`) into the canonical
// per-application Storage folder and patches the application doc's
// `documents` field with the final paths. See applicationFinalize.ts.
export { finalizeApplicationFiles } from './applicationFinalize'

// Applicant-initiated handshake: when staff accepts the application,
// the applicant picks one of accept / decline / defer on their Status
// page Decision card and this callable records the response.
// See applicationAccept.ts.
export { respondToOffer, reOfferToDeferredApplicant } from './applicationAccept'

// Mentor onboarding via single-use invite tokens. Staff/admin mints a
// token; the vetted contact opens /invite/<token> and gets role=mentor
// on consume. See mentorInvites.ts.
export { createMentorInvite, consumeMentorInvite, revokeMentorInvite } from './mentorInvites'

// Anonymous HTTP read of opted-in mentors for the /stay-connected
// public showcase. Reads via Admin SDK so the strict mentor-doc
// Firestore rule (auth required) stays in place; only mentors who
// flipped `mentorPublicProfile: true` are returned, and only the
// sanitized public subset (no email / emailPreferences). See
// getPublicMentors.ts.
export { getPublicMentors } from './getPublicMentors'

// Anonymous HTTP lookup of a single user's display name, used to
// personalise the /stay-connected hero ("Alice sent you here.") when
// a visitor lands with `?ref=u-<uid>`. Returns *only* displayName;
// never email or any other field. Edge-cached for an hour. See
// resolveReferrerName.ts.
export { resolveReferrerName } from './resolveReferrerName'

// Admin/staff callable that fans out a templated email to
// /stay-connected subscribers segmented by `interestTag`. Backs the
// drip surface for the augmented newsletter (next-cycle-open, mentor-
// welcome, general-update). Requires MAILGUN_LIST_ADDRESS in Secret
// Manager — same dependency as subscribeNewsletter. See announceCycle.ts.
export { sendInterestSegmentEmail } from './announceCycle'

// Cohort graduation: marks all active enrollments in a cohort
// 'completed' and transitions qualifying students to role='alumni'
// in one batched commit. See cohortGraduate.ts.
export { graduateCohort } from './cohortGraduate'

// Daily cron that batches the "your spot is open again" email to
// every deferred applicant when a new cohort is approaching its
// start date — safety net for the manual bulk-re-offer flow.
// See cohortCycleCron.ts.
export { reOfferDeferredOnCohortStart } from './cohortCycleCron'

// setNewsletterSubscription is intentionally not re-exported until
// MAILGUN_LIST_ADDRESS is set in Secret Manager and a Mailgun mailing
// list exists. Same gating pattern as subscribeNewsletter above.

// paystack.ts and newsletter.ts are intentionally NOT re-exported here.
//
// - Paystack: donations are gated behind src/config/features.ts:donationsEnabled
//   while compliance is pending. Re-export `paystackWebhook` and
//   `cancelSubscription` once PAYSTACK_SECRET_KEY is set in Secret
//   Manager and the live webhook URL is configured in Paystack.
//
// - Newsletter: requires a Mailgun mailing list to exist (and
//   MAILGUN_LIST_ADDRESS to be set). The footer signup form falls back
//   to a "fake success" state when VITE_NEWSLETTER_ENDPOINT is unset,
//   so leaving this off doesn't break the UI. Re-export
//   `subscribeNewsletter` once the list is created.
//
// Skipping the re-exports keeps the modules un-imported, which means
// their module-level `defineSecret(...)` calls don't run, which means
// the deploy doesn't gate on PAYSTACK_SECRET_KEY / MAILGUN_LIST_ADDRESS.
