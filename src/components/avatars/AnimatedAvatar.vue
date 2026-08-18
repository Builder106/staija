<script setup lang="ts">
import { Motion } from 'motion-v';
import { computed, ref } from 'vue';
import {
  AVATAR_BREATH_AMPLITUDE,
  AVATAR_DURATIONS,
  AVATAR_EASINGS,
  usePrefersReducedMotion,
} from '../../composables/useAvatarMotion';

/**
 * Phase 1 avatar wrapper. Adds three layers of motion to a static
 * portrait image:
 *
 *   - mount  — fade + scale-in on first paint (one-shot)
 *   - idle   — slow breath cycle while visible (infinite)
 *   - hover  — scale-up + drop shadow (interactive)
 *
 * `state` toggles between presets. `'idle'` is the default — the
 * everyday avatar, gentle breath. `'hero'` uses a slightly larger
 * breath amplitude for the Settings-page profile portrait, where the
 * avatar is the hero element on the page. `'static'` disables breath
 * entirely (mount + hover still play) for grids where many breathing
 * avatars would be distracting.
 *
 * All motion is gated on `prefers-reduced-motion: reduce` — when set,
 * the component renders the avatar with no transitions and no
 * infinite animations.
 */

const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    size?: number;
    state?: 'idle' | 'hero' | 'static';
  }>(),
  {
    alt: '',
    size: 80,
    state: 'idle',
  },
);

const { prefersReducedMotion } = usePrefersReducedMotion();

// Per-mount random phase offset for the breath cycle. When multiple
// avatars render on a page (alumni grid, comment thread), we don't
// want them pulsing in lockstep — that reads as artificial. Stable
// per instance: computed once on setup, never reactive.
const breathPhaseDelay = ref(Math.random() * AVATAR_DURATIONS.breath);

const breathAmplitude = computed(() =>
  props.state === 'hero' ? AVATAR_BREATH_AMPLITUDE.hero : AVATAR_BREATH_AMPLITUDE.idle,
);

const animatesBreath = computed(() => props.state !== 'static' && !prefersReducedMotion.value);

const initial = computed(() =>
  prefersReducedMotion.value ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.92 },
);

const animate = computed(() => {
  if (prefersReducedMotion.value) {
    return { opacity: 1, scale: 1 };
  }
  if (!animatesBreath.value) {
    return { opacity: 1, scale: 1 };
  }
  const a = breathAmplitude.value;
  return { opacity: 1, scale: [1, 1 + a, 1] };
});

const transition = computed(() => {
  if (prefersReducedMotion.value) {
    return { duration: 0 };
  }
  if (!animatesBreath.value) {
    return {
      duration: AVATAR_DURATIONS.mount,
      ease: AVATAR_EASINGS.out,
    };
  }
  return {
    opacity: { duration: AVATAR_DURATIONS.mount, ease: AVATAR_EASINGS.out },
    scale: {
      duration: AVATAR_DURATIONS.breath,
      ease: AVATAR_EASINGS.inOut,
      repeat: Infinity,
      delay: breathPhaseDelay.value,
    },
  };
});

const whileHover = computed(() =>
  prefersReducedMotion.value
    ? undefined
    : {
        scale: 1.05,
        transition: {
          duration: AVATAR_DURATIONS.hover,
          ease: AVATAR_EASINGS.out,
        },
      },
);

const sizeStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
}));
</script>

<template>
  <Motion
    :initial="initial"
    :animate="animate"
    :transition="transition"
    :while-hover="whileHover"
    class="animated-avatar"
    :style="sizeStyle"
  >
    <img
      :src="props.src"
      :alt="props.alt"
      :width="props.size"
      :height="props.size"
      class="animated-avatar__img"
      draggable="false"
    />
  </Motion>
</template>

<style scoped>
.animated-avatar {
  display: inline-block;
  border-radius: 9999px;
  overflow: hidden;
  transform-origin: center;
  will-change: transform;
}

.animated-avatar:hover {
  filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.18));
}

.animated-avatar__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .animated-avatar:hover {
    filter: none;
  }
}
</style>
