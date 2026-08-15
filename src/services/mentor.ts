/**
 * Mentor service — read mentor↔student assignments, read/write mentor
 * feedback. Used by the mentor portal pages.
 *
 * Compound where-clauses are intentionally avoided to keep us on
 * single-field auto-indexes (no firestore.indexes.json edits needed).
 * If the dataset grows past trivial scale, switch the second-field
 * filters to compound queries and add the matching composite indexes.
 */

import { addDoc, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase.ts';
import type { MentorAssignment, MentorFeedback, UserProfile } from './types';

export type AssignedStudent = MentorAssignment & {
  student: UserProfile | null;
};

export class MentorService {
  static async getAssignedStudents(mentorId: string): Promise<AssignedStudent[]> {
    const q = query(collection(db, 'mentor_assignments'), where('mentorId', '==', mentorId));
    const snap = await getDocs(q);
    const assignments: MentorAssignment[] = [];
    snap.forEach(d => {
      const data = d.data() as Omit<MentorAssignment, 'id'>;
      if (data.status === 'active') {
        assignments.push({ id: d.id, ...data });
      }
    });

    return Promise.all(
      assignments.map(async a => {
        try {
          const userSnap = await getDoc(doc(db, 'users', a.studentId));
          return {
            ...a,
            student: userSnap.exists() ? (userSnap.data() as UserProfile) : null,
          };
        } catch {
          return { ...a, student: null };
        }
      })
    );
  }

  static async getAssignment(
    mentorId: string,
    studentId: string
  ): Promise<MentorAssignment | null> {
    const q = query(collection(db, 'mentor_assignments'), where('mentorId', '==', mentorId));
    const snap = await getDocs(q);
    let result: MentorAssignment | null = null;
    snap.forEach(d => {
      if (result) return;
      const data = d.data() as Omit<MentorAssignment, 'id'>;
      if (data.studentId === studentId && data.status === 'active') {
        result = { id: d.id, ...data };
      }
    });
    return result;
  }

  static async getFeedbackForStudent(
    mentorId: string,
    studentId: string
  ): Promise<MentorFeedback[]> {
    const q = query(collection(db, 'mentor_feedback'), where('mentorId', '==', mentorId));
    const snap = await getDocs(q);
    const items: MentorFeedback[] = [];
    snap.forEach(d => {
      const data = d.data() as Omit<MentorFeedback, 'id'>;
      if (data.studentId === studentId) {
        items.push({ id: d.id, ...data });
      }
    });
    return items.sort((a, b) => toMillis(b.submittedAt) - toMillis(a.submittedAt));
  }

  static async submitFeedback(input: {
    mentorId: string;
    studentId: string;
    content: string;
  }): Promise<string> {
    const trimmed = input.content.trim();
    if (!trimmed) throw new Error('Feedback content is required.');
    const docRef = await addDoc(collection(db, 'mentor_feedback'), {
      mentorId: input.mentorId,
      studentId: input.studentId,
      content: trimmed,
      submittedAt: new Date(),
    });
    return docRef.id;
  }
}

function toMillis(value: unknown): number {
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
