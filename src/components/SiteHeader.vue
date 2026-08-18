<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth';
import { usePermissions } from '../composables/usePermissions';
import { donationsEnabled } from '../config/features';
import { resolveAvatarSrc } from '../services/avatar';
import ThemeToggle from './ThemeToggle.vue';
import Container from './ui/Container.vue';
import UiButton from './ui/UiButton.vue';

const isScrolled = ref(false);
const mobileOpen = ref(false);
const route = useRoute();
const router = useRouter();
const { isAuthenticated, displayName, signOut, user, userProfile, loading } = useAuth();

const avatarSrc = computed(() =>
  resolveAvatarSrc({
    photoURL: userProfile.value?.photoURL,
    avatarSlot: userProfile.value?.avatarSlot,
    seed: user.value?.uid ?? '',
  }),
);
const { isAdmin, isStaff, isMentor, isStudent, isAlumni } = usePermissions();

// Where the "Dashboard" link in the header points, by role. Mirrors the
// router's post-login redirect cascade in src/router/index.ts so an
// authenticated user lands at the same place via the header link as via
// the post-login fallback.
//
// Admin/staff URL split: admin → /admin, staff → /staff (mutually
// exclusive in this codebase — `isAdmin` is strict, `isStaff` returns
// true for both; we check `isAdmin` first to land admin on /admin).
const dashboardPath = computed(() => {
  if (isAdmin.value) return '/admin';
  if (isStaff.value) return '/staff';
  // Students land in the LMS directly. The legacy /student dashboard
  // is kept around with quick-link buttons that all point to /learn,
  // but going straight there is the better UX for active learners.
  if (isStudent.value) return '/learn';
  if (isAlumni.value) return '/alumni';
  if (isMentor.value) return '/mentor';
  return '/applicant';
});

const navLinks = [
  { name: 'StepUp Scholars', href: '/programs/stepup-scholars' },
  { name: 'Dynamerge', href: '/programs/dynamerge' },
  { name: 'Events', href: '/events' },
  { name: 'Stories', href: '/blog' },
  { name: 'About', href: '/about' },
];

// rAF-throttle the scroll handler so we coalesce burst scroll events into
// at most one update per frame. Without this, scroll fires hundreds of
// times during a fast scroll and each call writes to the reactive ref,
// triggering Vue's reactivity for no perceptible gain.
let scrollFrame = 0;
function handleScroll() {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    isScrolled.value = window.scrollY > 20;
    scrollFrame = 0;
  });
}

async function handleSignOut() {
  await signOut();
  router.push('/');
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true });
  // Set initial state for pages loaded mid-scroll (e.g. back/forward nav
  // restoring scrollY). Without this, isScrolled defaults to false and
  // the header renders unscrolled even if the page is deep-scrolled.
  handleScroll();
});
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
  if (scrollFrame) cancelAnimationFrame(scrollFrame);
});
watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false;
  },
);
</script>

<template>
  <!-- Header padding is fixed at py-5 (not toggling py-4 ↔ py-6 on scroll)
       because that 16px vertical delta caused a scroll-driven CLS every
       time the user crossed the scrollY > 20 threshold. The visual cue
       that the user has scrolled comes from the border-bottom alone now. -->
  <header
    class="sticky top-0 z-50 w-full py-5 transition-colors duration-200 bg-paper"
    :class="isScrolled ? 'border-b hairline-ink' : 'border-b border-transparent'"
  >
    <Container>
      <div class="flex items-center justify-between">
        <RouterLink
          to="/"
          class="flex items-center gap-2 focus-ring-brand rounded-sm"
          aria-label="STAIJA — home"
        >
          <!-- Right-sized logo variants. The master 1563×1563 STAIJA.png is
               1.07 MB and was the single biggest bandwidth hit on cold
               loads. staija-40 / staija-80 are pre-rasterized via sips
               (commit message: "right-size header/footer logo"). srcset
               1x / 2x covers retina without shipping more bytes than
               needed; on 1x displays the browser only fetches staija-40. -->
          <img
            src="/staija-40.png"
            srcset="/staija-40.png 1x, /staija-80.png 2x"
            alt="STAIJA"
            width="40"
            height="40"
            class="h-10 w-10 rounded-md"
          />
        </RouterLink>

        <nav class="hidden lg:flex items-center gap-8">
          <RouterLink
            v-for="link in navLinks"
            :key="link.name"
            :to="link.href"
            class="relative py-1 text-sm font-medium text-ink/80 transition-colors hover:text-brand-violet focus-ring-brand rounded-sm after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-brand-violet after:transition-transform after:duration-200 hover:after:scale-x-100"
          >
            {{ link.name }}
          </RouterLink>
        </nav>

        <!-- CLS guard: this sticky header reflows the entire page when its
             contents change height. Firebase Auth resolves asynchronously
             (no SSR — Vite SPA), so first paint always shows the auth-
             unresolved state, then either the unauthenticated (narrow) or
             authenticated (wide) cluster swaps in. To prevent that swap
             from shifting the page below:
               1. min-w on the cluster reserves the footprint of the wider
                  authenticated layout, so no horizontal reflow.
               2. justify-end packs items to the right within the reserved
                  width, so the brand mark on the left stays fixed.
               3. v-if="!loading" delays rendering the auth-conditional
                  content until Firebase resolves — no flash of the wrong
                  state for returning users. -->
        <div class="hidden lg:flex items-center justify-end gap-4 min-w-[260px] xl:min-w-[340px]">
          <ThemeToggle />
          <template v-if="!loading">
            <template v-if="isAuthenticated">
              <RouterLink
                v-if="donationsEnabled"
                to="/donor"
                class="text-sm font-medium text-ink/70 hover:text-brand-violet transition-colors focus-ring-brand rounded-sm"
              >
                My donations
              </RouterLink>
              <RouterLink
                :to="dashboardPath"
                class="text-sm font-semibold text-ink hover:text-brand-violet transition-colors focus-ring-brand rounded-full flex items-center gap-2"
              >
                <img
                  :src="avatarSrc"
                  :alt="displayName ?? 'Avatar'"
                  width="32"
                  height="32"
                  class="w-8 h-8 rounded-full object-cover ring-2 ring-brand-violet/30 shrink-0"
                />
                <span class="hidden xl:inline">{{ displayName || 'Dashboard' }}</span>
              </RouterLink>
              <RouterLink
                to="/account/settings"
                class="text-sm font-medium text-ink/70 hover:text-ink transition-colors focus-ring-brand rounded-sm"
              >
                Settings
              </RouterLink>
              <UiButton variant="secondary" type="button" @click="handleSignOut">
                Sign out
              </UiButton>
            </template>
            <template v-else>
              <UiButton variant="secondary" :to="'/login'"> Sign in </UiButton>
            </template>
          </template>
          <UiButton v-if="donationsEnabled" variant="primary" :to="'/donate'">Donate</UiButton>
        </div>

        <!-- Mobile-only cluster: theme toggle next to the hamburger so
             flipping the theme doesn't require opening the menu first. -->
        <div class="lg:hidden flex items-center gap-1 -mr-2">
          <ThemeToggle />
          <button
            type="button"
            class="p-2 text-ink focus-ring-brand rounded-md"
            :aria-label="mobileOpen ? 'Close menu' : 'Open menu'"
            :aria-expanded="mobileOpen"
            @click="mobileOpen = !mobileOpen"
          >
            <Icon :icon="mobileOpen ? 'lucide:x' : 'lucide:menu'" width="24" height="24" />
          </button>
        </div>
      </div>
    </Container>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="mobileOpen"
        class="absolute top-full left-0 w-full bg-paper border-b hairline-ink shadow-xl shadow-ink/5 lg:hidden overflow-hidden"
      >
        <Container>
          <div class="flex flex-col py-6 gap-4">
            <RouterLink
              v-for="link in navLinks"
              :key="link.name"
              :to="link.href"
              class="text-lg font-medium text-ink py-2 border-b hairline-ink"
            >
              {{ link.name }}
            </RouterLink>
            <div class="flex flex-col gap-3 mt-4">
              <template v-if="isAuthenticated">
                <UiButton variant="primary" class="w-full justify-center" :to="dashboardPath">
                  Go to dashboard
                </UiButton>
                <UiButton
                  variant="secondary"
                  class="w-full justify-center"
                  :to="'/account/settings'"
                >
                  Settings
                </UiButton>
                <UiButton variant="secondary" class="w-full justify-center" @click="handleSignOut">
                  Sign out
                </UiButton>
              </template>
              <UiButton v-else variant="secondary" class="w-full justify-center" :to="'/login'">
                Sign in
              </UiButton>
              <UiButton
                v-if="donationsEnabled"
                variant="primary"
                class="w-full justify-center"
                :to="'/donate'"
              >
                Donate
              </UiButton>
            </div>
          </div>
        </Container>
      </div>
    </Transition>
  </header>
</template>
