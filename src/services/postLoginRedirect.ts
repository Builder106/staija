/**
 * Where to send a freshly-authenticated user, by role.
 *
 * Used in three places:
 *   - The global router.beforeEach guard, when a user lacks the
 *     permissions for the route they were trying to reach
 *   - The auth forms (LoginForm, SignUpForm, EmailLinkCallback) after a
 *     successful sign-in/sign-up
 *
 * Keep these consumers using the same helper so a sign-in via Google,
 * email/password, or magic link all land on the same role-appropriate
 * dashboard. Drift here means one path ends up at /admin while another
 * ends up at /home for the same user.
 *
 * Admin vs staff URL split: returns `{ path: '/admin' }` for admin and
 * `{ path: '/staff' }` for staff so the two roles never share a URL.
 * Other roles return a named route — those don't have the dual-URL
 * concern.
 */

import type { RouteLocationRaw } from 'vue-router';
import { PermissionService } from './permissions';
import type { UserRole } from './types';

export function postLoginRoute(role: UserRole | null | undefined): RouteLocationRaw {
  if (!role) return { name: 'home' };
  // isAdminRole first — isStaffRole returns true for admin too, so the
  // order matters; we want admin → /admin, not admin → /staff.
  if (PermissionService.isAdminRole(role)) return { path: '/admin' };
  if (PermissionService.isStaffRole(role)) return { path: '/staff' };
  // Students land in the LMS directly. The legacy /student/* dashboard
  // and its sibling mock-data pages were retired in favour of /learn
  // (real cohort + course + progress data) — see the matching route
  // redirects in router/index.ts.
  if (PermissionService.isStudentRole(role)) return { path: '/learn' };
  if (PermissionService.isAlumniRole(role)) return { name: 'alumni-home' };
  if (PermissionService.isMentorRole(role)) return { name: 'mentor-dashboard' };
  if (PermissionService.hasPermission(role, 'view_own_applications')) {
    return { name: 'applicant-dashboard' };
  }
  return { name: 'home' };
}
