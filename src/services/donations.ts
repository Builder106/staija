/**
 * Donations service — frontend-side Paystack Inline checkout + Firestore
 * read helpers for the donor dashboard.
 *
 * Frontend records "intent" only (a placeholder doc with status='pending').
 * The Paystack webhook (functions/src/index.ts → paystackWebhook) is the
 * source of truth for "succeeded" donations — it idempotently upserts the
 * donation record on `charge.success`. This means a flaky network during
 * the redirect doesn't lose the donation.
 *
 * Currency: amounts are stored in **kobo** (1 NGN = 100 kobo). Display
 * converts at the edge via `formatNaira()`.
 */

import {
  collection,
  limit as fsLimit,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../config/firebase';
import { getAppConfig } from '../utils/env';
import { trackDonateComplete } from './analytics';

// --- Types -------------------------------------------------------------

export type DonationFrequency = 'one-time' | 'monthly';
export type DonationStatus = 'pending' | 'success' | 'failed' | 'cancelled';

export interface Donation {
  ref: string;
  donorEmail: string;
  donorUid?: string;
  amountKobo: number;
  currency: 'NGN';
  frequency: DonationFrequency;
  status: DonationStatus;
  createdAt: Date;
  paystackCustomerCode?: string;
  paystackSubscriptionCode?: string;
}

export interface DonateParams {
  amountKobo: number;
  email: string;
  frequency: DonationFrequency;
  /** Optional: Paystack plan code for monthly. Created server-side from a tier amount. */
  planCode?: string;
  /** Optional: pre-fill the donor's name on the Paystack popup. */
  fullName?: string;
}

export interface DonateResult {
  status: 'success' | 'cancelled';
  reference?: string;
  message?: string;
}

// --- Paystack Inline ---------------------------------------------------

interface PaystackHandler {
  openIframe: () => void;
}

interface PaystackPopWindow extends Window {
  PaystackPop?: {
    setup: (config: {
      key: string;
      email: string;
      amount: number;
      currency?: string;
      ref?: string;
      plan?: string;
      metadata?: Record<string, unknown>;
      callback: (resp: { reference: string; status?: string }) => void;
      onClose: () => void;
    }) => PaystackHandler;
  };
}

const PAYSTACK_INLINE_SRC = 'https://js.paystack.co/v1/inline.js';
let paystackLoadPromise: Promise<void> | null = null;

function loadPaystack(): Promise<void> {
  if (typeof window === 'undefined')
    return Promise.reject(new Error('Paystack requires a browser'));
  const w = window as PaystackPopWindow;
  if (w.PaystackPop) return Promise.resolve();
  if (paystackLoadPromise) return paystackLoadPromise;

  paystackLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PAYSTACK_INLINE_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Paystack')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.src = PAYSTACK_INLINE_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Paystack'));
    document.head.appendChild(script);
  });
  return paystackLoadPromise;
}

/**
 * Generate a unique reference for the donation. Used as the Firestore doc
 * key so the webhook upsert is idempotent.
 */
export function makeDonationRef(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `staija-${ts}-${rand}`;
}

/**
 * Launch Paystack Inline. Returns a promise that resolves on success or
 * rejects on user-cancel / load failure.
 *
 * The actual donation record is written by the Paystack webhook on the
 * server side. The frontend only fires `donate_complete` analytics on
 * the popup callback so the funnel metric stays accurate even if the
 * webhook is delayed.
 */
export async function donate(params: DonateParams): Promise<DonateResult> {
  const config = getAppConfig();
  if (!config.paystack) {
    throw new Error(
      'Paystack public key is not configured. Set VITE_PAYSTACK_PUBLIC_KEY in your .env file.'
    );
  }
  if (params.amountKobo <= 0) {
    throw new Error('Amount must be greater than zero.');
  }

  await loadPaystack();
  const w = window as PaystackPopWindow;
  if (!w.PaystackPop) throw new Error('Paystack failed to load');

  const ref = makeDonationRef();
  const currentUid = auth.currentUser?.uid;

  return new Promise<DonateResult>((resolve, reject) => {
    try {
      const handler = w.PaystackPop!.setup({
        key: config.paystack!.publicKey,
        email: params.email,
        amount: params.amountKobo,
        currency: 'NGN',
        ref,
        plan: params.frequency === 'monthly' ? params.planCode : undefined,
        metadata: {
          frequency: params.frequency,
          donor_uid: currentUid ?? null,
          full_name: params.fullName ?? null,
          source: 'website',
        },
        callback: resp => {
          trackDonateComplete({
            amount_kobo: params.amountKobo,
            frequency: params.frequency,
            paystack_ref: resp.reference,
            currency: 'NGN',
          });
          resolve({ status: 'success', reference: resp.reference });
        },
        onClose: () => {
          resolve({ status: 'cancelled', message: 'Donation cancelled' });
        },
      });
      handler.openIframe();
    } catch (err) {
      reject(err);
    }
  });
}

// --- Firestore reads (donor dashboard) --------------------------------

function donationFromDoc(data: DocumentData, id: string): Donation {
  const ts = data.createdAt as Timestamp | undefined;
  return {
    ref: data.ref ?? id,
    donorEmail: data.donorEmail ?? '',
    donorUid: data.donorUid ?? undefined,
    amountKobo: data.amountKobo ?? 0,
    currency: data.currency ?? 'NGN',
    frequency: data.frequency ?? 'one-time',
    status: data.status ?? 'pending',
    createdAt: ts ? ts.toDate() : new Date(),
    paystackCustomerCode: data.paystackCustomerCode,
    paystackSubscriptionCode: data.paystackSubscriptionCode,
  };
}

/**
 * Returns donations for the currently signed-in user. Looks up by `donorUid`
 * first; falls back to `donorEmail` if uid wasn't set at donate time.
 * Firestore security rules should restrict `donations/*` reads to the
 * matching uid OR admin role — see firestore.rules.
 */
export async function getMyDonations(maxResults = 50): Promise<Donation[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const col = collection(db, 'donations');
  const results: Donation[] = [];

  const byUid = await getDocs(
    query(col, where('donorUid', '==', user.uid), orderBy('createdAt', 'desc'), fsLimit(maxResults))
  );
  byUid.forEach(d => results.push(donationFromDoc(d.data(), d.id)));

  if (results.length === 0 && user.email) {
    const byEmail = await getDocs(
      query(
        col,
        where('donorEmail', '==', user.email),
        orderBy('createdAt', 'desc'),
        fsLimit(maxResults)
      )
    );
    byEmail.forEach(d => results.push(donationFromDoc(d.data(), d.id)));
  }

  return results;
}

// --- Display helpers --------------------------------------------------

const NAIRA_FORMATTER = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

export function formatNaira(amountKobo: number): string {
  return NAIRA_FORMATTER.format(amountKobo / 100);
}

/**
 * Cancel a monthly donation. Calls the `cancelSubscription` Cloud Function
 * which (1) verifies ownership against the donation row in Firestore,
 * (2) calls Paystack's disable API, (3) mirrors the new status.
 */
export async function cancelMyDonation(subscriptionCode: string): Promise<void> {
  const callable = httpsCallable<{ subscriptionCode: string }, { ok: boolean }>(
    functions,
    'cancelSubscription'
  );
  const result = await callable({ subscriptionCode });
  if (!result.data?.ok) throw new Error('Cancellation rejected');
}
