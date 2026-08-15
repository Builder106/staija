import {
  addDoc,
  and,
  collection,
  doc,
  getDoc,
  getDocs,
  or,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase.ts';

export interface ConnectionRequest {
  id?: string;
  fromUid: string;
  toUid: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  createdAt: Date | Timestamp;
  handledAt?: Date | Timestamp;
}

export interface Connection {
  id?: string;
  users: string[]; // [uid1, uid2] sorted
  createdAt: Date | Timestamp;
}

export class ConnectionService {
  private static requestsRef = collection(db, 'connection_requests');
  private static connectionsRef = collection(db, 'connections');

  static async sendRequest(fromUid: string, toUid: string): Promise<string> {
    if (fromUid === toUid) throw new Error('Cannot connect with yourself');

    // Check for existing connection
    const users = [fromUid, toUid].sort();
    const connQuery = query(this.connectionsRef, where('users', '==', users));
    const connSnap = await getDocs(connQuery);
    if (!connSnap.empty) throw new Error('Connection already exists');

    // Check for existing pending request (either direction)
    const pendingQuery = query(
      this.requestsRef,
      and(
        where('status', '==', 'pending'),
        or(
          and(where('fromUid', '==', fromUid), where('toUid', '==', toUid)),
          and(where('fromUid', '==', toUid), where('toUid', '==', fromUid))
        )
      )
    );
    const pendingSnap = await getDocs(pendingQuery);
    if (!pendingSnap.empty) throw new Error('Pending request already exists');

    // Create request
    const docRef = await addDoc(this.requestsRef, {
      fromUid,
      toUid,
      status: 'pending',
      createdAt: serverTimestamp(),
    });

    return docRef.id;
  }

  static async respondToRequest(requestId: string, status: 'accepted' | 'declined'): Promise<void> {
    const reqRef = doc(this.requestsRef, requestId);
    const reqSnap = await getDoc(reqRef);

    if (!reqSnap.exists()) throw new Error('Request not found');
    const data = reqSnap.data() as ConnectionRequest;

    if (data.status !== 'pending') throw new Error('Request is not pending');

    await updateDoc(reqRef, {
      status,
      handledAt: serverTimestamp(),
    });

    if (status === 'accepted') {
      const users = [data.fromUid, data.toUid].sort();
      await addDoc(this.connectionsRef, {
        users,
        createdAt: serverTimestamp(),
      });
    }
  }

  static async getPendingRequests(uid: string): Promise<ConnectionRequest[]> {
    const q = query(this.requestsRef, where('toUid', '==', uid), where('status', '==', 'pending'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as ConnectionRequest);
  }

  static async getConnections(uid: string): Promise<Connection[]> {
    const q = query(this.connectionsRef, where('users', 'array-contains', uid));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Connection);
  }

  static async getConnectionStatus(
    uid1: string,
    uid2: string
  ): Promise<'connected' | 'pending_sent' | 'pending_received' | 'none'> {
    const users = [uid1, uid2].sort();
    const connQuery = query(this.connectionsRef, where('users', '==', users));
    if (!(await getDocs(connQuery)).empty) return 'connected';

    const sentQuery = query(
      this.requestsRef,
      where('fromUid', '==', uid1),
      where('toUid', '==', uid2),
      where('status', '==', 'pending')
    );
    if (!(await getDocs(sentQuery)).empty) return 'pending_sent';

    const receivedQuery = query(
      this.requestsRef,
      where('fromUid', '==', uid2),
      where('toUid', '==', uid1),
      where('status', '==', 'pending')
    );
    if (!(await getDocs(receivedQuery)).empty) return 'pending_received';

    return 'none';
  }
}
