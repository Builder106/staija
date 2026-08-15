<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref, watchEffect } from 'vue';
import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Eyebrow from '../components/ui/Eyebrow.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiCard from '../components/ui/UiCard.vue';
import UiChip from '../components/ui/UiChip.vue';
import { useAdminBase } from '../composables/useAdminBase';
import { useAuth } from '../composables/useAuth';
import { usePermissions } from '../composables/usePermissions';
import type { Application } from '../services/firebase';
import { DatabaseService } from '../services/firebase';

const { displayName } = useAuth();
// `isAdmin` is strict — staff is NOT admin. We use it to hide tiles that
// link to admin-only screens (Users & roles, Firestore raw access).
// `isStaff` returns true for staff AND admin in this codebase, so it's
// not a useful distinguisher here — we explicitly check isAdmin.
const { isAdmin } = usePermissions();
// Preserves /admin vs /staff in every internal link on this page —
// see useAdminBase for the rationale.
const { adminBase } = useAdminBase();

// Role-aware labels so a staff account doesn't see "ADMIN" branding
// across the page. `isAdmin` is strict (admin only); anyone else
// landing here is by definition staff (the route's `view_all_users`
// permission gate admits both, and only admin/staff hold it).
const roleLabel = computed(() => (isAdmin.value ? 'Admin' : 'Staff'));

// Override the route-level document.title ("Admin Panel — STAIJA")
// so a staff member's browser tab also reads "Staff Panel — STAIJA".
// Runs reactively because the user profile (and therefore isAdmin)
// loads asynchronously after mount; a static onMounted set would race
// the auth listener and stamp the wrong label on a slow load.
watchEffect(() => {
  if (typeof document !== 'undefined') {
    document.title = `${roleLabel.value} Panel — STAIJA`;
  }
});

const applications = ref<Application[]>([]);
const loading = ref(true);
const error = ref('');

const firstName = computed(() => {
  const name = displayName.value ?? '';
  return name.split(/[\s@]/)[0] || 'there';
});

const submittedCount = computed(
  () => applications.value.filter(a => a.status === 'submitted').length
);
const underReviewCount = computed(
  () => applications.value.filter(a => a.status === 'under_review').length
);
const acceptedCount = computed(
  () => applications.value.filter(a => a.status === 'accepted').length
);
// Accepted applicants who deferred their spot. Surfaces the cycle-
// change re-offer queue at first paint of /admin so staff doesn't
// have to remember "oh right, I should filter the queue when a new
// cohort opens".
const deferredCount = computed(
  () =>
    applications.value.filter(a => a.status === 'accepted' && a.spotResponse === 'deferred').length
);

const pendingReview = computed(() =>
  applications.value.filter(a => a.status === 'submitted').slice(0, 5)
);

const deferredApplicants = computed(() =>
  applications.value
    .filter(a => a.status === 'accepted' && a.spotResponse === 'deferred')
    .slice(0, 5)
);

async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    applications.value = await DatabaseService.getAllApplications();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load admin data.';
  } finally {
    loading.value = false;
  }
}

function programLabel(p: Application['program']) {
  return p === 'stepup_scholars' ? 'StepUp Scholars' : 'Dynamerge';
}

function applicantName(a: Application): string {
  const parts = [a.personalInfo?.firstName, a.personalInfo?.lastName].filter(Boolean);
  return parts.length ? parts.join(' ') : a.personalInfo?.email || 'Unnamed applicant';
}

function timeAgo(value: unknown): string {
  const ms = Date.now() - toMillis(value);
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  return new Date(toMillis(value)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value).getTime();
  }
  return 0;
}

onMounted(loadData);
</script>

<template>
  <Section class="!pt-12 !pb-24">
    <Container>
      <!-- Greeting -->
      <div class="flex flex-col gap-3 mb-12">
        <Eyebrow class="text-brand-violet">{{ roleLabel }}</Eyebrow>
        <Heading :level="1"
          >Hi, <span class="text-brand-violet">{{ firstName }}</span
          >.</Heading
        >
        <Body class="text-ink/70 max-w-xl">
          Review applications, manage users, set up mentor pairings. Editorial content lives in
          Contentful — the link is below.
        </Body>
      </div>

      <div v-if="loading" class="flex items-center gap-3 text-ink/60">
        <Icon icon="lucide:loader-2" width="18" class="animate-spin" />
        Loading…
      </div>

      <div
        v-else-if="error"
        class="flex flex-col gap-4 rounded-2xl border border-red-200 bg-red-50/60 p-6 max-w-2xl"
      >
        <div class="flex items-center gap-3 text-red-700">
          <Icon icon="lucide:alert-circle" width="20" />
          <span class="font-semibold">Couldn't load admin data.</span>
        </div>
        <p class="text-sm text-ink/70 m-0">{{ error }}</p>
        <button
          type="button"
          class="self-start text-sm font-semibold text-brand-violet hover:underline"
          @click="loadData"
        >
          Try again
        </button>
      </div>

      <template v-else>
        <!-- Stat cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          <UiCard class="p-6 flex flex-col gap-2">
            <Eyebrow class="text-brand-violet">Needs review</Eyebrow>
            <div class="font-display text-4xl font-semibold tracking-tight text-ink">
              {{ submittedCount }}
            </div>
            <p class="text-sm text-ink/60 m-0">Submitted, not yet opened</p>
          </UiCard>
          <UiCard class="p-6 flex flex-col gap-2">
            <Eyebrow class="text-brand-violet">In review</Eyebrow>
            <div class="font-display text-4xl font-semibold tracking-tight text-ink">
              {{ underReviewCount }}
            </div>
            <p class="text-sm text-ink/60 m-0">Decision pending</p>
          </UiCard>
          <UiCard class="p-6 flex flex-col gap-2">
            <Eyebrow class="text-brand-violet">Accepted</Eyebrow>
            <div class="font-display text-4xl font-semibold tracking-tight text-ink">
              {{ acceptedCount }}
            </div>
            <p class="text-sm text-ink/60 m-0">Across all cohorts</p>
          </UiCard>
          <!-- Deferred: surfaces the cycle-change re-offer queue at
               first paint. Clickable like the rest, links straight
               to the filtered /admin/applications view. -->
          <RouterLink
            :to="`${adminBase}/applications?response=deferred`"
            class="focus-ring-brand rounded-2xl"
          >
            <UiCard
              hoverable
              class="p-6 flex flex-col gap-2"
              :class="deferredCount > 0 ? '!border-amber-200 bg-amber-50/30' : ''"
            >
              <Eyebrow class="text-amber-700">Deferred</Eyebrow>
              <div class="font-display text-4xl font-semibold tracking-tight text-ink">
                {{ deferredCount }}
              </div>
              <p class="text-sm text-ink/60 m-0">
                {{
                  deferredCount === 1 ? 'Awaiting re-offer' : 'Awaiting re-offer when cycle opens'
                }}
              </p>
            </UiCard>
          </RouterLink>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Pending applications (left, wider) -->
          <div class="lg:col-span-2 flex flex-col gap-4">
            <div class="flex items-end justify-between gap-4">
              <Heading :level="2">Pending review</Heading>
              <RouterLink
                v-if="applications.length > 0"
                :to="`${adminBase}/applications`"
                class="text-sm font-semibold text-brand-violet hover:underline"
              >
                View all →
              </RouterLink>
            </div>

            <div
              v-if="pendingReview.length === 0"
              class="rounded-2xl border hairline-ink p-8 text-center"
            >
              <Body class="text-ink/65 m-0">
                No applications waiting on you.
                <span v-if="applications.length === 0">
                  Once applicants start submitting, they'll show up here.
                </span>
              </Body>
            </div>

            <div v-else class="flex flex-col gap-3">
              <RouterLink
                v-for="app in pendingReview"
                :key="app.id"
                :to="`${adminBase}/applications/${app.id}/review`"
                class="block group focus-ring-brand rounded-2xl"
              >
                <UiCard hoverable class="p-5 flex items-center gap-4">
                  <div class="flex-1 flex flex-col gap-1 min-w-0">
                    <div class="flex items-center gap-3 flex-wrap">
                      <h3 class="font-semibold text-base m-0 truncate">
                        {{ applicantName(app) }}
                      </h3>
                      <UiChip>{{ programLabel(app.program) }}</UiChip>
                    </div>
                    <p class="text-sm text-ink/60 m-0">
                      Submitted {{ timeAgo(app.submittedAt ?? app.createdAt) }}
                    </p>
                  </div>
                  <Icon
                    icon="lucide:arrow-right"
                    width="18"
                    class="text-brand-violet transition-transform group-hover:translate-x-1 shrink-0"
                  />
                </UiCard>
              </RouterLink>
            </div>

            <!-- Deferred applicants queue. Renders only when there
                 are deferred entries — most cycles this list is
                 empty so we don't waste vertical space. Each row
                 links straight to the unified review page for that
                 application; the bulk "Re-offer all" entry point
                 lives on /admin/applications?response=deferred where
                 staff can multi-select before firing. -->
            <div v-if="deferredApplicants.length > 0" class="flex flex-col gap-4 mt-10">
              <div class="flex items-end justify-between gap-4">
                <div>
                  <Heading :level="2">Deferred applicants</Heading>
                  <p class="text-sm text-ink/60 m-0 mt-1">
                    Hold a fresh handshake for these when the next cycle opens.
                  </p>
                </div>
                <RouterLink
                  :to="`${adminBase}/applications?response=deferred`"
                  class="text-sm font-semibold text-amber-700 hover:underline shrink-0"
                >
                  View all →
                </RouterLink>
              </div>
              <div class="flex flex-col gap-3">
                <RouterLink
                  v-for="app in deferredApplicants"
                  :key="app.id"
                  :to="`${adminBase}/applications/${app.id}`"
                  class="block group focus-ring-brand rounded-2xl"
                >
                  <UiCard
                    hoverable
                    class="p-5 flex items-center gap-4 !border-amber-200/60 bg-amber-50/20"
                  >
                    <div
                      class="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"
                    >
                      <Icon icon="lucide:clock" width="18" />
                    </div>
                    <div class="flex-1 flex flex-col gap-1 min-w-0">
                      <div class="flex items-center gap-3 flex-wrap">
                        <h3 class="font-semibold text-base m-0 truncate">
                          {{ applicantName(app) }}
                        </h3>
                        <UiChip>{{ programLabel(app.program) }}</UiChip>
                      </div>
                      <p class="text-sm text-ink/60 m-0">
                        Deferred {{ timeAgo(app.spotRespondedAt ?? app.reviewedAt) }}
                      </p>
                    </div>
                    <Icon
                      icon="lucide:arrow-right"
                      width="18"
                      class="text-amber-700 transition-transform group-hover:translate-x-1 shrink-0"
                    />
                  </UiCard>
                </RouterLink>
              </div>
            </div>
          </div>

          <!-- Quick actions (right, narrower) -->
          <div class="flex flex-col gap-4">
            <Heading :level="2">Quick actions</Heading>
            <div class="flex flex-col gap-3">
              <RouterLink
                :to="`${adminBase}/applications`"
                class="flex items-start gap-4 p-5 rounded-2xl border hairline-ink hover:border-brand-violet/40 hover:bg-brand-violet/5 transition-colors focus-ring-brand"
              >
                <div
                  class="w-10 h-10 rounded-xl bg-brand-violet/10 flex items-center justify-center shrink-0"
                >
                  <Icon icon="lucide:clipboard-list" width="20" class="text-brand-violet" />
                </div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-semibold text-base">Applications</span>
                  <span class="text-sm text-ink/60">Review, accept, decline</span>
                </div>
              </RouterLink>

              <RouterLink
                v-if="isAdmin"
                :to="`${adminBase}/users`"
                class="flex items-start gap-4 p-5 rounded-2xl border hairline-ink hover:border-brand-violet/40 hover:bg-brand-violet/5 transition-colors focus-ring-brand"
              >
                <div
                  class="w-10 h-10 rounded-xl bg-brand-violet/10 flex items-center justify-center shrink-0"
                >
                  <Icon icon="lucide:users" width="20" class="text-brand-violet" />
                </div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-semibold text-base">Users &amp; roles</span>
                  <span class="text-sm text-ink/60">Promote, demote, audit</span>
                </div>
              </RouterLink>

              <RouterLink
                :to="`${adminBase}/programs`"
                class="flex items-start gap-4 p-5 rounded-2xl border hairline-ink hover:border-brand-violet/40 hover:bg-brand-violet/5 transition-colors focus-ring-brand"
              >
                <div
                  class="w-10 h-10 rounded-xl bg-brand-violet/10 flex items-center justify-center shrink-0"
                >
                  <Icon icon="lucide:settings" width="20" class="text-brand-violet" />
                </div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-semibold text-base">Program settings</span>
                  <span class="text-sm text-ink/60">Cohort dates, capacities</span>
                </div>
              </RouterLink>

              <RouterLink
                :to="`${adminBase}/cohorts`"
                class="flex items-start gap-4 p-5 rounded-2xl border hairline-ink hover:border-brand-violet/40 hover:bg-brand-violet/5 transition-colors focus-ring-brand"
              >
                <div
                  class="w-10 h-10 rounded-xl bg-brand-violet/10 flex items-center justify-center shrink-0"
                >
                  <Icon icon="lucide:layers" width="20" class="text-brand-violet" />
                </div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-semibold text-base">Cohorts</span>
                  <span class="text-sm text-ink/60">Course cycles, mentor pools</span>
                </div>
              </RouterLink>

              <RouterLink
                :to="`${adminBase}/enroll`"
                class="flex items-start gap-4 p-5 rounded-2xl border hairline-ink hover:border-brand-violet/40 hover:bg-brand-violet/5 transition-colors focus-ring-brand"
              >
                <div
                  class="w-10 h-10 rounded-xl bg-brand-violet/10 flex items-center justify-center shrink-0"
                >
                  <Icon icon="lucide:user-plus" width="20" class="text-brand-violet" />
                </div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-semibold text-base">Enroll student</span>
                  <span class="text-sm text-ink/60">Place student into a cohort</span>
                </div>
              </RouterLink>

              <RouterLink
                :to="`${adminBase}/content`"
                class="flex items-start gap-4 p-5 rounded-2xl border hairline-ink hover:border-brand-violet/40 hover:bg-brand-violet/5 transition-colors focus-ring-brand"
              >
                <div
                  class="w-10 h-10 rounded-xl bg-brand-violet/10 flex items-center justify-center shrink-0"
                >
                  <Icon icon="lucide:file-text" width="20" class="text-brand-violet" />
                </div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-semibold text-base">Course content</span>
                  <span class="text-sm text-ink/60">Courses, modules, lessons, assignments</span>
                </div>
              </RouterLink>

              <RouterLink
                :to="`${adminBase}/referrals`"
                class="flex items-start gap-4 p-5 rounded-2xl border hairline-ink hover:border-brand-violet/40 hover:bg-brand-violet/5 transition-colors focus-ring-brand"
              >
                <div
                  class="w-10 h-10 rounded-xl bg-brand-violet/10 flex items-center justify-center shrink-0"
                >
                  <Icon icon="lucide:trophy" width="20" class="text-brand-violet" />
                </div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-semibold text-base">Referrals</span>
                  <span class="text-sm text-ink/60">Who's bringing in new subscribers</span>
                </div>
              </RouterLink>

              <a
                v-if="isAdmin"
                href="https://app.contentful.com/spaces/zcw0qx1phkan/"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-start gap-4 p-5 rounded-2xl border hairline-ink hover:border-brand-violet/40 hover:bg-brand-violet/5 transition-colors focus-ring-brand"
              >
                <div
                  class="w-10 h-10 rounded-xl bg-brand-violet/10 flex items-center justify-center shrink-0"
                >
                  <Icon icon="lucide:external-link" width="20" class="text-brand-violet" />
                </div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-semibold text-base flex items-center gap-1.5">
                    Contentful (raw)
                    <Icon icon="lucide:external-link" width="14" class="text-ink/50" />
                  </span>
                  <span class="text-sm text-ink/60">Blog, events, advanced edits</span>
                </div>
              </a>

              <a
                v-if="isAdmin"
                href="https://console.firebase.google.com/project/staija/firestore"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-start gap-4 p-5 rounded-2xl border hairline-ink hover:border-brand-violet/40 hover:bg-brand-violet/5 transition-colors focus-ring-brand"
              >
                <div
                  class="w-10 h-10 rounded-xl bg-brand-violet/10 flex items-center justify-center shrink-0"
                >
                  <Icon icon="lucide:database" width="20" class="text-brand-violet" />
                </div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-semibold text-base flex items-center gap-1.5">
                    Firestore
                    <Icon icon="lucide:external-link" width="14" class="text-ink/50" />
                  </span>
                  <span class="text-sm text-ink/60">Mentor pairings, raw data</span>
                </div>
              </a>
            </div>
          </div>
        </div>
      </template>
    </Container>
  </Section>
</template>
