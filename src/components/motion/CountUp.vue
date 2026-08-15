<script setup lang="ts">
/**
 * CountUp — animates a number from 0 to a target value when the element
 * enters the viewport. Renders a `<span>` containing the formatted current
 * value. Pair with surrounding markup (eyebrow, caption) at the call site.
 *
 * Reduced motion: jumps to the final value immediately.
 */

import { useInView } from 'motion-v';
import { ref, watch } from 'vue';
import { useReducedMotion } from '../../composables/useReducedMotion';

interface Props {
  /** Target value to count up to. */
  value: number;
  /** Animation duration in ms. */
  duration?: number;
  /** Locale for `toLocaleString` formatting. Defaults to en-US. */
  locale?: string;
}

const { value, duration = 1600, locale = 'en-US' } = defineProps<Props>();

const root = ref<HTMLElement | null>(null);
const inView = useInView(root, { once: true, amount: 0.4 });
const reduce = useReducedMotion();
const display = ref(reduce.value ? format(value) : format(0));

function format(n: number) {
  return Math.round(n).toLocaleString(locale);
}

// easeOutCubic — fast start, gentle landing. Stat counters that ease-in
// feel sluggish on first impression.
function ease(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

watch(inView, visible => {
  if (!visible) return;
  if (reduce.value) {
    display.value = format(value);
    return;
  }
  const start = performance.now();
  function tick(now: number) {
    const t = Math.min(1, (now - start) / duration);
    display.value = format(ease(t) * value);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
});
</script>

<template>
  <span ref="root">{{ display }}</span>
</template>
