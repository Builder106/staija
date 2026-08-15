<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuth } from '../composables/useAuth';
import { usePermissions } from '../composables/usePermissions';
import { donationsEnabled } from '../config/features';
import { trackNewsletterSignup } from '../services/analytics';
import { getAppConfig } from '../utils/env';
import LocaleSwitcher from './LocaleSwitcher.vue';
import Container from './ui/Container.vue';
import UiButton from './ui/UiButton.vue';

const { isAuthenticated } = useAuth();
const { isAdmin, isStaff, isStudent, isAlumni, isMentor } = usePermissions();

const dashboardPath = computed(() => {
  // Admin and staff get separate URL prefixes; isAdmin is strict and
  // isStaff returns true for both, so check isAdmin first.
  if (isAdmin.value) return '/admin';
  if (isStaff.value) return '/staff';
  if (isStudent.value) return '/learn';
  if (isAlumni.value) return '/alumni';
  if (isMentor.value) return '/mentor';
  return '/applicant';
});

const year = computed(() => new Date().getFullYear());

const newsletterEmail = ref('');
const honeypot = ref(''); // bots that auto-fill every field will trip this
const newsletterStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle');
const newsletterError = ref<string | null>(null);

async function handleNewsletter(e: Event) {
  e.preventDefault();
  if (newsletterStatus.value === 'submitting') return;
  if (honeypot.value) return; // silent drop

  newsletterStatus.value = 'submitting';
  newsletterError.value = null;

  const endpoint = getAppConfig().newsletterEndpoint;
  if (!endpoint) {
    // Endpoint not configured yet — track the intent but explain.
    trackNewsletterSignup('footer');
    newsletterStatus.value = 'success';
    return;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newsletterEmail.value, source: 'footer' }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? 'Subscription failed');
    }
    trackNewsletterSignup('footer');
    newsletterStatus.value = 'success';
    newsletterEmail.value = '';
  } catch (err) {
    newsletterStatus.value = 'error';
    newsletterError.value = err instanceof Error ? err.message : 'Subscription failed';
  }
}
</script>

<template>
  <!-- Footer is intentionally always-dark regardless of theme. Uses
       `*-static` tokens so it doesn't invert in dark mode (which would
       turn the footer into a light surface — visually awkward and
       inconsistent with the always-dark hero treatment). -->
  <footer class="bg-ink-static text-paper-static py-16 md:py-20 relative">
    <!-- Gradient hairline at the top edge — continuity with the hero so
         the brand gradient bookends the page instead of appearing only
         once at the top. -->
    <div class="absolute top-0 left-0 right-0 h-[2px] hairline-gradient" aria-hidden="true" />
    <Container>
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-y-12 gap-x-8 lg:gap-x-12">
        <!-- Brand + tagline + social + newsletter -->
        <div class="col-span-2 lg:col-span-2 flex flex-col gap-6 max-w-md">
          <RouterLink
            to="/"
            class="inline-flex items-center focus-ring-brand rounded-sm"
            aria-label="STAIJA — home"
          >
            <!-- See SiteHeader for the right-sizing rationale. staija-48
                 is the 1x footer variant; staija-96 covers 2x retina. -->
            <img
              src="/staija-48.png"
              srcset="/staija-48.png 1x, /staija-96.png 2x"
              alt="STAIJA"
              width="48"
              height="48"
              class="h-12 w-12 rounded-md"
            />
          </RouterLink>
          <p class="text-paper-static/70 text-sm leading-relaxed m-0">
            Nurturing Africa's next generation of scientist-leaders through research, mentorship,
            and community.
          </p>
          <div class="flex items-center gap-3">
            <a
              href="https://www.threads.com/@staija_ng"
              target="_blank"
              rel="noopener"
              aria-label="Follow us on Threads"
              class="w-9 h-9 rounded-full bg-paper-static/5 border border-paper-static/10 flex items-center justify-center text-paper-static/70 hover:text-paper-static hover:bg-paper-static/10 hover:border-paper-static/20 transition-colors"
            >
              <Icon icon="simple-icons:threads" width="16" height="16" />
            </a>
            <a
              href="https://www.instagram.com/staija_ng/"
              target="_blank"
              rel="noopener"
              aria-label="Follow us on Instagram"
              class="w-9 h-9 rounded-full bg-paper-static/5 border border-paper-static/10 flex items-center justify-center text-paper-static/70 hover:text-paper-static hover:bg-paper-static/10 hover:border-paper-static/20 transition-colors"
            >
              <Icon icon="mdi:instagram" width="18" height="18" />
            </a>
            <a
              href="https://www.linkedin.com/company/staija/"
              target="_blank"
              rel="noopener"
              aria-label="Follow us on LinkedIn"
              class="w-9 h-9 rounded-full bg-paper-static/5 border border-paper-static/10 flex items-center justify-center text-paper-static/70 hover:text-paper-static hover:bg-paper-static/10 hover:border-paper-static/20 transition-colors"
            >
              <Icon icon="mdi:linkedin" width="18" height="18" />
            </a>
          </div>
          <div class="mt-2">
            <span
              class="block text-[11px] uppercase tracking-wider text-paper-static/70 mb-3 font-semibold"
            >
              Stay in the loop
            </span>
            <form
              v-if="newsletterStatus !== 'success'"
              class="flex gap-2"
              @submit="handleNewsletter"
            >
              <input
                v-model="newsletterEmail"
                type="email"
                placeholder="you@example.com"
                aria-label="Email address"
                :disabled="newsletterStatus === 'submitting'"
                class="bg-paper-static/10 border border-paper-static/15 rounded-xl px-4 py-2.5 text-sm w-full text-paper-static placeholder:text-paper-static/50 focus:outline-none focus:border-brand-sky focus:bg-paper-static/15 focus:ring-1 focus:ring-brand-sky transition-all disabled:opacity-50"
                required
              />
              <input
                v-model="honeypot"
                type="text"
                name="trap"
                tabindex="-1"
                autocomplete="off"
                aria-hidden="true"
                class="sr-only"
              />
              <UiButton
                variant="primary"
                type="submit"
                class="shrink-0 px-4"
                :disabled="newsletterStatus === 'submitting'"
                aria-label="Subscribe"
              >
                <Icon
                  :icon="
                    newsletterStatus === 'submitting' ? 'lucide:loader-2' : 'lucide:arrow-right'
                  "
                  width="18"
                  height="18"
                  :class="newsletterStatus === 'submitting' && 'animate-spin'"
                />
              </UiButton>
            </form>
            <p
              v-else
              class="text-sm text-paper-static/85 bg-paper-static/10 border border-paper-static/15 rounded-xl px-4 py-2.5 m-0"
            >
              Thanks — check your inbox to confirm your subscription.
            </p>
            <p v-if="newsletterError" role="alert" class="mt-2 text-xs text-red-300 m-0">
              {{ newsletterError }}
            </p>
          </div>
        </div>

        <!-- Programs -->
        <div class="lg:col-span-1">
          <h3
            class="font-sans text-[11px] uppercase tracking-wider text-paper-static/70 mb-5 font-semibold m-0"
          >
            Programs
          </h3>
          <ul class="flex flex-col gap-3 text-sm text-paper-static/85 list-none p-0 m-0">
            <li>
              <RouterLink to="/programs/stepup-scholars" class="hover:text-white transition-colors"
                >StepUp Scholars</RouterLink
              >
            </li>
            <li>
              <RouterLink to="/programs/dynamerge" class="hover:text-white transition-colors"
                >Dynamerge</RouterLink
              >
            </li>
            <li>
              <RouterLink to="/events" class="hover:text-white transition-colors"
                >Events</RouterLink
              >
            </li>
            <li>
              <RouterLink to="/blog" class="hover:text-white transition-colors">Stories</RouterLink>
            </li>
          </ul>
        </div>

        <!-- Organization -->
        <div class="lg:col-span-1">
          <h3
            class="font-sans text-[11px] uppercase tracking-wider text-paper-static/70 mb-5 font-semibold m-0"
          >
            Organization
          </h3>
          <ul class="flex flex-col gap-3 text-sm text-paper-static/85 list-none p-0 m-0">
            <li>
              <RouterLink to="/about" class="hover:text-white transition-colors">About</RouterLink>
            </li>
            <li>
              <RouterLink to="/get-involved" class="hover:text-white transition-colors"
                >Get Involved</RouterLink
              >
            </li>
            <li>
              <RouterLink to="/contact" class="hover:text-white transition-colors"
                >Contact</RouterLink
              >
            </li>
            <li>
              <RouterLink to="/press" class="hover:text-white transition-colors">Press</RouterLink>
            </li>
            <li v-if="donationsEnabled">
              <RouterLink to="/donate" class="hover:text-white transition-colors"
                >Donate</RouterLink
              >
            </li>
          </ul>
        </div>

        <!-- Account -->
        <div class="lg:col-span-1">
          <h3
            class="font-sans text-[11px] uppercase tracking-wider text-paper-static/70 mb-5 font-semibold m-0"
          >
            Account
          </h3>
          <ul class="flex flex-col gap-3 text-sm text-paper-static/85 list-none p-0 m-0">
            <template v-if="isAuthenticated">
              <li>
                <RouterLink :to="dashboardPath" class="hover:text-white transition-colors"
                  >Dashboard</RouterLink
                >
              </li>
              <li>
                <RouterLink to="/account/settings" class="hover:text-white transition-colors"
                  >Settings</RouterLink
                >
              </li>
              <li v-if="donationsEnabled">
                <RouterLink to="/donor" class="hover:text-white transition-colors"
                  >My donations</RouterLink
                >
              </li>
            </template>
            <template v-else>
              <li>
                <RouterLink to="/login" class="hover:text-white transition-colors"
                  >Sign in</RouterLink
                >
              </li>
              <li>
                <RouterLink to="/signup" class="hover:text-white transition-colors"
                  >Apply</RouterLink
                >
              </li>
              <li v-if="donationsEnabled">
                <RouterLink to="/donor" class="hover:text-white transition-colors"
                  >My donations</RouterLink
                >
              </li>
            </template>
          </ul>
        </div>
      </div>

      <div
        class="mt-16 pt-8 border-t border-paper-static/10 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-paper-static/55"
      >
        <p class="m-0">© {{ year }} STAIJA. All rights reserved.</p>
        <div class="flex items-center gap-6">
          <a href="#" class="hover:text-paper-static transition-colors">Privacy</a>
          <a href="#" class="hover:text-paper-static transition-colors">Terms</a>
          <LocaleSwitcher />
        </div>
      </div>
    </Container>
  </footer>
</template>
