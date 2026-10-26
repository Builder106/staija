<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue';
import { MOTION, gsap, useStageReveal } from '../programMotion';
import { DOTS, TEAMS } from './africaDots';
import { TRACKS } from './tracks';

// The Dynamerge signature drawing: a dot map of Africa that shows the
// cohort's four weeks.
//   0 before Week 1: the map, unlit
//   1 Week 1: every dot lit (open to any African country)
//   2 Week 2: dots tinted by track; `track` filters to one
//   3 Week 3: teams linked across the continent
//   4 Week 4: every team drawn toward one demo-day point
const props = defineProps<{ stage: number; track: number | null }>();

const TRACK_COLORS = TRACKS.map((t) => t.color);
const UNLIT = 'rgba(255, 255, 255, 0.16)';
const R = 6.5;
// Demo day happens online; the point sits near the middle of the map.
const DEMO: [number, number] = [575, 560];

const root = ref<SVGSVGElement | null>(null);
const { reduced } = useStageReveal(root, toRef(props, 'stage'));

const inTeam = new Set(TEAMS.flat());

// TEAMS is already ordered around each team's center, so a closed path
// draws each team as one shape.
const teamPaths = TEAMS.map(
  (team) => team.map((i, j) => `${j ? 'L' : 'M'}${DOTS[i][0]} ${DOTS[i][1]}`).join(' ') + ' Z',
);
const demoPaths = TEAMS.map((team) => {
  const cx = team.reduce((s, i) => s + DOTS[i][0], 0) / team.length;
  const cy = team.reduce((s, i) => s + DOTS[i][1], 0) / team.length;
  const mx = (cx + DEMO[0]) / 2 + (cy - DEMO[1]) * 0.2;
  const my = (cy + DEMO[1]) / 2 - (cx - DEMO[0]) * 0.2;
  return `M${cx.toFixed(1)} ${cy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${DEMO[0]} ${DEMO[1]}`;
});

const targets = computed(() =>
  DOTS.map(([, , , t], i) => {
    const { stage, track } = props;
    if (stage <= 0) return { fill: UNLIT, r: R };
    if (stage === 1) return { fill: TRACK_COLORS[0], r: R };
    if (stage === 2) {
      const lit = track === null || track === t;
      return { fill: lit ? TRACK_COLORS[t] : UNLIT, r: R };
    }
    return inTeam.has(i) ? { fill: TRACK_COLORS[t], r: R * 1.45 } : { fill: UNLIT, r: R * 0.8 };
  }),
);

let circles: SVGCircleElement[] = [];
function paint(instant: boolean) {
  const t = targets.value;
  gsap.to(circles, {
    fill: (i: number) => t[i].fill,
    attr: { r: (i: number) => t[i].r },
    duration: instant ? 0 : MOTION.dots.duration,
    ease: MOTION.ease,
    stagger: instant ? 0 : { amount: MOTION.dots.spread, from: 'random' },
    overwrite: true,
  });
}

onMounted(() => {
  circles = Array.from(root.value?.querySelectorAll<SVGCircleElement>('.dot') ?? []);
  paint(true);
});
onUnmounted(() => gsap.killTweensOf(circles));
watch(targets, () => paint(reduced.value));
</script>

<template>
  <svg ref="root" viewBox="0 0 1000 1000" class="block w-full h-auto" aria-hidden="true">
    <circle v-for="([x, y], i) in DOTS" :key="i" class="dot" :cx="x" :cy="y" :r="R" :fill="UNLIT" />
    <path
      v-for="(d, i) in teamPaths"
      :key="`t${i}`"
      data-stage="3"
      data-draw
      :d="d"
      fill="none"
      stroke="rgba(255,255,255,0.45)"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <path
      v-for="(d, i) in demoPaths"
      :key="`d${i}`"
      data-stage="4"
      data-draw
      :d="d"
      fill="none"
      stroke="#ffffff"
      stroke-width="1.5"
    />
    <g data-stage="4">
      <circle :cx="DEMO[0]" :cy="DEMO[1]" r="26" fill="none" stroke="#ffffff" stroke-width="2.5" />
      <circle :cx="DEMO[0]" :cy="DEMO[1]" r="11" fill="#ffffff" />
    </g>
  </svg>
</template>
