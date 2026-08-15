import { getAnalytics, type Analytics } from 'firebase/analytics';
import { initializeApp } from 'firebase/app';
import {
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getPerformance, type FirebasePerformance } from 'firebase/performance';
import { getStorage } from 'firebase/storage';

import { getFirebaseConfig } from '../utils/env.ts';

// Get Firebase configuration from environment variables
const firebaseConfig = getFirebaseConfig();

// Log environment info in development
// logEnvironmentInfo()

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize App Check (browser only — App Check has no Node equivalent and
// would crash SSR or test runs). Uses reCAPTCHA Enterprise.
//
// On debug-allowed environments (localhost, staging.staija.org), App Check
// is forced into debug mode: on the first load, Firebase prints a fresh
// debug token to the console. Copy it once and register it in Firebase
// Console → App Check → Apps → ⋮ → Manage debug tokens. To pin a specific
// token (so it survives reloads without re-registering), set
// VITE_FIREBASE_APPCHECK_DEBUG_TOKEN in .env / Vercel scope.
//
// We gate this on hostname rather than import.meta.env.DEV because the
// build flag can be wrong (e.g. NODE_ENV misconfigured on the host),
// which would silently ship debug-mode App Check to production. Adding a
// hostname here is an explicit allowlist; staija.org (prod) is not in
// the list, so prod always uses real reCAPTCHA Enterprise verification.
const isDebugAppCheckEnv =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === 'staging.staija.org');

let appCheck: AppCheck | null = null;
if (typeof window !== 'undefined') {
  if (isDebugAppCheckEnv) {
    const pinnedToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN as string | undefined;
    (
      self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }
    ).FIREBASE_APPCHECK_DEBUG_TOKEN = pinnedToken ?? true;
  }
  const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY as string | undefined;
  if (recaptchaSiteKey) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } else if (isDebugAppCheckEnv) {
    console.warn('[firebase] VITE_RECAPTCHA_ENTERPRISE_SITE_KEY not set — App Check skipped');
  }
}

// Fetch an App Check token for plain fetch() calls. onCall functions don't
// need this — the Firebase SDK auto-attaches the token. Use only for raw
// HTTPS endpoints (e.g. file uploads via multipart). Returns null if App
// Check isn't initialized (e.g. site key missing).
export async function getAppCheckToken(): Promise<string | null> {
  if (!appCheck) return null;
  try {
    const result = await getToken(appCheck, /* forceRefresh */ false);
    return result.token;
  } catch {
    return null;
  }
}

// Initialize Firebase services
export const auth = getAuth(app);
// initializeFirestore (not getFirestore) so we can pass transport options.
// experimentalAutoDetectLongPolling probes the default WebChannel streaming
// transport at startup, and on failure transparently falls back to plain
// HTTP long polling.
//
// Why: Firestore's default transport is a streaming "Listen/channel" URL
// with a very specific query-string signature (VER=8, TYPE=xmlhttp, etc).
// Safari content blockers, school WiFi captive portals, corporate proxies,
// and some mobile carriers in our recruiting regions all flag that as
// suspicious traffic and 4xx it — manifesting as the cryptic
//   "Fetch API cannot load ... due to access control checks"
// console error and silent data hangs. The long-polling fallback looks
// like ordinary HTTPS requests and gets through everywhere.
//
// "Auto-detect" (vs. forceLongPolling) preserves WebChannel for users
// whose networks allow it — those get the lower-latency transport — and
// only degrades for the ones that need it.
//
// persistentLocalCache backs reads with IndexedDB so a repeat visit in the
// same browser can resolve a query like ProgramService.getProgram from
// cache instantly (then revalidate against the server in the background),
// instead of every page load paying the full App-Check-attestation +
// transport-handshake + network round trip again from zero.
// persistentMultipleTabManager lets that cache be shared safely across
// multiple open tabs of the site instead of only the first tab opened.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
// Default bucket — used for application uploads (transcripts, IDs,
// reference letters). Lives in the project's data region (africa-south1)
// since those are private files served only to the applicant + staff.
export const storage = getStorage(app);
// Public bucket — used for program editor assets (hero, mentor, feature
// images) which need a no-cost-tier-eligible region. If
// VITE_FIREBASE_PUBLIC_BUCKET is unset we fall back to the default bucket
// so the app keeps working without it.
const publicBucket = import.meta.env.VITE_FIREBASE_PUBLIC_BUCKET as string | undefined;
export const publicStorage = publicBucket ? getStorage(app, `gs://${publicBucket}`) : storage;
export const functions = getFunctions(app);

// Initialize analytics and performance monitoring (only in production)
let analytics: Analytics | null = null;
let performance: FirebasePerformance | null = null;

if (typeof window !== 'undefined' && import.meta.env.PROD) {
  analytics = getAnalytics(app);
  performance = getPerformance(app);
}

export { analytics, performance };

// Export the app instance
export default app;
