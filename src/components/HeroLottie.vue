<script setup lang="ts">
import type { AnimationItem } from 'lottie-web';
import { onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    loop?: boolean;
    autoplay?: boolean;
  }>(),
  { loop: true, autoplay: true }
);

const container = ref<HTMLDivElement | null>(null);
let instance: AnimationItem | null = null;
let disposed = false;

onMounted(async () => {
  if (!container.value) return;
  const [{ default: lottie }, animationModule] = await Promise.all([
    import('lottie-web'),
    import('../assets/hero.json'),
  ]);
  if (disposed || !container.value) return;
  instance = lottie.loadAnimation({
    container: container.value,
    renderer: 'svg',
    loop: props.loop,
    autoplay: props.autoplay,
    animationData: animationModule.default,
    // Explicit renderer settings to prevent layout shift
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid meet',
      progressiveLoad: false,
      hideOnTransparent: true,
    },
  });
});

onBeforeUnmount(() => {
  disposed = true;
  instance?.destroy();
  instance = null;
});
</script>

<template>
  <div
    ref="container"
    class="w-full h-full max-w-[560px] relative"
    aria-hidden="true"
    style="width: 100%; height: 100%; min-width: 0; min-height: 0"
  >
    <!-- Static placeholder matching Lottie intrinsic aspect ratio (1080x950).
         Prevents CLS while lottie-web + hero.json load asynchronously.
         Low-res blurred SVG (tiny inline data URI) — replaced by Lottie
         on mount. -->
    <img
      src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1080' height='950' viewBox='0 0 1080 950'%3E%3Crect fill='%238B55FF' width='1080' height='950'/%3E%3C/svg%3E"
      alt=""
      aria-hidden="true"
      class="absolute inset-0 w-full h-full object-cover opacity-10 blur-[2px]"
      width="1080"
      height="950"
    />
  </div>
</template>
