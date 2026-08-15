/**
 * i18n setup. Backed by vue-i18n. Locale persistence via localStorage.
 *
 * Per PRD §8 + Decision #4:
 *   - Yorùbá (yo) is the first localization launch.
 *   - Hausa (ha), Igbo (ig), French (fr) follow.
 *   - English (en) is the source of truth + fallback for missing keys.
 *   - Manual translation only — no auto-translate. Empty strings in
 *     yo.json fall back to en.json automatically.
 */

import { createI18n, type I18nOptions } from 'vue-i18n';
import en from './locales/en.json';
import yo from './locales/yo.json';

export type LocaleCode = 'en' | 'yo';

export interface LocaleEntry {
  code: LocaleCode;
  label: string; // displayed in switcher
  nativeLabel: string; // shown to native speakers in their own script
}

// Locales the LocaleSwitcher exposes to end-users. Yorùbá ('yo') is
// **deliberately not listed** here despite yo.json being registered in
// the i18n messages map below — see PRD Decision §16.13. Showing a
// Yorùbá option while yo.json is empty (or worse, machine-translated)
// would be a footgun for the audience PRD §3 describes: they pick it,
// see English fall-throughs, and conclude the site doesn't actually
// serve them. Re-add `{ code: 'yo', label: 'Yoruba', nativeLabel: 'Yorùbá' }`
// here once a Yorùbá-speaking reviewer is in the loop AND yo.json has
// the priority surfaces (Home + StepUp + Donate per PRD §4.12) covered.
export const SUPPORTED_LOCALES: LocaleEntry[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
];

const STORAGE_KEY = 'staija.locale';
const DEFAULT_LOCALE: LocaleCode = 'en';

function detectInitialLocale(): LocaleCode {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(STORAGE_KEY) as LocaleCode | null;
  if (stored && SUPPORTED_LOCALES.some(l => l.code === stored)) return stored;

  // Honor browser language if it matches a supported locale.
  const browser = navigator.language.split('-')[0];
  if (SUPPORTED_LOCALES.some(l => l.code === browser)) return browser as LocaleCode;

  return DEFAULT_LOCALE;
}

const options: I18nOptions = {
  legacy: false,
  globalInjection: true,
  locale: detectInitialLocale(),
  fallbackLocale: 'en',
  // Empty strings in non-en locales fall back to en. Without this, an empty
  // string is treated as a real translation (returns empty string).
  fallbackWarn: false,
  missingWarn: false,
  messages: {
    en,
    yo,
  },
};

export const i18n = createI18n(options);

export function setLocale(code: LocaleCode): void {
  if (!SUPPORTED_LOCALES.some(l => l.code === code)) return;
  const loc = i18n.global.locale as string | { value: string };
  if (typeof loc === 'object' && loc !== null && 'value' in loc) {
    loc.value = code;
  } else {
    (i18n.global as { locale: string }).locale = code;
  }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, code);
    document.documentElement.lang = code;
  }
}

export function currentLocale(): LocaleCode {
  const loc = i18n.global.locale as string | { value: LocaleCode };
  if (typeof loc === 'object' && loc !== null && 'value' in loc) {
    return loc.value;
  }
  return loc as LocaleCode;
}
