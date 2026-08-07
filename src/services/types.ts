export interface AuditLog {
  id: string
  type: 'role_change' | 'permission_check'
  userId: string
  timestamp: Date
  changedBy?: string
  previousRole?: UserRole
  newRole?: UserRole
  permission?: Permission
  granted?: boolean
  reason?: string
  context?: string
  ipAddress?: string
  userAgent?: string
}

export type UserRole = 'admin' | 'alumni' | 'applicant' | 'staff' | 'student' | 'mentor'

export type PublicAssignableRole = 'applicant' | 'alumni'

export type AdminAssignableRole = UserRole

// Mentors are vetted/invited (not self-signup), but the invitation flow uses
// the same email-link mechanism we use for staff onboarding.
export type EmailLinkAssignableRole = 'applicant' | 'staff' | 'alumni' | 'mentor'

export type Permission =
  | 'manage_users'
  | 'manage_roles'
  | 'view_all_users'
  | 'manage_system_settings'
  | 'view_applications'
  | 'review_applications'
  | 'manage_applications'
  | 'export_applications'
  | 'create_programs'
  | 'edit_programs'
  | 'delete_programs'
  | 'manage_program_settings'
  | 'access_alumni_portal'
  | 'manage_alumni_profiles'
  | 'share_alumni_stories'
  | 'network_with_alumni'
  | 'view_program_content'
  | 'access_student_portal'
  | 'participate_in_programs'
  | 'submit_program_work'
  | 'access_mentor_support'
  | 'view_assigned_students'
  | 'submit_mentor_feedback'
  | 'apply_to_programs'
  | 'view_own_applications'
  | 'edit_own_applications'
  | 'view_public_content'
  | 'contact_support'
  | 'manage_profile'
  // LMS permissions (Phase 1)
  | 'submit_assignments'
  | 'grade_submissions'
  | 'manage_cohorts'
  | 'manage_sessions'

export interface EmailPreferences {
  // Transactional email (welcome, application status, reference invites,
  // password resets) is not opt-out-able and is intentionally NOT listed
  // here. These flags only cover non-essential / marketing-adjacent sends.
  eventReminders?: boolean
  mentorNotifications?: boolean
  productUpdates?: boolean
  newsletter?: boolean
}

export interface UserProfile {
  uid: string
  email: string
  displayName?: string
  photoURL?: string
  // Index into the avatar `PORTRAITS` library — set when the user
  // explicitly picks a portrait from the gallery rather than accepting
  // the deterministic seed-based default. `null` means "no override,
  // use the seed". Resolved alongside `photoURL` by `resolveAvatarSrc`
  // (uploaded photo wins over picked slot wins over seed).
  avatarSlot?: number | null
  bio?: string
  /** Mentor-specific profile fields, captured optionally at invite-
   *  consume time and editable later from account settings. Empty
   *  strings on non-mentor users; the consume flow only writes them
   *  when populated. Kept on UserProfile (rather than a separate
   *  `mentors/` collection) so the existing user-doc reads in the
   *  admin / cohort UIs pick them up without an extra round-trip. */
  mentorBio?: string
  mentorAvailability?: string
  /** Mentor opt-in for the public showcase on /stay-connected. When
   *  true, the `getPublicMentors` Cloud Function returns this mentor's
   *  sanitized public subset (name, photo, bio, availability) to
   *  anonymous visitors. Default false — mentors aren't surfaced
   *  publicly until they explicitly flip the toggle in account
   *  settings. Ignored on non-mentor accounts. */
  mentorPublicProfile?: boolean
  role: UserRole
  createdAt: Date
  updatedAt: Date
  program?: 'stepup_scholars' | 'dynamerge'
  applicationStatus?: 'draft' | 'submitted' | 'under_review' | 'accepted' | 'rejected'
  // Privacy: hide profile from the alumni directory (default visible).
  directoryHidden?: boolean
  // Email preferences. Missing or undefined means "opted in" — the existing
  // user base predates this field and we don't want to silently mute them.
  emailPreferences?: EmailPreferences
}

// A mentor↔student pairing for the duration of a program.
// Created by staff/admin (initially in Firestore directly; an admin UI for
// this can come later). Read by the mentor portal to populate "your students".
export interface MentorAssignment {
  id?: string
  mentorId: string
  studentId: string
  program: 'stepup_scholars' | 'dynamerge'
  status: 'active' | 'ended'
  assignedAt: Date
  endedAt?: Date
  assignedBy?: string
  notes?: string
}

// Free-form feedback a mentor leaves about an assigned student. Visible to
// the mentor (their own past entries) and to staff/admin. Student visibility
// is intentionally deferred — adding a student-facing surface needs UX
// thinking (timing of disclosure, ability to respond, etc.) that's separate
// from getting the mentor side working.
export interface MentorFeedback {
  id?: string
  mentorId: string
  studentId: string
  content: string
  submittedAt: Date
}

export interface ContentItem {
  id?: string
  title: string
  content: string
  author: string
  type: 'blog' | 'program' | 'event' | 'alumni_story'
  status: 'draft' | 'published' | 'archived'
  tags: string[]
  publishDate?: Date
  createdAt: Date
  updatedAt: Date
}

export interface Application {
  id?: string
  userId: string
  program: 'stepup_scholars' | 'dynamerge'
  status: 'draft' | 'submitted' | 'under_review' | 'accepted' | 'rejected'
  personalInfo: {
    firstName: string
    lastName: string
    email: string
    phone?: string
    dateOfBirth: string
    nationality: string
    currentInstitution?: string
    currentLevel?: string
  }
  academicInfo: {
    gpa?: string
    major?: string
    graduationYear?: string
    relevantCourses?: string[]
  }
  researchInterests: string[]
  motivation: string
  experience: string
  references: {
    name: string
    email: string
    institution: string
    relationship: string
  }[]
  /**
   * The applicant's response to the offered spot. Set by the
   * `respondToOffer` callable when the applicant clicks one of the
   * three actions on their Status page Decision card:
   *
   *   - 'accepted' → ready for cohort placement
   *   - 'declined' → applicant is out; staff should not enroll
   *   - 'deferred' → applicant wants the next cycle instead; staff
   *                  re-offers when that cycle opens
   *
   * Changes are allowed (accept → defer is a real story) so the
   * latest value wins. Undefined until the applicant has acted; the
   * admin queue shows "awaiting response" treatment until then.
   */
  spotResponse?: 'accepted' | 'declined' | 'deferred'
  /** Ms epoch of the most recent response. Plain primitive (not
   *  Firestore Timestamp) so the field round-trips cleanly. Bumped
   *  whenever spotResponse changes. */
  spotRespondedAt?: number
  /** Optional free-text reason the applicant left when declining or
   *  deferring. Surfaced to staff in the queue / review surface;
   *  blank for accept (the CTA is one-click). */
  spotResponseNote?: string
  documents?: {
    cv?: string
    transcript?: string
    /** Government / school ID photo or scan. Path set by
     *  `finalizeApplicationFiles` from the staged upload. */
    id?: string
    /** Optional "show your work" file (image / video / audio / PDF).
     *  URL counterpart lives in `showcase.url`. Both can coexist —
     *  reviewers see whichever the applicant attached. */
    showcase?: string
    recommendationLetter?: string
    /** Audio answers, keyed by motivation field name. Most programs
     *  only have one (currently always `motivation`) but the wizard
     *  schema supports multiple per program. */
    audio?: Record<string, string>
  }
  /**
   * Optional "show me something you've made" slot. URL is preferred —
   * zero upload cost, accessible from low-bandwidth contexts. File is
   * an alternative for applicants without somewhere to host work; the
   * actual bytes live in Storage under `applications/{uid}/{appId}/`.
   */
  showcase?: {
    url?: string
    fileName?: string
    note?: string
  }
  /**
   * Set by `onApplicationStatusChange` when Mailgun rejects the
   * applicant-facing email. Cleared automatically on a successful
   * retry. Surfaces a "Retry email" banner on the admin application
   * view ([ReviewApplication.vue](../views/admin/ReviewApplication.vue))
   * which calls the `retryApplicationEmail` callable.
   */
  lastEmailFailure?: {
    kind: 'submitted' | 'accepted' | 'rejected'
    to: string
    attemptedAt: Date
    error: string
  }
  submittedAt?: Date
  reviewedAt?: Date
  reviewedBy?: string
  feedback?: string
  createdAt: Date
  updatedAt: Date
}

// Program describes everything the public /programs/:slug pages show AND
// the operational fields (cohort dates, status) the admin tracks. Both
// program layouts (src/components/programs/StepUpDetailView.vue,
// DynamergeDetailView.vue) read this same shape directly, no adapter
// layer, via toProgramView() in src/services/programContent.ts.
export interface Program {
  id?: string
  slug: string
  name: string
  pitch: string                  // hero subtitle paragraph
  eligibility: string            // short eligibility line, e.g. "Ages 15–19 · Nigeria"
  heroImg: string
  stats: ProgramStat[]
  features: ProgramFeature[]
  timeline: ProgramTimelineStep[]
  eligibilityList: string[]      // bullet list under "Who it's for"
  mentors: ProgramMentor[]
  dates: ProgramDates
  status: 'active' | 'inactive' | 'draft'
  /** When the sendInterestSegmentEmail callable last fired for a
   *  given template name against this program's audience. Keyed by
   *  template name (e.g. `'next-cycle-opened'`) so a follow-up
   *  template against the same segment doesn't fuzz the read.
   *  Stamped server-side; admin UI surfaces "Announced N ago" so
   *  staff don't accidentally re-spam the segment. */
  lastAnnouncedAt?: Record<string, Date>
  createdAt: Date
  updatedAt: Date
  updatedBy: string
}

export interface ProgramStat {
  icon: string
  label: string
  value: string
}

export interface ProgramFeature {
  title: string
  desc: string
  img: string
}

export interface ProgramTimelineStep {
  date: string
  desc: string
}

export interface ProgramMentor {
  name: string
  title: string
  institution: string
  img: string
}

export interface ProgramDates {
  applicationStart: string
  applicationEnd: string
  programStart: string
  programEnd: string
  decisionsBy: string
}

// A point-in-time copy of a Program, captured by saveProgramWithHistory()
// before each update. Lives at programs/{id}/history/{snapshotId}. Used by
// /admin/programs to let an editor revert to any of the last ~20 versions.
export interface ProgramHistorySnapshot {
  id?: string
  // Captured Program state. Optional because a future schema change could
  // produce historical entries we haven't fully back-filled.
  data: Program
  savedAt: Date
  savedBy: string
}

// --- LMS types ----------------------------------------------------------
//
// Editorial content lives in Contentful, mirrored to Firestore via
// functions/src/contentful.ts. Operational data (cohorts, enrollments,
// progress, submissions, sessions) is Firestore-native.

// Mirror of a Contentful `course` entry. `_sys` carries the publish metadata
// the webhook stamps onto every mirrored doc.
export interface CmsCourse {
  slug: string
  title: string
  program: 'stepup_scholars' | 'dynamerge'
  summary?: string
  coverImage?: { url: string; title?: string } | string
  modules?: { sys: { id: string } }[]
  estimatedHours?: number
  track?: string
  published?: boolean
  version?: string
  _sys?: { id: string; contentType: string; createdAt: string; updatedAt: string; mirroredAt: string }
}

export interface CmsModule {
  slug: string
  title: string
  summary?: string
  lessons?: { sys: { id: string } }[]
  unlockRule?: 'sequential' | 'open'
  assignments?: { sys: { id: string } }[]
  _sys?: CmsCourse['_sys']
}

export interface CmsLesson {
  slug: string
  title: string
  body?: unknown // Contentful Rich Text document
  videoUrl?: string
  attachments?: { url: string; title?: string }[]
  estimatedMinutes?: number
  completionCriteria?: 'viewed' | 'assignment_submitted' | 'quiz_passed'
  quiz?: { sys: { id: string } }
  _sys?: CmsCourse['_sys']
}

export interface QuizOption {
  id: string
  text: string
}

export interface QuizQuestion {
  id: string
  questionText: string
  options: QuizOption[]
  correctOptionId: string
  explanation?: string
}

export interface CmsQuiz {
  slug: string
  title: string
  summary?: string
  passThresholdPercent?: number // Default 70%
  questions: QuizQuestion[]
  _sys?: CmsCourse['_sys']
}

export interface QuizAttempt {
  id?: string
  enrollmentId: string
  studentId: string
  quizId: string
  quizSlug: string
  lessonSlug: string
  score: number
  passed: boolean
  answers: Record<string, string> // questionId -> optionId
  totalQuestions: number
  correctCount: number
  submittedAt: Date
}

export interface CmsAssignmentSpec {
  slug: string
  title: string
  instructions?: unknown // Contentful Rich Text document
  submissionType: 'text' | 'file' | 'link' | 'text_or_file'
  maxFileSizeMb?: number
  acceptedFileTypes?: string[]
  dueOffsetDays?: number
  _sys?: CmsCourse['_sys']
}

// A cycle of a course. StepUp / Dynamerge run as cohorts with set start
// and end dates, a roster of students, and a pool of mentors.
export interface Cohort {
  id?: string
  program: 'stepup_scholars' | 'dynamerge'
  courseSlug: string
  // Pinned at cohort creation so editing the course in Contentful doesn't
  // retroactively change the syllabus for an in-flight cohort.
  courseVersion: string
  name?: string
  startDate: Date
  endDate: Date
  mentorPool: string[] // mentor uids; round-robin assigned at enroll
  status: 'planned' | 'active' | 'completed'
  // Students accepted before the cohort starts wait here. onCohortStart
  // (Phase 2) drains them into enrollments at kickoff.
  queuedStudentIds?: string[]
  /** True once the `reOfferDeferredOnCohortStart` cron has fired the
   *  batched re-offer pass for this cohort. Prevents the daily cron
   *  from re-emailing every deferred applicant each morning while
   *  the cohort sits within the trigger window. Cleared back to
   *  undefined would let a manual re-run happen; staff doesn't need
   *  to touch this field in the normal flow. */
  deferredsAutoReOffered?: boolean
  /** Plain ms epoch when the auto-re-offer pass fired. Surfaced in
   *  the admin Cohorts table so staff can verify the cron ran. */
  deferredsAutoReOfferedAt?: number
  createdAt: Date
  createdBy?: string
}

// A student-in-cohort relationship. The doc id is `${studentId}_${cohortId}`
// so re-enrolling the same student into the same cohort is idempotent.
export interface Enrollment {
  id?: string
  studentId: string
  cohortId: string
  courseSlug: string
  program: 'stepup_scholars' | 'dynamerge'
  // Denormalized at enroll time. The matching mentor_assignments row is
  // the canonical pairing; this copy keeps reads fast.
  mentorId: string
  status: 'active' | 'completed' | 'withdrawn'
  enrolledAt: Date
  completedAt?: Date
  /** Set when status flips to 'withdrawn'. respondToOffer writes this
   *  with `withdrawnReason: 'applicant_declined'` when an applicant
   *  declines the offer after staff has already enrolled them. */
  withdrawnAt?: Date
  withdrawnReason?: 'applicant_declined' | 'staff_manual'
}

// Per-lesson, per-enrollment state. Doc id is
// `${enrollmentId}_${lessonSlug}`.
export interface LessonProgress {
  id?: string
  enrollmentId: string
  studentId: string
  lessonSlug: string
  moduleSlug: string
  status: 'not_started' | 'viewed' | 'completed'
  firstViewedAt?: Date
  completedAt?: Date
  quizScore?: number
  quizPassed?: boolean
}

export interface AssignmentSubmission {
  id?: string
  enrollmentId: string
  studentId: string
  // Denormalized so mentor queries don't require a second hop.
  mentorId: string
  assignmentSlug: string
  // Optional — most assignments are tied to a lesson, but rubric-only
  // capstone submissions may not be.
  lessonSlug?: string
  submissionType: 'text' | 'file' | 'link'
  textContent?: string
  fileUrl?: string
  fileName?: string
  linkUrl?: string
  submittedAt: Date
  status: 'submitted' | 'returned' | 'graded'
  grade?: number
  mentorComment?: string
  gradedAt?: Date
  gradedBy?: string
}

// A scheduled live mentor session for a cohort. Operational, not
// editorial — never lives in Contentful.
export interface LiveSession {
  id?: string
  cohortId: string
  courseSlug: string
  title: string
  description?: string
  startsAt: Date
  endsAt: Date
  meetingUrl: string
  meetingProvider: 'zoom' | 'meet' | 'other'
  hostUid: string
  recordingUrl?: string
  status: 'scheduled' | 'live' | 'completed' | 'cancelled'
  createdAt: Date
  createdBy: string
}

// A student's RSVP for a session. Doc id is
// `${sessionId}_${studentId}`.
export interface SessionRsvp {
  id?: string
  sessionId: string
  studentId: string
  rsvped: 'yes' | 'no' | 'maybe'
  attended?: boolean
  respondedAt: Date
}

/**
 * Single-use invite token that promotes its consumer to role='mentor'.
 *
 * The doc ID is the token itself (32 hex chars of crypto-random), so
 * the URL `staija.org/invite/<docId>` is the full invite link — no
 * separate token field needed. Generated by staff/admin via the
 * UserManagement page, mailed/messaged to the vetted contact, and
 * consumed exactly once when the recipient signs in and lands on
 * `/invite/<token>`. The consume callable validates not-expired,
 * not-consumed, optional email match, then flips the caller's role to
 * mentor and stamps `consumed`.
 *
 * Why a separate collection vs. a field on `users/`: most mentors
 * don't have an account yet when the invite is generated, so we can't
 * attach the token to a user doc. The mentorInvites collection
 * decouples invite issuance from account creation.
 */
export interface MentorInvite {
  /** Same value as the Firestore doc ID. Stored redundantly so a
   *  query result is self-describing without consulting `id`. */
  token: string
  /** UID of the staff/admin who minted the invite. */
  createdBy: string
  /** Display name of the issuer at mint time — denormalised so the
   *  consume landing page can render "{Name} invited you" without a
   *  second user lookup. */
  createdByName: string
  /** Plain ms epoch (not Timestamp) so it round-trips cleanly through
   *  the callable response. */
  createdAt: number
  /** Plain ms epoch. Default 30 days from createdAt at issuance;
   *  staff can pass a custom `expiresInDays` at mint time. */
  expiresAt: number
  /** True once a valid consume call has landed. Idempotent re-fires
   *  by the SAME uid return success without flipping anything. */
  consumed: boolean
  consumedBy?: string
  consumedAt?: number
  /** Optional admin-supplied audit note ("Reached out to her via
   *  LinkedIn after the matchmaking session"). Surfaced in the
   *  pending-invites list so other staff understand the context. */
  note?: string
  /** Optional email restriction. When set, the consume callable
   *  rejects unless the signed-in user's email matches (case-
   *  insensitive). Without this, anyone with the URL can claim the
   *  invite — fine for trusted forwards, risky if the link leaks. */
  email?: string
  /** Set true when staff revokes the invite from the admin UI before
   *  it's been consumed. Consume rejects revoked tokens with a clear
   *  message. Once revoked, the row is read-only — to "un-revoke"
   *  staff just mints a fresh invite. */
  revoked?: boolean
  revokedAt?: number
  revokedBy?: string
}
