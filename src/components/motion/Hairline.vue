<script setup lang="ts">
/**
 * Hairline — a 1px horizontal divider that draws in left-to-right when
 * scrolled into view. Drop this between sections in place of (or in
 * addition to) the static `border-y hairline-ink` pattern.
 *
 * Color matches the existing `.hairline-ink` border:
 *   light: rgba(14, 18, 23, 0.08)
 *   dark : rgba(240, 244, 248, 0.10)
 *
 * Reduced motion: renders as a static line.
 */

import { Motion } from 'motion-v';
import { useReducedMotion } from '../../composables/useReducedMotion';

const reduce = useReducedMotion();
</script>

<template>
  <div v-if="reduce" class="hairline-line" aria-hidden="true" />
  <Motion
    v-else
    class="hairline-line origin-left"
    :initial="{ scaleX: 0 }"
    :while-in-view="{ scaleX: 1 }"
    :in-view-options="{ once: true, amount: 1 }"
    :transition="{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }"
    aria-hidden="true"
  />
</template>

<style scoped>
.hairline-line {
  width: 100%;
  height: 1px;
  background-color: rgba(14, 18, 23, 0.08);
}
:global([data-theme='dark']) .hairline-line {
  background-color: rgba(240, 244, 248, 0.1);
}
</style>
