<script setup lang="ts">
import lottie, { type AnimationItem } from 'lottie-web';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

/**
 * Plays a Lottie animation in a circular avatar frame, with a PNG
 * fallback that's shown until the Lottie either loads or fails.
 * Designed for surfaces that want richer character motion (eye blink,
 * head tilt, expression shift) on a single hero portrait — typically
 * the Settings page. Bulk grids should keep using AnimatedAvatar +
 * static thumbnail.
 *
 * The Lottie source is provided as raw animation JSON (the parsed
 * `.lottie` or Bodymovin export). The caller is responsible for
 * importing the JSON; that way Vite tree-shakes the file out of
 * bundles where it isn't needed.
 *
 * Hover scale-up is implemented in CSS rather than Lottie so the
 * "hover state" stays consistent with AnimatedAvatar across the app.
 */

const props = withDefaults(
  defineProps<{
    // Parsed Lottie JSON. When null/undefined, only the fallback
    // renders. Use a dynamic-import so the JSON doesn't bloat the
    // bundle of pages that don't need it.
    animationData?: Record<string, unknown> | null;
    // PNG shown until the Lottie loads (and as the permanent
    // rendering when prefers-reduced-motion is set).
    fallbackSrc: string;
    alt?: string;
    size?: number;
    loop?: boolean;
    autoplay?: boolean;
  }>(),
  {
    animationData: null,
    alt: '',
    size: 80,
    loop: true,
    autoplay: true,
  },
);

const container = ref<HTMLDivElement | null>(null);
const loaded = ref(false);
let instance: AnimationItem | null = null;

function destroyInstance() {
  if (instance) {
    instance.destroy();
    instance = null;
  }
  loaded.value = false;
}

function loadInstance() {
  destroyInstance();
  if (!container.value || !props.animationData) return;

  // Honor prefers-reduced-motion: render only the static fallback.
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }

  instance = lottie.loadAnimation({
    container: container.value,
    renderer: 'svg',
    loop: props.loop,
    autoplay: props.autoplay,
    animationData: props.animationData,
  });
  // `DOMLoaded` fires once the Lottie SVG is in the DOM. We wait for
  // it before fading the fallback out so the swap is invisible.
  instance.addEventListener('DOMLoaded', () => {
    loaded.value = true;
  });
}

onMounted(loadInstance);
onBeforeUnmount(destroyInstance);

// Re-load when the animationData reference changes — e.g. a parent
// dynamic-imported a new file.
watch(
  () => props.animationData,
  () => loadInstance(),
);
</script>

<template>
  <div class="lottie-avatar" :style="{ width: `${props.size}px`, height: `${props.size}px` }">
    <img
      v-show="!loaded || !props.animationData"
      :src="props.fallbackSrc"
      :alt="props.alt"
      :width="props.size"
      :height="props.size"
      class="lottie-avatar__fallback"
      draggable="false"
    />
    <div
      ref="container"
      class="lottie-avatar__stage"
      :class="{ 'lottie-avatar__stage--loaded': loaded }"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.lottie-avatar {
  display: inline-block;
  position: relative;
  border-radius: 9999px;
  overflow: hidden;
  transform-origin: center;
  will-change: transform;
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.lottie-avatar:hover {
  transform: scale(1.05);
  filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.18));
}

.lottie-avatar__fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.lottie-avatar__stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 200ms ease-out;
  pointer-events: none;
}

.lottie-avatar__stage--loaded {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .lottie-avatar,
  .lottie-avatar__stage {
    transition: none;
  }
  .lottie-avatar:hover {
    transform: none;
    filter: none;
  }
}
</style>
