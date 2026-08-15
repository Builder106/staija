import { addDoc, collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../config/firebase.ts';
import type { AuditLog, Permission, UserRole } from './types';

export class AuditService {
  static async logRoleChange(params: {
    userId: string;
    previousRole: UserRole;
    newRole: UserRole;
    changedBy: string;
    reason?: string;
  }): Promise<void> {
    try {
      const auditLog = {
        type: 'role_change',
        userId: params.userId,
        previousRole: params.previousRole,
        newRole: params.newRole,
        changedBy: params.changedBy,
        reason: params.reason || 'Role change',
        timestamp: new Date(),
        ipAddress: '',
        userAgent: '',
      };

      await addDoc(collection(db, 'audit_logs'), auditLog);
    } catch (error) {
      console.error('Failed to log role change:', error);
    }
  }

  static async logPermissionCheck(params: {
    userId: string;
    permission: Permission;
    granted: boolean;
    context?: string;
  }): Promise<void> {
    try {
      const auditLog = {
        type: 'permission_check',
        userId: params.userId,
        permission: params.permission,
        granted: params.granted,
        context: params.context || '',
        timestamp: new Date(),
      };

      await addDoc(collection(db, 'audit_logs'), auditLog);
    } catch (error) {
      console.error('Failed to log permission check:', error);
    }
  }

  static async getAuditLogs(userId?: string, logLimit: number = 50): Promise<AuditLog[]> {
    try {
      let q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(logLimit));

      if (userId) {
        q = query(q, where('userId', '==', userId));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as AuditLog);
    } catch (error) {
      console.error('Failed to get audit logs:', error);
      throw error;
    }
  }
}
