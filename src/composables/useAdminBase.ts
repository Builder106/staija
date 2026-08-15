/**
 * Resolves the URL prefix the current admin/staff visitor navigated
 * under (`/admin` or `/staff`). The same components serve both paths
 * — staff land on `/staff/*`, admin land on `/admin/*` — so internal
 * RouterLinks need to preserve whichever prefix the visitor is
 * actually on, otherwise a staff click would pivot the URL bar from
 * `/staff/applications` to `/admin/applications/:id` and break the
 * role/URL alignment we ship for separation.
 *
 * Implementation note: this reads from `route.path` rather than the
 * user's role on purpose. The role-based decision happens *once*, at
 * post-login redirect time (postLoginRoute); from that moment on the
 * URL itself is the source of truth, and a cross-prefix accident
 * (e.g. a stale bookmark pointing at /admin while signed in as
 * staff) is caught by the router guard, not by every link helper.
 */

import { computed } from 'vue';
import { useRoute } from 'vue-router';

export function useAdminBase() {
  const route = useRoute();
  const adminBase = computed<'/admin' | '/staff'>(() =>
    route.path.startsWith('/staff') ? '/staff' : '/admin'
  );
  return { adminBase };
}
