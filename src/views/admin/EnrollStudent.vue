<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiCard from '../../components/ui/UiCard.vue';
import UiSelect from '../../components/ui/UiSelect.vue';
import { DatabaseService } from '../../services/database';
import { CohortService, EnrollmentService, enrollStudent } from '../../services/learn';
import type { Application, Cohort, Enrollment, UserProfile } from '../../services/types';

const route = useRoute();

const cohorts = ref<Cohort[]>([]);
const candidates = ref<UserProfile[]>([]);
/** Full users list so we can resolve mentor uids → names in the
 *  pairing picker. The mentorPool on a cohort is a list of uids; the
 *  legacy picker showed those raw, which was useless ("ic1yK2dR…").
 *  Keeping the full set on hand also lets us future-proof for staff
 *  surfaces that need to display the cohort roster, etc. */
const allUsers = ref<UserProfile[]>([]);
/** Active enrollments in the currently-selected cohort, indexed for
 *  per-mentor load. Refetched whenever the cohort selection changes
 *  so the load counts stay fresh — staff don't have to refresh the
 *  page after a teammate enrolls someone in a parallel session. */
const cohortEnrollments = ref<Enrollment[]>([]);
const cohortEnrollmentsLoading = ref(false);
const loading = ref(true);
const error = ref<string | null>(null);
const success = ref<string | null>(null);

const selectedStudentId = ref('');
const selectedCohortId = ref('');
const selectedMentorId = ref('');
const submitting = ref(false);

const selectedCohort = computed(() => cohorts.value.find(c => c.id === selectedCohortId.value));

/** The selected applicant's own applications, fetched on selection
 *  change. Drives the cohort filter so staff can't accidentally
 *  enroll a Dynamerge-accepted applicant into a StepUp cohort (the
 *  server-side guard in enrollStudent catches it too, but failing
 *  loud at submit time is worse UX than not surfacing the wrong
 *  cohort to begin with). null while loading or before a student is
 *  picked. */
const applicantApplications = ref<Application[] | null>(null);
const applicantAppsLoading = ref(false);

/** Programs the selected applicant has an accepted+confirmed
 *  application for. The enrollStudent callable requires this match
 *  (and a spotResponse='accepted' on the matching app); we mirror
 *  that gate in the picker so staff see the eligible cohorts only. */
const eligiblePrograms = computed<Set<string>>(() => {
  const apps = applicantApplications.value;
  if (!apps) return new Set();
  const programs = new Set<string>();
  for (const a of apps) {
    if (a.status === 'accepted' && a.spotResponse === 'accepted' && a.program) {
      programs.add(a.program);
    }
  }
  return programs;
});

/** Existing-student short-circuit: a candidate who's already
 *  `role='student'` is enrolling in a second cohort, which doesn't
 *  re-run the application gate (matches the enrollStudent callable's
 *  role-flip skip). For them, every active cohort is fair game. */
const selectedCandidate = computed(() =>
  candidates.value.find(u => u.uid === selectedStudentId.value)
);
const candidateIsExistingStudent = computed(() => selectedCandidate.value?.role === 'student');

/** Cohorts the staff can actually enroll the selected applicant
 *  into. Falls back to the full list when no applicant is selected
 *  yet, or when the candidate is an existing student. */
const eligibleCohorts = computed<Cohort[]>(() => {
  if (!selectedStudentId.value) return cohorts.value;
  if (candidateIsExistingStudent.value) return cohorts.value;
  if (!applicantApplications.value) return []; // still loading
  return cohorts.value.filter(c => eligiblePrograms.value.has(c.program));
});

/** Tracks why eligibleCohorts is empty so the picker can render an
 *  honest empty state instead of a silent "no options" dropdown. */
const cohortEmptyReason = computed<string | null>(() => {
  if (!selectedStudentId.value) return null;
  if (candidateIsExistingStudent.value) return null;
  if (applicantAppsLoading.value) return 'Loading applications…';
  if (!applicantApplications.value) return null;
  if (eligiblePrograms.value.size === 0) {
    const apps = applicantApplications.value;
    if (apps.length === 0) {
      return 'No applications on file for this person.';
    }
    const hasAccepted = apps.some(a => a.status === 'accepted');
    if (!hasAccepted) {
      return "No accepted applications yet. Decide on this applicant's submission first.";
    }
    return "Applicant hasn't confirmed their spot yet. Confirm the spot response first, then enroll.";
  }
  if (eligibleCohorts.value.length === 0) {
    return "No active cohort matches this applicant's accepted program.";
  }
  return null;
});

const canSubmit = computed(
  () => selectedStudentId.value && selectedCohortId.value && !submitting.value
);

/** Mentor pool resolved to display-friendly options with active load
 *  per mentor in the SELECTED cohort. The picker becomes useful:
 *
 *    Auto · would pick Mary Doe (3 students)
 *    Mary Doe · 3 students
 *    John Smith · 5 students
 *    Aisha Bello · 0 students
 *
 *  Sorted by load ascending so auto-pick's choice matches the human
 *  pick at the top, and so the least-loaded mentor surfaces first
 *  when staff want to override. */
const mentorOptions = computed<{ value: string; label: string }[]>(() => {
  if (!selectedCohort.value) {
    return [{ value: '', label: 'Pick a cohort first' }];
  }
  const pool = selectedCohort.value.mentorPool ?? [];
  if (pool.length === 0) {
    return [{ value: '', label: 'No mentor pool on this cohort — add one first' }];
  }
  const userByUid = new Map(allUsers.value.map(u => [u.uid, u]));
  const loadByUid = new Map<string, number>();
  for (const e of cohortEnrollments.value) {
    if (e.mentorId) loadByUid.set(e.mentorId, (loadByUid.get(e.mentorId) ?? 0) + 1);
  }
  const labelFor = (uid: string): { name: string; load: number } => {
    const user = userByUid.get(uid);
    const name = user?.displayName?.trim() || user?.email || `${uid.slice(0, 8)}…`;
    return { name, load: loadByUid.get(uid) ?? 0 };
  };
  const entries = pool.map(uid => ({ uid, ...labelFor(uid) })).sort((a, b) => a.load - b.load);
  const studentWord = (n: number) => (n === 1 ? 'student' : 'students');
  const autoPick = entries[0];
  const autoLabel = cohortEnrollmentsLoading.value
    ? 'Auto | loading mentor loads…'
    : `Auto | would pick ${autoPick.name} (${autoPick.load} ${studentWord(autoPick.load)})`;
  return [
    { value: '', label: autoLabel },
    ...entries.map(e => ({
      value: e.uid,
      label: `${e.name} | ${e.load} ${studentWord(e.load)}`,
    })),
  ];
});

/** Fetch the selected applicant's own applications whenever the
 *  student picker changes. Powers the cohort filter; clears any
 *  prior selection so a stale Dynamerge cohort doesn't carry over
 *  when staff switches to a StepUp-accepted applicant. */
watch(selectedStudentId, async uid => {
  selectedCohortId.value = '';
  applicantApplications.value = null;
  if (!uid) return;
  const candidate = candidates.value.find(u => u.uid === uid);
  // Existing students don't go through the application gate (second-
  // cohort enrollment), so skip the fetch entirely.
  if (candidate?.role === 'student') {
    applicantApplications.value = [];
    return;
  }
  applicantAppsLoading.value = true;
  try {
    applicantApplications.value = await DatabaseService.getUserApplications(uid);
  } catch (err) {
    console.warn('[EnrollStudent] applicant applications load failed', err);
    applicantApplications.value = [];
  } finally {
    applicantAppsLoading.value = false;
  }
});

/** Fetch the cohort's active enrollments whenever the selected cohort
 *  changes. Safe to re-run; getForCohort is a single query. */
watch(selectedCohortId, async cohortId => {
  // Reset the manual mentor pick whenever the cohort changes — a
  // mentor from cohort A isn't necessarily in cohort B's pool.
  selectedMentorId.value = '';
  if (!cohortId) {
    cohortEnrollments.value = [];
    return;
  }
  cohortEnrollmentsLoading.value = true;
  try {
    cohortEnrollments.value = await EnrollmentService.getForCohort(cohortId);
  } catch (err) {
    // Non-fatal — the picker still shows mentors, just without load
    // counts. Better than blocking the staff workflow.
    console.warn('[EnrollStudent] cohort enrollment load failed', err);
    cohortEnrollments.value = [];
  } finally {
    cohortEnrollmentsLoading.value = false;
  }
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [cs, users] = await Promise.all([
      CohortService.listAllCohorts(),
      DatabaseService.getAllUsers(),
    ]);
    cohorts.value = cs.filter(c => c.status !== 'completed');
    allUsers.value = users;
    // Phase 1: enroll any applicant or student. The applicant role is the
    // common case (just got accepted); already-students may need a second
    // course.
    candidates.value = users.filter(u => u.role === 'applicant' || u.role === 'student');
    // Pre-fill from ?applicant=<uid> on the URL. AdminApplications'
    // "Place in cohort" button hands the student off via this query
    // param so staff don't have to scroll through the whole candidate
    // list looking for the person they just accepted. Only honour
    // values that actually exist in the candidate set — a stale uid
    // from a copy-pasted URL silently no-ops instead of locking the
    // picker to nothing.
    const presetApplicant = route.query.applicant;
    if (
      typeof presetApplicant === 'string' &&
      candidates.value.some(u => u.uid === presetApplicant)
    ) {
      selectedStudentId.value = presetApplicant;
    }
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load.';
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = null;
  success.value = null;
  try {
    const result = await enrollStudent({
      studentId: selectedStudentId.value,
      cohortId: selectedCohortId.value,
      mentorId: selectedMentorId.value || undefined,
    });
    // Resolve the assigned mentor's uid → display name against the
    // already-loaded users list. Falls back to email, then to the
    // short uid prefix so a staff race (mentor added between page
    // load and submit) still produces a readable message.
    const mentor = allUsers.value.find(u => u.uid === result.mentorId);
    const mentorLabel =
      mentor?.displayName?.trim() || mentor?.email || `${result.mentorId.slice(0, 8)}…`;
    success.value = `Enrolled — assigned to ${mentorLabel}.`;
    selectedStudentId.value = '';
    selectedMentorId.value = '';
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Enroll failed.';
  } finally {
    submitting.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-12 !pb-8 wash-violet-6 border-b hairline-ink">
      <Container class="max-w-2xl">
        <Eyebrow class="text-brand-violet mb-3 block">Admin</Eyebrow>
        <Heading :level="1" class="mb-3">Enroll a student.</Heading>
        <Body class="text-ink/70">
          Manually enroll a student into a cohort. In Phase 2 this becomes automatic when an
          application is accepted.
        </Body>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="max-w-2xl">
        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon icon="lucide:loader-2" width="24" class="animate-spin text-brand-violet mx-auto" />
        </UiCard>

        <UiCard v-else class="p-6 md:p-10 bg-surface">
          <div class="flex flex-col gap-5">
            <!-- Pick the student first so the cohort picker can
                 filter to programs they're actually eligible for. -->
            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                >Student</label
              >
              <UiSelect
                v-model="selectedStudentId"
                placeholder="Select a student…"
                :options="
                  candidates.map(u => ({
                    value: u.uid,
                    label: `${u.displayName || u.email} — ${u.role}`,
                  }))
                "
              />
              <p class="text-xs text-ink/50">Showing applicants and existing students.</p>
            </div>

            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                >Cohort</label
              >
              <UiSelect
                v-model="selectedCohortId"
                placeholder="Select a cohort…"
                :disabled="!!cohortEmptyReason"
                :options="
                  eligibleCohorts.map(c => ({
                    value: c.id ?? '',
                    label: `${c.name || c.courseSlug} (${c.program.replace('_', ' ')}, ${c.status})`,
                  }))
                "
              />
              <!-- Honest empty state when the cohort list filters to
                   nothing. Tells staff exactly what to do next
                   (decide the application, wait for confirmation,
                   add a matching cohort) instead of leaving a silent
                   empty dropdown. -->
              <p v-if="cohortEmptyReason" class="text-xs text-amber-700 m-0">
                {{ cohortEmptyReason }}
              </p>
              <p
                v-else-if="selectedStudentId && !candidateIsExistingStudent"
                class="text-xs text-ink/50 m-0"
              >
                Filtered to programs this applicant has confirmed.
              </p>
            </div>

            <div v-if="selectedCohort" class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                Mentor
                <span class="text-ink/40 normal-case"
                  >(optional — auto-picks the least-loaded mentor if blank)</span
                >
              </label>
              <UiSelect v-model="selectedMentorId" :options="mentorOptions" />
              <p class="text-xs text-ink/50 m-0">
                Counts reflect this cohort's active enrollments only — a mentor with 5 students
                across two cohorts still shows 0 here if none are in this cohort.
              </p>
            </div>

            <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
            <p v-if="success" class="text-sm text-emerald-700">{{ success }}</p>

            <UiButton variant="primary" :disabled="!canSubmit" @click="submit">
              <Icon v-if="submitting" icon="lucide:loader-2" width="14" class="animate-spin" />
              <Icon v-else icon="lucide:user-plus" width="14" />
              {{ submitting ? 'Enrolling…' : 'Enroll' }}
            </UiButton>
          </div>
        </UiCard>
      </Container>
    </Section>
  </div>
</template>
