import { AuditService } from './audit';
import { AuthService } from './auth';
import { DatabaseService } from './database';
import type { Application, AuditLog, UserProfile, UserRole } from './types';

export class RoleTransitionService {
  static async checkTransitionEligibility(
    userId: string,
    targetRole: UserRole
  ): Promise<{
    eligible: boolean;
    reason?: string;
    requiredActions?: string[];
  }> {
    try {
      const userProfile = await DatabaseService.getUserProfile(userId);
      if (!userProfile) {
        return { eligible: false, reason: 'User profile not found' };
      }

      switch (targetRole) {
        case 'alumni':
          return await this.checkAlumniEligibility(userProfile);
        case 'student':
          return await this.checkStudentEligibility(userProfile);
        case 'staff':
          return await this.checkStaffEligibility(userProfile);
        case 'admin':
          return await this.checkAdminEligibility(userProfile);
        default:
          return { eligible: false, reason: 'Invalid target role for transition' };
      }
    } catch (error) {
      console.error('Error checking transition eligibility:', error);
      return { eligible: false, reason: 'Error checking eligibility' };
    }
  }

  private static async checkStudentEligibility(userProfile: UserProfile): Promise<{
    eligible: boolean;
    reason?: string;
    requiredActions?: string[];
  }> {
    if (userProfile.role !== 'applicant') {
      return { eligible: false, reason: 'User must be an applicant to transition to student' };
    }

    const userApplications = await DatabaseService.getUserApplications(userProfile.uid);
    const acceptedApplications = userApplications.filter(
      app => app.status === 'accepted' && app.program
    );

    if (acceptedApplications.length === 0) {
      return {
        eligible: false,
        reason: 'User must be accepted into a program to become a student',
        requiredActions: ['Apply to a program', 'Get program acceptance'],
      };
    }

    return { eligible: true };
  }

  private static async checkAlumniEligibility(userProfile: UserProfile): Promise<{
    eligible: boolean;
    reason?: string;
    requiredActions?: string[];
  }> {
    if (userProfile.role !== 'applicant' && userProfile.role !== 'student') {
      return {
        eligible: false,
        reason: 'User must be an applicant or student to transition to alumni',
      };
    }

    const userApplications = await DatabaseService.getUserApplications(userProfile.uid);
    const completedApplications = userApplications.filter(
      app => app.status === 'accepted' && app.program && this.isProgramCompleted(app)
    );

    if (completedApplications.length === 0) {
      return {
        eligible: false,
        reason: 'User must complete a program to become alumni',
        requiredActions: ['Complete program requirements'],
      };
    }

    return { eligible: true };
  }

  private static checkStaffEligibility(userProfile: UserProfile): {
    eligible: boolean;
    reason?: string;
    requiredActions?: string[];
  } {
    const allowedSourceRoles: UserRole[] = ['alumni', 'mentor'];
    if (!allowedSourceRoles.includes(userProfile.role)) {
      return {
        eligible: false,
        reason: 'Only alumni or mentors can transition into staff',
        requiredActions: ['Must be alumni or mentor first'],
      };
    }
    return { eligible: true };
  }

  private static checkAdminEligibility(userProfile: UserProfile): {
    eligible: boolean;
    reason?: string;
    requiredActions?: string[];
  } {
    if (userProfile.role !== 'staff') {
      return {
        eligible: false,
        reason: 'Only staff members can become admins',
        requiredActions: ['Must be staff first', 'Requires admin approval'],
      };
    }
    return {
      eligible: false,
      reason: 'Admin role requires manual approval from existing admin',
      requiredActions: ['Get approval from existing admin'],
    };
  }

  static async processAutomaticTransitions(): Promise<void> {
    try {
      console.log('Processing automatic role transitions...');
      const applicants = await this.getApplicantsForTransition();

      for (const applicant of applicants) {
        const eligibility = await this.checkTransitionEligibility(applicant.uid, 'alumni');
        if (eligibility.eligible) {
          await this.performTransition(
            applicant.uid,
            'alumni',
            'Automatic transition based on program completion'
          );
        }
      }

      console.log('Automatic transitions processed');
    } catch (error) {
      console.error('Error processing automatic transitions:', error);
    }
  }

  static async performTransition(
    userId: string,
    targetRole: UserRole,
    reason: string,
    _performedBy?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const eligibility = await this.checkTransitionEligibility(userId, targetRole);

      if (!eligibility.eligible) {
        return {
          success: false,
          message: eligibility.reason || 'Transition not eligible',
        };
      }

      await AuthService.assignRole(userId, targetRole, reason);

      return {
        success: true,
        message: `Role transitioned to ${targetRole}`,
      };
    } catch (error) {
      console.error('Error performing role transition:', error);
      const errorMessage = error instanceof Error ? error.message : 'Transition failed';
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  static async getTransitionHistory(userId: string): Promise<AuditLog[]> {
    try {
      const auditLogs = await AuditService.getAuditLogs(userId, 50);
      return auditLogs.filter(log => log.type === 'role_change');
    } catch (error) {
      console.error('Error getting transition history:', error);
      return [];
    }
  }

  private static isProgramCompleted(application: Application): boolean {
    if (!application.submittedAt) return false;

    const submittedDate = new Date(application.submittedAt);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    return submittedDate < sixMonthsAgo && application.status === 'accepted';
  }

  private static getApplicantsForTransition(): UserProfile[] {
    try {
      const allUsers: UserProfile[] = [];
      return allUsers.filter(user => user.role === 'applicant');
    } catch (error) {
      console.error('Error getting applicants for transition:', error);
      return [];
    }
  }
}
