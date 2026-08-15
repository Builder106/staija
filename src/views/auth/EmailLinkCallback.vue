<template>
  <div class="email-link-callback">
    <div class="callback-container">
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner"></div>
        <h2>Completing Sign In...</h2>
        <p>Please wait while we complete your authentication.</p>
      </div>

      <div v-else-if="error" class="error-state">
        <div class="error-icon"><Icon icon="lucide:alert-triangle" /></div>
        <h2>Authentication Error</h2>
        <p>{{ error }}</p>
        <div class="error-actions">
          <button @click="retrySignIn" class="btn btn-primary">Try Again</button>
          <router-link to="/login" class="btn btn-outline">Back to Login</router-link>
        </div>
      </div>

      <div v-else-if="emailPrompt" class="email-prompt">
        <div class="prompt-icon"><Icon icon="lucide:mail" /></div>
        <h2>Confirm Your Email</h2>
        <p>Please provide your email address to complete the sign-in process.</p>

        <form @submit.prevent="completeSignIn" class="email-form">
          <div class="form-group">
            <label for="email">Email Address</label>
            <input
              id="email"
              v-model="email"
              type="email"
              class="form-input"
              required
              placeholder="Enter your email address"
            />
          </div>
          <button type="submit" :disabled="completing" class="btn btn-primary">
            <span v-if="completing">Completing...</span>
            <span v-else>Complete Sign In</span>
          </button>
        </form>
      </div>

      <div v-else-if="success" class="success-state">
        <div class="success-icon"><Icon icon="lucide:check-circle" /></div>
        <h2>Sign In Successful!</h2>
        <p>Welcome back to STAIJA. Redirecting you to your dashboard...</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { getAdditionalUserInfo } from 'firebase/auth';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { AuthService, DatabaseService } from '../../services/firebase';
import { postLoginRoute } from '../../services/postLoginRedirect';

const router = useRouter();

const loading = ref(true);
const error = ref('');
const emailPrompt = ref(false);
const success = ref(false);
const completing = ref(false);
const email = ref('');

const completeSignIn = async () => {
  if (!email.value) return;

  completing.value = true;
  error.value = '';

  try {
    const result = await AuthService.completeSignInWithEmailLink(email.value, window.location.href);

    const additionalInfo = getAdditionalUserInfo(result);
    if (additionalInfo?.isNewUser) {
      const role = AuthService.getStoredRole() || 'applicant';
      const displayName = email.value.split('@')[0];

      await AuthService.createUserProfile(
        result.user,
        displayName,
        role as 'applicant' | 'staff' | 'alumni'
      );
    }

    success.value = true;

    // Redirect after a short delay
    setTimeout(async () => {
      const user = AuthService.getCurrentUser();
      let resolvedRole = null;
      if (user) {
        try {
          const profile = await DatabaseService.getUserProfile(user.uid);
          resolvedRole = profile?.role ?? null;
        } catch {
          // Fall through with role=null — postLoginRoute returns { name: 'home' }
        }
      }
      router.push(postLoginRoute(resolvedRole));
    }, 2000);
  } catch (err: unknown) {
    error.value =
      err instanceof Error ? err.message : 'Failed to complete sign in. Please try again.';
    completing.value = false;
  }
};

const retrySignIn = () => {
  loading.value = true;
  error.value = '';
  emailPrompt.value = false;
  success.value = false;
  checkEmailLink();
};

const checkEmailLink = async () => {
  try {
    // Check if this is an email link
    if (!AuthService.isSignInWithEmailLink(window.location.href)) {
      error.value = 'Invalid or expired sign-in link. Please request a new one.';
      loading.value = false;
      return;
    }

    // Try to get stored email
    const storedEmail = AuthService.getStoredEmail();

    if (storedEmail) {
      // Complete sign in with stored email
      email.value = storedEmail;
      await completeSignIn();
    } else {
      // Prompt user for email
      emailPrompt.value = true;
      loading.value = false;
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Failed to process sign-in link.';
    loading.value = false;
  }
};

onMounted(() => {
  checkEmailLink();
});
</script>

<style scoped>
.email-link-callback {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
}

.callback-container {
  background: white;
  border-radius: var(--radius-2xl);
  padding: 3rem;
  max-width: 500px;
  width: 100%;
  text-align: center;
  box-shadow: var(--shadow-xl);
}

.loading-state,
.error-state,
.email-prompt,
.success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.loading-spinner {
  width: 3rem;
  height: 3rem;
  border: 3px solid var(--neutral-200);
  border-top: 3px solid var(--primary-600);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.prompt-icon,
.error-icon,
.success-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

h2 {
  margin: 0;
  color: var(--neutral-900);
  font-size: 1.5rem;
}

p {
  margin: 0;
  color: var(--neutral-600);
  line-height: 1.6;
}

.email-form {
  width: 100%;
  max-width: 300px;
  margin-top: 1rem;
}

.form-group {
  margin-bottom: 1.5rem;
  text-align: left;
}

.form-group label {
  display: block;
  font-weight: 600;
  color: var(--neutral-700);
  margin-bottom: 0.5rem;
}

.form-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--neutral-300);
  border-radius: var(--radius-md);
  font-size: 1rem;
  transition: all 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-500);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
}

.error-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 1rem;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: var(--radius-md);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  display: inline-block;
}

.btn-primary {
  background: var(--primary-600);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-700);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-outline {
  background: transparent;
  color: var(--primary-600);
  border: 1px solid var(--primary-600);
}

.btn-outline:hover {
  background: var(--primary-50);
}

@media (max-width: 768px) {
  .callback-container {
    padding: 2rem;
    margin: 1rem;
  }

  .error-actions {
    flex-direction: column;
  }
}
</style>
