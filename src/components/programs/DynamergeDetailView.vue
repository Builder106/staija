<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { useMediaQuery } from '@vueuse/core';
import { computed, nextTick, ref, watch } from 'vue';
import { useProgram } from '../../composables/useProgram';
import { trackApplyClick } from '../../services/analytics';
import { ProgramService } from '../../services/programService';
import Container from '../ui/Container.vue';
import UiButton from '../ui/UiButton.vue';
import ContinentMap from './dynamerge/ContinentMap.vue';
import { TRACKS } from './dynamerge/tracks';
import { ScrollTrigger, useScheduleScroll } from './programMotion';

// Dynamerge: the page is organized around the cohort spread across the
// continent. A dot map of Africa stays in view on the right while the
// four weeks scroll on the left; each week changes what the map shows
// (lit, tinted by track, linked into teams, drawn to demo day). On
// phones each week carries its own copy of the map. FAQ answers sit
// beside the week that raises the question. Counterpart to
// StepUpDetailView (the manuscript register).
const SLUG = 'dynamerge' as const;

const { program, programDoc, applicationStatus, isApplyOpen, closedReason, isStatusResolved } =
  useProgram(SLUG);

const root = ref<HTMLElement | null>(null);
const { stage } = useScheduleScroll(root);
const isDesktop = useMediaQuery('(min-width: 1024px)');
const activeTrack = ref<number | null>(null);

watch([program, isDesktop], () => nextTick(() => ScrollTrigger.refresh()));

// Real deadline, only when a Firestore doc provides one; never invented.
const applyDeadline = computed<string | null>(() => {
  if (applicationStatus.value !== 'open') return null;
  const end = programDoc.value?.dates?.applicationEnd;
  return end ? ProgramService.formatDate(end) : null;
});

const facts = computed(() => program.value?.stats.map((s) => s.value).join(' | ') ?? '');

// Timeline entries arrive as "Kicker: rest of sentence." Guarded so a
// colon deep inside a sentence doesn't split. The body becomes its own
// sentence, so its first letter is capitalized ("Deep Dive: specialized
// tracks" arrives lowercase).
function splitStep(desc: string): { kicker: string | null; body: string } {
  const idx = desc.indexOf(':');
  if (idx === -1 || idx > 24) return { kicker: null, body: desc };
  const body = desc.slice(idx + 1).trim();
  return { kicker: desc.slice(0, idx), body: body.charAt(0).toUpperCase() + body.slice(1) };
}

const FAQS = {
  cost: {
    q: 'How much does Dynamerge cost?',
    a: 'Nothing. The bootcamp is fully funded, and applying is completely free.',
  },
  internet: {
    q: 'What if my internet connection is unreliable?',
    a: "Data stipends are available based on need, so connectivity should never be the reason you don't apply.",
  },
  code: {
    q: 'Do I have to know how to code already?',
    a: 'No. Week one starts at foundations: an introduction to programming and data analysis.',
  },
  both: {
    q: 'Can I apply to both programs?',
    a: 'Yes, but you can only participate in one program per calendar year if accepted to both.',
  },
};
// Week index -> the questions that week raises.
const FAQ_BY_WEEK: Record<number, { q: string; a: string }[]> = {
  0: [FAQS.code, FAQS.internet],
};

const ctaLabel = computed(() => {
  if (isApplyOpen.value) return 'Apply now';
  return closedReason.value === 'upcoming'
    ? 'Get notified when applications open'
    : 'Stay connected for the next cycle';
});
const ctaTarget = computed(() =>
  isApplyOpen.value
    ? `/apply/${SLUG}`
    : `/stay-connected?from=${SLUG}&reason=${closedReason.value}`,
);
function onApply(source: 'program_hero' | 'program_cta_banner') {
  if (isApplyOpen.value) trackApplyClick({ program: 'dynamerge', source });
}

function toggleTrack(i: number) {
  activeTrack.value = activeTrack.value === i ? null : i;
}
</script>

<template>
  <div v-if="program" ref="root" class="bg-ink-static text-white">
    <Container class="grid lg:grid-cols-12 gap-x-16">
      <div class="lg:col-span-5">
        <!-- Opening: the program as one sentence with the map unlit beside it. -->
        <div class="pt-16 md:pt-24 pb-16 lg:min-h-[calc(100vh-5rem)] flex flex-col justify-center">
          <p v-if="isStatusResolved" class="m-0 text-base font-semibold text-white/85">
            <template v-if="isApplyOpen">Applications are open.</template>
            <template v-else-if="closedReason === 'upcoming'">Applications open soon.</template>
            <template v-else>Applications are closed for this cycle.</template>
          </p>
          <!-- Madimi One (African-designed, OFL; see docs/TYPOGRAPHY-SYSTEM.md)
               on the program wordmark only. One weight, so font-normal. -->
          <h1
            class="relative z-10 mt-4 m-0 font-accent-african font-normal leading-[0.9] tracking-tight text-[clamp(3.75rem,9vw,8rem)]"
          >
            {{ program.name }}
          </h1>
          <p class="mt-8 m-0 text-xl md:text-2xl leading-snug text-white/85 max-w-lg">
            {{ program.pitch }}
          </p>
          <p class="mt-4 m-0 text-lg text-brand-sky">{{ facts }}</p>
          <div class="mt-10 flex flex-wrap items-center gap-4">
            <UiButton
              v-if="isStatusResolved"
              variant="on-gradient"
              :to="ctaTarget"
              @click="onApply('program_hero')"
            >
              {{ ctaLabel }}
            </UiButton>
            <UiButton variant="on-gradient-ghost" href="#weeks">See the four weeks</UiButton>
          </div>
          <p v-if="applyDeadline" class="mt-4 m-0 text-sm text-white/70">
            Apply by {{ applyDeadline }}.
          </p>
          <div class="mt-14 max-w-sm">
            <p class="m-0 font-semibold">{{ FAQS.cost.q }}</p>
            <p class="m-0 mt-1 text-white/65 leading-relaxed">{{ FAQS.cost.a }}</p>
          </div>
          <figure v-if="!isDesktop" class="mt-12 m-0">
            <ContinentMap :stage="0" :track="null" class="mx-auto max-w-sm" />
            <figcaption class="mt-2 text-sm text-white/55">
              Students from anywhere in Africa can apply. The tracks and teams shown below are an
              illustration.
            </figcaption>
          </figure>
        </div>

        <ol id="weeks" class="list-none p-0 m-0 scroll-mt-24">
          <li
            v-for="(step, i) in program.timeline"
            :key="i"
            data-step
            class="lg:min-h-[80vh] flex flex-col justify-center py-14"
          >
            <h2
              class="m-0 font-mono-african font-normal leading-none text-[clamp(2.75rem,5vw,4.5rem)]"
            >
              {{ step.date }}
            </h2>
            <h3
              v-if="splitStep(step.desc).kicker"
              class="mt-6 m-0 font-display font-medium text-[28px] leading-tight"
            >
              {{ splitStep(step.desc).kicker }}
            </h3>
            <p class="mt-3 m-0 text-xl leading-snug text-white/80 max-w-md">
              {{ splitStep(step.desc).body }}
            </p>

            <!-- Week 2: the tracks filter the map. -->
            <div v-if="i === 1" class="mt-8">
              <div class="flex flex-wrap gap-3" role="group" aria-label="Show one track on the map">
                <button
                  v-for="(track, t) in TRACKS"
                  :key="track.name"
                  type="button"
                  class="focus-ring-inverse inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border transition-colors"
                  :class="
                    activeTrack === t
                      ? 'bg-white text-ink-static border-white'
                      : 'bg-transparent text-white border-white/25 hover:border-white/60'
                  "
                  :aria-pressed="activeTrack === t"
                  @click="toggleTrack(t)"
                >
                  <span
                    class="w-3 h-3 rounded-[3px]"
                    :style="{ background: track.color }"
                    aria-hidden="true"
                  />
                  {{ track.name }}
                </button>
              </div>
              <div
                v-for="(track, t) in TRACKS"
                v-show="activeTrack === null || activeTrack === t"
                :key="track.name"
                class="mt-6 flex items-start gap-3 max-w-md"
              >
                <Icon
                  :icon="track.icon"
                  width="22"
                  class="shrink-0 mt-1"
                  :style="{ color: track.color }"
                  aria-hidden="true"
                />
                <p class="m-0 text-white/75 leading-relaxed">{{ track.copy }}</p>
              </div>
            </div>

            <div v-if="FAQ_BY_WEEK[i]" class="mt-10 flex flex-col gap-6 max-w-sm">
              <div v-for="faq in FAQ_BY_WEEK[i]" :key="faq.q">
                <p class="m-0 font-semibold">{{ faq.q }}</p>
                <p class="m-0 mt-1 text-white/65 leading-relaxed">{{ faq.a }}</p>
              </div>
            </div>

            <ContinentMap
              v-if="!isDesktop"
              :stage="i + 1"
              :track="activeTrack"
              class="mt-10 mx-auto max-w-sm"
            />
          </li>
        </ol>

        <!-- After Demo Day: who can join the next cohort. -->
        <div class="pt-16 pb-24 md:pb-36 lg:min-h-[70vh]">
          <h2 class="m-0 font-display font-medium text-[clamp(2rem,3.4vw,2.75rem)] leading-tight">
            Who can join the next cohort
          </h2>
          <ul class="mt-6 list-none p-0 m-0 flex flex-col gap-3 text-lg text-white/80">
            <li v-for="req in program.eligibilityList" :key="req">{{ req }}</li>
          </ul>
          <div v-if="isStatusResolved" class="mt-10">
            <UiButton variant="on-gradient" :to="ctaTarget" @click="onApply('program_cta_banner')">
              {{ ctaLabel }}
            </UiButton>
          </div>
          <div class="mt-12 max-w-sm">
            <p class="m-0 font-semibold">{{ FAQS.both.q }}</p>
            <p class="m-0 mt-1 text-white/65 leading-relaxed">{{ FAQS.both.a }}</p>
          </div>
        </div>
      </div>

      <div v-if="isDesktop" class="lg:col-span-7">
        <figure class="sticky top-24 m-0 pt-6">
          <ContinentMap :stage="stage" :track="activeTrack" class="map-fit ml-auto" />
          <figcaption class="mt-2 text-right text-sm text-white/55">
            Students from anywhere in Africa can apply. The tracks and teams shown are an
            illustration.
          </figcaption>
        </figure>
      </div>
    </Container>
  </div>
  <div v-else class="p-24 text-center">Program not found.</div>
</template>

<style scoped>
/* design-system: DESIGN.md | detail-view: Dynamerge continent register (see note vs.
   StepUpDetailView) */

/* Fit the held map inside the viewport below the sticky header. */
.map-fit {
  width: min(100%, calc(100vh - 9rem));
}
</style>
