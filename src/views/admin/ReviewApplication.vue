<script setup lang="ts">
/**
 * Staff review surface — turns a submitted application into something a
 * reviewer can actually scan and decide on. The legacy layout (bare HTML
 * cards on a white page) tried to share screen real estate between the
 * applicant's content AND the decision form by stacking them vertically.
 * On a tall application the "Save review" button ended up below the fold
 * and the reviewer had to scroll back up to a buried select, change it,
 * scroll back down to feedback, then submit — a bad shape for the
 * primary action.
 *
 * The new layout puts the decision panel in a sticky right column on
 * lg+ and at the bottom of the stack on mobile. Content lives in the
 * left column, organized as discrete cards so the eye can land on
 * "References", "Documents", "Motivation" without parsing a wall of
 * text. Documents render real download links via Storage's
 * getDownloadURL — that's the surface the new staged-files pipeline
 * feeds; admins finally have a way to actually open the transcript +
 * ID + showcase without going to the Firebase Console.
 */
import { Icon } from '@iconify/vue';
import { httpsCallable } from 'firebase/functions';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiCard from '../../components/ui/UiCard.vue';
import UiSelect from '../../components/ui/UiSelect.vue';
import { useAdminBase } from '../../composables/useAdminBase';
import { functions } from '../../config/firebase';
import { resolveAvatarSrc } from '../../services/avatar';
import { AuthService, DatabaseService, type Application } from '../../services/firebase';
import { StorageService } from '../../services/storageService';

const router = useRouter();
const route = useRoute();
const { adminBase } = useAdminBase();

const application = ref<Application | null>(null);
const applicantPhotoURL = ref<string | null>(null);
const applicantAvatarSlot = ref<number | null>(null);
const loading = ref(true);
const error = ref('');
const saving = ref(false);
const saveError = ref<string | null>(null);

const reviewForm = ref({
  status: 'submitted' as 'draft' | 'submitted' | 'under_review' | 'accepted' | 'rejected',
  feedback: '',
});

// Email-failure retry state. `lastEmailFailure` on the application doc
// is set by onApplicationStatusChange when Mailgun rejects the
// applicant-facing send (typo'd address, deliverability hold, etc.).
// The banner lets staff fix the failure inline without going to the
// Firebase Console; clicking Retry re-derives the email from the
// current status so a typo fixed since the failure picks up
// automatically.
const retrying = ref(false);
const retryMessage = ref('');
const retryTone = ref<'success' | 'error'>('success');

/** Resolved Storage download URLs, keyed by logical document kind
 *  (`transcript`, `id`, `showcase`, `recommendationLetter`, or
 *  `audio:<fieldName>`). Populated in parallel after the application
 *  loads — a missing key means the resolve failed (orphaned path,
 *  permissions, etc.) and the row renders a muted "Couldn't fetch"
 *  state instead of a broken link. */
const documentURLs = ref<Record<string, string>>({});

const programLabel = computed(() => {
  if (!application.value) return '';
  return application.value.program === 'stepup_scholars' ? 'StepUp Scholars' : 'Dynamerge';
});

const avatarSrc = computed(() => {
  if (!application.value) return '';
  return resolveAvatarSrc({
    photoURL: applicantPhotoURL.value,
    avatarSlot: applicantAvatarSlot.value,
    seed: application.value.userId,
  });
});

interface StatusMeta {
  label: string;
  pill: string;
}
const STATUS_META: Record<Application['status'], StatusMeta> = {
  draft: { label: 'Draft', pill: 'bg-ink/5 text-ink/60 border-ink/15' },
  submitted: {
    label: 'Submitted',
    pill: 'bg-brand-violet/10 text-brand-violet border-brand-violet/30',
  },
  under_review: { label: 'Under review', pill: 'bg-amber-50 text-amber-700 border-amber-200' },
  accepted: { label: 'Accepted', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Decision sent', pill: 'bg-rose-50 text-rose-700 border-rose-200' },
};
const currentStatusMeta = computed<StatusMeta>(() => {
  if (!application.value) return STATUS_META.submitted;
  return STATUS_META[application.value.status];
});

/** Whether the reviewer has changed any field since load. Drives the
 *  Save button's disabled state — saving the same status + feedback is
 *  a no-op that still bumps `reviewedAt`, which is misleading audit
 *  metadata. */
const isDirty = computed(() => {
  const a = application.value;
  if (!a) return false;
  return reviewForm.value.status !== a.status || reviewForm.value.feedback !== (a.feedback ?? '');
});

/** Days the application has been waiting since the applicant
 *  submitted it. Drives the "X days in queue" chip in the hero — at
 *  scale this is the single most useful piece of metadata for triage
 *  (which app has been sitting longest?), and the legacy surface
 *  buried it under a paragraph of "Submitted: October 12, 2026". */
const daysInQueue = computed<number | null>(() => {
  const submitted = toDate(application.value?.submittedAt);
  if (!submitted) return null;
  const ms = Date.now() - submitted.getTime();
  if (ms < 0) return null;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
});

const queueChip = computed<{ label: string; tone: string } | null>(() => {
  const days = daysInQueue.value;
  if (days === null || application.value?.status !== 'submitted') return null;
  const label = days === 0 ? 'New today' : days === 1 ? '1 day in queue' : `${days} days in queue`;
  // Tone climbs with age so a 30-day-old "submitted" jumps out red.
  const tone =
    days >= 14
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : days >= 7
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-ink/5 text-ink/60 border-ink/15';
  return { label, tone };
});

/** Word count helper for the long-form fields. Splits on whitespace
 *  rather than tokenising properly — the value is a skim signal, not
 *  a precise count, so the cheap version is good enough. */
function wordCount(text: string | undefined | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const motivationWords = computed(() => wordCount(application.value?.motivation));
const experienceWords = computed(() => wordCount(application.value?.experience));

/** Reference to the feedback textarea so quick-actions can land focus
 *  there after setting a status — the staff flow is "decide → write a
 *  one-line reason → save", so dropping the cursor in the textarea
 *  removes one click from the path. */
const feedbackInput = ref<HTMLTextAreaElement | null>(null);

/** Bump the status to a new value AND focus the feedback field. Used
 *  by the quick-action buttons (Accept / Mark under review / Decline)
 *  so the most common transitions are one-click affairs — the verbose
 *  dropdown stays for edge cases like reverting to "Submitted". */
function quickSetStatus(status: typeof reviewForm.value.status) {
  reviewForm.value.status = status;
  // Defer focus to next tick so the textarea has rendered if it was
  // hidden mid-state-change (it isn't today, but cheap insurance).
  setTimeout(() => feedbackInput.value?.focus(), 0);
}

const personalRows = computed(() => {
  const p = application.value?.personalInfo;
  if (!p) return [];
  return [
    { label: 'Email', value: p.email },
    { label: 'Phone', value: p.phone || '—' },
    { label: 'Date of birth', value: p.dateOfBirth ? formatDate(new Date(p.dateOfBirth)) : '—' },
    { label: 'Nationality', value: p.nationality || '—' },
    { label: 'Institution', value: p.currentInstitution || '—' },
    { label: 'Level', value: p.currentLevel || '—' },
  ];
});

const academicRows = computed(() => {
  const a = application.value?.academicInfo;
  if (!a) return [];
  return [
    { label: 'GPA', value: a.gpa || '—' },
    { label: 'Major', value: a.major || '—' },
    { label: 'Graduation year', value: a.graduationYear || '—' },
  ];
});

interface DocumentRow {
  /** Stable key used to look up the resolved URL in `documentURLs`. */
  key: string;
  /** Reader-friendly label shown in the row ("Transcript" etc). */
  label: string;
  /** Original Storage path — only surfaced as a tooltip / fallback. */
  path: string;
}
const documentRows = computed<DocumentRow[]>(() => {
  const docs = application.value?.documents;
  if (!docs) return [];
  const rows: DocumentRow[] = [];
  if (docs.transcript)
    rows.push({ key: 'transcript', label: 'Transcript / grade report', path: docs.transcript });
  if (docs.id) rows.push({ key: 'id', label: 'Government / school ID', path: docs.id });
  if (docs.showcase) rows.push({ key: 'showcase', label: 'Showcase upload', path: docs.showcase });
  if (docs.cv) rows.push({ key: 'cv', label: 'CV', path: docs.cv });
  if (docs.recommendationLetter) {
    rows.push({
      key: 'recommendationLetter',
      label: 'Recommendation letter',
      path: docs.recommendationLetter,
    });
  }
  if (docs.audio) {
    for (const [field, path] of Object.entries(docs.audio)) {
      rows.push({ key: `audio:${field}`, label: `Audio answer | ${field}`, path });
    }
  }
  return rows;
});

function failureKindLabel(kind: 'submitted' | 'accepted' | 'rejected' | string): string {
  if (kind === 'submitted') return 'Submission-confirmation';
  if (kind === 'accepted') return 'Acceptance';
  if (kind === 'rejected') return 'Status-update';
  return 'Applicant';
}

const failureWhen = computed(() => {
  const d = toDate(application.value?.lastEmailFailure?.attemptedAt);
  return d ? d.toLocaleString() : '';
});

async function retryEmail() {
  if (!application.value?.id || retrying.value) return;
  retrying.value = true;
  retryMessage.value = '';
  try {
    const fn = httpsCallable<{ applicationId: string }, { ok: boolean; kind: string; to: string }>(
      functions,
      'retryApplicationEmail'
    );
    const res = await fn({ applicationId: application.value.id });
    retryMessage.value = `Email re-sent to ${res.data.to}.`;
    retryTone.value = 'success';
    // Reload so the banner clears — lastEmailFailure is deleted on a
    // successful retry by the Cloud Function.
    await loadApplication();
  } catch (err) {
    retryMessage.value = err instanceof Error ? err.message : 'Retry failed.';
    retryTone.value = 'error';
  } finally {
    retrying.value = false;
  }
}

function formatDate(date: Date | undefined | null): string {
  if (!date) return 'Not submitted';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateTime(date: Date | undefined | null): string {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Coerce Firestore Timestamp / ISO / Date into a Date. Status data
 *  arrives in multiple shapes depending on whether the doc was just
 *  written by a Cloud Function (Timestamp) or read from cache (Date),
 *  so we normalise once at the edge. */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const fn = (value as { toDate: () => Date }).toDate;
    if (typeof fn === 'function') return fn.call(value);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

async function loadApplication() {
  loading.value = true;
  error.value = '';
  try {
    const app = await DatabaseService.getApplication(route.params.id as string);
    if (!app) {
      error.value = "We couldn't find that application.";
      return;
    }
    application.value = app;
    reviewForm.value.status = app.status;
    reviewForm.value.feedback = app.feedback || '';

    // Fan out two side jobs — the applicant's profile photo for the
    // header and the Storage URLs for any uploaded documents — so
    // they can populate as the review surface paints. Failures don't
    // block the review; the avatar falls back to the deterministic
    // seeded thumbnail and the document rows render a muted error
    // state with the raw path so a reviewer can still hunt them down.
    void loadApplicantAvatar(app.userId);
    void loadDocumentURLs();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load this application.';
  } finally {
    loading.value = false;
  }
}

async function loadApplicantAvatar(uid: string) {
  try {
    const profile = await DatabaseService.getUserProfile(uid);
    if (!profile) return;
    applicantPhotoURL.value = profile.photoURL ?? null;
    applicantAvatarSlot.value = (profile as { avatarSlot?: number | null }).avatarSlot ?? null;
  } catch {
    // Avatar is decorative — silently fall back to the seeded thumb.
  }
}

async function loadDocumentURLs() {
  const rows = documentRows.value;
  if (rows.length === 0) return;
  await Promise.all(
    rows.map(async row => {
      try {
        const url = await StorageService.getFileURL(row.path);
        documentURLs.value = { ...documentURLs.value, [row.key]: url };
      } catch {
        // Leave the key unset — template renders a "couldn't fetch"
        // affordance for that row.
      }
    })
  );
}

async function saveReview() {
  const app = application.value;
  if (!app?.id || saving.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    const currentUser = AuthService.getCurrentUser();
    await DatabaseService.updateApplication(app.id, {
      status: reviewForm.value.status,
      feedback: reviewForm.value.feedback,
      reviewedAt: new Date(),
      reviewedBy: currentUser?.email || 'Unknown',
    });
    router.push(`${adminBase.value}/applications`);
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Save failed. Try again.';
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.back();
}

onMounted(loadApplication);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <!-- Loading skeleton: anchors the page width so the first paint
         doesn't reflow when the application data lands. -->
    <Section v-if="loading" class="!py-16">
      <Container class="max-w-6xl flex flex-col gap-6">
        <div class="h-4 w-32 bg-ink/5 rounded animate-pulse" />
        <div class="h-12 w-3/4 bg-ink/5 rounded animate-pulse" />
        <div class="grid lg:grid-cols-3 gap-6 mt-6">
          <div class="lg:col-span-2 h-96 bg-ink/5 rounded-2xl animate-pulse" />
          <div class="h-64 bg-ink/5 rounded-2xl animate-pulse" />
        </div>
      </Container>
    </Section>

    <Section v-else-if="error && !application" class="!py-24 text-center">
      <Container class="max-w-xl flex flex-col items-center gap-6">
        <Heading :level="2">Couldn't load this application</Heading>
        <Body class="text-ink/70">{{ error }}</Body>
        <div class="flex items-center gap-3">
          <UiButton variant="secondary" @click="goBack">Back</UiButton>
          <UiButton variant="primary" @click="loadApplication">Try again</UiButton>
        </div>
      </Container>
    </Section>

    <template v-else-if="application">
      <!-- Hero band: applicant identity at a glance. Mirrors the
           applicant-facing Status.vue header so staff scanning many
           applications get a consistent visual anchor at the top. -->
      <Section class="!pt-12 !pb-8 wash-violet-6 border-b hairline-ink">
        <Container class="max-w-6xl">
          <RouterLink
            :to="`${adminBase}/applications`"
            class="inline-flex items-center gap-2 text-sm font-semibold text-ink/60 hover:text-brand-violet transition-colors mb-6 focus-ring-brand rounded-sm"
          >
            <Icon icon="lucide:arrow-left" width="16" /> All applications
          </RouterLink>

          <Eyebrow class="text-brand-violet mb-3 block"> {{ programLabel }} application </Eyebrow>

          <div class="flex flex-col md:flex-row md:items-center gap-5">
            <img
              :src="avatarSrc"
              :alt="`${application.personalInfo.firstName} ${application.personalInfo.lastName}`"
              class="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover border-2 hairline-ink !border-brand-violet/30 shrink-0"
              referrerpolicy="no-referrer"
            />
            <div class="flex-1 min-w-0 flex flex-col gap-2">
              <Heading :level="1" class="!text-3xl md:!text-4xl !m-0">
                {{ application.personalInfo.firstName }} {{ application.personalInfo.lastName }}
              </Heading>
              <div class="flex flex-wrap items-center gap-3">
                <span
                  class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border"
                  :class="currentStatusMeta.pill"
                >
                  {{ currentStatusMeta.label }}
                </span>
                <span
                  v-if="queueChip"
                  class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border"
                  :class="queueChip.tone"
                >
                  <Icon icon="lucide:clock" width="12" />
                  {{ queueChip.label }}
                </span>
                <a
                  :href="`mailto:${application.personalInfo.email}`"
                  class="text-sm text-ink/70 hover:text-brand-violet focus-ring-brand rounded-sm transition-colors"
                >
                  {{ application.personalInfo.email }}
                </a>
                <span class="text-sm text-ink/55">
                  Submitted
                  {{
                    formatDate(
                      toDate(application.submittedAt) ?? toDate(application.createdAt) ?? undefined
                    )
                  }}
                </span>
                <span class="text-xs text-ink/40 font-mono">
                  {{ application.id }}
                </span>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <!-- Email-failure banner. Fires when the applicant-facing
           status-update email was rejected by Mailgun. The Retry
           button calls the same Cloud Function the legacy view used,
           and the application doc reload after success clears the
           banner so the reviewer doesn't have to refresh by hand. -->
      <Section v-if="application.lastEmailFailure" class="!pt-6 !pb-0">
        <Container class="max-w-6xl">
          <div
            role="status"
            class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-4 sm:p-5 rounded-2xl border border-rose-200 bg-rose-50 text-rose-900"
          >
            <div class="flex items-start gap-3 flex-1 min-w-0">
              <Icon icon="lucide:mail-x" width="22" class="text-rose-700 mt-0.5 shrink-0" />
              <div class="flex flex-col gap-1 min-w-0">
                <div class="text-sm font-semibold">Couldn't email the applicant.</div>
                <div class="text-sm text-rose-800">
                  {{ failureKindLabel(application.lastEmailFailure.kind) }} email to
                  <code class="px-1 py-0.5 rounded bg-rose-100 font-mono text-xs">{{
                    application.lastEmailFailure.to
                  }}</code>
                  failed<span v-if="failureWhen"> {{ failureWhen }}</span
                  >.
                </div>
                <div class="text-xs font-mono text-rose-700/80 break-words">
                  {{ application.lastEmailFailure.error }}
                </div>
              </div>
            </div>
            <button
              type="button"
              :disabled="retrying"
              class="shrink-0 self-start sm:self-center inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white bg-rose-700 hover:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed focus-ring-brand transition-colors"
              @click="retryEmail"
            >
              <Icon
                :icon="retrying ? 'lucide:loader-2' : 'lucide:refresh-cw'"
                width="14"
                :class="retrying ? 'animate-spin' : ''"
              />
              {{ retrying ? 'Retrying…' : 'Retry email' }}
            </button>
          </div>
          <div
            v-if="retryMessage"
            role="status"
            class="mt-3 text-sm rounded-xl px-3 py-2 border"
            :class="
              retryTone === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            "
          >
            {{ retryMessage }}
          </div>
        </Container>
      </Section>

      <Section class="!py-10">
        <Container class="max-w-6xl">
          <div class="grid lg:grid-cols-3 gap-6">
            <!-- LEFT: full applicant content. Each card is a
                 standalone scannable surface so the reviewer can
                 anchor their eye on a section without losing place. -->
            <div class="lg:col-span-2 flex flex-col gap-6">
              <!-- Personal -->
              <UiCard class="p-6 md:p-8 bg-surface">
                <div class="flex items-center gap-3 mb-5">
                  <Icon icon="lucide:user" width="20" class="text-brand-violet" />
                  <h2 class="font-display text-xl font-semibold m-0 text-ink">Personal</h2>
                </div>
                <dl class="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm m-0">
                  <div v-for="row in personalRows" :key="row.label" class="flex flex-col">
                    <dt class="text-xs uppercase tracking-wider text-ink/50 font-semibold">
                      {{ row.label }}
                    </dt>
                    <dd class="text-ink m-0 break-words">{{ row.value }}</dd>
                  </div>
                </dl>
              </UiCard>

              <!-- Academic -->
              <UiCard v-if="academicRows.length > 0" class="p-6 md:p-8 bg-surface">
                <div class="flex items-center gap-3 mb-5">
                  <Icon icon="lucide:graduation-cap" width="20" class="text-brand-violet" />
                  <h2 class="font-display text-xl font-semibold m-0 text-ink">Academic</h2>
                </div>
                <dl class="grid sm:grid-cols-3 gap-x-6 gap-y-3 text-sm m-0">
                  <div v-for="row in academicRows" :key="row.label" class="flex flex-col">
                    <dt class="text-xs uppercase tracking-wider text-ink/50 font-semibold">
                      {{ row.label }}
                    </dt>
                    <dd class="text-ink m-0 break-words">{{ row.value }}</dd>
                  </div>
                </dl>
                <div
                  v-if="application.academicInfo?.relevantCourses?.length"
                  class="mt-5 pt-5 border-t hairline-ink"
                >
                  <div class="text-xs uppercase tracking-wider text-ink/50 font-semibold mb-2">
                    Relevant courses
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <span
                      v-for="c in application.academicInfo.relevantCourses"
                      :key="c"
                      class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-ink/5 text-ink/80"
                    >
                      {{ c }}
                    </span>
                  </div>
                </div>
              </UiCard>

              <!-- Research interests -->
              <UiCard v-if="application.researchInterests?.length" class="p-6 md:p-8 bg-surface">
                <div class="flex items-center gap-3 mb-5">
                  <Icon icon="lucide:flask-conical" width="20" class="text-brand-violet" />
                  <h2 class="font-display text-xl font-semibold m-0 text-ink">
                    Research interests
                  </h2>
                </div>
                <div class="flex flex-wrap gap-2">
                  <span
                    v-for="r in application.researchInterests"
                    :key="r"
                    class="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-brand-violet/10 text-brand-violet"
                  >
                    {{ r }}
                  </span>
                </div>
              </UiCard>

              <!-- Motivation -->
              <UiCard v-if="application.motivation" class="p-6 md:p-8 bg-surface">
                <div class="flex items-center justify-between gap-3 mb-5">
                  <div class="flex items-center gap-3">
                    <Icon icon="lucide:sparkles" width="20" class="text-brand-violet" />
                    <h2 class="font-display text-xl font-semibold m-0 text-ink">Motivation</h2>
                  </div>
                  <span class="text-xs text-ink/50 tabular-nums shrink-0">
                    {{ motivationWords }} words
                  </span>
                </div>
                <p class="text-sm text-ink/85 leading-relaxed whitespace-pre-wrap m-0">
                  {{ application.motivation }}
                </p>
              </UiCard>

              <!-- Experience -->
              <UiCard v-if="application.experience" class="p-6 md:p-8 bg-surface">
                <div class="flex items-center justify-between gap-3 mb-5">
                  <div class="flex items-center gap-3">
                    <Icon icon="lucide:briefcase" width="20" class="text-brand-violet" />
                    <h2 class="font-display text-xl font-semibold m-0 text-ink">Experience</h2>
                  </div>
                  <span class="text-xs text-ink/50 tabular-nums shrink-0">
                    {{ experienceWords }} words
                  </span>
                </div>
                <p class="text-sm text-ink/85 leading-relaxed whitespace-pre-wrap m-0">
                  {{ application.experience }}
                </p>
              </UiCard>

              <!-- Documents — only renders when the finalize callable
                   has populated `application.documents`. Older
                   submissions without `documents` won't have a row
                   here; that's a deliberate gap, not a bug — the
                   files are still in Storage at applications/{uid}/{appId}/
                   for those, just without indexed paths. -->
              <UiCard v-if="documentRows.length > 0" class="p-6 md:p-8 bg-surface">
                <div class="flex items-center gap-3 mb-5">
                  <Icon icon="lucide:files" width="20" class="text-brand-violet" />
                  <h2 class="font-display text-xl font-semibold m-0 text-ink">Documents</h2>
                </div>
                <ul class="flex flex-col gap-2 list-none p-0 m-0">
                  <li
                    v-for="row in documentRows"
                    :key="row.key"
                    class="flex items-center justify-between gap-3 p-3 border hairline-ink rounded-xl bg-paper/50"
                  >
                    <div class="flex items-center gap-3 min-w-0">
                      <Icon
                        :icon="
                          row.key.startsWith('audio:') ? 'lucide:audio-lines' : 'lucide:file-text'
                        "
                        width="18"
                        class="text-brand-violet shrink-0"
                      />
                      <div class="flex flex-col min-w-0">
                        <span class="text-sm font-semibold text-ink truncate">{{ row.label }}</span>
                        <span class="text-xs text-ink/45 font-mono truncate">{{ row.path }}</span>
                      </div>
                    </div>
                    <a
                      v-if="documentURLs[row.key]"
                      :href="documentURLs[row.key]"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-violet hover:underline focus-ring-brand rounded-sm shrink-0"
                    >
                      Open
                      <Icon icon="lucide:external-link" width="14" />
                    </a>
                    <span v-else class="text-xs text-ink/45 italic shrink-0">Couldn't fetch</span>
                  </li>
                </ul>
              </UiCard>

              <!-- Showcase: URL + optional note. The file (if any) is
                   surfaced under Documents above; this card focuses on
                   the link/note context the applicant volunteered. -->
              <UiCard
                v-if="
                  application.showcase && (application.showcase.url || application.showcase.note)
                "
                class="p-6 md:p-8 bg-surface"
              >
                <div class="flex items-center justify-between gap-3 mb-5">
                  <div class="flex items-center gap-3">
                    <Icon icon="lucide:star" width="20" class="text-brand-violet" />
                    <h2 class="font-display text-xl font-semibold m-0 text-ink">Showcase</h2>
                  </div>
                  <span class="text-xs uppercase tracking-wider text-ink/50 font-semibold"
                    >Optional</span
                  >
                </div>
                <div class="flex flex-col gap-3 text-sm">
                  <div v-if="application.showcase.url" class="flex flex-col gap-1">
                    <span class="text-xs uppercase tracking-wider text-ink/50 font-semibold"
                      >Link</span
                    >
                    <a
                      :href="application.showcase.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-brand-violet hover:underline break-all focus-ring-brand rounded-sm"
                    >
                      {{ application.showcase.url }}
                    </a>
                  </div>
                  <div v-if="application.showcase.note" class="flex flex-col gap-1">
                    <span class="text-xs uppercase tracking-wider text-ink/50 font-semibold"
                      >Note</span
                    >
                    <p class="m-0 text-ink/85 leading-relaxed">{{ application.showcase.note }}</p>
                  </div>
                </div>
              </UiCard>

              <!-- References -->
              <UiCard v-if="application.references?.length" class="p-6 md:p-8 bg-surface">
                <div class="flex items-center gap-3 mb-5">
                  <Icon icon="lucide:mail" width="20" class="text-brand-violet" />
                  <h2 class="font-display text-xl font-semibold m-0 text-ink">References</h2>
                </div>
                <ul class="flex flex-col gap-3 list-none p-0 m-0">
                  <li
                    v-for="(r, i) in application.references"
                    :key="i"
                    class="p-4 border hairline-ink rounded-xl bg-paper/50"
                  >
                    <div class="flex items-center justify-between gap-3 flex-wrap">
                      <div class="font-semibold text-ink text-sm">{{ r.name }}</div>
                      <a
                        v-if="r.email"
                        :href="`mailto:${r.email}`"
                        class="text-xs text-brand-violet hover:underline focus-ring-brand rounded-sm"
                      >
                        {{ r.email }}
                      </a>
                    </div>
                    <div class="text-xs text-ink/60 mt-1">
                      {{ r.institution }}<span v-if="r.relationship"> | {{ r.relationship }}</span>
                    </div>
                  </li>
                </ul>
              </UiCard>

              <!-- Prior feedback. Renders when reviewedAt is populated
                   — so a staffer revisiting a decision sees what was
                   communicated last time and can iterate on it
                   without reloading the page from the dashboard. -->
              <UiCard
                v-if="application.feedback || application.reviewedAt"
                class="p-6 md:p-8 bg-surface !border-amber-200/50 !bg-amber-50/30"
              >
                <div class="flex items-center gap-3 mb-3">
                  <Icon icon="lucide:history" width="20" class="text-amber-700" />
                  <h2 class="font-display text-lg font-semibold m-0 text-ink">
                    Previously reviewed
                  </h2>
                </div>
                <p class="text-sm text-ink/85 whitespace-pre-wrap m-0">
                  {{ application.feedback || '(no feedback recorded)' }}
                </p>
                <div class="text-xs text-ink/55 mt-3">
                  by {{ application.reviewedBy || 'unknown' }} on
                  {{ formatDateTime(toDate(application.reviewedAt) ?? undefined) }}
                </div>
              </UiCard>
            </div>

            <!-- RIGHT: sticky decision panel. Always reachable on
                 desktop without scrolling; on mobile it follows the
                 content stack so the reviewer scans, then decides. -->
            <div class="lg:col-span-1">
              <UiCard class="p-6 lg:sticky lg:top-24 bg-surface flex flex-col gap-5">
                <div class="flex items-center gap-3">
                  <Icon icon="lucide:clipboard-check" width="20" class="text-brand-violet" />
                  <h2 class="font-display text-lg font-semibold m-0 text-ink">Decision</h2>
                </div>

                <!-- Quick-action row. The full status dropdown lives
                     below for edge cases (reverting to "Submitted",
                     etc.), but >95% of decisions land on one of these
                     three transitions — one tap + write feedback +
                     save instead of dropdown-click-pick-tab-write. -->
                <div class="flex flex-col gap-2">
                  <span class="text-xs uppercase tracking-wider text-ink/55 font-semibold">
                    Quick decision
                  </span>
                  <div class="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      class="inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold border transition-colors focus-ring-brand"
                      :class="
                        reviewForm.status === 'accepted'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      "
                      @click="quickSetStatus('accepted')"
                    >
                      <Icon icon="lucide:check" width="14" />
                      Accept
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold border transition-colors focus-ring-brand"
                      :class="
                        reviewForm.status === 'under_review'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                      "
                      @click="quickSetStatus('under_review')"
                    >
                      <Icon icon="lucide:eye" width="14" />
                      Review
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold border transition-colors focus-ring-brand"
                      :class="
                        reviewForm.status === 'rejected'
                          ? 'bg-rose-700 text-white border-rose-700'
                          : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                      "
                      @click="quickSetStatus('rejected')"
                    >
                      <Icon icon="lucide:x" width="14" />
                      Decline
                    </button>
                  </div>
                </div>

                <div class="flex flex-col gap-2">
                  <label
                    :for="`status-${application.id}`"
                    class="text-xs uppercase tracking-wider text-ink/55 font-semibold"
                  >
                    Status
                  </label>
                  <UiSelect
                    :id="`status-${application.id}`"
                    v-model="reviewForm.status"
                    :options="[
                      { value: 'submitted', label: 'Submitted' },
                      { value: 'under_review', label: 'Under review' },
                      { value: 'accepted', label: 'Accepted' },
                      { value: 'rejected', label: 'Decision sent' },
                    ]"
                  />
                </div>

                <div class="flex flex-col gap-2">
                  <label
                    :for="`feedback-${application.id}`"
                    class="text-xs uppercase tracking-wider text-ink/55 font-semibold"
                  >
                    Feedback to applicant
                  </label>
                  <textarea
                    :id="`feedback-${application.id}`"
                    ref="feedbackInput"
                    v-model="reviewForm.feedback"
                    rows="8"
                    placeholder="Tell the applicant what stood out, what's pending, what's next…"
                    class="border hairline-ink rounded-xl px-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-surface resize-y"
                  />
                  <p class="text-xs text-ink/50 m-0">
                    Sent in the next status-update email if the applicant is notified.
                  </p>
                </div>

                <div
                  v-if="saveError"
                  role="alert"
                  class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 m-0"
                >
                  {{ saveError }}
                </div>

                <div class="flex flex-col gap-2 pt-2 border-t hairline-ink">
                  <UiButton variant="gradient" :disabled="saving || !isDirty" @click="saveReview">
                    <span v-if="saving" class="flex items-center gap-2">
                      <Icon icon="lucide:loader-2" width="16" class="animate-spin" />
                      Saving…
                    </span>
                    <span v-else-if="!isDirty" class="flex items-center gap-2">
                      <Icon icon="lucide:check" width="16" />
                      Up to date
                    </span>
                    <span v-else class="flex items-center gap-2">
                      Save review
                      <Icon icon="lucide:arrow-right" width="16" />
                    </span>
                  </UiButton>
                  <UiButton variant="secondary" @click="goBack">Cancel</UiButton>
                </div>
              </UiCard>
            </div>
          </div>
        </Container>
      </Section>
    </template>
  </div>
</template>
