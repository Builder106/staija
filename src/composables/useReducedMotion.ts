/**
 * Reduced-motion preference — single source of truth for JS-driven motion.
 *
 * CSS animations should keep using `@media (prefers-reduced-motion: reduce)`
 * directly. This composable is for components that decide at runtime whether
 * to mount motion-v animations, scroll-driven transforms, etc.
 *
 * Module-level state with a refcounted matchMedia listener so multiple
 * components share one subscription.
 */

import { onBeforeUnmount, onMounted, ref } from 'vue';

const QUERY = '(prefers-reduced-motion: reduce)';

const prefers = ref(detectInitial());
let mediaQuery: MediaQueryList | null = null;
let listenerCount = 0;

function detectInitial(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

function onChange(e: MediaQueryListEvent) {
  prefers.value = e.matches;
}

export function useReducedMotion() {
  onMounted(() => {
    listenerCount++;
    if (listenerCount === 1 && typeof window !== 'undefined' && window.matchMedia) {
      mediaQuery = window.matchMedia(QUERY);
      mediaQuery.addEventListener('change', onChange);
      // Re-sync in case the OS preference changed between module load and mount.
      prefers.value = mediaQuery.matches;
    }
  });

  onBeforeUnmount(() => {
    listenerCount = Math.max(0, listenerCount - 1);
    if (listenerCount === 0 && mediaQuery) {
      mediaQuery.removeEventListener('change', onChange);
      mediaQuery = null;
    }
  });

  return prefers;
}
