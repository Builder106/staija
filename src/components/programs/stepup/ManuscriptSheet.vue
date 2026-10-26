<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import type { ProgramView } from '../../../services/programContent';
import { useStageReveal } from '../programMotion';

// The StepUp signature drawing: the manuscript a scholar leaves with,
// shown at the state it reaches by each point in the program. The section
// headings are there from the start, so the sheet reads as a paper waiting
// to be written; each stage fills in its sections.
//   0 before Month 1: masthead, title, authors, empty outline
//   1 Month 1: methods text and the lab safety seal
//   2 Months 2-4: Figure 1 data and the weekly check-in marks
//   3 Month 5: abstract, fitted line, results text
//   4 Month 6: symposium text and the submission stamp
// The text inside the sheet is the program's own copy, set small, and set
// the way a journal sets it: program facts go in the affiliation footnote.
const props = defineProps<{ program: ProgramView; stage: number }>();

const root = ref<HTMLElement | null>(null);
useStageReveal(root, toRef(props, 'stage'));

const affiliation = computed(() =>
  props.program.stats.map((s) => `${s.label.toLowerCase()} ${s.value}`).join('; '),
);

// Figure 1 is a sketch, not a result: a loose positive trend with noise,
// fixed so the drawing does not change between renders.
const POINTS: [number, number][] = [
  [18, 92],
  [26, 86],
  [31, 90],
  [38, 78],
  [44, 81],
  [49, 70],
  [55, 74],
  [61, 63],
  [66, 67],
  [72, 55],
  [77, 60],
  [83, 49],
  [88, 52],
  [94, 41],
  [99, 45],
  [105, 35],
  [111, 38],
  [117, 28],
  [123, 31],
  [129, 22],
];
const WEEKS = 13;
</script>

<template>
  <figure
    ref="root"
    class="manuscript m-0 bg-white text-ink-static rounded-[6px] overflow-hidden shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)] font-sans select-none"
    aria-hidden="true"
  >
    <div class="sheet flex flex-col h-full">
      <div
        class="bg-brand-violet text-white px-[7%] py-[1.25em] flex items-baseline justify-between"
      >
        <span class="font-display font-semibold text-[1.36em] tracking-tight">StepUp Scholars</span>
        <span class="text-[1em] text-white/80">Manuscript draft</span>
      </div>

      <div class="flex-1 flex flex-col px-[7%] pt-[2.2em] pb-[6%]">
        <div class="flex items-start justify-between gap-[1.45em]">
          <div>
            <div class="text-[2.2em] leading-tight font-display font-medium">
              Your research question
            </div>
            <div class="mt-[0.7em] text-[1.14em] text-ink-static/75">
              You<sup class="text-brand-violet">1</sup> and your mentor<sup
                class="text-brand-violet"
                >2</sup
              >
            </div>
          </div>
          <!-- Lab safety seal, earned in Month 1. -->
          <svg
            data-stage="1"
            viewBox="0 0 64 64"
            class="w-[4.4em] h-[4.4em] shrink-0 text-brand-violet"
          >
            <circle cx="32" cy="26" r="18" fill="currentColor" fill-opacity="0.12" />
            <circle cx="32" cy="26" r="18" fill="none" stroke="currentColor" stroke-width="2.5" />
            <path
              d="M24 41 L20 60 L32 53 L44 60 L40 41"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linejoin="round"
            />
            <path
              d="M25 26 l5 5 l9 -10"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

        <div class="mt-[1.45em] h-[3px] rounded-full bg-gradient-brand" />

        <div class="mt-[1.45em] rounded-[4px] bg-brand-sky/15 px-[1.25em] py-[1.1em]">
          <div class="text-[1.05em] font-semibold">Abstract</div>
          <p data-stage="3" class="m-0 mt-[0.35em] text-[1em] leading-[1.55] text-ink-static/80">
            {{ program.pitch }}
          </p>
        </div>

        <div class="mt-[1.45em]">
          <div class="text-[1.05em] font-semibold">
            <span class="text-brand-violet">1</span> Methods
          </div>
          <p data-stage="1" class="m-0 mt-[0.35em] text-[1em] leading-[1.55] text-ink-static/80">
            {{ program.timeline[0]?.desc }}
          </p>
        </div>

        <div class="mt-[1.45em] grid grid-cols-[1.25fr_1fr] gap-[1.8em] items-start">
          <div class="rounded-[4px] bg-brand-sky/15 p-[0.9em]">
            <svg viewBox="0 0 140 108" class="w-full overflow-visible">
              <path d="M10 4 V100 H138" fill="none" stroke="#0e1217" stroke-opacity="0.5" />
              <circle
                v-for="([x, y], i) in POINTS"
                :key="i"
                data-stage="2"
                :cx="x"
                :cy="y"
                r="2.6"
                fill="#8b55ff"
              />
              <path
                data-stage="3"
                data-draw
                d="M14 94 L134 20"
                fill="none"
                stroke="#3f1f8a"
                stroke-width="2"
              />
            </svg>
            <div class="mt-[0.35em] text-[0.86em] leading-snug text-ink-static/65">
              Figure 1. Your original dataset, sketched.
            </div>
          </div>
          <div>
            <div class="text-[1.05em] font-semibold">
              <span class="text-brand-violet">2</span> Data
            </div>
            <div data-stage="2">
              <p class="m-0 mt-[0.35em] text-[1em] leading-[1.55] text-ink-static/80">
                {{ program.timeline[1]?.desc }}
              </p>
              <svg :viewBox="`0 0 ${WEEKS * 8} 12`" class="mt-[0.7em] w-full">
                <line
                  v-for="w in WEEKS"
                  :key="w"
                  :x1="w * 8 - 4"
                  :x2="w * 8 - 4"
                  y1="1"
                  y2="11"
                  stroke="#8b55ff"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
              <div class="mt-[0.2em] text-[0.86em] text-ink-static/65">
                One mark per mentor check-in
              </div>
            </div>
          </div>
        </div>

        <div class="mt-[1.45em]">
          <div class="text-[1.05em] font-semibold">
            <span class="text-brand-violet">3</span> Results
          </div>
          <p data-stage="3" class="m-0 mt-[0.35em] text-[1em] leading-[1.55] text-ink-static/80">
            {{ program.timeline[2]?.desc }}
          </p>
        </div>

        <div class="mt-[1.45em]">
          <div class="text-[1.05em] font-semibold">
            <span class="text-brand-violet">4</span> Symposium
          </div>
          <p data-stage="4" class="m-0 mt-[0.35em] text-[1em] leading-[1.55] text-ink-static/80">
            {{ program.timeline[3]?.desc }}
          </p>
        </div>

        <div class="mt-auto pt-[1.8em] flex items-end justify-between gap-[2.2em]">
          <div class="text-[0.86em] leading-relaxed text-ink-static/60 max-w-[62%]">
            <p class="m-0">
              <sup class="text-brand-violet">1</sup> {{ program.name }}, Nigeria: {{ affiliation }}.
            </p>
            <p class="m-0">
              <sup class="text-brand-violet">2</sup> A postdoctoral researcher or industry
              scientist.
            </p>
          </div>
          <div
            data-stage="4"
            class="stamp shrink-0 rotate-[-8deg] border-[3px] border-brand-violet text-brand-violet rounded-[4px] px-[0.5em] py-[0.3em] font-mono-african text-[2em] leading-none"
          >
            SUBMITTED
          </div>
        </div>
      </div>
    </div>
  </figure>
</template>

<style scoped>
/* design-system: DESIGN.md | drawing: StepUp manuscript (program page signature) */
/* Every size inside the sheet is in em off one base that tracks the
   sheet's width, so the drawing scales as a unit instead of reflowing. */
.manuscript {
  container-type: inline-size;
}
.sheet {
  font-size: max(8px, 1.96cqw);
}
.stamp {
  mix-blend-mode: multiply;
}
</style>
