<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useReducedMotion } from '../../composables/useReducedMotion';

interface Props {
  /** Target particle count. Default: 32 (optimized for performance). */
  count?: number;
  /** Max connection distance in CSS pixels. Default: 110. */
  maxDistance?: number;
  /** CSS class to append to the canvas container. */
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  count: 32,
  maxDistance: 110,
  class: '',
});

const canvasRef = ref<HTMLCanvasElement | null>(null);
const reduceMotion = useReducedMotion();

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
}

let particles: Particle[] = [];
let animFrameId = 0;
let isVisible = true;
let observer: IntersectionObserver | null = null;

function initParticles(width: number, height: number) {
  particles = [];
  const particleCount = Math.min(props.count, Math.floor((width * height) / 18000));
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      radius: Math.random() * 1.5 + 1,
      baseAlpha: Math.random() * 0.3 + 0.15,
    });
  }
}

function handleResize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = parent.clientWidth;
  const height = parent.clientHeight;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
  }

  initParticles(width, height);
}

function draw() {
  if (!isVisible || reduceMotion.value) return;

  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;

  ctx.clearRect(0, 0, width, height);

  const isDark = document.documentElement.classList.contains('dark');
  const nodeColor = isDark ? '167, 139, 250' : '99, 102, 241'; // brand violet / indigo rgb

  // Draw connecting edges
  const maxDistSq = props.maxDistance * props.maxDistance;
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const distSq = dx * dx + dy * dy;
      if (distSq < maxDistSq) {
        const alpha = (1 - distSq / maxDistSq) * 0.12;
        ctx.strokeStyle = `rgba(${nodeColor}, ${alpha})`;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.stroke();
      }
    }
  }

  // Draw and step particles
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;

    // Wrap-around boundaries
    if (p.x < 0) p.x = width;
    else if (p.x > width) p.x = 0;
    if (p.y < 0) p.y = height;
    else if (p.y > height) p.y = 0;

    ctx.fillStyle = `rgba(${nodeColor}, ${p.baseAlpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  animFrameId = requestAnimationFrame(draw);
}

onMounted(() => {
  handleResize();
  window.addEventListener('resize', handleResize, { passive: true });

  if (canvasRef.value) {
    observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      isVisible = entry.isIntersecting;
      if (isVisible && !animFrameId && !reduceMotion.value) {
        animFrameId = requestAnimationFrame(draw);
      } else if (!isVisible && animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = 0;
      }
    });
    observer.observe(canvasRef.value);
  }

  if (!reduceMotion.value) {
    animFrameId = requestAnimationFrame(draw);
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (observer) {
    observer.disconnect();
    observer = null;
  }
});
</script>

<template>
  <canvas
    ref="canvasRef"
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 z-0 opacity-80 transition-opacity duration-700"
    :class="props.class"
  />
</template>
