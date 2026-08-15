<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiButton from '../components/ui/UiButton.vue';
import { primeProfileCache } from '../router';
import { AuthService, toFriendlyAuthMessage } from '../services/auth';
import { postLoginRoute } from '../services/postLoginRedirect';

const router = useRouter();
const firstName = ref('');
const lastName = ref('');
const email = ref('');
const password = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);

const displayName = computed(() => [firstName.value, lastName.value].filter(Boolean).join(' '));

async function onSubmit(e: Event) {
  e.preventDefault();
  error.value = null;
  submitting.value = true;
  try {
    const cred = await AuthService.signUp(
      email.value,
      password.value,
      displayName.value || email.value
    );
    // New sign-ups always land as applicant.
    primeProfileCache(cred.user.uid, 'applicant');
    router.push({ name: 'applicant-dashboard' });
  } catch (err: unknown) {
    error.value = toFriendlyAuthMessage(err, 'Sign up failed');
  } finally {
    submitting.value = false;
  }
}

async function onGoogle() {
  error.value = null;
  submitting.value = true;
  try {
    const { credential, role } = await AuthService.signInWithGoogle();
    primeProfileCache(credential.user.uid, role);
    router.push(postLoginRoute(role));
  } catch (err: unknown) {
    error.value = toFriendlyAuthMessage(err, 'Google sign up failed');
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
              <Heading :level="2" class="mb-2">Join STAIJA</Heading>
              <Body class="mb-8">
                Create an account to apply to programs, save your progress, and join our community.
              </Body>

              <form class="flex flex-col gap-5" @submit="onSubmit">
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-2">
                    <label class="text-sm font-semibold text-ink/80">First Name</label>
                    <input
                      v-model="firstName"
                      type="text"
                      required
                      autocomplete="given-name"
                      placeholder="Amina"
                      class="border hairline-ink rounded-xl px-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-surface"
                    />
                  </div>
                  <div class="flex flex-col gap-2">
                    <label class="text-sm font-semibold text-ink/80">Last Name</label>
                    <input
                      v-model="lastName"
                      type="text"
                      required
                      autocomplete="family-name"
                      placeholder="Yusuf"
                      class="border hairline-ink rounded-xl px-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-surface"
                    />
                  </div>
                </div>
                <div class="flex flex-col gap-2">
                  <label class="text-sm font-semibold text-ink/80">Email Address</label>
                  <input
                    v-model="email"
                    type="email"
                    required
                    autocomplete="email"
                    placeholder="name@example.com"
                    class="border hairline-ink rounded-xl px-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-surface"
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <label class="text-sm font-semibold text-ink/80">Password</label>
                  <input
                    v-model="password"
                    type="password"
                    required
                    minlength="8"
                    autocomplete="new-password"
                    placeholder="Create a strong password"
                    class="border hairline-ink rounded-xl px-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-surface"
                  />
                  <p class="text-xs text-ink/50 mt-1 m-0">Must be at least 8 characters long.</p>
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
                  {{ submitting ? 'Creating account…' : 'Create Account' }}
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
                Sign up with Google
              </UiButton>

              <p class="mt-8 text-center text-sm text-ink/70">
                Already have an account?
                <RouterLink
                  to="/login"
                  class="font-semibold text-brand-violet hover:underline underline-offset-2"
                  >Sign in</RouterLink
                >
              </p>
            </div>
          </div>

          <!-- Photo -->
          <div class="hidden lg:block relative bg-ink">
            <div class="absolute inset-0 wash-violet-6 mix-blend-screen z-10 pointer-events-none" />
            <div class="absolute inset-0 bg-ink/10 mix-blend-multiply z-10 pointer-events-none" />
            <img
              src="https://images.unsplash.com/photo-1620831468075-db24ca183258?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080"
              alt="Student with laptop"
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
