<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import Body from '../../../components/ui/Body.vue';
import Container from '../../../components/ui/Container.vue';
import Eyebrow from '../../../components/ui/Eyebrow.vue';
import Heading from '../../../components/ui/Heading.vue';
import Section from '../../../components/ui/Section.vue';
import UiButton from '../../../components/ui/UiButton.vue';
import UiCard from '../../../components/ui/UiCard.vue';
import { useAuth } from '../../../composables/useAuth';
import { DatabaseService } from '../../../services/database';
import {
  EnrollmentService,
  ProgressService,
  SubmissionService,
  toMillis,
} from '../../../services/learn';
import { MentorService } from '../../../services/mentor';
import type {
  AssignmentSubmission,
  Enrollment,
  LessonProgress,
  MentorFeedback,
  UserProfile,
} from '../../../services/types';

const route = useRoute();
const { user } = useAuth();

const loading = ref(true);
const error = ref<string | null>(null);
const student = ref<UserProfile | null>(null);
const enrollment = ref<Enrollment | null>(null);
const progress = ref<LessonProgress[]>([]);
const submissions = ref<AssignmentSubmission[]>([]);
const feedback = ref<MentorFeedback[]>([]);

const completedCount = computed(
  () => progress.value.filter((p) => p.status === 'completed').length,
);

async function load() {
  if (!user.value) return;
  loading.value = true;
  error.value = null;
  try {
    const studentId = route.params.studentId as string;

    const [s, assignment] = await Promise.all([
      DatabaseService.getUserProfile(studentId),
      MentorService.getAssignment(user.value.uid, studentId),
    ]);
    student.value = s;
    if (!s) {
      error.value = 'Student profile not found.';
      return;
    }
    if (!assignment) {
      error.value = 'You are not assigned to this student.';
      return;
    }

    // Find the matching active enrollment.
    const studentEnrollments = await EnrollmentService.getActiveForStudent(studentId);
    const own = studentEnrollments.find((e) => e.mentorId === user.value!.uid);
    if (own) {
      enrollment.value = own;
      const enrollmentId = own.id ?? `${own.studentId}_${own.cohortId}`;
      const [p, subs, fb] = await Promise.all([
        ProgressService.getProgressForEnrollment(enrollmentId),
        SubmissionService.getSubmissionsForEnrollmentAndAssignmentAll(enrollmentId),
        MentorService.getFeedbackForStudent(user.value.uid, studentId),
      ]);
      progress.value = p;
      submissions.value = subs;
      feedback.value = fb;
    }
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load student.';
  } finally {
    loading.value = false;
  }
}

function fmtDate(value: unknown) {
  return new Date(toMillis(value)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const statusClass: Record<string, string> = {
  submitted: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  returned: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  graded: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
};

// Quick-copy email feedback. The student profile has the address in
// plain text already, but a one-click copy beats select-all-then-cmd-c
// when mentors are queuing outreach in a separate tab.
const emailCopied = ref(false);
async function copyEmail() {
  const email = student.value?.email;
  if (!email) return;
  try {
    await navigator.clipboard.writeText(email);
    emailCopied.value = true;
    setTimeout(() => {
      emailCopied.value = false;
    }, 1500);
  } catch {
    // Clipboard API can fail under strict-permissions browsers.
    // Silently fail — the address is right there in the link above.
  }
}

// Inline feedback composer writes via MentorService.submitFeedback
// and prepends the new entry to the local list on success.
const feedbackDraft = ref('');
const feedbackSubmitting = ref(false);
const feedbackError = ref<string | null>(null);
const feedbackSuccess = ref(false);

async function submitFeedback() {
  const content = feedbackDraft.value.trim();
  if (!content || feedbackSubmitting.value) return;
  if (!user.value || !student.value) return;
  feedbackSubmitting.value = true;
  feedbackError.value = null;
  feedbackSuccess.value = false;
  try {
    const id = await MentorService.submitFeedback({
      mentorId: user.value.uid,
      studentId: student.value.uid,
      content,
    });
    feedback.value = [
      {
        id,
        mentorId: user.value.uid,
        studentId: student.value.uid,
        content,
        submittedAt: new Date(),
      },
      ...feedback.value,
    ];
    feedbackDraft.value = '';
    feedbackSuccess.value = true;
    setTimeout(() => {
      feedbackSuccess.value = false;
    }, 2000);
  } catch (err) {
    feedbackError.value = err instanceof Error ? err.message : 'Could not save feedback.';
  } finally {
    feedbackSubmitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-10 !pb-6 border-b hairline-ink">
      <Container class="max-w-4xl">
        <RouterLink
          to="/mentor"
          class="text-xs text-ink/60 hover:text-ink mb-3 inline-flex items-center gap-1"
        >
          <Icon icon="lucide:arrow-left" width="12" /> All students
        </RouterLink>
        <Eyebrow class="text-brand-violet mb-2 block">Student</Eyebrow>
        <Heading v-if="student" :level="1" class="mb-2">
          {{ student.displayName || 'No name' }}
        </Heading>
        <p v-if="student" class="text-sm text-ink/60">{{ student.email }}</p>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="max-w-4xl flex flex-col gap-6">
        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon icon="lucide:loader-2" width="24" class="animate-spin text-brand-violet mx-auto" />
        </UiCard>

        <UiCard v-else-if="error" class="p-6 bg-surface">
          <Body class="text-red-700 text-sm">{{ error }}</Body>
        </UiCard>

        <template v-else-if="student && enrollment">
          <!-- Quick actions: email, schedule a session for this
               cohort. Previously the mentor had to jump back to the
               dashboard and hunt for a "schedule session" link
               unrelated to the student they were already viewing —
               surfacing it inline keeps the mentor in flow. -->
          <UiCard class="p-5 bg-surface flex flex-col sm:flex-row sm:items-center gap-3">
            <a
              v-if="student.email"
              :href="`mailto:${student.email}`"
              class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-violet/10 text-brand-violet hover:bg-brand-violet/15 focus-ring-brand transition-colors"
            >
              <Icon icon="lucide:mail" width="14" />
              Email {{ student.displayName?.split(' ')[0] || 'student' }}
            </a>
            <button
              v-if="student.email"
              type="button"
              class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors focus-ring-brand"
              :class="
                emailCopied
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'border-ink/15 text-ink/75 hover:bg-ink/5'
              "
              @click="copyEmail"
            >
              <Icon :icon="emailCopied ? 'lucide:check' : 'lucide:clipboard'" width="14" />
              {{ emailCopied ? 'Copied' : 'Copy email' }}
            </button>
            <RouterLink
              to="/learn/mentor/schedule"
              class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border border-ink/15 text-ink/75 hover:bg-ink/5 focus-ring-brand transition-colors"
            >
              <Icon icon="lucide:calendar-plus" width="14" />
              Schedule a session
            </RouterLink>
          </UiCard>

          <UiCard class="p-6 md:p-8 bg-surface">
            <Eyebrow class="text-ink/50 mb-2 block">Progress</Eyebrow>
            <p class="text-ink text-sm">
              {{ completedCount }} lesson{{ completedCount === 1 ? '' : 's' }} completed
            </p>
          </UiCard>

          <div>
            <Eyebrow class="text-ink/50 mb-3 block">Submissions</Eyebrow>
            <UiCard v-if="submissions.length === 0" class="p-6 bg-surface">
              <Body class="text-ink/60 text-sm">No submissions yet.</Body>
            </UiCard>
            <UiCard v-else class="p-0 bg-surface overflow-hidden">
              <ul class="divide-y divide-ink/5">
                <li v-for="sub in submissions" :key="sub.id">
                  <RouterLink
                    :to="{ name: 'learn-mentor-submission', params: { id: sub.id } }"
                    class="flex items-center gap-3 px-5 py-4 hover:bg-ink/[0.02]"
                  >
                    <Icon icon="lucide:file-edit" width="18" class="text-ink/50" />
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium text-ink truncate capitalize">
                        {{ sub.assignmentSlug.replace(/-/g, ' ') }}
                      </div>
                      <div class="text-xs text-ink/50">{{ fmtDate(sub.submittedAt) }}</div>
                    </div>
                    <span
                      class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize"
                      :class="statusClass[sub.status]"
                    >
                      {{ sub.status }}
                    </span>
                    <Icon icon="lucide:chevron-right" width="14" class="text-ink/30" />
                  </RouterLink>
                </li>
              </ul>
            </UiCard>
          </div>

          <div>
            <Eyebrow class="text-ink/50 mb-3 block">Feedback you've left</Eyebrow>

            <!-- Inline composer. Replaces a "+ Leave new feedback"
                 link that used to navigate away to a dedicated page
                 and made the mentor lose all the student context
                 they were just reading. The submit handler writes
                 via MentorService.submitFeedback (same path the
                 standalone page uses) and prepends the new row to
                 the local list on success — no reload. -->
            <UiCard class="p-5 md:p-6 bg-surface mb-3 flex flex-col gap-3">
              <textarea
                v-model="feedbackDraft"
                rows="3"
                placeholder="Leave a note for the student — what's going well, what to focus on next…"
                class="border hairline-ink rounded-xl px-4 py-3 text-sm bg-paper focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all resize-y"
              />
              <div class="flex flex-wrap items-center gap-3">
                <UiButton
                  variant="primary"
                  :disabled="!feedbackDraft.trim() || feedbackSubmitting"
                  @click="submitFeedback"
                >
                  <span v-if="feedbackSubmitting" class="flex items-center gap-2">
                    <Icon icon="lucide:loader-2" width="14" class="animate-spin" />
                    Sending…
                  </span>
                  <span v-else class="flex items-center gap-2">
                    <Icon icon="lucide:send-horizontal" width="14" />
                    Send feedback
                  </span>
                </UiButton>
                <p v-if="feedbackError" class="text-xs text-rose-700 m-0">{{ feedbackError }}</p>
                <p v-else-if="feedbackSuccess" class="text-xs text-emerald-700 m-0">
                  <Icon icon="lucide:check" width="12" class="inline -mt-0.5" /> Saved.
                </p>
                <p v-else class="text-xs text-ink/45 m-0">
                  The student sees this on their dashboard.
                </p>
              </div>
            </UiCard>

            <UiCard v-if="feedback.length === 0" class="p-6 bg-surface">
              <Body class="text-ink/60 text-sm">No feedback yet.</Body>
            </UiCard>
            <UiCard v-else class="p-0 bg-surface overflow-hidden">
              <ul class="divide-y divide-ink/5">
                <li v-for="fb in feedback" :key="fb.id" class="px-5 py-4">
                  <p class="text-sm text-ink whitespace-pre-line">{{ fb.content }}</p>
                  <p class="text-xs text-ink/40 mt-2">{{ fmtDate(fb.submittedAt) }}</p>
                </li>
              </ul>
            </UiCard>
          </div>
        </template>
      </Container>
    </Section>
  </div>
</template>
