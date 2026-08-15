/**
 * Theme management — light/dark mode with system preference detection.
 *
 * Three states:
 *   - 'light' — force light regardless of OS
 *   - 'dark'  — force dark regardless of OS
 *   - 'system' — match `prefers-color-scheme`, update live if OS flips
 *
 * Persistence: localStorage under `staija.theme`. Default: 'system'.
 *
 * The applied theme (light/dark) is reflected as `data-theme="..."` on
 * <html>. A small synchronous script in index.html runs this same logic
 * before Vue mounts, so there's no flash-of-wrong-theme on first paint.
 * The composable here only handles in-app changes after that.
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'staija.theme';

// Module-level state — single source of truth across the app. Without
// this, two `useTheme()` calls would each have their own ref and the
// toggle in the footer wouldn't sync with anything else that reads the
// theme.
const choice = ref<ThemeChoice>(readStored());
const systemDark = ref(detectSystemDark());

let mediaQuery: MediaQueryList | null = null;

function readStored(): ThemeChoice {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

function detectSystemDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyToDocument(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolved;
  // Sync the mobile-browser chrome bar so it doesn't read as a stark
  // light strip in dark mode (or vice versa). Color-scheme also gives
  // the browser hints for native form controls, scrollbars, etc.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const color = resolved === 'dark' ? '#0B0E12' : '#F1F5F9';
  if (meta) meta.content = color;
  document.documentElement.style.colorScheme = resolved;
}

let listenerCount = 0;

export function useTheme() {
  const resolved = computed<ResolvedTheme>(() => {
    if (choice.value === 'system') return systemDark.value ? 'dark' : 'light';
    return choice.value;
  });

  function setTheme(next: ThemeChoice) {
    choice.value = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode — non-fatal, theme just won't persist */
    }
  }

  // Cycle: light → dark → system → light. Keeps the toggle a
  // single-button affordance instead of needing a popover.
  function toggle() {
    if (choice.value === 'light') setTheme('dark');
    else if (choice.value === 'dark') setTheme('system');
    else setTheme('light');
  }

  // Re-apply whenever the resolved theme changes (either choice flips
  // or the OS flips while choice === 'system').
  watch(resolved, applyToDocument, { immediate: true });

  // Watch the OS preference. Only matters while choice === 'system',
  // but we always wire it so flipping back to 'system' picks up the
  // current OS state without a reload.
  function onMediaChange(e: MediaQueryListEvent) {
    systemDark.value = e.matches;
  }

  onMounted(() => {
    listenerCount++;
    if (listenerCount === 1 && typeof window !== 'undefined' && window.matchMedia) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', onMediaChange);
    }
  });

  onBeforeUnmount(() => {
    listenerCount = Math.max(0, listenerCount - 1);
    if (listenerCount === 0 && mediaQuery) {
      mediaQuery.removeEventListener('change', onMediaChange);
      mediaQuery = null;
    }
  });

  return {
    /** What the user picked: 'light' | 'dark' | 'system'. */
    choice,
    /** What's actually applied: 'light' | 'dark'. */
    resolved,
    setTheme,
    toggle,
  };
}
