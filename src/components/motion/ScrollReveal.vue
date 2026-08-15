<script setup lang="ts">
/**
 * ScrollReveal — wraps a slot in a fade + lift entrance triggered when the
 * element enters the viewport. Renders a `<div>`. If a different element
 * is required for semantics (e.g. `<p>`, `<section>`), nest it inside the
 * slot — the wrapper div carries no visual styling of its own.
 *
 * No-op under prefers-reduced-motion — content renders statically.
 */

import { Motion } from 'motion-v';
import { useReducedMotion } from '../../composables/useReducedMotion';

interface Props {
  /** Seconds to delay the animation after entering view. */
  delay?: number;
  /** Pixels of vertical lift on entry. Negative values drop instead. */
  y?: number;
  /** Animation duration in seconds. */
  duration?: number;
  /** Re-run on every enter (false) vs only the first time (true, default). */
  once?: boolean;
}

const { delay = 0, y = 24, duration = 0.5, once = true } = defineProps<Props>();

const reduce = useReducedMotion();
</script>

<template>
  <div v-if="reduce">
    <slot />
  </div>
  <Motion
    v-else
    :initial="{ opacity: 0, y }"
    :while-in-view="{ opacity: 1, y: 0 }"
    :in-view-options="{ once, amount: 0.2 }"
    :transition="{ delay, duration, ease: [0.22, 1, 0.36, 1] }"
  >
    <slot />
  </Motion>
</template>
