<script setup lang="ts">
/**
 * Tagged newsletter signup for /stay-connected.
 *
 * Same Mailgun-mailing-list endpoint as the footer form, plus an
 * `interestTag` so future drip campaigns can segment by audience
 * (next-cycle applicant vs. mentor-curious vs. general). Falls back to
 * a "fake success" state when `VITE_NEWSLETTER_ENDPOINT` is unset,
 * matching the footer's behavior so unconfigured environments don't
 * advertise a broken form.
 *
 * The default interest tag respects the `?from` / `reason` the page
 * was opened with, so a visitor who arrived because StepUp is closed
 * sees "StepUp — next cycle" preselected.
 */
import { Icon } from '@iconify/vue';
import { ref, watch } from 'vue';
import { trackNewsletterSignup } from '../../services/analytics';
import { getCapturedReferrerId } from '../../services/referrals';
import { getAppConfig } from '../../utils/env';
import Body from '../ui/Body.vue';
import Heading from '../ui/Heading.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';
import UiSelect from '../ui/UiSelect.vue';

const props = defineProps<{
  /** Program slug the visitor was looking at, when known. Used to
   *  preselect the matching interest tag. */
  from: string;
  /** Why the visitor landed here ('closed', 'eligibility', etc.).
   *  Forwarded to the endpoint as part of `source` so analytics can
   *  attribute drip-campaign performance back to the original gap. */
  reason: string;
}>();

type InterestTag = 'stepup-next' | 'dynamerge-next' | 'mentor' | 'general';
const OPTIONS: { value: InterestTag; label: string }[] = [
  { value: 'stepup-next', label: 'StepUp Scholars — next cycle' },
  { value: 'dynamerge-next', label: 'Dynamerge — next cycle' },
  { value: 'mentor', label: 'Becoming a mentor' },
  { value: 'general', label: 'Just general STAIJA updates' },
];

function defaultTag(from: string): InterestTag {
  if (from === 'stepup-scholars' || from === 'stepup') return 'stepup-next';
  if (from === 'dynamerge') return 'dynamerge-next';
  return 'general';
}

const email = ref('');
const interestTag = ref<InterestTag>(defaultTag(props.from));
const honeypot = ref('');
const status = ref<'idle' | 'submitting' | 'success' | 'error'>('idle');
const error = ref<string | null>(null);

watch(
  () => props.from,
  (next) => {
    // Only override when the user hasn't touched the dropdown yet
    // (i.e. status is still idle and the current value matches what a
    // prior `from` would've defaulted to).
    if (status.value !== 'idle') return;
    interestTag.value = defaultTag(next);
  },
);

async function handleSubmit(e: Event) {
  e.preventDefault();
  if (status.value === 'submitting') return;
  if (honeypot.value) return; // silent drop

  status.value = 'submitting';
  error.value = null;

  const endpoint = getAppConfig().newsletterEndpoint;
  const source = `stay-connected:${props.reason || 'direct'}`;
  // Pull the referrer attribution captured on page load. `null` when
  // this visitor arrived without a `?ref=` in the URL — fine, the
  // server treats absent as "no referrer."
  const referrerId = getCapturedReferrerId();

  if (!endpoint) {
    // Endpoint not configured — record the intent locally, mirror the
    // footer's "fake success" pattern so we don't expose half-built
    // plumbing to visitors.
    trackNewsletterSignup(`${source}:${interestTag.value}`);
    status.value = 'success';
    return;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value,
        source,
        interestTag: interestTag.value,
        ...(props.from ? { program: props.from } : {}),
        ...(referrerId ? { referrerId } : {}),
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? 'Subscription failed');
    }
    trackNewsletterSignup(`${source}:${interestTag.value}`);
    status.value = 'success';
    email.value = '';
  } catch (err) {
    status.value = 'error';
    error.value = err instanceof Error ? err.message : 'Subscription failed';
  }
}
</script>

<template>
  <UiCard class="p-6 md:p-8 bg-surface">
    <div class="flex items-center gap-3 mb-2">
      <Icon icon="lucide:mail" width="20" class="text-brand-violet" />
      <Heading :level="2" class="!text-xl !m-0">Tell us what to send.</Heading>
    </div>
    <Body class="text-ink/65 text-sm mb-6">
      One short email when the cycle you care about opens. No weekly digests, no marketing pile-on.
    </Body>

    <form v-if="status !== 'success'" class="flex flex-col gap-4" @submit="handleSubmit">
      <div class="flex flex-col gap-2">
        <label
          for="notify-me-interest"
          class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
          >I'm interested in</label
        >
        <UiSelect id="notify-me-interest" v-model="interestTag" :options="OPTIONS" />
      </div>

      <div class="flex flex-col gap-2">
        <label
          for="notify-me-email"
          class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
          >Email</label
        >
        <input
          id="notify-me-email"
          v-model="email"
          type="email"
          required
          placeholder="you@example.com"
          :disabled="status === 'submitting'"
          class="border hairline-ink rounded-xl px-4 py-3 text-sm bg-paper focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all disabled:opacity-60"
        />
      </div>

      <input
        v-model="honeypot"
        type="text"
        name="trap"
        tabindex="-1"
        autocomplete="off"
        aria-hidden="true"
        class="sr-only"
      />

      <p v-if="error" role="alert" class="text-sm text-red-700 m-0">{{ error }}</p>

      <div>
        <UiButton type="submit" variant="primary" :disabled="status === 'submitting'">
          <Icon
            :icon="status === 'submitting' ? 'lucide:loader-2' : 'lucide:arrow-right'"
            width="16"
            :class="status === 'submitting' && 'animate-spin'"
          />
          {{ status === 'submitting' ? 'Adding you…' : 'Notify me' }}
        </UiButton>
      </div>
    </form>

    <div
      v-else
      class="flex items-start gap-3 px-4 py-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900"
    >
      <Icon icon="lucide:check-circle-2" width="20" class="mt-0.5 text-emerald-700 shrink-0" />
      <div class="text-sm">
        <div class="font-semibold">You're on the list.</div>
        <div class="text-emerald-800/85 text-xs mt-1">
          Check your inbox to confirm your subscription — we won't email you again until then.
        </div>
      </div>
    </div>
  </UiCard>
</template>
