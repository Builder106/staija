import { computed } from 'vue';
import { PermissionService } from '../services/permissions';
import type { Permission, UserRole } from '../services/types';
import { useAuth } from './useAuth';

export function usePermissions(roleOverride?: () => UserRole | null) {
  const { role: authRole } = useAuth();

  const role = computed(() => {
    if (roleOverride) return roleOverride();
    return authRole.value;
  });

  function hasPermission(permission: Permission): boolean {
    if (!role.value) return false;
    return PermissionService.hasPermission(role.value, permission);
  }

  function hasAnyPermission(permissions: Permission[]): boolean {
    if (!role.value) return false;
    return PermissionService.hasAnyPermission(role.value, permissions);
  }

  const isAdmin = computed(() => (role.value ? PermissionService.isAdminRole(role.value) : false));
  const isStaff = computed(() => (role.value ? PermissionService.isStaffRole(role.value) : false));
  const isAlumni = computed(() =>
    role.value ? PermissionService.isAlumniRole(role.value) : false,
  );
  const isStudent = computed(() =>
    role.value ? PermissionService.isStudentRole(role.value) : false,
  );
  const isMentor = computed(() =>
    role.value ? PermissionService.isMentorRole(role.value) : false,
  );

  return {
    role,
    hasPermission,
    hasAnyPermission,
    isAdmin,
    isStaff,
    isAlumni,
    isStudent,
    isMentor,
  };
}
