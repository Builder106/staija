<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import Body from '../../../components/ui/Body.vue';
import Container from '../../../components/ui/Container.vue';
import Eyebrow from '../../../components/ui/Eyebrow.vue';
import Heading from '../../../components/ui/Heading.vue';
import Section from '../../../components/ui/Section.vue';
import UiButton from '../../../components/ui/UiButton.vue';
import UiCard from '../../../components/ui/UiCard.vue';
import { DatabaseService } from '../../../services/database';
import { SubmissionService, gradeSubmission, toMillis } from '../../../services/learn';
import type { AssignmentSubmission, UserProfile } from '../../../services/types';

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const submission = ref<AssignmentSubmission | null>(null);
const student = ref<UserProfile | null>(null);
const error = ref<string | null>(null);

const grade = ref<number | null>(null);
const comment = ref('');
const saving = ref(false);

async function load() {
  loading.value = true;
  try {
    const id = route.params.id as string;
    const s = await SubmissionService.getSubmission(id);
    if (!s) {
      error.value = 'Submission not found.';
      return;
    }
    submission.value = s;
    student.value = await DatabaseService.getUserProfile(s.studentId);
    grade.value = s.grade ?? null;
    comment.value = s.mentorComment ?? '';
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load.';
  } finally {
    loading.value = false;
  }
}

async function save(status: 'returned' | 'graded') {
  if (!submission.value || saving.value) return;
  saving.value = true;
  error.value = null;
  try {
    await gradeSubmission({
      submissionId: submission.value.id ?? '',
      grade: status === 'graded' && grade.value !== null ? grade.value : undefined,
      mentorComment: comment.value.trim() || undefined,
      status,
    });
    router.push({ name: 'mentor-dashboard' });
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Save failed.';
  } finally {
    saving.value = false;
  }
}

function fmtDate(value: unknown) {
  return new Date(toMillis(value)).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-10 !pb-6 border-b hairline-ink">
      <Container class="max-w-3xl">
        <RouterLink
          to="/mentor"
          class="text-xs text-ink/60 hover:text-ink mb-3 inline-flex items-center gap-1"
        >
          <Icon icon="lucide:arrow-left" width="12" /> Mentor portal
        </RouterLink>
        <Eyebrow class="text-brand-violet mb-2 block">Review submission</Eyebrow>
        <Heading v-if="submission" :level="1" class="mb-2 capitalize">
          {{ submission.assignmentSlug.replace(/-/g, ' ') }}
        </Heading>
        <p v-if="student" class="text-sm text-ink/60">
          From <strong class="text-ink">{{ student.displayName || student.email }}</strong>
          <span v-if="submission"> | {{ fmtDate(submission.submittedAt) }}</span>
        </p>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="max-w-3xl flex flex-col gap-6">
        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon icon="lucide:loader-2" width="24" class="animate-spin text-brand-violet mx-auto" />
        </UiCard>

        <UiCard v-else-if="error && !submission" class="p-6 bg-surface">
          <Body class="text-red-700 text-sm">{{ error }}</Body>
        </UiCard>

        <template v-else-if="submission">
          <UiCard class="p-6 md:p-8 bg-surface">
            <Eyebrow class="text-ink/50 mb-3 block">Student's submission</Eyebrow>
            <p
              v-if="submission.textContent"
              class="text-sm text-ink/85 whitespace-pre-line mb-4 leading-relaxed"
            >
              {{ submission.textContent }}
            </p>
            <a
              v-if="submission.fileUrl"
              :href="submission.fileUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 text-sm text-brand-violet hover:underline"
            >
              <Icon icon="lucide:paperclip" width="14" />
              {{ submission.fileName || 'Download file' }}
            </a>
            <a
              v-if="submission.linkUrl"
              :href="submission.linkUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 text-sm text-brand-violet hover:underline mt-2"
            >
              <Icon icon="lucide:external-link" width="14" />
              {{ submission.linkUrl }}
            </a>
          </UiCard>

          <UiCard class="p-6 md:p-8 bg-surface">
            <Heading :level="2" class="text-lg mb-4">Your review</Heading>
            <div class="flex flex-col gap-5">
              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                  Grade <span class="text-ink/40 normal-case">(optional, 0–100)</span>
                </label>
                <input
                  v-model.number="grade"
                  type="number"
                  min="0"
                  max="100"
                  class="w-32 px-4 py-2 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                  Comment
                </label>
                <textarea
                  v-model="comment"
                  rows="6"
                  placeholder="What did the student do well? What's the next step?"
                  class="w-full px-4 py-3 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet resize-none"
                />
              </div>
              <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
              <div class="flex flex-wrap gap-2">
                <UiButton variant="primary" :disabled="saving" @click="save('graded')">
                  <Icon v-if="saving" icon="lucide:loader-2" width="14" class="animate-spin" />
                  <Icon v-else icon="lucide:check" width="14" />
                  {{ saving ? 'Saving…' : 'Submit grade' }}
                </UiButton>
                <UiButton variant="secondary" :disabled="saving" @click="save('returned')">
                  Return for revision
                </UiButton>
              </div>
            </div>
          </UiCard>
        </template>
      </Container>
    </Section>
  </div>
</template>
