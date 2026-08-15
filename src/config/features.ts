/**
 * Site-wide feature flags.
 *
 * Flip a value here to enable/disable a feature across the whole UI in
 * one edit. Each flag's comment explains the gating rule and what to do
 * when the gate clears.
 */

/**
 * Donations & donor surfaces.
 *
 * `false` while the founder completes Paystack/regulator compliance.
 * When `false`:
 *   - all "Donate" CTAs are removed from the header, footer, blog, and
 *     post-page CTAs
 *   - the "/donate" route renders a "compliance pending" placeholder
 *   - the "/donor" route redirects to the home page (no donations exist
 *     yet, so there's nothing to show)
 *   - the donor-account dropdown link in the header is hidden
 *
 * To re-enable: flip to `true`, set the production Paystack secret in
 * Firebase Secret Manager (`PAYSTACK_SECRET_KEY`), configure the live
 * webhook URL in Paystack, and redeploy `paystackWebhook`.
 */
export const donationsEnabled = false;
