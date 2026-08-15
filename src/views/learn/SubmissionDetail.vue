<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiCard from '../../components/ui/UiCard.vue';
import { SubmissionService, toMillis } from '../../services/learn';
import type { AssignmentSubmission } from '../../services/types';

const route = useRoute();

const loading = ref(true);
const submission = ref<AssignmentSubmission | null>(null);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  try {
    const id = route.params.id as string;
    const s = await SubmissionService.getSubmission(id);
    if (!s) error.value = 'Submission not found.';
    else submission.value = s;
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load submission.';
  } finally {
    loading.value = false;
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

const statusClass: Record<string, string> = {
  submitted: 'bg-ink/5 text-ink/70 ring-1 ring-ink/10',
  returned: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  graded: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
};

onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-10 !pb-6 border-b hairline-ink">
      <Container class="max-w-3xl">
        <RouterLink
          to="/learn"
          class="text-xs text-ink/60 hover:text-ink mb-3 inline-flex items-center gap-1"
        >
          <Icon icon="lucide:arrow-left" width="12" /> Back to course
        </RouterLink>
        <Eyebrow class="text-brand-violet mb-2 block">Submission</Eyebrow>
        <Heading v-if="submission" :level="1" class="mb-2 capitalize">
          {{ submission.assignmentSlug.replace(/-/g, ' ') }}
        </Heading>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="max-w-3xl flex flex-col gap-6">
        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon icon="lucide:loader-2" width="24" class="animate-spin text-brand-violet mx-auto" />
        </UiCard>

        <UiCard v-else-if="error" class="p-6 bg-surface">
          <Body class="text-red-700 text-sm">{{ error }}</Body>
        </UiCard>

        <template v-else-if="submission">
          <UiCard class="p-6 md:p-8 bg-surface">
            <div class="flex items-start justify-between gap-4 mb-4">
              <div>
                <Eyebrow class="text-ink/50 mb-1 block">Status</Eyebrow>
                <span
                  class="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold capitalize"
                  :class="statusClass[submission.status]"
                >
                  {{ submission.status }}
                </span>
              </div>
              <div class="text-right">
                <Eyebrow class="text-ink/50 mb-1 block">Submitted</Eyebrow>
                <span class="text-sm text-ink">{{ fmtDate(submission.submittedAt) }}</span>
              </div>
            </div>

            <!-- Mentor feedback -->
            <div
              v-if="submission.status !== 'submitted'"
              class="mt-4 p-4 rounded-lg border hairline-ink bg-ink/[0.02]"
            >
              <Eyebrow class="text-brand-violet mb-2 block">Mentor review</Eyebrow>
              <p v-if="typeof submission.grade === 'number'" class="text-sm text-ink mb-2">
                Grade: <strong class="font-semibold">{{ submission.grade }}</strong>
              </p>
              <p v-if="submission.mentorComment" class="text-sm text-ink/80 whitespace-pre-line">
                {{ submission.mentorComment }}
              </p>
              <p v-else-if="typeof submission.grade !== 'number'" class="text-sm text-ink/50">
                Your mentor returned the submission without a written comment.
              </p>
              <p v-if="submission.gradedAt" class="text-xs text-ink/40 mt-2">
                {{ fmtDate(submission.gradedAt) }}
              </p>
            </div>
          </UiCard>

          <!-- Student's submission content -->
          <UiCard class="p-6 md:p-8 bg-surface">
            <Eyebrow class="text-ink/50 mb-3 block">Your submission</Eyebrow>
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
        </template>
      </Container>
    </Section>
  </div>
</template>
