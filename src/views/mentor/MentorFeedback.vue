<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiCard from '../../components/ui/UiCard.vue';
import UiChip from '../../components/ui/UiChip.vue';
import { DatabaseService } from '../../services/database';
import {
  AuthService,
  MentorService,
  type MentorAssignment,
  type MentorFeedback,
  type UserProfile,
} from '../../services/firebase';

const route = useRoute();
const router = useRouter();

const studentId = computed(() => String(route.params.studentId ?? ''));

const assignment = ref<MentorAssignment | null>(null);
const studentProfile = ref<UserProfile | null>(null);
const pastFeedback = ref<MentorFeedback[]>([]);
const loading = ref(true);
const error = ref('');
const notAssigned = ref(false);

const draft = ref('');
const submitting = ref(false);
const submitError = ref('');

const studentName = computed(() => {
  return studentProfile.value?.displayName || studentProfile.value?.email || 'Student';
});

const programLabel = computed(() => {
  if (!assignment.value) return '';
  return assignment.value.program === 'stepup_scholars' ? 'StepUp Scholars' : 'Dynamerge';
});

async function loadData() {
  loading.value = true;
  error.value = '';
  notAssigned.value = false;
  try {
    const currentUser = AuthService.getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (!studentId.value) {
      error.value = 'Missing student ID.';
      return;
    }

    const [a, profile, fb] = await Promise.all([
      MentorService.getAssignment(currentUser.uid, studentId.value),
      DatabaseService.getUserProfile(studentId.value),
      MentorService.getFeedbackForStudent(currentUser.uid, studentId.value),
    ]);

    if (!a) {
      // The mentor isn't assigned to this student. Don't reveal whether the
      // student exists — just say there's no active pairing.
      notAssigned.value = true;
      return;
    }

    assignment.value = a;
    studentProfile.value = profile;
    pastFeedback.value = fb;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load this student.';
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  if (submitting.value) return;
  const content = draft.value.trim();
  if (!content) {
    submitError.value = 'Please write some feedback before submitting.';
    return;
  }
  if (!assignment.value) {
    submitError.value = 'You can only submit feedback for an actively assigned student.';
    return;
  }

  submitting.value = true;
  submitError.value = '';
  try {
    const currentUser = AuthService.getCurrentUser();
    if (!currentUser) throw new Error('Not signed in.');
    const id = await MentorService.submitFeedback({
      mentorId: currentUser.uid,
      studentId: studentId.value,
      content,
    });
    pastFeedback.value = [
      {
        id,
        mentorId: currentUser.uid,
        studentId: studentId.value,
        content,
        submittedAt: new Date(),
      },
      ...pastFeedback.value,
    ];
    draft.value = '';
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Failed to submit feedback.';
  } finally {
    submitting.value = false;
  }
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
watch(studentId, loadData);
</script>

<template>
  <Section class="!pt-12 !pb-24">
    <Container>
      <RouterLink
        to="/mentor"
        class="inline-flex items-center gap-1.5 text-sm font-medium text-ink/70 hover:text-brand-violet mb-6 focus-ring-brand rounded-sm"
      >
        <Icon icon="lucide:arrow-left" width="16" />
        Back to your students
      </RouterLink>

      <div v-if="loading" class="flex items-center gap-3 text-ink/60">
        <Icon icon="lucide:loader-2" width="18" class="animate-spin" />
        Loading…
      </div>

      <div v-else-if="notAssigned" class="rounded-2xl border hairline-ink p-8 max-w-2xl">
        <Heading :level="3" class="mb-3">Not your student.</Heading>
        <Body class="text-ink/70">
          You don't have an active mentor assignment for this student, so this feedback page isn't
          available to you. If you think this is a mistake, email
          <a href="mailto:contact@staija.org" class="text-brand-violet hover:underline">
            contact@staija.org </a
          >.
        </Body>
      </div>

      <div
        v-else-if="error"
        class="flex flex-col gap-4 rounded-2xl border border-red-200 bg-red-50/60 p-6 max-w-2xl"
      >
        <div class="flex items-center gap-3 text-red-700">
          <Icon icon="lucide:alert-circle" width="20" />
          <span class="font-semibold">Couldn't load this page.</span>
        </div>
        <p class="text-sm text-ink/70 m-0">{{ error }}</p>
      </div>

      <template v-else>
        <div class="flex flex-col gap-3 mb-10">
          <Eyebrow class="text-brand-violet">Mentor feedback</Eyebrow>
          <Heading :level="1">{{ studentName }}</Heading>
          <div class="flex items-center gap-3 flex-wrap">
            <UiChip>{{ programLabel }}</UiChip>
            <span v-if="studentProfile?.email" class="text-sm text-ink/60">
              {{ studentProfile.email }}
            </span>
          </div>
        </div>

        <!-- New feedback form -->
        <UiCard class="p-6 md:p-8 mb-10">
          <Heading :level="3" class="mb-2">Leave feedback</Heading>
          <Body class="text-ink/65 mb-5 text-sm">
            Visible to you and to STAIJA staff. Don't include anything you wouldn't want the student
            to read eventually — they may see this in a future student-side view.
          </Body>
          <form @submit.prevent="handleSubmit" class="flex flex-col gap-4">
            <textarea
              v-model="draft"
              rows="6"
              :disabled="submitting"
              placeholder="What's going well? What needs attention? Any concerns to flag?"
              class="w-full rounded-xl border hairline-ink bg-paper px-4 py-3 text-base leading-relaxed font-sans focus:outline-none focus:border-brand-violet/50 focus:ring-2 focus:ring-brand-violet/20 disabled:opacity-60"
            />
            <p v-if="submitError" role="alert" class="text-sm text-red-700 m-0">
              {{ submitError }}
            </p>
            <div class="flex items-center justify-between gap-4">
              <span class="text-xs text-ink/50">
                {{ draft.trim().length }} character{{ draft.trim().length === 1 ? '' : 's' }}
              </span>
              <UiButton variant="primary" type="submit" :disabled="submitting || !draft.trim()">
                <Icon
                  v-if="submitting"
                  icon="lucide:loader-2"
                  width="16"
                  class="animate-spin mr-1.5"
                />
                {{ submitting ? 'Submitting…' : 'Submit feedback' }}
              </UiButton>
            </div>
          </form>
        </UiCard>

        <!-- Past feedback -->
        <Heading :level="3" class="mb-4">Your past feedback</Heading>
        <div v-if="pastFeedback.length === 0" class="text-sm text-ink/60">
          You haven't left any feedback for this student yet.
        </div>
        <div v-else class="flex flex-col gap-4">
          <UiCard v-for="entry in pastFeedback" :key="entry.id ?? entry.content" class="p-5">
            <p class="text-xs text-ink/55 mb-2">
              {{ timeAgo(entry.submittedAt) }}
            </p>
            <p class="text-base text-ink leading-relaxed whitespace-pre-wrap m-0">
              {{ entry.content }}
            </p>
          </UiCard>
        </div>
      </template>
    </Container>
  </Section>
</template>
