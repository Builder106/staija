import type { User } from 'firebase/auth';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { AuthService } from '../services/auth';
import { DatabaseService } from '../services/database';
import type { UserProfile } from '../services/types';

const user = ref<User | null>(null);
const userProfile = ref<UserProfile | null>(null);
const loading = ref(true);

let subscriberCount = 0;
let unsubscribe: (() => void) | null = null;

function startListening() {
  if (unsubscribe) return;

  unsubscribe = AuthService.onAuthStateChanged(async (firebaseUser) => {
    user.value = firebaseUser;
    if (firebaseUser) {
      try {
        userProfile.value = await DatabaseService.getUserProfile(firebaseUser.uid);
      } catch {
        userProfile.value = null;
      }
    } else {
      userProfile.value = null;
    }
    loading.value = false;
  });
}

function stopListening() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

export function useAuth() {
  onMounted(() => {
    subscriberCount++;
    startListening();
  });

  onUnmounted(() => {
    subscriberCount--;
    if (subscriberCount <= 0) {
      subscriberCount = 0;
      stopListening();
    }
  });

  const isAuthenticated = computed(() => !!user.value);
  const role = computed(() => userProfile.value?.role ?? null);
  const displayName = computed(
    () => userProfile.value?.displayName || user.value?.displayName || user.value?.email || null,
  );

  async function refreshProfile() {
    if (!user.value) return;
    userProfile.value = await DatabaseService.getUserProfile(user.value.uid);
  }

  async function signOut() {
    await AuthService.signOut();
  }

  return {
    user,
    userProfile,
    loading,
    isAuthenticated,
    role,
    displayName,
    refreshProfile,
    signOut,
  };
}
