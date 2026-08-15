<script setup lang="ts">
/**
 * Context-aware cross-promo. Only renders when the visitor's gap on
 * one program is a fit signal for the other:
 *
 *   - From StepUp (Nigeria-only) → suggest Dynamerge (pan-African)
 *     when the reason hints at a location mismatch.
 *   - Either direction → suggest the other program when the reason is
 *     a closed window, since the *other* cycle may be open right now.
 *
 * Eligibility-failure suggestions are silent: "eligibility" can mean
 * any of four things (age, location, schooling, time commitment) and
 * we don't want to push someone toward Dynamerge if they failed
 * StepUp on the time-commitment row.
 */
import { Icon } from '@iconify/vue';
import { computed } from 'vue';
import Body from '../ui/Body.vue';
import Heading from '../ui/Heading.vue';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';

const props = defineProps<{
  from: string;
  reason: string;
}>();

interface Suggestion {
  slug: 'stepup-scholars' | 'dynamerge';
  name: string;
  pitch: string;
  audience: string;
}

const SUGGESTIONS: Record<string, Suggestion> = {
  'stepup-scholars': {
    slug: 'stepup-scholars',
    name: 'StepUp Scholars',
    pitch: 'A 6-month, in-person research incubator in Nigeria for ages 15–19.',
    audience: 'Nigeria-based | ages 15–19',
  },
  dynamerge: {
    slug: 'dynamerge',
    name: 'Dynamerge',
    pitch: 'A 4-week virtual summer bootcamp open to ages 15–20 across the continent.',
    audience: 'Pan-African | ages 15–20 | fully virtual',
  },
};

const suggestion = computed<Suggestion | null>(() => {
  // Closed cycle: always offer the sibling program.
  if (props.reason === 'closed') {
    if (props.from === 'stepup-scholars' || props.from === 'stepup')
      return SUGGESTIONS['dynamerge'];
    if (props.from === 'dynamerge') return SUGGESTIONS['stepup-scholars'];
  }
  return null;
});
</script>

<template>
  <UiCard
    v-if="suggestion"
    class="p-6 md:p-8 bg-paper border border-brand-violet/20 flex flex-col gap-4"
  >
    <div class="flex items-center gap-3">
      <Icon icon="lucide:arrow-right-left" width="20" class="text-brand-violet" />
      <Heading :level="3" class="!text-lg !m-0">Have a look at our other program.</Heading>
    </div>
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-5">
      <div class="flex flex-col gap-1.5">
        <div class="font-display text-xl font-semibold text-ink">{{ suggestion.name }}</div>
        <div class="text-xs font-semibold text-brand-violet uppercase tracking-wide">
          {{ suggestion.audience }}
        </div>
        <Body class="text-ink/70 text-sm m-0">{{ suggestion.pitch }}</Body>
      </div>
      <UiButton variant="secondary" :to="`/programs/${suggestion.slug}`" class="shrink-0">
        See {{ suggestion.name }}
        <Icon icon="lucide:arrow-right" width="14" />
      </UiButton>
    </div>
  </UiCard>
</template>
