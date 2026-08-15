import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type QueryConstraint,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase.ts';

export interface AppEvent {
  id?: string;
  title: string;
  description: string;
  start: Date | string | Timestamp;
  end: Date | string | Timestamp;
  timezone: string;
  location: {
    type: 'online' | 'physical';
    url?: string;
    address?: string;
  };
  capacity: number;
  registeredCount: number;
  waitlistCount: number;
  tags: string[];
  published: boolean;
  createdBy: string;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface EventRegistration {
  id?: string;
  eventId: string;
  uid: string;
  status: 'registered' | 'waitlisted' | 'cancelled';
  createdAt: Date | Timestamp;
  cancelledAt?: Date | Timestamp;
}

export class EventService {
  private static eventsRef = collection(db, 'events');
  private static registrationsRef = collection(db, 'event_registrations');

  static async createEvent(
    eventData: Omit<
      AppEvent,
      'id' | 'createdAt' | 'updatedAt' | 'registeredCount' | 'waitlistCount'
    >
  ): Promise<string> {
    const docRef = await addDoc(this.eventsRef, {
      ...eventData,
      registeredCount: 0,
      waitlistCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  static async updateEvent(eventId: string, updates: Partial<AppEvent>): Promise<void> {
    const docRef = doc(this.eventsRef, eventId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  }

  static async getEvents(
    filters: { publishedOnly?: boolean; tags?: string[] } = {}
  ): Promise<AppEvent[]> {
    const constraints: QueryConstraint[] = [orderBy('start', 'asc')];

    if (filters.publishedOnly) {
      constraints.unshift(where('published', '==', true));
    }

    if (filters.tags && filters.tags.length > 0) {
      constraints.push(where('tags', 'array-contains-any', filters.tags));
    }

    const q = query(this.eventsRef, ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as AppEvent);
  }

  static async getEvent(eventId: string): Promise<AppEvent | null> {
    const docRef = doc(this.eventsRef, eventId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as AppEvent;
  }

  static async registerForEvent(eventId: string, uid: string): Promise<string> {
    return await runTransaction(db, async transaction => {
      const eventRef = doc(this.eventsRef, eventId);
      const eventSnap = await transaction.get(eventRef);

      if (!eventSnap.exists()) throw new Error('Event not found');
      const event = eventSnap.data() as AppEvent;

      // Check existing registration
      const regQuery = query(
        this.registrationsRef,
        where('eventId', '==', eventId),
        where('uid', '==', uid),
        where('status', 'in', ['registered', 'waitlisted'])
      );
      const regSnap = await getDocs(regQuery);
      if (!regSnap.empty) throw new Error('Already registered');

      let status: 'registered' | 'waitlisted';
      if (event.registeredCount < event.capacity) {
        status = 'registered';
        transaction.update(eventRef, { registeredCount: event.registeredCount + 1 });
      } else {
        status = 'waitlisted';
        transaction.update(eventRef, { waitlistCount: event.waitlistCount + 1 });
      }

      const newRegRef = doc(this.registrationsRef);
      transaction.set(newRegRef, {
        eventId,
        uid,
        status,
        createdAt: serverTimestamp(),
      });

      return newRegRef.id;
    });
  }

  static async cancelRegistration(eventId: string, uid: string): Promise<void> {
    await runTransaction(db, async transaction => {
      const q = query(
        this.registrationsRef,
        where('eventId', '==', eventId),
        where('uid', '==', uid),
        where('status', 'in', ['registered', 'waitlisted'])
      );
      const snap = await getDocs(q);
      if (snap.empty) throw new Error('Registration not found');

      const regDoc = snap.docs[0];
      const regData = regDoc.data() as EventRegistration;

      const eventRef = doc(this.eventsRef, eventId);
      // Optimistically get event for counters (though we don't strictly need read-lock if we use increment, but we need values for logic if we were promoting)
      // For now just decrement.

      // Note: Firestore transactions require reads before writes.
      const eventSnap = await transaction.get(eventRef);
      if (!eventSnap.exists()) throw new Error('Event not found'); // Should exist
      const event = eventSnap.data() as AppEvent;

      if (regData.status === 'registered') {
        transaction.update(eventRef, { registeredCount: event.registeredCount - 1 });
      } else {
        transaction.update(eventRef, { waitlistCount: event.waitlistCount - 1 });
      }

      transaction.update(regDoc.ref, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
      });
    });
  }

  static async getUserRegistration(
    eventId: string,
    uid: string
  ): Promise<EventRegistration | null> {
    const q = query(
      this.registrationsRef,
      where('eventId', '==', eventId),
      where('uid', '==', uid),
      where('status', 'in', ['registered', 'waitlisted'])
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as EventRegistration;
  }
}
