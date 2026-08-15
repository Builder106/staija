/**
 * Learn (LMS) service. Wraps:
 *   - cms_* reads (Contentful → Firestore mirror)
 *   - operational collection reads/queries (cohorts, enrollments,
 *     lesson_progress, assignment_submissions, live_sessions,
 *     session_rsvps)
 *   - the LMS callables (enroll, completeLesson, submitAssignment,
 *     gradeSubmission, scheduleSession, rsvpSession)
 *
 * Compound where-clauses are used here from day one — the matching
 * composite indexes are in firestore.indexes.json. (The older
 * MentorService deliberately avoided compound queries to skip index
 * maintenance; LMS volume makes that trade-off the wrong call.)
 */

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  limit as fsLimit,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  type DocumentSnapshot,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase.ts';
import type {
  AssignmentSubmission,
  CmsAssignmentSpec,
  CmsCourse,
  CmsLesson,
  CmsModule,
  CmsQuiz,
  Cohort,
  Enrollment,
  LessonProgress,
  LiveSession,
  QuizAttempt,
  SessionRsvp,
} from './types';

// --- CMS reads (Contentful mirror) ------------------------------------

export class CourseService {
  // Find a course by its slug. The mirror keys docs by Contentful entry
  // id, so we query by `slug` field. Returns null if not yet mirrored
  // or unpublished.
  static async getCourseBySlug(slug: string): Promise<CmsCourse | null> {
    const q = query(collection(db, 'cms_courses'), where('slug', '==', slug), fsLimit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].data() as CmsCourse;
  }

  // Resolve module link references on a course into hydrated CmsModule
  // docs (in the order they were authored). Each module link is a
  // Contentful sys reference; we fetch by entry id which is the
  // Firestore doc id in cms_modules.
  static async getModulesForCourse(course: CmsCourse): Promise<CmsModule[]> {
    const refs = course.modules ?? [];
    if (refs.length === 0) return [];
    const ids = refs.map(r => r?.sys?.id).filter(Boolean);
    const docs = await Promise.all(ids.map(id => getDoc(doc(db, 'cms_modules', id))));
    const out: CmsModule[] = [];
    for (const d of docs) {
      if (d.exists()) out.push(d.data() as CmsModule);
    }
    return out;
  }

  static async getLessonsForModule(module: CmsModule): Promise<CmsLesson[]> {
    const refs = module.lessons ?? [];
    if (refs.length === 0) return [];
    const ids = refs.map(r => r?.sys?.id).filter(Boolean);
    const docs = await Promise.all(ids.map(id => getDoc(doc(db, 'cms_lessons', id))));
    const out: CmsLesson[] = [];
    for (const d of docs) {
      if (d.exists()) out.push(d.data() as CmsLesson);
    }
    return out;
  }

  static async getAssignmentsForModule(module: CmsModule): Promise<CmsAssignmentSpec[]> {
    const refs = module.assignments ?? [];
    if (refs.length === 0) return [];
    const ids = refs.map(r => r?.sys?.id).filter(Boolean);
    const docs = await Promise.all(ids.map(id => getDoc(doc(db, 'cms_assignmentSpecs', id))));
    const out: CmsAssignmentSpec[] = [];
    for (const d of docs) {
      if (d.exists()) out.push(d.data() as CmsAssignmentSpec);
    }
    return out;
  }

  // Lessons and assignments are queried by slug from views (not from
  // the cms_* mirror's primary key). Convenience lookups for the
  // student-facing routes which receive slugs from the URL.
  static async getLessonBySlug(slug: string): Promise<CmsLesson | null> {
    const q = query(collection(db, 'cms_lessons'), where('slug', '==', slug), fsLimit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : (snap.docs[0].data() as CmsLesson);
  }

  static async getModuleBySlug(slug: string): Promise<CmsModule | null> {
    const q = query(collection(db, 'cms_modules'), where('slug', '==', slug), fsLimit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : (snap.docs[0].data() as CmsModule);
  }

  static async getAssignmentSpecBySlug(slug: string): Promise<CmsAssignmentSpec | null> {
    const q = query(collection(db, 'cms_assignmentSpecs'), where('slug', '==', slug), fsLimit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : (snap.docs[0].data() as CmsAssignmentSpec);
  }
}

// --- Cohort + enrollment reads ----------------------------------------

export class CohortService {
  static async getCohort(cohortId: string): Promise<Cohort | null> {
    const snap = await getDoc(doc(db, 'cohorts', cohortId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Cohort) : null;
  }

  static async listActiveCohorts(program?: 'stepup_scholars' | 'dynamerge'): Promise<Cohort[]> {
    const constraints: QueryConstraint[] = [where('status', '==', 'active')];
    if (program) constraints.push(where('program', '==', program));
    constraints.push(orderBy('startDate', 'desc'));
    const snap = await getDocs(query(collection(db, 'cohorts'), ...constraints));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Cohort);
  }

  static async listAllCohorts(): Promise<Cohort[]> {
    const snap = await getDocs(query(collection(db, 'cohorts'), orderBy('startDate', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Cohort);
  }

  static async createCohort(data: Omit<Cohort, 'id' | 'createdAt'>): Promise<string> {
    const ref = await addDoc(collection(db, 'cohorts'), {
      ...data,
      createdAt: Timestamp.now(),
    });
    return ref.id;
  }

  static async updateCohort(cohortId: string, updates: Partial<Cohort>): Promise<void> {
    await updateDoc(doc(db, 'cohorts', cohortId), updates as import('firebase/firestore').UpdateData<Cohort>);
  }

  static async deleteCohort(cohortId: string): Promise<void> {
    await deleteDoc(doc(db, 'cohorts', cohortId));
  }

  /**
   * Clear the two `deferredsAutoReOffered*` markers so the next run
   * of `reOfferDeferredOnCohortStart` will process this cohort
   * again. Used by the Cohorts admin "Re-arm" action when staff
   * wants the cron to re-fire the batched re-offer email — e.g.
   * after editing a cohort's startDate forward, or after the first
   * pass picked up zero applicants because they all hit the deferred
   * state AFTER the cron ran.
   *
   * Field-level deletes via FieldValue.deleteField() so the doc
   * returns to its pre-cron state instead of carrying false +
   * stale-timestamp metadata. Staff/admin rule on cohorts already
   * permits this write; no callable needed.
   */
  static async rearmDeferredsCron(cohortId: string): Promise<void> {
    await updateDoc(doc(db, 'cohorts', cohortId), {
      deferredsAutoReOffered: deleteField(),
      deferredsAutoReOfferedAt: deleteField(),
    });
  }
}

export class EnrollmentService {
  static async getActiveForStudent(studentId: string): Promise<Enrollment[]> {
    const q = query(
      collection(db, 'enrollments'),
      where('studentId', '==', studentId),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Enrollment);
  }

  static async getForCohort(cohortId: string): Promise<Enrollment[]> {
    const q = query(
      collection(db, 'enrollments'),
      where('cohortId', '==', cohortId),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Enrollment);
  }

  static async getForMentor(mentorId: string): Promise<Enrollment[]> {
    const q = query(
      collection(db, 'enrollments'),
      where('mentorId', '==', mentorId),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Enrollment);
  }
}

// --- Progress ---------------------------------------------------------

export class ProgressService {
  static async getProgressForEnrollment(enrollmentId: string): Promise<LessonProgress[]> {
    const q = query(collection(db, 'lesson_progress'), where('enrollmentId', '==', enrollmentId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as LessonProgress);
  }

  // Real-time listener — used by student dashboard / lesson views so
  // the "Mark complete" button reflects updates instantly without
  // refetching.
  static subscribeProgressForEnrollment(
    enrollmentId: string,
    cb: (progress: LessonProgress[]) => void
  ): Unsubscribe {
    const q = query(collection(db, 'lesson_progress'), where('enrollmentId', '==', enrollmentId));
    return onSnapshot(q, snap => {
      cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as LessonProgress));
    });
  }
}

// --- Submissions ------------------------------------------------------

export class SubmissionService {
  static async getOwnSubmissions(
    studentId: string,
    pageSize = 20,
    cursor?: DocumentSnapshot
  ): Promise<{ items: AssignmentSubmission[]; nextCursor?: DocumentSnapshot }> {
    const constraints: QueryConstraint[] = [
      where('studentId', '==', studentId),
      orderBy('submittedAt', 'desc'),
      fsLimit(pageSize),
    ];
    if (cursor) constraints.splice(2, 0, startAfter(cursor));
    const snap = await getDocs(query(collection(db, 'assignment_submissions'), ...constraints));
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }) as AssignmentSubmission);
    const nextCursor = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : undefined;
    return { items, nextCursor };
  }

  static async getSubmission(submissionId: string): Promise<AssignmentSubmission | null> {
    const snap = await getDoc(doc(db, 'assignment_submissions', submissionId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as AssignmentSubmission) : null;
  }

  // Mentor's review queue: ungraded submissions for assigned students,
  // newest first. Real-time so the "1 ungraded" badge auto-updates.
  static subscribeMentorQueue(
    mentorId: string,
    cb: (subs: AssignmentSubmission[]) => void,
    pageSize = 50
  ): Unsubscribe {
    const q = query(
      collection(db, 'assignment_submissions'),
      where('mentorId', '==', mentorId),
      where('status', '==', 'submitted'),
      orderBy('submittedAt', 'desc'),
      fsLimit(pageSize)
    );
    return onSnapshot(q, snap => {
      cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as AssignmentSubmission));
    });
  }

  static async getSubmissionsForEnrollmentAndAssignment(
    enrollmentId: string,
    assignmentSlug: string
  ): Promise<AssignmentSubmission[]> {
    const q = query(
      collection(db, 'assignment_submissions'),
      where('enrollmentId', '==', enrollmentId),
      where('assignmentSlug', '==', assignmentSlug),
      orderBy('submittedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as AssignmentSubmission);
  }

  // Every submission for a single enrollment, newest first. Used by the
  // mentor's per-student view to render the full submission timeline.
  static async getSubmissionsForEnrollmentAndAssignmentAll(
    enrollmentId: string
  ): Promise<AssignmentSubmission[]> {
    const q = query(
      collection(db, 'assignment_submissions'),
      where('enrollmentId', '==', enrollmentId),
      orderBy('submittedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as AssignmentSubmission);
  }
}

// --- Sessions ---------------------------------------------------------

export class SessionService {
  static async listForCohort(cohortId: string): Promise<LiveSession[]> {
    const q = query(
      collection(db, 'live_sessions'),
      where('cohortId', '==', cohortId),
      orderBy('startsAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as LiveSession);
  }

  static async getSession(sessionId: string): Promise<LiveSession | null> {
    const snap = await getDoc(doc(db, 'live_sessions', sessionId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as LiveSession) : null;
  }

  static async upcomingForCohort(cohortId: string, max = 5): Promise<LiveSession[]> {
    const now = Timestamp.now();
    const q = query(
      collection(db, 'live_sessions'),
      where('cohortId', '==', cohortId),
      where('startsAt', '>=', now),
      orderBy('startsAt', 'asc'),
      fsLimit(max)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as LiveSession);
  }

  static async getRsvp(sessionId: string, studentId: string): Promise<SessionRsvp | null> {
    const snap = await getDoc(doc(db, 'session_rsvps', `${sessionId}_${studentId}`));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as SessionRsvp) : null;
  }
}

// --- Callables --------------------------------------------------------

export interface EnrollPayload {
  studentId: string;
  cohortId: string;
  mentorId?: string;
}

export const enrollStudent = (data: EnrollPayload) =>
  httpsCallable<EnrollPayload, { ok: boolean; enrollmentId: string; mentorId: string }>(
    functions,
    'enrollStudent'
  )(data).then(r => r.data);

export const completeLesson = (data: {
  enrollmentId: string;
  lessonSlug: string;
  moduleSlug?: string;
}) =>
  httpsCallable<typeof data, { ok: boolean }>(functions, 'completeLesson')(data).then(r => r.data);

export interface SubmitAssignmentPayload {
  enrollmentId: string;
  assignmentSlug: string;
  lessonSlug?: string;
  textContent?: string;
  fileUrl?: string;
  fileName?: string;
  linkUrl?: string;
}

export const submitAssignment = (data: SubmitAssignmentPayload) =>
  httpsCallable<SubmitAssignmentPayload, { ok: boolean; submissionId: string }>(
    functions,
    'submitAssignment'
  )(data).then(r => r.data);

export const gradeSubmission = (data: {
  submissionId: string;
  grade?: number;
  mentorComment?: string;
  status: 'returned' | 'graded';
}) =>
  httpsCallable<typeof data, { ok: boolean }>(functions, 'gradeSubmission')(data).then(r => r.data);

export interface ScheduleSessionPayload {
  cohortId: string;
  title: string;
  description?: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  meetingUrl: string;
  meetingProvider: 'zoom' | 'meet' | 'other';
}

export const scheduleSession = (data: ScheduleSessionPayload) =>
  httpsCallable<ScheduleSessionPayload, { ok: boolean; sessionId: string }>(
    functions,
    'scheduleSession'
  )(data).then(r => r.data);

export const rsvpSession = (data: { sessionId: string; rsvped: 'yes' | 'no' | 'maybe' }) =>
  httpsCallable<typeof data, { ok: boolean }>(functions, 'rsvpSession')(data).then(r => r.data);

export interface SubmitQuizPayload {
  enrollmentId: string;
  quizId: string;
  lessonSlug: string;
  moduleSlug?: string;
  answers: Record<string, string>;
}

export interface QuizSubmitResult {
  ok: boolean;
  score: number;
  passed: boolean;
  passThresholdPercent: number;
  correctCount: number;
  totalQuestions: number;
  questionFeedback: Record<
    string,
    { correct: boolean; correctOptionId: string; explanation?: string }
  >;
}

export const submitQuiz = (data: SubmitQuizPayload) =>
  httpsCallable<SubmitQuizPayload, QuizSubmitResult>(
    functions,
    'submitQuiz'
  )(data).then(r => r.data);

export class QuizService {
  static async getQuizById(id: string): Promise<CmsQuiz | null> {
    const snap = await getDoc(doc(db, 'cms_quizzes', id));
    return snap.exists() ? (snap.data() as CmsQuiz) : null;
  }

  static async getQuizBySlug(slug: string): Promise<CmsQuiz | null> {
    const q = query(collection(db, 'cms_quizzes'), where('slug', '==', slug), fsLimit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : (snap.docs[0].data() as CmsQuiz);
  }

  static async getAttemptsForStudent(
    enrollmentId: string,
    lessonSlug: string
  ): Promise<QuizAttempt[]> {
    const q = query(
      collection(db, 'quiz_attempts'),
      where('enrollmentId', '==', enrollmentId),
      where('lessonSlug', '==', lessonSlug),
      orderBy('submittedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as QuizAttempt);
  }
}

export interface AskLmsTutorPayload {
  lessonTitle: string;
  lessonBodyPlain: string;
  courseTitle?: string;
  program?: string;
  studentQuestion: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  questionContext?: {
    questionText: string;
    userAnswerText?: string;
    explanation?: string;
  };
}

export interface AskLmsTutorResult {
  reply: string;
  suggestedFollowUps: string[];
}

export const askLmsTutor = (data: AskLmsTutorPayload) =>
  httpsCallable<AskLmsTutorPayload, AskLmsTutorResult>(
    functions,
    'askLmsTutor'
  )(data).then(r => r.data);

// --- Helpers ----------------------------------------------------------

// Convert a Firestore Timestamp / ISO string / Date / number into ms.
// Used by views that rendervariously-typed timestamps from the same
// service. Same shape as the helper in mentor.ts; deliberately
// duplicated here to keep the module self-contained.
export function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value).getTime();
  }
  return 0;
}

// Compute completion fraction for an enrollment given a flat list of
// progress rows + the total lesson count.
export function completionFraction(progress: LessonProgress[], totalLessons: number): number {
  if (totalLessons <= 0) return 0;
  const completed = progress.filter(p => p.status === 'completed').length;
  return Math.min(1, completed / totalLessons);
}
