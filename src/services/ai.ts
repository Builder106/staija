/**
 * Thin wrappers around AI-backed Cloud Functions.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase.ts';

export interface OutlineCoursePayload {
  topic: string;
  program: 'stepup_scholars' | 'dynamerge';
  weeks: number;
  lessonsPerModule?: number;
  audience?: string;
  version?: string;
  env?: string;
}

export interface OutlineCourseResult {
  courseId: string;
  title: string;
  moduleCount: number;
  lessonCount: number;
  assignmentCount: number;
}

export const outlineCourse = (data: OutlineCoursePayload) =>
  httpsCallable<OutlineCoursePayload, OutlineCourseResult>(
    functions,
    'outlineCourse',
  )(data).then((r) => r.data);

export interface LessonMediaPayload {
  title: string;
  /** Plain-text version of the lesson body — caller flattens rich text. */
  bodyPlain: string;
}

export interface LessonMediaResult {
  videoQueries: { query: string; rationale: string }[];
  imageQueries: { query: string; rationale: string }[];
  /** 80-120 word narration script the editor can read aloud and record. */
  narrationScript: string;
  /** 3-5 short bullets distilling the lesson takeaways. */
  keyConcepts: string[];
}

export const lessonMediaAssist = (data: LessonMediaPayload) =>
  httpsCallable<LessonMediaPayload, LessonMediaResult>(
    functions,
    'lessonMediaAssist',
  )(data).then((r) => r.data);
