/**
 * Auto-reload when a new deploy ships.
 *
 * Vue Router SPA navigations never re-fetch index.html, so a session
 * that loaded its HTML before a new deploy stays on the old chunk
 * references forever — manifests as silently empty pages when the
 * stale chunks 404. This module fixes that without requiring the user
 * to manually hard-refresh.
 *
 * Mechanism: every build emits a `/version.txt` containing the commit
 * SHA. The same SHA is baked into the JS bundle as `__BUILD_ID__`. On
 * tab focus we re-fetch `/version.txt` (cache-busted with a timestamp
 * to bypass any intermediate cache) and compare to `__BUILD_ID__`. If
 * the server has a newer SHA, we force a full-page reload before the
 * user does anything that would surface a stale-chunk failure.
 *
 * Guarded against:
 *   - dev builds: `__BUILD_ID__` starts with "dev-" — skip entirely so
 *     a local dev server doesn't fight the auto-reload.
 *   - fetch failures: silently no-op. Network down is not a deploy
 *     event, so we don't try to "recover" by reloading.
 *   - reload loops: a single sessionStorage marker ensures we don't
 *     reload twice for the same target SHA in the same tab.
 */

const BUILD_ID = __BUILD_ID__;
const VERSION_URL = '/version.txt';
const RELOAD_MARKER_KEY = 'staija.versionReloadedTo';

let checking = false;

async function fetchCurrentBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text || null;
  } catch {
    return null;
  }
}

async function checkForUpdate(): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    const serverId = await fetchCurrentBuildId();
    if (!serverId || serverId === BUILD_ID) return;

    // We have a new deploy. Don't loop: if we've already reloaded to
    // this SHA in this tab, the bundle the browser actually loaded is
    // somehow stale anyway (CDN propagation lag, intermediate proxy
    // serving cached HTML, etc.). Wait it out instead of thrashing.
    const reloadedTo = sessionStorage.getItem(RELOAD_MARKER_KEY);
    if (reloadedTo === serverId) return;

    sessionStorage.setItem(RELOAD_MARKER_KEY, serverId);
    window.location.reload();
  } finally {
    checking = false;
  }
}

/**
 * Wires up the focus / visibility-change listeners that trigger the
 * check. Call once from `main.ts` after Vue mounts.
 */
export function startVersionWatcher(): void {
  // Skip in dev — local builds use a timestamp-style id, fetching
  // /version.txt from `vite dev` returns 404, the check no-ops, but
  // the focus listener still fires on every tab switch which is
  // wasteful. Bail explicitly.
  if (BUILD_ID.startsWith('dev-')) return;
  if (typeof window === 'undefined') return;

  // Skip on hostnames gated by Vercel SSO Deployment Protection. The
  // initial HTML load passes because the browser carries the SSO
  // cookie, but a same-origin fetch() from inside the SPA fires
  // without that cookie context and gets 401'd — visible as repeated
  // "GET /version.txt 401" lines in the DevTools console for as long
  // as the tab is open. The watcher serves no purpose on staging /
  // preview deploys anyway (those are reloaded manually during smoke
  // tests, not by long-lived end-user tabs), so just bail.
  const host = window.location.hostname;
  if (host === 'staging.staija.org' || host.endsWith('.vercel.app')) return;

  // Most common trigger: user returns to the tab after some time
  // away. visibilitychange fires for both "tab activated" and "tab
  // deactivated"; we only care about the activation side.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void checkForUpdate();
    }
  });

  // pageshow handles the case where the browser restores the page
  // from the back-forward cache — visibilitychange doesn't always
  // fire for bfcache restores.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) void checkForUpdate();
  });
}
