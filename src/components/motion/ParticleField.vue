<script setup lang="ts">
import { useReducedMotion } from '../../composables/useReducedMotion';

const reduce = useReducedMotion();

const particles = [
  { x: '12%', y: '22%', size: 4, delay: '0s', duration: '7s' },
  { x: '28%', y: '68%', size: 3, delay: '1.2s', duration: '9s' },
  { x: '44%', y: '18%', size: 5, delay: '0.6s', duration: '8s' },
  { x: '62%', y: '74%', size: 3, delay: '2.1s', duration: '10s' },
  { x: '78%', y: '28%', size: 4, delay: '1.5s', duration: '7.5s' },
  { x: '88%', y: '60%', size: 3, delay: '0.4s', duration: '8.5s' },
];
</script>

<template>
  <div v-if="!reduce" class="particle-field" aria-hidden="true">
    <span
      v-for="(p, idx) in particles"
      :key="idx"
      class="particle-field__dot"
      :style="{
        left: p.x,
        top: p.y,
        width: `${p.size}px`,
        height: `${p.size}px`,
        animationDelay: p.delay,
        animationDuration: p.duration,
      }"
    />
  </div>
</template>

<style scoped>
.particle-field {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.particle-field__dot {
  position: absolute;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(139, 85, 255, 0.45), rgba(94, 219, 231, 0.2));
  opacity: 0.35;
  will-change: transform, opacity;
  animation: particle-drift ease-in-out infinite;
}

@keyframes particle-drift {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
    opacity: 0.25;
  }
  50% {
    transform: translate3d(8px, -14px, 0) scale(1.18);
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .particle-field {
    display: none;
  }
}
</style>
