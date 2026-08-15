<script setup lang="ts">
/**
 * Parallax — translates slotted content along Y as the wrapper passes through
 * the viewport. The wrapper itself stays in normal flow; only the inner
 * Motion element transforms, so total layout height is unchanged.
 *
 * Pass-through classes land on the host wrapper, so a caller can write
 * `<Parallax class="absolute inset-0">` to fill an absolute-positioned
 * container. The inner Motion element fills the host, and slot content
 * inherits its dimensions.
 *
 * The caller is responsible for clipping if needed (e.g. wrap in a parent
 * with `overflow-hidden`). Best used on decorative imagery and backgrounds —
 * not flowing text, which would visibly drift past neighbors.
 *
 * No-op under prefers-reduced-motion.
 */

import { Motion, useScroll, useTransform } from 'motion-v';
import { ref } from 'vue';
import { useReducedMotion } from '../../composables/useReducedMotion';

interface Props {
  /**
   * Drift amount and direction. Positive: content drifts upward as the page
   * scrolls down (foreground feel). Negative: content trails the scroll.
   * Range is open-ended but values outside ±1 usually look unnatural.
   */
  speed?: number;
  /** Total travel range in pixels across one viewport pass. */
  distance?: number;
}

const { speed = 0.3, distance = 80 } = defineProps<Props>();
const target = ref<HTMLElement | null>(null);
const reduce = useReducedMotion();

const { scrollYProgress } = useScroll({
  target,
  offset: ['start end', 'end start'],
});

const y = useTransform(scrollYProgress, [0, 1], [speed * distance, -speed * distance]);

defineOptions({ inheritAttrs: true });
</script>

<template>
  <div ref="target">
    <Motion v-if="!reduce" class="parallax-inner" :style="{ y, willChange: 'transform' }">
      <slot />
    </Motion>
    <template v-else>
      <slot />
    </template>
  </div>
</template>

<style scoped>
.parallax-inner {
  width: 100%;
  height: 100%;
}
</style>
