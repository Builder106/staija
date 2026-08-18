import type { CollectionReference, DocumentData, Query as FsQuery } from 'firebase/firestore';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase.ts';
import type {
  Application,
  ContentItem,
  Program,
  ProgramHistorySnapshot,
  UserProfile,
} from './types';

export class DatabaseService {
  static async getUserProfile(uid: string): Promise<UserProfile | null> {
    if (!db) {
      console.warn('Firestore not available');
      return null;
    }
    // First-call permission-denied on initial page load is almost always
    // an App Check / auth token warmup race — onAuthStateChanged fires
    // immediately with the cached user, but our reCAPTCHA Enterprise
    // App Check token is still being minted. Firestore rejects the
    // unsigned request as permission-denied. A single 500ms-deferred
    // retry hits the now-warm token and succeeds. We only retry once
    // and only for permission-denied so a genuinely-forbidden read
    // (e.g. someone else's profile) still fails fast.
    const docRef = doc(db, 'users', uid);
    try {
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? (docSnap.data() as UserProfile) : null;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'permission-denied') {
        console.error('Get user profile error:', error);
        throw error;
      }
      // Retry-once branch.
      await new Promise((r) => setTimeout(r, 500));
      try {
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? (docSnap.data() as UserProfile) : null;
      } catch (retryError) {
        console.error('Get user profile error (after retry):', retryError);
        throw retryError;
      }
    }
  }

  // Admin-only listing. The matching Firestore rule allows staff/admin to
  // read any document under /users/{uid}; non-staff calls will fail at the
  // server. Don't paginate yet — at our scale (low hundreds at most) one
  // round-trip is fine. Revisit if user counts ever exceed ~1000.
  static async getAllUsers(): Promise<UserProfile[]> {
    try {
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile);
    } catch (error) {
      console.error('Get all users error:', error);
      throw error;
    }
  }

  static async updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
    try {
      const docRef = doc(db, 'users', uid);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Update user profile error:', error);
      throw error;
    }
  }

  static async getContentItems(type?: string, status?: string): Promise<ContentItem[]> {
    try {
      let q: FsQuery<DocumentData> | CollectionReference<DocumentData> = collection(db, 'content');

      if (type) {
        q = query(q, where('type', '==', type));
      }

      if (status) {
        q = query(q, where('status', '==', status));
      }

      q = query(q, orderBy('createdAt', 'desc'));

      const querySnapshot = await getDocs(q);
      const items: ContentItem[] = [];

      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as ContentItem);
      });

      return items;
    } catch (error) {
      console.error('Get content items error:', error);
      throw error;
    }
  }

  static async createContentItem(
    item: Omit<ContentItem, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'content'), {
        ...item,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return docRef.id;
    } catch (error) {
      console.error('Create content item error:', error);
      throw error;
    }
  }

  static async updateContentItem(id: string, updates: Partial<ContentItem>): Promise<void> {
    try {
      const docRef = doc(db, 'content', id);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Update content item error:', error);
      throw error;
    }
  }

  static async deleteContentItem(id: string): Promise<void> {
    try {
      const docRef = doc(db, 'content', id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Delete content item error:', error);
      throw error;
    }
  }

  static onContentChanges(callback: (items: ContentItem[]) => void): () => void {
    const q = query(collection(db, 'content'), orderBy('createdAt', 'desc'));

    return onSnapshot(q, (querySnapshot) => {
      const items: ContentItem[] = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as ContentItem);
      });
      callback(items);
    });
  }

  static async getUserApplications(userId: string): Promise<Application[]> {
    try {
      const q = query(
        collection(db, 'applications'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
      );
      const querySnapshot = await getDocs(q);
      const applications: Application[] = [];
      querySnapshot.forEach((doc) => {
        applications.push({ id: doc.id, ...doc.data() } as Application);
      });
      return applications;
    } catch (error) {
      console.error('Get user applications error:', error);
      throw error;
    }
  }

  static async getApplication(applicationId: string): Promise<Application | null> {
    try {
      const docRef = doc(db, 'applications', applicationId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Application;
      }
      return null;
    } catch (error) {
      console.error('Get application error:', error);
      throw error;
    }
  }

  static async createApplication(
    application: Omit<Application, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'applications'), {
        ...application,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return docRef.id;
    } catch (error) {
      console.error('Create application error:', error);
      throw error;
    }
  }

  static async updateApplication(
    applicationId: string,
    updates: Partial<Application>,
  ): Promise<void> {
    try {
      const docRef = doc(db, 'applications', applicationId);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Update application error:', error);
      throw error;
    }
  }

  static async getAllApplications(status?: string): Promise<Application[]> {
    try {
      let q = query(collection(db, 'applications'), orderBy('createdAt', 'desc'));

      if (status) {
        q = query(q, where('status', '==', status));
      }

      const querySnapshot = await getDocs(q);
      const applications: Application[] = [];
      querySnapshot.forEach((doc) => {
        applications.push({ id: doc.id, ...doc.data() } as Application);
      });
      return applications;
    } catch (error) {
      console.error('Get all applications error:', error);
      throw error;
    }
  }

  static async getProgram(slug: string): Promise<Program | null> {
    try {
      const q = query(collection(db, 'programs'), where('slug', '==', slug), limit(1));
      const snapshot = await getDocs(q);

      if (snapshot.empty) return null;

      const d = snapshot.docs[0];
      return { id: d.id, ...d.data() } as Program;
    } catch (error) {
      console.error('Get program error:', error);
      throw error;
    }
  }

  static async getAllPrograms(): Promise<Program[]> {
    try {
      const q = query(collection(db, 'programs'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Program);
    } catch (error) {
      console.error('Get all programs error:', error);
      throw error;
    }
  }

  static async createProgram(
    program: Omit<Program, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<string> {
    try {
      const now = new Date();
      const programData = {
        ...program,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await addDoc(collection(db, 'programs'), programData);
      return docRef.id;
    } catch (error) {
      console.error('Create program error:', error);
      throw error;
    }
  }

  static async updateProgram(id: string, updates: Partial<Program>): Promise<void> {
    try {
      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      await updateDoc(doc(db, 'programs', id), updateData);
    } catch (error) {
      console.error('Update program error:', error);
      throw error;
    }
  }

  // Save a program update plus a history snapshot of the prior state in a
  // single Firestore batch — atomic, so we never end up with new state
  // committed but no undo trail. Snapshots live at
  // /programs/{id}/history/{snapshotId} and are read by getProgramHistory().
  static async saveProgramWithHistory(
    id: string,
    updates: Partial<Program>,
    savedBy: string,
  ): Promise<void> {
    try {
      const programRef = doc(db, 'programs', id);
      const current = await getDoc(programRef);
      const batch = writeBatch(db);

      // Snapshot the current state (if any) before overwriting.
      if (current.exists()) {
        const historyRef = doc(collection(programRef, 'history'));
        batch.set(historyRef, {
          data: { id: current.id, ...current.data() },
          savedAt: serverTimestamp(),
          savedBy,
        });
      }

      batch.update(programRef, {
        ...updates,
        updatedAt: new Date(),
      });

      await batch.commit();
    } catch (error) {
      console.error('Save program with history error:', error);
      throw error;
    }
  }

  static async getProgramHistory(id: string, max = 20): Promise<ProgramHistorySnapshot[]> {
    try {
      const q = query(
        collection(db, 'programs', id, 'history'),
        orderBy('savedAt', 'desc'),
        limit(max),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ProgramHistorySnapshot);
    } catch (error) {
      console.error('Get program history error:', error);
      throw error;
    }
  }

  static async deleteProgram(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'programs', id));
    } catch (error) {
      console.error('Delete program error:', error);
      throw error;
    }
  }

  static async getActivePrograms(): Promise<Program[]> {
    try {
      const q = query(
        collection(db, 'programs'),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc'),
      );
      const snapshot = await getDocs(q);

      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Program);
    } catch (error) {
      console.error('Get active programs error:', error);
      throw error;
    }
  }
}
