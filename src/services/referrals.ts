/**
 * Per-share referral tracking.
 *
 * Each visitor gets a stable referral ID — `u-<uid>` when signed in,
 * `a-<short-random>` when anonymous (persisted in localStorage so a
 * second visit from the same browser keeps the same identity). The ID
 * is the value embedded in the `?ref=` query param on share links, so
 * downstream signups can attribute back to the referrer.
 *
 * Attribution capture: when a visitor lands with `?ref=<id>` in the
 * URL, we stash that id in localStorage so subsequent newsletter
 * signups send it with the subscription payload. We don't try to be
 * cute about decay — the most recent `?ref=` wins until another one
 * overwrites it.
 *
 * Server side: `subscribeNewsletter` reads `referrerId` from the
 * payload and increments `referralStats/<id>` in Firestore. This file
 * never writes to Firestore directly — anonymous browser writes would
 * be an obvious spam vector.
 */

import { auth } from '../config/firebase';
import { getAppConfig } from '../utils/env';

const REF_ID_KEY = 'staija.refId';
const REFERRER_ID_KEY = 'staija.referrerId';

/** Visible characters only — keep the URL clean and easy to share over
 *  voice. 7 random chars × ~5.5 bits ≈ 38 bits, fine for an unguessable
 *  identifier at the volumes we expect. */
function mintShortId(): string {
  // 7 chars from a 36-char alphabet — base36 encoding of a crypto
  // random number, padded if it's shorter than 7 chars in the rare
  // case the random integer falls into a low value.
  const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
  // crypto.getRandomValues exists in every browser we ship to (it's
  // required by the existing Firebase Auth flows).
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 7; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

function isLikelyValidRefId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 64 &&
    // Letters, digits, dash only — keeps URL-encoding boring and
    // server-side validation cheap.
    /^[A-Za-z0-9-]+$/.test(value)
  );
}

/**
 * Return this browser's outgoing referral ID — the value to embed in
 * `?ref=` on any share link this visitor creates. Stable across visits
 * for the same browser; uses the user's uid when signed in so a
 * leaderboard can later credit named accounts.
 *
 * Pass the current signed-in uid if known; pass `null` when anonymous.
 */
export function getOrMintMyReferralId(uid: string | null): string {
  if (uid) return `u-${uid}`;
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(REF_ID_KEY);
    if (isLikelyValidRefId(existing)) return existing;
    const fresh = `a-${mintShortId()}`;
    window.localStorage.setItem(REF_ID_KEY, fresh);
    return fresh;
  } catch {
    // Private mode or quota — fall back to a fresh id with no
    // persistence. The visitor's share links won't be stable across
    // visits in that environment, which is the right tradeoff vs.
    // blowing up.
    return `a-${mintShortId()}`;
  }
}

/**
 * Inspect the current URL and, if it carries `?ref=<id>`, capture it
 * as the referrer attribution for any newsletter signup that happens
 * on this device.
 *
 * Safe to call repeatedly — idempotent in steady state. Returns the
 * captured value (or null when no valid `ref` was present), in case a
 * caller wants to react.
 *
 * No-ops on the server (SSR) and in storage-blocked environments.
 *
 * Self-referral guard. Two halves, both necessary because main.ts
 * calls this once *before* the Firebase auth listener resolves (so
 * `auth.currentUser` is null on the initial hit), then again from
 * `router.afterEach` once the app's mounted:
 *
 *   1. **Refuse to write** a `?ref=` that matches the current
 *      visitor's own id (`u-<uid>` post-auth, or the local
 *      `a-<short>` we minted as a sharer).
 *   2. **Also clear** an already-stored stale self-ref so the
 *      post-auth recapture cleans up after the pre-auth initial
 *      capture wrote a self-credit before we knew who the visitor
 *      was. Without (2) the pre-auth window leaves a permanent
 *      self-credit in localStorage.
 *
 * Without this guard a user could open their own share link in
 * another tab and bump their own `referralStats` counter on a
 * subsequent signup with a different email.
 */
export function captureReferrerFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('ref');

    // Build the set of ids that count as "me" right now.
    const selfIds = new Set<string>();
    const signedInUid = auth.currentUser?.uid ?? null;
    if (signedInUid) selfIds.add(`u-${signedInUid}`);
    const myAnonId = window.localStorage.getItem(REF_ID_KEY);
    if (myAnonId) selfIds.add(myAnonId);

    // Half 2: scrub any stored self-credit from a prior call that
    // landed before we knew the auth state. Runs every call, so the
    // post-auth recapture from router.afterEach finishes the cleanup
    // even when the current URL has no `?ref=`.
    const stored = window.localStorage.getItem(REFERRER_ID_KEY);
    if (stored && selfIds.has(stored)) {
      window.localStorage.removeItem(REFERRER_ID_KEY);
    }

    // Half 1: refuse to write a self-ref on this call.
    if (!isLikelyValidRefId(raw)) return null;
    if (selfIds.has(raw)) return null;

    window.localStorage.setItem(REFERRER_ID_KEY, raw);
    return raw;
  } catch {
    return null;
  }
}

/**
 * Return the referrer attribution captured for this device, if any.
 * Used by NotifyMeForm so a tagged newsletter signup carries the
 * referrer's id along.
 */
export function getCapturedReferrerId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(REFERRER_ID_KEY);
    return isLikelyValidRefId(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a `u-<uid>` referral id to a display name via the public
 * `resolveReferrerName` Cloud Function. Used to personalise the
 * /stay-connected hero. Returns null for anonymous referrers (`a-…`),
 * unconfigured environments, and any lookup failure — the caller
 * falls back to generic hero copy on null.
 */
export async function resolveReferrerDisplayName(
  referrerId: string | null,
): Promise<string | null> {
  if (!referrerId || !referrerId.startsWith('u-')) return null;
  const uid = referrerId.slice(2);
  if (!uid) return null;

  const endpoint = getAppConfig().referrerNameEndpoint;
  if (!endpoint) return null;

  try {
    const url = `${endpoint}?uid=${encodeURIComponent(uid)}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return null;
    const data = (await res.json()) as { displayName?: unknown };
    return typeof data.displayName === 'string' && data.displayName.trim().length > 0
      ? data.displayName.trim()
      : null;
  } catch {
    return null;
  }
}
