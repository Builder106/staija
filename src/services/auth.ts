import type { User, UserCredential } from 'firebase/auth';
import {
  createUserWithEmailAndPassword,
  GithubAuthProvider,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase.ts';
import { AuditService } from './audit';
import { DatabaseService } from './database';
import { PermissionService } from './permissions';
import type {
  AdminAssignableRole,
  EmailLinkAssignableRole,
  PublicAssignableRole,
  UserProfile,
  UserRole,
} from './types';

export class AuthService {
  static async signIn(
    email: string,
    password: string,
  ): Promise<{ credential: UserCredential; role: UserRole | null }> {
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const role = await this.ensureUserProfile(credential.user);
      return { credential, role };
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  }

  static async signUp(
    email: string,
    password: string,
    displayName: string,
    role: PublicAssignableRole = 'applicant',
  ): Promise<UserCredential> {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName });
        // Even @staija.org sign-ups land as 'applicant' here — the staff
        // elevation only fires after the user has clicked the Firebase
        // verification email (which only the real IONOS mailbox owner can do).
        // See ensureUserProfile() for the elevation step.
        await this.createUserProfile(userCredential.user, displayName, role);
        try {
          await sendEmailVerification(userCredential.user);
        } catch {
          /* noop */
        }
      }

      return userCredential;
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  }

  static async signInWithGoogle(): Promise<{ credential: UserCredential; role: UserRole | null }> {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    const role = await this.ensureUserProfile(credential.user);
    return { credential, role };
  }

  static async signInWithGitHub(): Promise<{ credential: UserCredential; role: UserRole | null }> {
    const provider = new GithubAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    const role = await this.ensureUserProfile(credential.user);
    return { credential, role };
  }

  static async sendVerificationEmail(): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('No authenticated user');
    await sendEmailVerification(user);
  }

  static async signOut(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  static async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error('Password reset error:', error);
      throw error;
    }
  }

  static async updatePassword(newPassword: string): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('No authenticated user');
      await updatePassword(user, newPassword);
    } catch (error) {
      console.error('Update password error:', error);
      throw error;
    }
  }

  static async updateProfile(data: { displayName?: string; photoURL?: string }): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('No authenticated user');
    await updateProfile(user, data);
  }

  static async sendSignInLink(email: string, role?: EmailLinkAssignableRole): Promise<void> {
    try {
      const actionCodeSettings = {
        url: `${globalThis.location.origin}/auth/email-link-callback`,
        handleCodeInApp: true,
        iOS: { bundleId: 'com.staija.app' },
        android: {
          packageName: 'com.staija.app',
          installApp: true,
          minimumVersion: '12',
        },
      };

      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      globalThis.localStorage.setItem('emailForSignIn', email);
      if (role) {
        globalThis.localStorage.setItem('roleForSignIn', role);
      }
    } catch (error) {
      console.error('Send sign in link error:', error);
      throw error;
    }
  }

  static async completeSignInWithEmailLink(email: string, url: string): Promise<UserCredential> {
    try {
      const result = await signInWithEmailLink(auth, email, url);
      globalThis.localStorage.removeItem('emailForSignIn');
      globalThis.localStorage.removeItem('roleForSignIn');
      return result;
    } catch (error) {
      console.error('Complete sign in with email link error:', error);
      throw error;
    }
  }

  static isSignInWithEmailLink(url: string): boolean {
    return isSignInWithEmailLink(auth, url);
  }

  static async assignRole(
    userId: string,
    role: AdminAssignableRole,
    reason?: string,
  ): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('No authenticated user');

      const currentUserProfile = await DatabaseService.getUserProfile(currentUser.uid);
      if (!currentUserProfile) throw new Error('Current user profile not found');

      if (!PermissionService.canAssignRole(currentUserProfile.role, role)) {
        throw new Error('Insufficient permissions to assign this role');
      }

      const targetUserProfile = await DatabaseService.getUserProfile(userId);
      if (!targetUserProfile) throw new Error('Target user profile not found');

      if (!PermissionService.isValidRoleTransition(targetUserProfile.role, role)) {
        throw new Error('Invalid role transition');
      }

      await DatabaseService.updateUserProfile(userId, { role });

      await AuditService.logRoleChange({
        userId,
        previousRole: targetUserProfile.role,
        newRole: role,
        changedBy: currentUser.uid,
        reason: reason || 'Role assignment by admin',
      });
    } catch (error) {
      console.error('Assign role error:', error);
      throw error;
    }
  }

  static getStoredEmail(): string | null {
    return globalThis.localStorage.getItem('emailForSignIn');
  }

  static getStoredRole(): string | null {
    return globalThis.localStorage.getItem('roleForSignIn');
  }

  static getCurrentUser(): User | null {
    return auth.currentUser;
  }

  static async getUserProfile(): Promise<UserProfile | null> {
    const user = auth.currentUser;
    if (!user) return null;
    return await DatabaseService.getUserProfile(user.uid);
  }

  static onAuthStateChanged(callback: (user: User | null) => void): () => void {
    if (!auth) {
      console.warn('Firebase auth not available');
      return () => {};
    }
    return onAuthStateChanged(auth, callback);
  }

  static async createUserProfile(
    user: User,
    displayName: string,
    role: AdminAssignableRole = 'applicant',
  ): Promise<void> {
    const userProfile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      displayName,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await setDoc(doc(db, 'users', user.uid), userProfile);
  }

  private static async ensureUserProfile(user: User): Promise<UserRole | null> {
    if (!user) return null;
    const ref = doc(db, 'users', user.uid);
    const existing = await getDoc(ref);

    if (!existing.exists()) {
      const name = user.displayName || user.email || 'User';
      // First-time profile: only auto-promote to staff if the OAuth provider
      // has already verified the email. Email/password sign-ups land as
      // 'applicant' here (email isn't verified yet) and elevate later, the
      // first time they sign in after clicking the Firebase verification
      // link delivered to their IONOS mailbox.
      const role: AdminAssignableRole =
        user.emailVerified && isStaffEmail(user.email) ? 'staff' : 'applicant';
      await this.createUserProfile(user, String(name), role);
      return role;
    }

    const profile = existing.data() as UserProfile;
    // Existing profile: auto-elevate applicant -> staff once the user proves
    // they own the @staija.org mailbox by clicking Firebase's verification
    // email.
    if (profile.role === 'applicant' && user.emailVerified && isStaffEmail(user.email)) {
      await updateDoc(ref, { role: 'staff', updatedAt: new Date() });
      return 'staff';
    }
    return profile.role;
  }
}

const STAFF_EMAIL_DOMAIN = 'staija.org';

function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  return email.slice(at + 1).toLowerCase() === STAFF_EMAIL_DOMAIN;
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/popup-closed-by-user': 'Sign-in was cancelled. Please try again.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled. Please try again.',
  'auth/popup-blocked':
    'Your browser blocked the sign-in popup. Please allow popups for this site and try again.',
  'auth/network-request-failed': 'Network error. Please check your connection and try again.',
  'auth/user-disabled': 'This account has been disabled. Contact support for help.',
  'auth/account-exists-with-different-credential':
    'An account already exists with this email using a different sign-in method.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
};

// Firestore's IndexedDB persistence layer can throw raw browser exceptions
// (e.g. "the database connection is closing") when a second tab or the
// OAuth popup races the main tab's connection. Those aren't meaningful to
// users, so they're mapped to one friendly retry message.
function isStorageError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /database connection is closing|indexeddb|version change transaction/i.test(message);
}

export function toFriendlyAuthMessage(error: unknown, fallback: string): string {
  if (isStorageError(error)) {
    return 'A temporary storage issue interrupted sign-in. Please try again, or close other tabs of this site and retry.';
  }
  const code = (error as { code?: string } | undefined)?.code;
  if (code && AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code];
  return error instanceof Error ? error.message : fallback;
}
