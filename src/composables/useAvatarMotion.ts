import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * Shared motion values for the avatar wrapper. Centralized so the
 * preview route, Settings hero, team grids, and any future surfaces
 * stay visually consistent.
 *
 * Durations are in seconds (Motion-V's unit). Easings are cubic-bezier
 * arrays for use with `:transition`. The `[0.34, 1.56, 0.64, 1]` curve
 * is the "back" ease used elsewhere in the app (Hero, Home).
 */

export const AVATAR_DURATIONS = {
  mount: 0.28,
  hover: 0.2,
  breath: 4,
} as const;

export const AVATAR_EASINGS = {
  back: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
};

export const AVATAR_BREATH_AMPLITUDE = {
  idle: 0.018,
  hero: 0.025,
} as const;

/**
 * Reactive `prefers-reduced-motion: reduce` flag. Components that
 * import this should treat `true` as "skip every transition, jump
 * straight to the resolved state". Listens for system-level changes
 * so a user toggling the OS setting mid-session doesn't need a
 * reload.
 */
export function usePrefersReducedMotion() {
  const prefersReducedMotion = ref(false);

  let mql: MediaQueryList | null = null;
  const onChange = (e: MediaQueryListEvent) => {
    prefersReducedMotion.value = e.matches;
  };

  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.value = mql.matches;
    mql.addEventListener('change', onChange);
  });

  onBeforeUnmount(() => {
    mql?.removeEventListener('change', onChange);
  });

  return { prefersReducedMotion };
}
