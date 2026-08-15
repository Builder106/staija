<script setup lang="ts">
/**
 * ScrollProgress — a 2px reading-progress bar fixed to the top of the
 * viewport, scaled by overall page scroll. Drop it once on long-form pages
 * (e.g. blog post detail).
 *
 * Hidden under prefers-reduced-motion.
 */

import { Motion, useScroll } from 'motion-v';
import { useReducedMotion } from '../../composables/useReducedMotion';

const { scrollYProgress } = useScroll();
const reduce = useReducedMotion();
</script>

<template>
  <Motion
    v-if="!reduce"
    class="fixed top-0 left-0 right-0 h-[2px] origin-left z-50 pointer-events-none bg-brand-violet"
    :style="{ scaleX: scrollYProgress }"
  />
</template>
