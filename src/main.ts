import { createApp } from 'vue';
// Legacy first so Tailwind's responsive utilities (loaded second) win
// when they overlap. legacy.css defines unscoped `.grid-cols-2` etc.
// for the dashboard tree; if loaded after Tailwind it would override
// `lg:grid-cols-*` and break footer / hero / other responsive grids.
import './style.css';
import './styles/legacy.css';
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import App from './App.vue';
import { currentLocale, i18n } from './i18n';
import router from './router';
import { installAnalyticsRouter } from './services/analytics';
import { captureReferrerFromUrl } from './services/referrals';
import { startVersionWatcher } from './services/versionCheck';

inject();
injectSpeedInsights();

// Auto-reload long-lived tabs when a new deploy ships. Without this,
// a tab that loaded its HTML at 9 AM keeps referencing the 9-AM chunk
// hashes forever — and any deploy in between leaves silently broken
// route navigations. The watcher fetches /version.txt on tab focus
// and reloads when the SHA no longer matches the bundle's own SHA.
startVersionWatcher();

// Capture `?ref=<id>` on the initial hit. The router.afterEach hook
// installed alongside Analytics below catches every subsequent SPA
// navigation that brings in a new `?ref=`.
captureReferrerFromUrl();

// Mount Vue immediately so first paint is instantaneous (FCP/LCP optimization).
// Router guards (src/router/index.ts) handle async Firebase Auth resolution for protected routes.
const app = createApp(App);
app.use(router);
app.use(i18n);

if (typeof document !== 'undefined') {
  document.documentElement.lang = currentLocale();
}

installAnalyticsRouter(router);

router.afterEach(() => {
  captureReferrerFromUrl();
});

app.mount('#app');
