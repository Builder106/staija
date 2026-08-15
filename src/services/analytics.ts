/**
 * Analytics service — typed wrapper over Firebase Analytics (GA4) that
 * no-ops in dev / when analytics isn't initialized. Funnel events match
 * the metrics targets in docs/PRD.md §10.
 *
 * Usage:
 *   import { trackEvent, trackApplyClick, trackDonateComplete } from '../services/analytics'
 *   trackApplyClick({ program: 'stepup', source: 'home_hero' })
 *
 * Page views are auto-tracked via the router hook installed in main.ts.
 */

import { logEvent } from 'firebase/analytics';
import type { Router } from 'vue-router';
import { analytics } from '../config/firebase';

type FunnelParams = Record<string, string | number | boolean | undefined>;

/**
 * Low-level wrapper. Safe to call in dev — silently no-ops when analytics
 * isn't initialized (which is the case anywhere except production).
 */
export function trackEvent(name: string, params: FunnelParams = {}): void {
  if (!analytics) return;
  try {
    // Strip undefined values; GA4 rejects them.
    const clean: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) clean[k] = v;
    }
    logEvent(analytics, name, clean);
  } catch (err) {
    console.warn('[analytics] trackEvent failed', err);
  }
}

// --- Funnel events (PRD §10) -----------------------------------------

export function trackPageView(path: string, title?: string): void {
  trackEvent('page_view', { page_path: path, page_title: title });
}

export function trackApplyClick(params: {
  program: 'stepup' | 'dynamerge';
  source: string; // home_hero | program_hero | program_cta_banner | nav | etc.
}): void {
  trackEvent('apply_click', params);
}

export function trackDonateStart(params: {
  amount_kobo: number;
  frequency: 'one-time' | 'monthly';
  tier?: 'preset' | 'custom';
}): void {
  trackEvent('donate_start', params);
}

export function trackDonateComplete(params: {
  amount_kobo: number;
  frequency: 'one-time' | 'monthly';
  paystack_ref: string;
  currency: 'NGN' | 'USD';
}): void {
  trackEvent('donate_complete', params);
}

export function trackNewsletterSignup(source: string): void {
  trackEvent('newsletter_signup', { source });
}

export function trackEventRsvp(params: { event_slug: string; is_virtual: boolean }): void {
  trackEvent('event_rsvp', params);
}

export function trackInquirySubmit(params: {
  type: 'volunteer' | 'partner' | 'intern' | 'contact';
}): void {
  trackEvent('inquiry_submit', params);
}

// --- Router integration ----------------------------------------------

/**
 * Install on the vue-router instance to auto-fire `page_view` events on
 * every successful navigation. Idempotent — safe to call once at app boot.
 */
export function installAnalyticsRouter(router: Router): void {
  router.afterEach(to => {
    // Use the document title once vue-router has set it (next tick).
    setTimeout(() => {
      trackPageView(to.fullPath, document.title);
    }, 0);
  });
}
