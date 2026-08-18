<script setup lang="ts">
/**
 * "Refer someone who fits" share card.
 *
 * One copyable link + a small row of share targets (WhatsApp, Email,
 * Threads). The `?ref=stay-connected` tag on the outbound URL lets
 * downstream signups attribute themselves to this surface — measured
 * via the existing newsletter `source` field when a referred visitor
 * subscribes here, not via per-share UUIDs (v1 keeps it simple).
 *
 * Prefilled share text references the program the *current* visitor
 * was looking at, since they're the best judge of who in their
 * network it suits.
 */
import { Icon } from '@iconify/vue';
import { computed, ref } from 'vue';
import { useAuth } from '../../composables/useAuth';
import { getOrMintMyReferralId } from '../../services/referrals';
import Body from '../ui/Body.vue';
import Heading from '../ui/Heading.vue';
import UiCard from '../ui/UiCard.vue';

const props = defineProps<{
  from: string;
}>();

const { user } = useAuth();

// Stable referral ID for this visitor. For signed-in users it's
// `u-<uid>` (so a future leaderboard can credit them by name). For
// anonymous visitors it's `a-<short-random>`, persisted in
// localStorage so a follow-up visit keeps the same identity.
const myRefId = computed(() => getOrMintMyReferralId(user.value?.uid ?? null));

const PROGRAM_LABELS: Record<string, string> = {
  'stepup-scholars': 'StepUp Scholars',
  stepup: 'StepUp Scholars',
  dynamerge: 'Dynamerge',
};

// Build the share URL from the current origin so the link works in
// preview deployments and local dev without hardcoding staija.org.
// `?ref=<myRefId>` is the per-user attribution marker — distinct per
// sharer so a future leaderboard can credit signups back to them.
const shareUrl = computed(() => {
  const ref = myRefId.value || 'stay-connected';
  const origin = typeof window === 'undefined' ? 'https://staija.org' : window.location.origin;
  if (props.from === 'stepup-scholars' || props.from === 'stepup') {
    return `${origin}/programs/stepup-scholars?ref=${ref}`;
  }
  if (props.from === 'dynamerge') {
    return `${origin}/programs/dynamerge?ref=${ref}`;
  }
  return `${origin}/?ref=${ref}`;
});

const shareMessage = computed(() => {
  const label = PROGRAM_LABELS[props.from];
  if (label) {
    return `STAIJA runs ${label} — a STEM research program for African high-school and gap-year students. Worth a look:`;
  }
  return `STAIJA runs STEM research programs for African high-school and gap-year students. Worth a look:`;
});

const fullShareText = computed(() => `${shareMessage.value} ${shareUrl.value}`);

const whatsappHref = computed(
  () => `https://wa.me/?text=${encodeURIComponent(fullShareText.value)}`,
);
const emailHref = computed(() => {
  const subject = encodeURIComponent('Thought of you — STAIJA');
  const body = encodeURIComponent(`${shareMessage.value}\n\n${shareUrl.value}`);
  return `mailto:?subject=${subject}&body=${body}`;
});
const threadsHref = computed(
  () => `https://threads.net/intent/post?text=${encodeURIComponent(fullShareText.value)}`,
);

const copied = ref(false);
async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // Clipboard blocked (older browsers, insecure context). Silent — the
    // raw link is already on screen in the read-only input.
  }
}
</script>

<template>
  <UiCard class="p-6 md:p-8 bg-surface">
    <div class="flex items-center gap-3 mb-2">
      <Icon icon="lucide:share-2" width="20" class="text-brand-violet" />
      <Heading :level="2" class="!text-xl !m-0">Know someone who'd fit?</Heading>
    </div>
    <Body class="text-ink/65 text-sm mb-6">
      The fastest way to grow STAIJA is the people you already know. Send the link to a cousin,
      classmate, or whoever you thought of when you read the eligibility list.
    </Body>

    <div class="flex flex-col sm:flex-row gap-2 mb-5">
      <input
        :value="shareUrl"
        readonly
        aria-label="Share link"
        class="flex-1 border hairline-ink rounded-xl px-4 py-2.5 text-sm bg-paper font-mono text-ink/80 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet"
        @focus="($event.target as HTMLInputElement).select()"
      />
      <button
        type="button"
        class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border hairline-ink bg-paper text-sm font-semibold text-ink hover:bg-brand-violet/5 hover:border-brand-violet/40 transition-colors"
        @click="copyLink"
      >
        <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" width="14" />
        {{ copied ? 'Copied' : 'Copy link' }}
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <a
        :href="whatsappHref"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-medium hover:bg-emerald-100 transition-colors"
      >
        <Icon icon="simple-icons:whatsapp" width="14" />
        WhatsApp
      </a>
      <a
        :href="emailHref"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ink/5 border hairline-ink text-ink text-sm font-medium hover:bg-ink/10 transition-colors"
      >
        <Icon icon="lucide:mail" width="14" />
        Email
      </a>
      <a
        :href="threadsHref"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ink/5 border hairline-ink text-ink text-sm font-medium hover:bg-ink/10 transition-colors"
      >
        <Icon icon="simple-icons:threads" width="14" />
        Threads
      </a>
    </div>
  </UiCard>
</template>
