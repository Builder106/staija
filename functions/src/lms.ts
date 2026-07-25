/**
 * LMS callables: enroll students, mark lessons complete, submit
 * assignments, grade submissions.
 *
 * All four enforce App Check and require auth. Direct Firestore writes
 * to enrollments / lesson_progress / assignment_submissions are denied
 * by firestore.rules so business logic, audit trails, and notification
 * side-effects can't be skipped by a tampered client.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { APP_URL, sendMailgun, enrollmentEmail, submissionGradedEmail } from './emailTemplates'

const MAILGUN_API_KEY = defineSecret('MAILGUN_API_KEY')
const MAILGUN_DOMAIN = defineSecret('MAILGUN_DOMAIN')

// --- Helpers ----------------------------------------------------------

async function callerRole(uid: string): Promise<string | null> {
  const snap = await getFirestore().collection('users').doc(uid).get()
  return (snap.data()?.role as string | undefined) ?? null
}

function programLabel(program: string | undefined): string {
  if (program === 'stepup_scholars') return 'StepUp Scholars'
  if (program === 'dynamerge') return 'Dynamerge'
  return 'STAIJA'
}

// --- enrollStudent ----------------------------------------------------
//
// Creates an enrollment + matching mentor assignment. Idempotent on
// (studentId, cohortId) — the doc id is `${studentId}_${cohortId}`. If
// mentorId is omitted, picks the mentor with the fewest active
// enrollments in this cohort (round-robin by load, not by index, so
// the rotation stays balanced even when mentors are added or removed
// mid-cohort).

interface EnrollInput {
  studentId: string
  cohortId: string
  mentorId?: string
}

export const enrollStudent = onCall<EnrollInput>(
  {
    secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN],
    memory: '512MiB',
    timeoutSeconds: 60,
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.')
    }
    const role = await callerRole(request.auth.uid)
    if (role !== 'staff' && role !== 'admin') {
      throw new HttpsError('permission-denied', 'Staff or admin role required.')
    }

    const { studentId, cohortId, mentorId } = request.data ?? {}
    if (!studentId || !cohortId) {
      throw new HttpsError('invalid-argument', 'studentId and cohortId are required.')
    }

    const db = getFirestore()
    const cohortSnap = await db.collection('cohorts').doc(cohortId).get()
    if (!cohortSnap.exists) {
      throw new HttpsError('not-found', `Cohort ${cohortId} not found.`)
    }
    const cohort = cohortSnap.data() as {
      program: string
      courseSlug: string
      mentorPool?: string[]
    }

    const studentRef = db.collection('users').doc(studentId)
    const studentSnap = await studentRef.get()
    if (!studentSnap.exists) {
      throw new HttpsError('not-found', `Student ${studentId} not found.`)
    }
    const student = studentSnap.data() as { email?: string; displayName?: string; role?: string }

    // Cohort/application program-match + spot-response guard.
    //
    // Two bugs the lack of this guard let through:
    //   1. Staff could pair a Dynamerge-accepted applicant with a
    //      StepUp cohort — the system happily enrolled them and the
    //      LMS rendered the wrong program's course content.
    //   2. Staff could enroll someone whose `spotResponse` was still
    //      undefined / 'declined' / 'deferred', i.e. before (or
    //      against) the applicant's own confirmation.
    //
    // We only enforce this for first-time enrollments (role still
    // 'applicant'). An existing student adding a second cohort goes
    // through a different workflow and shouldn't need a fresh
    // application — handled by the role-flip skip at the bottom of
    // this block.
    if (student.role === 'applicant') {
      const appsSnap = await db
        .collection('applications')
        .where('userId', '==', studentId)
        .where('program', '==', cohort.program)
        .where('status', '==', 'accepted')
        .get()
      if (appsSnap.empty) {
        // Either no application for this program at all, or there's
        // one but staff hasn't accepted it yet. Surface the distinct
        // case so staff knows whether to go back to the queue or to
        // pick a different cohort.
        const anyAppSnap = await db
          .collection('applications')
          .where('userId', '==', studentId)
          .where('program', '==', cohort.program)
          .limit(1)
          .get()
        if (anyAppSnap.empty) {
          throw new HttpsError(
            'failed-precondition',
            `This applicant has no application for ${programLabel(cohort.program)}. Pick a cohort whose program matches an accepted application.`,
          )
        }
        throw new HttpsError(
          'failed-precondition',
          `This applicant's ${programLabel(cohort.program)} application isn't accepted yet. Decide on the application first.`,
        )
      }
      const confirmedApp = appsSnap.docs.find(
        (d) => (d.data() as { spotResponse?: string }).spotResponse === 'accepted',
      )
      if (!confirmedApp) {
        // There's an accepted application but the applicant hasn't
        // confirmed (or has declined / deferred). Surface which
        // state we're in so staff can either chase the applicant or
        // wait for re-offer.
        const responses = appsSnap.docs.map(
          (d) => (d.data() as { spotResponse?: string }).spotResponse ?? 'awaiting',
        )
        const reason =
          responses.every((r) => r === 'declined')
            ? `applicant declined the spot`
            : responses.every((r) => r === 'deferred')
            ? `applicant deferred to next cycle`
            : `applicant hasn't confirmed the spot yet`
        throw new HttpsError(
          'failed-precondition',
          `Can't enroll — ${reason}. Confirm the spot response first.`,
        )
      }
    }

    // Role transition. Until now, enrolling an applicant didn't change
    // their role — they stayed `applicant` even after landing in a
    // cohort, which meant their dashboard kept showing the post-apply
    // queue surface instead of the LMS, and the role-gated routes
    // (e.g. /learn) silently denied them. We flip to `student` here
    // so the enrollment is a complete state transition: read access
    // to lessons / sessions / mentor surfaces unlocks in one server
    // round-trip. Idempotent against re-enrollment because we only
    // bump when the current role is applicant.
    if (student.role === 'applicant') {
      await studentRef.update({
        role: 'student',
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    // Pick a mentor.
    let resolvedMentorId = mentorId
    if (!resolvedMentorId) {
      const pool = cohort.mentorPool ?? []
      if (pool.length === 0) {
        throw new HttpsError(
          'failed-precondition',
          'Cohort has no mentor pool and no mentor was specified.',
        )
      }
      // Count active enrollments per mentor in this cohort, pick the
      // lowest. If all zero, picks the first.
      const counts = await Promise.all(
        pool.map(async (mid) => {
          const q = await db
            .collection('enrollments')
            .where('cohortId', '==', cohortId)
            .where('mentorId', '==', mid)
            .where('status', '==', 'active')
            .count()
            .get()
          return { mid, count: q.data().count }
        }),
      )
      counts.sort((a, b) => a.count - b.count)
      resolvedMentorId = counts[0].mid
    } else if (!cohort.mentorPool?.includes(resolvedMentorId)) {
      throw new HttpsError(
        'invalid-argument',
        `Mentor ${resolvedMentorId} is not in this cohort's mentor pool.`,
      )
    }

    const enrollmentId = `${studentId}_${cohortId}`
    const enrollmentRef = db.collection('enrollments').doc(enrollmentId)
    const now = FieldValue.serverTimestamp()

    await enrollmentRef.set(
      {
        studentId,
        cohortId,
        courseSlug: cohort.courseSlug,
        program: cohort.program,
        mentorId: resolvedMentorId,
        status: 'active',
        enrolledAt: now,
      },
      { merge: true },
    )

    // Mirror as a mentor_assignment so the existing mentor portal picks
    // it up without changes.
    const assignmentRef = db.collection('mentor_assignments').doc(enrollmentId)
    await assignmentRef.set(
      {
        mentorId: resolvedMentorId,
        studentId,
        program: cohort.program,
        status: 'active',
        assignedAt: now,
        assignedBy: request.auth.uid,
        notes: `Auto-assigned via cohort ${cohortId}`,
      },
      { merge: true },
    )

    // In-app notification + welcome email. Best-effort.
    try {
      await db.collection('notifications').add({
        uid: studentId,
        type: 'general',
        title: `You're enrolled in ${programLabel(cohort.program)}`,
        message: 'Open your dashboard to start the first lesson.',
        data: { cohortId, courseSlug: cohort.courseSlug },
        read: false,
        createdAt: now,
      })
    } catch (err) {
      console.error('[enrollStudent] notification create failed', err)
    }

    if (student.email) {
      const firstName = (student.displayName ?? '').trim().split(/\s+/)[0] || 'there'
      try {
        const { html, text } = enrollmentEmail({
          firstName,
          programLabel: programLabel(cohort.program),
          courseUrl: `${APP_URL}/learn/course/${cohort.courseSlug}`,
        })
        await sendMailgun({
          apiKey: MAILGUN_API_KEY.value(),
          domain: MAILGUN_DOMAIN.value(),
          to: student.email,
          subject: `Welcome to ${programLabel(cohort.program)}`,
          text,
          html,
        })
      } catch (err) {
        console.error('[enrollStudent] welcome email failed', err)
      }
    }

    return { ok: true, enrollmentId, mentorId: resolvedMentorId }
  },
)

// --- completeLesson ---------------------------------------------------

interface CompleteLessonInput {
  enrollmentId: string
  lessonSlug: string
  moduleSlug?: string
}

export const completeLesson = onCall<CompleteLessonInput>(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.')
    }
    const { enrollmentId, lessonSlug, moduleSlug } = request.data ?? {}
    if (!enrollmentId || !lessonSlug) {
      throw new HttpsError('invalid-argument', 'enrollmentId and lessonSlug are required.')
    }

    const db = getFirestore()
    const enrollmentSnap = await db.collection('enrollments').doc(enrollmentId).get()
    if (!enrollmentSnap.exists) {
      throw new HttpsError('not-found', 'Enrollment not found.')
    }
    const enrollment = enrollmentSnap.data() as {
      studentId: string
      cohortId: string
      courseSlug: string
      status: string
      mentorId?: string
    }
    if (enrollment.studentId !== request.auth.uid) {
      throw new HttpsError('permission-denied', "You can't update someone else's progress.")
    }

    const progressId = `${enrollmentId}_${lessonSlug}`
    const progressRef = db.collection('lesson_progress').doc(progressId)
    const now = FieldValue.serverTimestamp()
    await progressRef.set(
      {
        enrollmentId,
        studentId: enrollment.studentId,
        mentorId: enrollment.mentorId ?? null,
        lessonSlug,
        moduleSlug: moduleSlug ?? '',
        status: 'completed',
        completedAt: now,
        firstViewedAt: now,
      },
      { merge: true },
    )

    // Course completion: count distinct lessons in cms_modules of this
    // course vs completed lesson_progress rows. If equal, flip
    // enrollment to completed.
    try {
      const modulesSnap = await db
        .collection('cms_modules')
        .where('courseSlug', '==', enrollment.courseSlug)
        .get()
      const allLessonSlugs: string[] = []
      for (const m of modulesSnap.docs) {
        const data = m.data() as { lessons?: { sys: { id: string } }[] }
        // Lessons in cms_modules are stored as Contentful sys-id
        // references; the doc itself is keyed by sys id, not slug. We
        // resolve via cms_lessons docs in a follow-up read because the
        // mirror flattens but doesn't denormalize cross-references.
        const refs = data.lessons ?? []
        for (const r of refs) {
          if (r?.sys?.id) allLessonSlugs.push(r.sys.id)
        }
      }
      // The naive total above counts Contentful entry IDs, not slugs.
      // For now, we treat completion as "every lesson_progress doc
      // for this enrollment is status=completed" which matches what
      // the student UI computes anyway. A richer aggregate can come
      // when we have a curriculum index.
      const progressSnap = await db
        .collection('lesson_progress')
        .where('enrollmentId', '==', enrollmentId)
        .get()
      const completed = progressSnap.docs.filter(
        (d) => (d.data() as { status?: string }).status === 'completed',
      ).length
      // Conservative: only mark course completed if a curriculum is
      // recognizable (non-empty cms_modules) AND completed lessons
      // match the count. Otherwise leave status as-is.
      if (allLessonSlugs.length > 0 && completed >= allLessonSlugs.length) {
        await db.collection('enrollments').doc(enrollmentId).update({
          status: 'completed',
          completedAt: now,
        })
      }
    } catch (err) {
      console.error('[completeLesson] aggregate update failed', err)
    }

    return { ok: true }
  },
)

// --- submitAssignment -------------------------------------------------

interface SubmitAssignmentInput {
  enrollmentId: string
  assignmentSlug: string
  lessonSlug?: string
  textContent?: string
  fileUrl?: string
  fileName?: string
  linkUrl?: string
}

export const submitAssignment = onCall<SubmitAssignmentInput>(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.')
    }
    const { enrollmentId, assignmentSlug, lessonSlug, textContent, fileUrl, fileName, linkUrl } =
      request.data ?? {}
    if (!enrollmentId || !assignmentSlug) {
      throw new HttpsError('invalid-argument', 'enrollmentId and assignmentSlug are required.')
    }
    if (!textContent && !fileUrl && !linkUrl) {
      throw new HttpsError(
        'invalid-argument',
        'At least one of textContent / fileUrl / linkUrl is required.',
      )
    }

    const db = getFirestore()
    const enrollmentSnap = await db.collection('enrollments').doc(enrollmentId).get()
    if (!enrollmentSnap.exists) {
      throw new HttpsError('not-found', 'Enrollment not found.')
    }
    const enrollment = enrollmentSnap.data() as {
      studentId: string
      mentorId: string
    }
    if (enrollment.studentId !== request.auth.uid) {
      throw new HttpsError('permission-denied', "You can't submit on someone else's enrollment.")
    }

    // Determine submissionType from the inputs that arrived. The
    // assignmentSpec.submissionType is what the UI gates on; here we
    // just record what was actually submitted.
    let submissionType: 'text' | 'file' | 'link' = 'text'
    if (fileUrl) submissionType = 'file'
    else if (linkUrl) submissionType = 'link'

    const submissionRef = await db.collection('assignment_submissions').add({
      enrollmentId,
      studentId: enrollment.studentId,
      mentorId: enrollment.mentorId,
      assignmentSlug,
      lessonSlug: lessonSlug ?? null,
      submissionType,
      textContent: textContent ?? null,
      fileUrl: fileUrl ?? null,
      fileName: fileName ?? null,
      linkUrl: linkUrl ?? null,
      submittedAt: FieldValue.serverTimestamp(),
      status: 'submitted',
    })

    // Notify the mentor.
    try {
      await db.collection('notifications').add({
        uid: enrollment.mentorId,
        type: 'general',
        title: 'New submission to review',
        message: 'A student just submitted an assignment.',
        data: { submissionId: submissionRef.id, enrollmentId, assignmentSlug },
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      })
    } catch (err) {
      console.error('[submitAssignment] mentor notification failed', err)
    }

    return { ok: true, submissionId: submissionRef.id }
  },
)

// --- gradeSubmission --------------------------------------------------

interface GradeSubmissionInput {
  submissionId: string
  grade?: number
  mentorComment?: string
  status: 'returned' | 'graded'
}

export const gradeSubmission = onCall<GradeSubmissionInput>(
  {
    secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN],
    memory: '256MiB',
    timeoutSeconds: 30,
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.')
    }
    const role = await callerRole(request.auth.uid)
    if (role !== 'mentor' && role !== 'staff' && role !== 'admin') {
      throw new HttpsError('permission-denied', 'Mentor, staff, or admin role required.')
    }

    const { submissionId, grade, mentorComment, status } = request.data ?? {}
    if (!submissionId || !status) {
      throw new HttpsError('invalid-argument', 'submissionId and status are required.')
    }
    if (status !== 'returned' && status !== 'graded') {
      throw new HttpsError('invalid-argument', 'status must be returned or graded.')
    }

    const db = getFirestore()
    const submissionRef = db.collection('assignment_submissions').doc(submissionId)
    const submissionSnap = await submissionRef.get()
    if (!submissionSnap.exists) {
      throw new HttpsError('not-found', 'Submission not found.')
    }
    const submission = submissionSnap.data() as {
      mentorId: string
      studentId: string
      assignmentSlug: string
    }

    // Mentor must be the assigned one; staff/admin may grade any.
    if (role === 'mentor' && submission.mentorId !== request.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        "You can only grade submissions for your own assigned students.",
      )
    }

    const update: Record<string, unknown> = {
      status,
      gradedAt: FieldValue.serverTimestamp(),
      gradedBy: request.auth.uid,
    }
    if (typeof grade === 'number') update.grade = grade
    if (typeof mentorComment === 'string') update.mentorComment = mentorComment

    await submissionRef.update(update)

    // Notify the student in-app + email.
    try {
      await db.collection('notifications').add({
        uid: submission.studentId,
        type: 'general',
        title: status === 'graded' ? 'Your submission was graded' : 'Your submission has feedback',
        message: mentorComment ?? '',
        data: { submissionId, assignmentSlug: submission.assignmentSlug },
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      })
    } catch (err) {
      console.error('[gradeSubmission] notification failed', err)
    }

    try {
      const studentSnap = await db.collection('users').doc(submission.studentId).get()
      const studentEmail = studentSnap.data()?.email
      const firstName =
        ((studentSnap.data()?.displayName as string | undefined) ?? '').trim().split(/\s+/)[0] ||
        'there'
      if (studentEmail) {
        const { html, text } = submissionGradedEmail({
          firstName,
          assignmentSlug: submission.assignmentSlug,
          grade: typeof grade === 'number' ? grade : undefined,
          mentorComment: mentorComment ?? '',
          submissionUrl: `${APP_URL}/learn/submissions/${submissionId}`,
        })
        await sendMailgun({
          apiKey: MAILGUN_API_KEY.value(),
          domain: MAILGUN_DOMAIN.value(),
          to: studentEmail,
          subject: 'Your STAIJA submission was graded',
          text,
          html,
        })
      }
    } catch (err) {
      console.error('[gradeSubmission] email failed', err)
    }

    return { ok: true }
  },
)
