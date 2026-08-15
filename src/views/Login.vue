<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiButton from '../components/ui/UiButton.vue';
import { primeProfileCache } from '../router';
import { AuthService, toFriendlyAuthMessage } from '../services/auth';
import { postLoginRoute } from '../services/postLoginRedirect';
import type { UserRole } from '../services/types';

const router = useRouter();
const route = useRoute();
const email = ref('');
const password = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);

function redirectAfterAuth(uid: string, role: UserRole | null) {
  primeProfileCache(uid, role);
  const redirect = route.query.redirect as string | undefined;
  if (redirect) return router.push(redirect);
  router.push(postLoginRoute(role));
}

async function onSubmit(e: Event) {
  e.preventDefault();
  error.value = null;
  submitting.value = true;
  try {
    const { credential, role } = await AuthService.signIn(email.value, password.value);
    redirectAfterAuth(credential.user.uid, role);
  } catch (err: unknown) {
    error.value = toFriendlyAuthMessage(err, 'Sign in failed');
  } finally {
    submitting.value = false;
  }
}

async function onGoogle() {
  error.value = null;
  submitting.value = true;
  try {
    const { credential, role } = await AuthService.signInWithGoogle();
    redirectAfterAuth(credential.user.uid, role);
  } catch (err: unknown) {
    error.value = toFriendlyAuthMessage(err, 'Google sign in failed');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!py-8 md:!py-16 flex-1 flex flex-col justify-center">
      <Container class="max-w-6xl">
        <div
          class="grid lg:grid-cols-2 bg-surface rounded-[24px] border hairline-ink overflow-hidden shadow-sm min-h-[600px]"
        >
          <!-- Form -->
          <div class="p-8 md:p-12 lg:p-16 flex flex-col justify-center">
            <div class="max-w-md w-full mx-auto">
              <Heading :level="2" class="mb-2">Sign in to STAIJA</Heading>
              <Body class="mb-8">Welcome back. Continue your research journey.</Body>

              <form class="flex flex-col gap-5" @submit="onSubmit">
                <div class="flex flex-col gap-2">
                  <label class="text-sm font-semibold text-ink/80">Email Address</label>
                  <input
                    v-model="email"
                    type="email"
                    required
                    autocomplete="email"
                    placeholder="name@example.com"
                    class="border hairline-ink rounded-xl px-4 py-3.5 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-surface"
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <div class="flex items-center justify-between">
                    <label class="text-sm font-semibold text-ink/80">Password</label>
                    <RouterLink
                      to="#"
                      class="text-xs font-medium text-brand-violet hover:underline underline-offset-2"
                    >
                      Forgot password?
                    </RouterLink>
                  </div>
                  <input
                    v-model="password"
                    type="password"
                    required
                    autocomplete="current-password"
                    placeholder="••••••••"
                    class="border hairline-ink rounded-xl px-4 py-3.5 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-surface"
                  />
                </div>

                <div
                  v-if="error"
                  role="alert"
                  class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
                >
                  {{ error }}
                </div>

                <UiButton
                  variant="gradient"
                  type="submit"
                  :disabled="submitting"
                  class="w-full mt-2 !h-12 text-base font-bold"
                >
                  {{ submitting ? 'Signing in…' : 'Sign In' }}
                </UiButton>
              </form>

              <div class="flex items-center gap-4 my-8">
                <div class="flex-1 h-px bg-ink/10" />
                <span class="text-xs font-semibold text-ink/40 uppercase tracking-widest">Or</span>
                <div class="flex-1 h-px bg-ink/10" />
              </div>

              <UiButton
                variant="secondary"
                :disabled="submitting"
                class="w-full !h-12 flex items-center justify-center gap-3"
                @click="onGoogle"
              >
                <Icon icon="logos:google-icon" width="18" />
                Continue with Google
              </UiButton>

              <p class="mt-8 text-center text-sm text-ink/70">
                Don't have an account?
                <RouterLink
                  to="/signup"
                  class="font-semibold text-brand-violet hover:underline underline-offset-2"
                  >Sign up</RouterLink
                >
              </p>
            </div>
          </div>

          <!-- Photo -->
          <div class="hidden lg:block relative bg-ink">
            <div class="absolute inset-0 wash-violet-6 mix-blend-screen z-10 pointer-events-none" />
            <div class="absolute inset-0 bg-ink/10 mix-blend-multiply z-10 pointer-events-none" />
            <img
              src="https://images.unsplash.com/photo-1758573467240-f944226c2026?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080"
              alt="Student in lab"
              width="1080"
              height="1440"
              class="w-full h-full object-cover"
            />
          </div>
        </div>
      </Container>
    </Section>
  </div>
</template>
