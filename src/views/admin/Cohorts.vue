<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { computed, onMounted, ref } from 'vue';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiCard from '../../components/ui/UiCard.vue';
import UiSelect from '../../components/ui/UiSelect.vue';
import { useAuth } from '../../composables/useAuth';
import { functions } from '../../config/firebase';
import { CohortService, EnrollmentService, toMillis } from '../../services/learn';
import type { Cohort } from '../../services/types';

const { user } = useAuth();

const cohorts = ref<Cohort[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const showForm = ref(false);
const editingId = ref<string | null>(null);

const blank = () => ({
  program: 'stepup_scholars' as 'stepup_scholars' | 'dynamerge',
  courseSlug: '',
  courseVersion: '',
  name: '',
  startDate: '',
  endDate: '',
  mentorPool: '',
  status: 'planned' as 'planned' | 'active' | 'completed',
});
const form = ref(blank());
const saving = ref(false);

const canSave = computed(
  () =>
    form.value.courseSlug && form.value.courseVersion && form.value.startDate && form.value.endDate
);

async function load() {
  loading.value = true;
  try {
    cohorts.value = await CohortService.listAllCohorts();
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load cohorts.';
  } finally {
    loading.value = false;
  }
}

// Graduation state. The modal is a confirmation dialog that names
// exactly how many enrollments are about to flip — staff shouldn't
// accidentally graduate a cohort thinking they were marking it
// inactive or whatever. Active-enrollment count is fetched lazily
// when the modal opens so the number is fresh.
const graduateTarget = ref<Cohort | null>(null);
const graduateCount = ref<number | null>(null);
const graduateCountLoading = ref(false);
const graduating = ref(false);
const graduateError = ref<string | null>(null);
const graduateResult = ref<{ enrollmentsCompleted: number; rolesFlipped: number } | null>(null);

async function openGraduate(c: Cohort) {
  graduateTarget.value = c;
  graduateResult.value = null;
  graduateError.value = null;
  graduateCount.value = null;
  graduateCountLoading.value = true;
  try {
    const enrollments = await EnrollmentService.getForCohort(c.id ?? '');
    graduateCount.value = enrollments.length;
  } catch {
    // Non-fatal — staff can still proceed; the callable returns the
    // real count in its response.
    graduateCount.value = null;
  } finally {
    graduateCountLoading.value = false;
  }
}

function closeGraduate() {
  graduateTarget.value = null;
  graduateResult.value = null;
  graduateError.value = null;
  graduateCount.value = null;
}

async function confirmGraduate() {
  const target = graduateTarget.value;
  if (!target?.id || graduating.value) return;
  graduating.value = true;
  graduateError.value = null;
  try {
    const fn = httpsCallable<
      { cohortId: string },
      { ok: true; cohortId: string; enrollmentsCompleted: number; rolesFlipped: number }
    >(functions, 'graduateCohort');
    const res = await fn({ cohortId: target.id });
    graduateResult.value = {
      enrollmentsCompleted: res.data.enrollmentsCompleted,
      rolesFlipped: res.data.rolesFlipped,
    };
    // Refresh the cohorts list so the just-graduated cohort shows
    // status='completed' in the table without a manual page refresh.
    await load();
  } catch (err) {
    graduateError.value = err instanceof Error ? err.message : 'Graduation failed.';
  } finally {
    graduating.value = false;
  }
}

function openNew() {
  editingId.value = null;
  form.value = blank();
  showForm.value = true;
}

function openEdit(c: Cohort) {
  editingId.value = c.id ?? null;
  form.value = {
    program: c.program,
    courseSlug: c.courseSlug,
    courseVersion: c.courseVersion,
    name: c.name ?? '',
    startDate: new Date(toMillis(c.startDate)).toISOString().slice(0, 10),
    endDate: new Date(toMillis(c.endDate)).toISOString().slice(0, 10),
    mentorPool: (c.mentorPool ?? []).join(', '),
    status: c.status,
  };
  showForm.value = true;
}

async function save() {
  if (!canSave.value || !user.value) return;
  saving.value = true;
  error.value = null;
  try {
    const payload = {
      program: form.value.program,
      courseSlug: form.value.courseSlug.trim(),
      courseVersion: form.value.courseVersion.trim(),
      name: form.value.name.trim() || undefined,
      startDate: Timestamp.fromDate(new Date(form.value.startDate)).toDate(),
      endDate: Timestamp.fromDate(new Date(form.value.endDate)).toDate(),
      mentorPool: form.value.mentorPool
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      status: form.value.status,
      createdBy: user.value.uid,
    };

    if (editingId.value) {
      await CohortService.updateCohort(editingId.value, payload);
    } else {
      await CohortService.createCohort(payload);
    }
    showForm.value = false;
    await load();
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Save failed.';
  } finally {
    saving.value = false;
  }
}

async function remove(c: Cohort) {
  if (!c.id) return;
  if (!confirm(`Delete cohort "${c.name || c.courseSlug}"? This can't be undone.`)) return;
  try {
    await CohortService.deleteCohort(c.id);
    await load();
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Delete failed.';
  }
}

// Re-arm the deferred-re-offer cron for a cohort that's already been
// processed. Clears the two tracking fields so the next daily cron
// run picks it up again — useful when staff wants a fresh batch of
// emails to go out (e.g. after extending a cohort's startDate, or
// when the first pass found zero deferreds because the deferred
// responses landed AFTER the cron ran). Per-row loading flag so a
// click can't fire twice. The confirm() is deliberate: re-arming
// produces user-visible emails on the next cron run, and staff
// should know they're queueing that side effect.
const rearmingIds = ref<Set<string>>(new Set());

async function rearmDeferredsCron(c: Cohort) {
  if (!c.id || rearmingIds.value.has(c.id)) return;
  if (
    !confirm(
      `Re-arm the deferred re-offer cron for "${c.name || c.courseSlug}"?\n\n` +
        `The next daily cron run will email every deferred applicant in this ` +
        `program. They'll see the three-CTA handshake on their dashboard again.`
    )
  )
    return;
  rearmingIds.value = new Set([...rearmingIds.value, c.id]);
  try {
    await CohortService.rearmDeferredsCron(c.id);
    await load();
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Re-arm failed.';
  } finally {
    const next = new Set(rearmingIds.value);
    next.delete(c.id);
    rearmingIds.value = next;
  }
}

function fmtDate(value: unknown) {
  return new Date(toMillis(value)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Plain ms epoch → short readable date. Separate from `fmtDate`
 *  because `deferredsAutoReOfferedAt` is stored as a primitive ms
 *  number (the cron writes `Date.now()`), not a Firestore Timestamp,
 *  so it bypasses the toMillis wrap. */
function fmtMsDate(ms: number | undefined): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const statusClass: Record<string, string> = {
  planned: 'bg-ink/5 text-ink/70 ring-1 ring-ink/10',
  active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  completed: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
};

onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-12 !pb-8 wash-violet-6 border-b hairline-ink">
      <Container>
        <Eyebrow class="text-brand-violet mb-3 block">Admin</Eyebrow>
        <Heading :level="1" class="mb-3">Cohorts.</Heading>
        <Body class="text-ink/70 max-w-2xl">
          A cohort is one cycle of a course — set start/end dates, pin a course version, assign a
          mentor pool. Enrollment is done from <strong>/admin/enroll</strong>.
        </Body>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="flex flex-col gap-6">
        <div class="flex justify-end">
          <UiButton variant="primary" @click="openNew">
            <Icon icon="lucide:plus" width="14" />
            New cohort
          </UiButton>
        </div>

        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon icon="lucide:loader-2" width="24" class="animate-spin text-brand-violet mx-auto" />
        </UiCard>

        <UiCard v-else-if="error" class="p-6 bg-surface">
          <Body class="text-red-700 text-sm">{{ error }}</Body>
        </UiCard>

        <UiCard v-else-if="cohorts.length === 0" class="p-10 bg-surface text-center">
          <Body class="text-ink/60 text-sm">No cohorts yet.</Body>
        </UiCard>

        <UiCard v-else class="p-0 bg-surface overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-ink/[0.03] text-ink/60">
                <tr>
                  <th class="text-left font-semibold px-5 py-3">Cohort</th>
                  <th class="text-left font-semibold px-5 py-3">Program</th>
                  <th class="text-left font-semibold px-5 py-3">Dates</th>
                  <th class="text-left font-semibold px-5 py-3">Mentors</th>
                  <th class="text-left font-semibold px-5 py-3">Status</th>
                  <th class="text-right font-semibold px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="c in cohorts"
                  :key="c.id"
                  class="border-t hairline-ink hover:bg-ink/[0.015]"
                >
                  <td class="px-5 py-3">
                    <div class="text-ink font-medium">{{ c.name || c.courseSlug }}</div>
                    <div class="text-ink/60 text-xs">v{{ c.courseVersion }}</div>
                    <!-- Cron audit line. Renders only when the
                         reOfferDeferredOnCohortStart cron has fired
                         for this cohort — staff sees at a glance
                         which cohorts already had their deferreds
                         re-opened. The companion Re-arm button in
                         the Actions column clears this. -->
                    <div
                      v-if="c.deferredsAutoReOffered && c.deferredsAutoReOfferedAt"
                      class="inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      :title="`Deferred applicants re-offered by the daily cron on ${fmtMsDate(c.deferredsAutoReOfferedAt)}`"
                    >
                      <Icon icon="lucide:mail-check" width="10" />
                      Deferreds re-offered {{ fmtMsDate(c.deferredsAutoReOfferedAt) }}
                    </div>
                  </td>
                  <td class="px-5 py-3 text-ink/80 capitalize">
                    {{ c.program.replace('_', ' ') }}
                  </td>
                  <td class="px-5 py-3 text-ink/70 text-xs whitespace-nowrap">
                    {{ fmtDate(c.startDate) }} – {{ fmtDate(c.endDate) }}
                  </td>
                  <td class="px-5 py-3 text-ink/70 text-xs">{{ (c.mentorPool ?? []).length }}</td>
                  <td class="px-5 py-3">
                    <span
                      class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize"
                      :class="statusClass[c.status]"
                    >
                      {{ c.status }}
                    </span>
                  </td>
                  <td class="px-5 py-3 text-right whitespace-nowrap">
                    <!-- Graduate appears only for active cohorts. The
                         callable is idempotent so it'd be safe to
                         expose elsewhere, but the action's semantics
                         (mark all enrollments complete + alumni
                         transition) only make sense from the active
                         state — a planned cohort has no enrollments
                         to graduate, a completed cohort has none
                         left. -->
                    <button
                      v-if="c.status === 'active'"
                      type="button"
                      class="text-xs font-semibold text-emerald-700 hover:underline mr-3"
                      @click="openGraduate(c)"
                    >
                      Graduate
                    </button>
                    <!-- Re-arm only renders when the cron has already
                         fired. Lets staff queue a fresh email round
                         to deferred applicants without touching
                         Firestore Console. The confirm() spells out
                         the side effect (emails will be sent) so a
                         mis-click doesn't surprise anyone. -->
                    <button
                      v-if="c.deferredsAutoReOffered === true"
                      type="button"
                      class="text-xs font-medium text-amber-700 hover:underline mr-3 disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
                      :disabled="!!c.id && rearmingIds.has(c.id)"
                      @click="rearmDeferredsCron(c)"
                    >
                      {{ c.id && rearmingIds.has(c.id) ? 'Re-arming…' : 'Re-arm' }}
                    </button>
                    <button
                      type="button"
                      class="text-xs font-medium text-brand-violet hover:underline mr-3"
                      @click="openEdit(c)"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      class="text-xs font-medium text-red-700 hover:underline"
                      @click="remove(c)"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UiCard>

        <!-- Form -->
        <UiCard v-if="showForm" class="p-6 md:p-8 bg-surface">
          <Heading :level="2" class="text-lg mb-4">
            {{ editingId ? 'Edit cohort' : 'New cohort' }}
          </Heading>
          <div class="grid md:grid-cols-2 gap-4">
            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                >Program</label
              >
              <UiSelect
                v-model="form.program"
                :options="[
                  { value: 'stepup_scholars', label: 'StepUp Scholars' },
                  { value: 'dynamerge', label: 'Dynamerge' },
                ]"
              />
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                >Status</label
              >
              <UiSelect
                v-model="form.status"
                :options="[
                  { value: 'planned', label: 'Planned' },
                  { value: 'active', label: 'Active' },
                  { value: 'completed', label: 'Completed' },
                ]"
              />
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                >Course slug</label
              >
              <input
                v-model="form.courseSlug"
                type="text"
                placeholder="e.g. stepup-foundations"
                class="w-full px-3 py-2 rounded-md border hairline-ink bg-surface text-sm font-mono"
              />
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                >Course version</label
              >
              <input
                v-model="form.courseVersion"
                type="text"
                placeholder="e.g. 2026-spring"
                class="w-full px-3 py-2 rounded-md border hairline-ink bg-surface text-sm font-mono"
              />
            </div>
            <div class="flex flex-col gap-2 md:col-span-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                Display name <span class="text-ink/40 normal-case">(optional)</span>
              </label>
              <input
                v-model="form.name"
                type="text"
                placeholder="e.g. Spring 2026"
                class="w-full px-3 py-2 rounded-md border hairline-ink bg-surface text-sm"
              />
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                >Start date</label
              >
              <input
                v-model="form.startDate"
                type="date"
                class="w-full px-3 py-2 rounded-md border hairline-ink bg-surface text-sm"
              />
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                >End date</label
              >
              <input
                v-model="form.endDate"
                type="date"
                class="w-full px-3 py-2 rounded-md border hairline-ink bg-surface text-sm"
              />
            </div>
            <div class="flex flex-col gap-2 md:col-span-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                Mentor pool <span class="text-ink/40 normal-case">(comma-separated uids)</span>
              </label>
              <textarea
                v-model="form.mentorPool"
                rows="2"
                placeholder="abc123, def456, …"
                class="w-full px-3 py-2 rounded-md border hairline-ink bg-surface text-sm font-mono resize-none"
              />
            </div>
          </div>

          <p v-if="error" class="text-sm text-red-700 mt-4">{{ error }}</p>

          <div class="flex gap-2 mt-6">
            <UiButton variant="primary" :disabled="!canSave || saving" @click="save">
              <Icon v-if="saving" icon="lucide:loader-2" width="14" class="animate-spin" />
              {{ saving ? 'Saving…' : editingId ? 'Update cohort' : 'Create cohort' }}
            </UiButton>
            <UiButton variant="secondary" :disabled="saving" @click="showForm = false"
              >Cancel</UiButton
            >
          </div>
        </UiCard>
      </Container>
    </Section>

    <!-- Graduation confirmation modal. Two states:
           (a) confirm — shows the active-enrollment count + the
               consequence (status flip + alumni transitions) and
               asks staff to commit.
           (b) result — shows what landed; staff dismisses or
               opens another cohort. -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-150"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="graduateTarget"
          class="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
          @click.self="!graduating && closeGraduate()"
        >
          <div
            role="dialog"
            aria-modal="true"
            class="bg-surface rounded-2xl shadow-xl max-w-md w-full border hairline-ink"
          >
            <template v-if="graduateResult">
              <div class="p-6 flex flex-col gap-4">
                <div class="flex items-start gap-3">
                  <div
                    class="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"
                  >
                    <Icon icon="lucide:graduation-cap" width="20" />
                  </div>
                  <div>
                    <Heading :level="3" class="!text-lg !m-0">Cohort graduated</Heading>
                    <p class="text-sm text-ink/60 m-0 mt-1">
                      {{ graduateTarget.name || graduateTarget.courseSlug }} is now marked
                      completed.
                    </p>
                  </div>
                </div>
                <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm border-t hairline-ink pt-4">
                  <dt class="text-ink/60">Enrollments completed</dt>
                  <dd class="text-ink font-semibold tabular-nums m-0 text-right">
                    {{ graduateResult.enrollmentsCompleted }}
                  </dd>
                  <dt class="text-ink/60">Students → alumni</dt>
                  <dd class="text-ink font-semibold tabular-nums m-0 text-right">
                    {{ graduateResult.rolesFlipped }}
                  </dd>
                </dl>
                <p
                  v-if="graduateResult.enrollmentsCompleted > graduateResult.rolesFlipped"
                  class="text-xs text-ink/55 m-0"
                >
                  {{ graduateResult.enrollmentsCompleted - graduateResult.rolesFlipped }} student(s)
                  stayed at their current role — they have another active enrollment or weren't
                  role='student' to begin with.
                </p>
              </div>
              <div class="flex justify-end px-6 py-4 border-t hairline-ink bg-ink/[0.02]">
                <UiButton variant="primary" @click="closeGraduate">Done</UiButton>
              </div>
            </template>

            <template v-else>
              <div class="p-6 flex flex-col gap-4">
                <div class="flex items-start gap-3">
                  <div
                    class="w-10 h-10 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center shrink-0"
                  >
                    <Icon icon="lucide:graduation-cap" width="20" />
                  </div>
                  <div>
                    <Heading :level="3" class="!text-lg !m-0">
                      Graduate {{ graduateTarget.name || graduateTarget.courseSlug }}?
                    </Heading>
                    <p class="text-sm text-ink/60 m-0 mt-1">
                      The cohort's status flips to <span class="font-semibold">completed</span>, all
                      active enrollments are marked finished, and qualifying students transition to
                      <span class="font-semibold">alumni</span>. Idempotent — safe to re-run if
                      something fails midway.
                    </p>
                  </div>
                </div>
                <div class="rounded-xl bg-ink/[0.03] px-4 py-3 text-sm">
                  <span class="text-ink/60">Active enrollments: </span>
                  <span class="font-semibold tabular-nums text-ink">
                    <template v-if="graduateCountLoading">checking…</template>
                    <template v-else-if="graduateCount === null"
                      >unknown (callable will report)</template
                    >
                    <template v-else>{{ graduateCount }}</template>
                  </span>
                </div>
                <p
                  v-if="graduateError"
                  class="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 m-0"
                >
                  {{ graduateError }}
                </p>
              </div>
              <div class="flex justify-end gap-2 px-6 py-4 border-t hairline-ink bg-ink/[0.02]">
                <UiButton variant="secondary" :disabled="graduating" @click="closeGraduate">
                  Cancel
                </UiButton>
                <UiButton variant="primary" :disabled="graduating" @click="confirmGraduate">
                  <span v-if="graduating" class="flex items-center gap-2">
                    <Icon icon="lucide:loader-2" width="14" class="animate-spin" />
                    Graduating…
                  </span>
                  <span v-else class="flex items-center gap-2">
                    <Icon icon="lucide:graduation-cap" width="14" />
                    Graduate cohort
                  </span>
                </UiButton>
              </div>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
