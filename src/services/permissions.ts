import type { Permission, UserRole } from './types';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'manage_users',
    'manage_roles',
    'view_all_users',
    'manage_system_settings',
    'view_applications',
    'review_applications',
    'manage_applications',
    'export_applications',
    'create_programs',
    'edit_programs',
    'delete_programs',
    'manage_program_settings',
    'access_alumni_portal',
    'manage_alumni_profiles',
    'view_public_content',
    'contact_support',
    'manage_profile',
    'grade_submissions',
    'manage_cohorts',
    'manage_sessions',
  ],

  staff: [
    'view_all_users',
    'view_applications',
    'review_applications',
    'manage_applications',
    'edit_programs',
    'manage_program_settings',
    'access_alumni_portal',
    'view_public_content',
    'contact_support',
    'manage_profile',
    'grade_submissions',
    'manage_cohorts',
    'manage_sessions',
  ],

  alumni: [
    'access_alumni_portal',
    'share_alumni_stories',
    'network_with_alumni',
    'view_public_content',
    'contact_support',
    'manage_profile',
  ],

  applicant: [
    'apply_to_programs',
    'view_own_applications',
    'edit_own_applications',
    'view_public_content',
    'contact_support',
    'manage_profile',
  ],

  student: [
    'view_own_applications',
    'view_program_content',
    'access_student_portal',
    'participate_in_programs',
    'submit_program_work',
    'submit_assignments',
    'access_mentor_support',
    'view_public_content',
    'contact_support',
    'manage_profile',
  ],

  mentor: [
    'view_program_content',
    'view_assigned_students',
    'submit_mentor_feedback',
    'grade_submissions',
    'manage_sessions',
    'access_mentor_support',
    'view_public_content',
    'contact_support',
    'manage_profile',
  ],
};

// Derived runtime lists. Admin UIs that need to iterate every role or every
// permission (e.g. UserManagement.vue) should import these instead of
// hardcoding their own arrays — new roles or permissions then show up in
// the admin dropdowns without an extra edit somewhere else.
export const ALL_ROLES: UserRole[] = Object.keys(ROLE_PERMISSIONS) as UserRole[];

export const ALL_PERMISSIONS: Permission[] = Array.from(
  new Set(Object.values(ROLE_PERMISSIONS).flat()),
);

export class PermissionService {
  static hasPermission(userRole: UserRole, permission: Permission): boolean {
    const permissions = ROLE_PERMISSIONS[userRole] || [];
    return permissions.includes(permission);
  }

  static hasAnyPermission(userRole: UserRole, permissions: Permission[]): boolean {
    return permissions.some((permission) => this.hasPermission(userRole, permission));
  }

  static hasAllPermissions(userRole: UserRole, permissions: Permission[]): boolean {
    return permissions.every((permission) => this.hasPermission(userRole, permission));
  }

  static getRolePermissions(role: UserRole): Permission[] {
    return ROLE_PERMISSIONS[role] || [];
  }

  // Identity checks: "is this user *exactly* this role?"
  //
  // `isStaffRole` is the one exception that returns true for admin too —
  // admin is a strict superset of staff capabilities, and the router's
  // post-login redirect cascade depends on admins matching it first so they
  // land at /admin. The others are strict identity checks: an admin is not
  // an alumnus / student / mentor, even though they have superset
  // permissions. Use `hasPermission(role, '...')` to ask capability
  // questions.
  static isAdminRole(role: UserRole): boolean {
    return role === 'admin';
  }

  static isStaffRole(role: UserRole): boolean {
    return role === 'admin' || role === 'staff';
  }

  static isAlumniRole(role: UserRole): boolean {
    return role === 'alumni';
  }

  static isStudentRole(role: UserRole): boolean {
    return role === 'student';
  }

  static isMentorRole(role: UserRole): boolean {
    return role === 'mentor';
  }

  static canAssignRole(currentRole: UserRole, targetRole: UserRole): boolean {
    if (currentRole === 'admin') return true;
    if (currentRole === 'staff') {
      return ['applicant', 'staff', 'alumni', 'mentor'].includes(targetRole);
    }
    return false;
  }

  static isValidRoleTransition(currentRole: UserRole, newRole: UserRole): boolean {
    if (currentRole === newRole) return true;

    // Lifecycle transitions:
    //   applicant → student (accepted), alumni (accepted but program ended),
    //               or mentor (consumed an admin's invite link)
    //   student → alumni (graduated), applicant (re-applying to another
    //             program), or mentor (alum-track mentor pulled in early)
    //   alumni → mentor (very common pattern), applicant, or student
    //   mentor → staff (hired full-time) or alumni (mentor stint ended)
    //   staff → admin, applicant, or mentor (staff who also mentor)
    //   admin → staff, applicant, alumni, or mentor (mostly for testing)
    //
    // Keep this in lockstep with `isValidRoleTransition` in
    // firestore.rules. Drift means client-side validation passes
    // while the server rule rejects (or vice versa).
    const allowedTransitions: Record<UserRole, UserRole[]> = {
      applicant: ['student', 'alumni', 'mentor'],
      student: ['alumni', 'applicant', 'mentor'],
      alumni: ['applicant', 'student', 'mentor'],
      mentor: ['staff', 'alumni'],
      staff: ['admin', 'applicant', 'mentor'],
      admin: ['staff', 'applicant', 'alumni', 'mentor'],
    };

    return allowedTransitions[currentRole]?.includes(newRole) ?? false;
  }
}
