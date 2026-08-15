<script setup lang="ts">
/**
 * Query-param-aware hero for /stay-connected.
 *
 * Hits four kinds of visitor:
 *   - Arrived from `/apply/<program>` with eligibility unchecked
 *     (`?from=<program>&reason=eligibility`).
 *   - Arrived because the application window is closed
 *     (`?from=<program>&reason=closed`).
 *   - Arrived from home / a direct link with no query string.
 *   - Followed a referral link (`?ref=stay-connected`).
 *
 * Copy stays positive — "this isn't your cycle" not "you don't
 * qualify". Same hub serves future applicants, mentor-curious adults,
 * and existing supporters.
 */
import { computed, ref, watch } from 'vue';
import { resolveReferrerDisplayName } from '../../services/referrals';
import Body from '../ui/Body.vue';
import Container from '../ui/Container.vue';
import Eyebrow from '../ui/Eyebrow.vue';
import Heading from '../ui/Heading.vue';
import Section from '../ui/Section.vue';

const props = defineProps<{
  from: string;
  reason: string;
  /** Referrer id pulled from `?ref=` on the URL — when it points at a
   *  signed-in user (`u-<uid>`) and that user has a public display
   *  name, the hero leads with "<Name> sent you here." Falls through
   *  to the standard headline for anonymous and unresolved cases. */
  referrerId?: string | null;
}>();

// Resolved display name for the referrer. Starts null and flips when
// the lookup returns — a brief moment of generic copy is better than
// holding the hero blank during the round-trip.
const referrerName = ref<string | null>(null);
watch(
  () => props.referrerId,
  async id => {
    referrerName.value = null;
    if (!id) return;
    const name = await resolveReferrerDisplayName(id);
    // Guard against a stale resolve clobbering a newer one — if the
    // prop changed during the await, ignore this result.
    if (props.referrerId === id) referrerName.value = name;
  },
  { immediate: true }
);

const PROGRAM_LABELS: Record<string, string> = {
  'stepup-scholars': 'StepUp Scholars',
  stepup: 'StepUp Scholars',
  dynamerge: 'Dynamerge',
};

const programLabel = computed(() => PROGRAM_LABELS[props.from] ?? '');

const headline = computed(() => {
  // Personalised referrer headline wins when we resolved one — it's
  // the most "you specifically were sent here" signal we can offer.
  if (referrerName.value) {
    return `${referrerName.value} sent you here.`;
  }
  if (props.reason === 'closed' && programLabel.value) {
    return `${programLabel.value} isn't open right now.`;
  }
  if (props.reason === 'eligibility' && programLabel.value) {
    return `${programLabel.value} isn't the right fit yet.`;
  }
  if (props.reason === 'closed') return `Applications aren't open right now.`;
  if (props.reason === 'eligibility') return `Not the right fit for this cycle?`;
  return `Not applying right now? Stay close anyway.`;
});

const dek = computed(() => {
  if (props.reason === 'closed') {
    return `We open applications on a cycle. Drop your email and we'll
            tell you the day the next window opens — no follow-ups in between.`;
  }
  if (props.reason === 'eligibility') {
    return `Maybe you're a year too young, in the wrong country for this
            program, or just not ready yet. There are still real ways to
            be part of STAIJA in the meantime.`;
  }
  return `Future applicants, mentor-curious adults, alumni-friends, and
          anyone who landed here too early — pick what fits and we'll
          stay in touch.`;
});
</script>

<template>
  <Section class="!pt-12 !pb-10 wash-violet-6 border-b hairline-ink">
    <Container class="max-w-3xl">
      <Eyebrow class="text-brand-violet mb-3 block">Stay connected</Eyebrow>
      <Heading :level="1" class="!text-3xl md:!text-5xl !mb-4">
        {{ headline }}
      </Heading>
      <Body class="text-ink/75 max-w-2xl">{{ dek }}</Body>
    </Container>
  </Section>
</template>
