<script setup lang="ts">
import { Motion } from 'motion-v';
import { onMounted, ref } from 'vue';
// Hero Lottie data — JSON import keeps the data colocated, but the
// `lottie-web` runtime (~50 KB gzipped) is lazy-loaded inside
// onMounted below so it lands in its own chunk and doesn't block the
// home route's first paint. The hero-animation__canvas container has
// a fixed 260 px height (see <style scoped>) so reserving it during
// the lazy load doesn't shift layout.
import heroAnimation from '../assets/hero.json';

const props = defineProps<{
  title: string;
  subtitle?: string;
  ctaText?: string;
  ctaHref?: string;
  secondaryCtaText?: string;
  secondaryCtaHref?: string;
  backgroundImageUrl?: string;
}>();

const lottieContainer = ref<HTMLDivElement | null>(null);

onMounted(async () => {
  if (!lottieContainer.value) return;
  const { default: lottie } = await import('lottie-web');
  // Re-check the ref — the component may have unmounted while we
  // awaited the lottie chunk (fast route changes on the home page).
  if (!lottieContainer.value) return;
  lottie.loadAnimation({
    container: lottieContainer.value,
    renderer: 'svg',
    loop: false,
    autoplay: true,
    animationData: heroAnimation,
  });
});
</script>

<template>
  <section
    class="hero"
    :style="
      props.backgroundImageUrl
        ? {
            backgroundImage: `linear-gradient(rgba(10,14,23,0.55), rgba(10,14,23,0.55)), url(${props.backgroundImageUrl})`,
          }
        : {}
    "
  >
    <div class="eureka-lattice" aria-hidden="true"></div>
    <div class="container">
      <div class="hero-inner" aria-labelledby="hero-heading">
        <Motion
          :initial="{ opacity: 0, scale: 0.9, y: 30 }"
          :animate="{ opacity: 1, scale: 1, y: 0 }"
          :transition="{ duration: 0.4, delay: 0.1, ease: [0.34, 1.56, 0.64, 1] }"
          class="hero-animation"
          aria-hidden="true"
        >
          <div ref="lottieContainer" class="hero-animation__canvas"></div>
        </Motion>

        <Motion
          :initial="{ opacity: 0, y: 40 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.5, delay: 0.3, ease: [0.34, 1.56, 0.64, 1] }"
        >
          <h1 id="hero-heading" class="hero-title">
            {{ props.title || "Nurturing Africa's next generation of scientist‑leaders" }}
          </h1>
        </Motion>

        <Motion
          v-if="subtitle"
          :initial="{ opacity: 0, y: 20 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.5, delay: 0.45, ease: [0.34, 1.56, 0.64, 1] }"
        >
          <p class="hero-subtitle">{{ subtitle }}</p>
        </Motion>

        <Motion
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :transition="{ duration: 0.24, delay: 0.6, ease: [0.6, 0, 0.4, 1] }"
          class="hero-actions"
        >
          <Motion
            :initial="{ opacity: 0, scale: 0.8 }"
            :animate="{ opacity: 1, scale: 1 }"
            :transition="{ duration: 0.24, delay: 0.6, ease: [0.68, -0.55, 0.265, 1.55] }"
            :whileHover="{ scale: 1.02, borderRadius: '4px' }"
            :whileTap="{ scale: 0.98 }"
          >
            <RouterLink class="btn btn-primary" :to="ctaHref || '/apply'">{{
              ctaText || 'Apply'
            }}</RouterLink>
          </Motion>

          <Motion
            :initial="{ opacity: 0, scale: 0.8 }"
            :animate="{ opacity: 1, scale: 1 }"
            :transition="{ duration: 0.24, delay: 0.68, ease: [0.68, -0.55, 0.265, 1.55] }"
            :whileHover="{ scale: 1.02, borderRadius: '4px' }"
            :whileTap="{ scale: 0.98 }"
          >
            <RouterLink class="btn btn-secondary" :to="secondaryCtaHref || '/donate'">{{
              secondaryCtaText || 'Donate'
            }}</RouterLink>
          </Motion>
        </Motion>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  width: 100%;
  min-height: 92vh;
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, var(--primary-50), var(--secondary-50));
  background-size: cover;
  background-position: center;
}

.hero::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.eureka-lattice {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 150vw;
  height: 150vw;
  background-image:
    repeating-linear-gradient(
      45deg,
      var(--primary-200) 0,
      var(--primary-200) 1px,
      transparent 1px,
      transparent 40px
    ),
    repeating-linear-gradient(
      -45deg,
      var(--primary-200) 0,
      var(--primary-200) 1px,
      transparent 1px,
      transparent 40px
    );
  z-index: -1;
  pointer-events: none;
  animation: lattice-pulse 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
  mix-blend-mode: multiply;
}

@keyframes lattice-pulse {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.2) rotate(45deg);
    clip-path: circle(0% at center);
  }
  50% {
    opacity: 0.15;
    transform: translate(-50%, -50%) scale(1.05) rotate(0deg);
    clip-path: circle(50% at center);
  }
  100% {
    opacity: 0.1;
    transform: translate(-50%, -50%) scale(1) rotate(0deg);
    clip-path: circle(50% at center);
  }
}

@media (prefers-reduced-motion: reduce) {
  .eureka-lattice {
    animation: none;
    opacity: 0.15;
  }
}

.hero-inner {
  position: relative;
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 var(--space-6);
  text-align: center;
}

.hero-animation {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0 auto var(--space-8);
  max-width: 520px;
}

.hero-animation__canvas {
  width: 100%;
  height: 260px;
}

.hero-title {
  font-size: clamp(2.5rem, 6vw, 4.5rem);
  font-weight: 900;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--neutral-900);
  margin: 0 0 var(--space-6) 0;
  text-transform: uppercase;
  text-shadow: 4px 4px 0px var(--primary-200);
}

.hero-subtitle {
  font-size: clamp(1.0625rem, 2.2vw, 1.5rem);
  color: var(--neutral-800);
  line-height: 1.7;
  margin: 0 auto;
  max-width: 900px;
  font-weight: 600;
}

.hero-actions {
  margin-top: var(--space-8);
  display: inline-flex;
  gap: var(--space-4);
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius-full);
  font-weight: 700;
  text-decoration: none;
  border: 1px solid transparent;
}

.btn-primary {
  background: var(--primary-700);
  color: white;
  border-color: var(--primary-800);
}

.btn-primary:hover {
  background: var(--primary-800);
}

.btn-secondary {
  background: white;
  color: var(--primary-800);
  border-color: var(--primary-200);
}

.btn-secondary:hover {
  background: var(--primary-50);
}

.btn:focus-visible {
  outline: 3px solid var(--secondary-400);
  outline-offset: 2px;
}

@media (min-width: 1024px) {
  .hero {
    min-height: 95vh;
  }
  .hero-title {
    font-size: clamp(3rem, 5.5vw, 4.25rem);
  }
  .hero-subtitle {
    font-size: clamp(1.125rem, 1.8vw, 1.5rem);
  }
}

@media (max-width: 639px) {
  .hero {
    min-height: 80vh;
  }
}
</style>
