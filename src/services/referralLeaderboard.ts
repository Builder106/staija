/**
 * Referral leaderboard reader.
 *
 * Fetches the top-N rows of `referralStats` ordered by `signupCount`
 * descending, then joins `u-<uid>` rows against `users/<uid>` for a
 * named display. Anonymous rows (`a-<short>`) stay numeric — the
 * short id is shown as-is so admin can correlate with copy-link logs.
 *
 * Read access is gated to staff/admin by the Firestore rule on
 * `referralStats/{id}` — this module assumes the caller already has
 * the role, otherwise the underlying `getDocs` throws permission-
 * denied and the catch in the view surfaces it.
 *
 * Why the join lives client-side: top-25 + name lookup is two queries
 * with at most 30 reads. A Cloud Function would buy nothing but
 * latency and a deploy dependency.
 */

import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface ReferralLeaderboardRow {
  /** Stored doc id — `u-<uid>` for signed-in referrers, `a-<short>`
   *  for anonymous ones. Stable across renders so it works as a Vue
   *  `:key`. */
  id: string;
  /** True when this referrer is a signed-in user the join could
   *  resolve to a real display name. False for anonymous rows and
   *  for signed-in rows whose user doc has since been deleted. */
  identified: boolean;
  /** Display name (joined from `users/<uid>.displayName`) when the
   *  row is identified, otherwise a humanised short-id string like
   *  "Anonymous · abc1234". */
  displayName: string;
  /** When identified, the uid component (`<uid>` without the `u-`
   *  prefix) so the UI can link to the user profile. `null` for
   *  anonymous rows. */
  uid: string | null;
  signupCount: number;
  lastSignupAt: Date | null;
}

/** Top-N rows. Default limit of 25 is generous for an early-stage
 *  surface; admin can re-run with a larger limit when the program
 *  scales and we want a fuller leaderboard. */
export async function fetchReferralLeaderboard(topN = 25): Promise<ReferralLeaderboardRow[]> {
  const statsQuery = query(
    collection(db, 'referralStats'),
    orderBy('signupCount', 'desc'),
    limit(topN)
  );
  const snap = await getDocs(statsQuery);
  if (snap.empty) return [];

  // Pre-build the rows in fetched order so we can paste display names
  // in afterwards without re-sorting.
  const rows: ReferralLeaderboardRow[] = snap.docs.map(d => {
    const data = d.data() as { signupCount?: number; lastSignupAt?: Timestamp | Date };
    const id = d.id;
    const isUserRow = id.startsWith('u-');
    const uid = isUserRow ? id.slice(2) : null;
    const last = data.lastSignupAt;
    const lastDate = last instanceof Timestamp ? last.toDate() : last instanceof Date ? last : null;

    return {
      id,
      identified: false, // flipped on join below for user rows
      displayName: isUserRow
        ? `Member | ${uid?.slice(0, 6) ?? '?'}` // placeholder until the join resolves
        : `Anonymous | ${id.slice(2)}`,
      uid,
      signupCount: typeof data.signupCount === 'number' ? data.signupCount : 0,
      lastSignupAt: lastDate,
    };
  });

  // Join names for `u-<uid>` rows. Firestore's `in` operator caps at
  // 30 items, which sits comfortably above our default top-25, so a
  // single batched query covers the join for the standard call. For
  // larger N we chunk into 30-item batches.
  const userUids = rows.map(r => r.uid).filter((u): u is string => Boolean(u));
  if (userUids.length === 0) return rows;

  const CHUNK = 30;
  const profiles = new Map<string, { displayName?: string; email?: string }>();

  for (let i = 0; i < userUids.length; i += CHUNK) {
    const chunk = userUids.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    try {
      const userSnap = await getDocs(
        query(collection(db, 'users'), where(documentId(), 'in', chunk))
      );
      for (const userDoc of userSnap.docs) {
        const data = userDoc.data() as { displayName?: string; email?: string };
        profiles.set(userDoc.id, {
          displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
          email: typeof data.email === 'string' ? data.email : undefined,
        });
      }
    } catch {
      // Batch failure (e.g. an `in` rejected by a future rule change)
      // shouldn't blank the whole leaderboard. Fall back to a
      // per-uid get so rule-permitted reads still resolve.
      for (const uid of chunk) {
        try {
          const oneSnap = await getDoc(doc(db, 'users', uid));
          if (oneSnap.exists()) {
            const data = oneSnap.data() as { displayName?: string; email?: string };
            profiles.set(uid, {
              displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
              email: typeof data.email === 'string' ? data.email : undefined,
            });
          }
        } catch {
          // Per-uid permission denied — leave the row in its
          // placeholder state.
        }
      }
    }
  }

  for (const row of rows) {
    if (!row.uid) continue;
    const profile = profiles.get(row.uid);
    if (!profile) continue;
    row.identified = true;
    row.displayName =
      profile.displayName?.trim() || profile.email?.trim() || `Member | ${row.uid.slice(0, 6)}`;
  }

  return rows;
}
