<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core';
import { computed, nextTick, ref, watch } from 'vue';
import { useProgram } from '../../composables/useProgram';
import { trackApplyClick } from '../../services/analytics';
import Container from '../ui/Container.vue';
import UiButton from '../ui/UiButton.vue';
import { ScrollTrigger, useScheduleScroll } from './programMotion';
import ManuscriptSheet from './stepup/ManuscriptSheet.vue';

// StepUp Scholars: the page is organized around the paper a scholar
// leaves with. The months scroll on the left; the manuscript stays in
// view on the right and reaches each month's state as that month crosses
// the middle of the screen. On phones each month carries its own copy of
// the sheet. FAQ answers sit beside the month that raises the question.
const SLUG = 'stepup-scholars' as const;

const { program, isApplyOpen, closedReason, isStatusResolved } = useProgram(SLUG);

const root = ref<HTMLElement | null>(null);
const { stage } = useScheduleScroll(root);
const isDesktop = useMediaQuery('(min-width: 1024px)');

// Firestore can replace the fallback copy after mount, which changes the
// height of every month.
watch([program, isDesktop], () => nextTick(() => ScrollTrigger.refresh()));

const titleWords = computed(() => {
  const [first, ...rest] = (program.value?.name ?? '').split(' ');
  return { first, rest: rest.join(' ') };
});

// What each phase leaves behind, keyed by month so it renders whether the
// timeline comes from the fallback or from a Firestore doc.
const OUTPUTS: Record<string, string> = {
  'Month 1': 'You finish with a lab safety certification.',
  'Month 2–4': 'You finish with an original dataset.',
  'Month 5': 'You finish with a drafted abstract.',
  'Month 6': 'You finish with a submitted manuscript.',
};

const FAQS = [
  {
    q: 'Do I need prior research experience?',
    a: 'Not at all. We are looking for curiosity and a willingness to learn.',
  },
  {
    q: 'How does the stipend work?',
    a: 'Accepted students receive a monthly stipend to cover internet, transportation, and basic needs during the program.',
  },
  { q: 'Is there an application fee?', a: 'No, applying to STAIJA programs is completely free.' },
  {
    q: 'Can I apply to both programs?',
    a: 'Yes, but you can only participate in one program per calendar year if accepted to both.',
  },
];
// Month index -> the question that month raises.
const FAQ_BY_MONTH: Record<number, (typeof FAQS)[number]> = { 0: FAQS[0], 1: FAQS[1] };
const CLOSING_FAQS = [FAQS[2], FAQS[3]];

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
  if (isApplyOpen.value) trackApplyClick({ program: 'stepup', source });
}
</script>

<template>
  <div v-if="program" ref="root" class="flex flex-col">
    <!-- Title line: the program name with a duotone photo set into it. -->
    <section class="bg-paper pt-14 md:pt-24 pb-14 md:pb-20">
      <Container>
        <div class="relative">
          <h1
            class="m-0 font-display font-medium text-ink tracking-[-0.035em] leading-[0.95] text-[clamp(3.25rem,9.5vw,7.5rem)]"
          >
            <span class="flex items-center gap-[0.22em]">
              <span>{{ titleWords.first }}</span>
              <span class="inline-photo" aria-hidden="true">
                <img :src="program.heroImg" alt="" width="1280" height="720" />
              </span>
            </span>
            <span class="block">{{ titleWords.rest }}</span>
          </h1>
          <!-- On wide screens the pitch sits on the second title line, beside
               the shorter word, instead of below the whole title. -->
          <p
            class="mt-8 lg:mt-0 lg:absolute lg:right-0 lg:bottom-[0.6rem] lg:w-[44%] mb-0 text-xl leading-snug text-ink/80"
          >
            {{ program.pitch }}
          </p>
        </div>
        <div class="mt-10 md:mt-12 flex flex-wrap items-center gap-4">
          <UiButton v-if="isStatusResolved" :to="ctaTarget" @click="onApply('program_hero')">
            {{ ctaLabel }}
          </UiButton>
          <UiButton variant="secondary" href="#months">See the six months</UiButton>
        </div>
      </Container>
    </section>

    <section class="bg-ink-static text-white">
      <Container class="pt-24 md:pt-36">
        <p
          data-fill
          class="m-0 max-w-5xl font-display font-light tracking-[-0.01em] leading-[1.15] text-[clamp(1.75rem,3.6vw,3.25rem)]"
        >
          Each scholar spends six months on one research question. It starts with a lab safety
          course, moves through experiments with weekly mentor check-ins, and ends with a manuscript
          sent to a youth science journal. A stipend arrives every month.
        </p>

        <div
          id="months"
          class="mt-20 md:mt-32 grid lg:grid-cols-12 gap-10 lg:gap-16 pb-24 md:pb-36 scroll-mt-24"
        >
          <div class="lg:col-span-5">
            <!-- Before Month 1 the sheet is blank: this is who can start one. -->
            <div class="lg:min-h-[70vh] flex flex-col justify-center py-6">
              <h2 class="m-0 font-display font-medium text-[28px] leading-tight">Before Month 1</h2>
              <ul class="mt-6 list-none p-0 m-0 flex flex-col gap-3 text-lg text-white/80">
                <li v-for="req in program.eligibilityList" :key="req">{{ req }}</li>
              </ul>
              <ManuscriptSheet v-if="!isDesktop" :program="program" :stage="0" class="mt-10" />
            </div>

            <ol class="list-none p-0 m-0">
              <li
                v-for="(step, i) in program.timeline"
                :key="i"
                data-step
                class="lg:min-h-[75vh] flex flex-col justify-center py-14"
              >
                <h2
                  class="m-0 font-mono-african font-normal leading-none text-[clamp(2.75rem,5vw,4.5rem)] text-white"
                >
                  {{ step.date }}
                </h2>
                <p class="mt-6 m-0 text-xl md:text-2xl leading-snug text-white/85 max-w-md">
                  {{ step.desc }}
                </p>
                <p v-if="OUTPUTS[step.date]" class="mt-4 m-0 text-lg text-brand-sky max-w-md">
                  {{ OUTPUTS[step.date] }}
                </p>
                <div v-if="FAQ_BY_MONTH[i]" class="mt-10 max-w-sm">
                  <p class="m-0 font-semibold text-white">{{ FAQ_BY_MONTH[i].q }}</p>
                  <p class="m-0 mt-1 text-white/65 leading-relaxed">{{ FAQ_BY_MONTH[i].a }}</p>
                </div>
                <ManuscriptSheet
                  v-if="!isDesktop"
                  :program="program"
                  :stage="i + 1"
                  class="mt-10"
                />
              </li>
            </ol>

            <!-- After Month 6: the application is the first page of the next manuscript. -->
            <div class="pt-16 lg:pt-24 lg:min-h-[60vh]">
              <h2
                class="m-0 font-display font-medium text-[clamp(2rem,3.4vw,2.75rem)] leading-tight"
              >
                Joining the next cohort
              </h2>
              <div v-if="isStatusResolved" class="mt-8">
                <UiButton
                  variant="on-gradient"
                  :to="ctaTarget"
                  @click="onApply('program_cta_banner')"
                >
                  {{ ctaLabel }}
                </UiButton>
              </div>
              <div class="mt-12 flex flex-col gap-8 max-w-md">
                <div v-for="faq in CLOSING_FAQS" :key="faq.q">
                  <p class="m-0 font-semibold text-white">{{ faq.q }}</p>
                  <p class="m-0 mt-1 text-white/65 leading-relaxed">{{ faq.a }}</p>
                </div>
              </div>
            </div>
          </div>

          <div v-if="isDesktop" class="lg:col-span-7">
            <div class="sticky top-28 flex justify-end">
              <ManuscriptSheet :program="program" :stage="stage" class="sheet-fit" />
            </div>
          </div>
        </div>
      </Container>
    </section>
  </div>
  <div v-else class="p-24 text-center">Program not found.</div>
</template>

<style scoped>
/* design-system: DESIGN.md | detail-view: StepUp manuscript register (see note vs.
   DynamergeDetailView) */

/* The photo set into the title line (Colonia Zacamil reference): the
   program photo in the brand duotone, filling the rest of the first line
   so the title spans the page at every width. */
.inline-photo {
  flex: 1 1 auto;
  min-width: 1.2em;
  height: 0.74em;
  margin-top: 0.08em;
  border-radius: 0.16em;
  overflow: hidden;
  background: linear-gradient(
    135deg,
    #3f1f8a 0%,
    var(--color-brand-violet) 50%,
    var(--color-brand-sky) 100%
  );
}
.inline-photo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 30%;
  filter: grayscale(1) contrast(1.2) brightness(1.1);
  mix-blend-mode: multiply;
}

/* Fit the held sheet inside the viewport below the sticky header. */
.sheet-fit {
  width: min(100%, calc((100vh - 9rem) * 0.72));
}
</style>
