<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import RichText from '../../components/learn/RichText.vue';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiCard from '../../components/ui/UiCard.vue';
import { useAuth } from '../../composables/useAuth';
import { storage } from '../../config/firebase';
import {
  CourseService,
  EnrollmentService,
  SubmissionService,
  submitAssignment,
  toMillis,
} from '../../services/learn';
import type { AssignmentSubmission, CmsAssignmentSpec, Enrollment } from '../../services/types';

const route = useRoute();
const router = useRouter();
const { user } = useAuth();

const loading = ref(true);
const error = ref<string | null>(null);
const spec = ref<CmsAssignmentSpec | null>(null);
const enrollment = ref<Enrollment | null>(null);
const previousSubmissions = ref<AssignmentSubmission[]>([]);

const text = ref('');
const linkUrl = ref('');
const file = ref<File | null>(null);
const submitting = ref(false);

const accepts = computed(() => {
  if (!spec.value) return '';
  if (spec.value.acceptedFileTypes && spec.value.acceptedFileTypes.length > 0) {
    return spec.value.acceptedFileTypes.join(',');
  }
  return '';
});

const maxBytes = computed(() => (spec.value?.maxFileSizeMb ?? 10) * 1024 * 1024);

const submissionType = computed(() => spec.value?.submissionType ?? 'text');
const allowsText = computed(
  () => submissionType.value === 'text' || submissionType.value === 'text_or_file',
);
const allowsFile = computed(
  () => submissionType.value === 'file' || submissionType.value === 'text_or_file',
);
const allowsLink = computed(() => submissionType.value === 'link');

const canSubmit = computed(() => {
  if (submitting.value || !enrollment.value || !spec.value) return false;
  if (allowsText.value && text.value.trim().length > 0) return true;
  if (allowsFile.value && file.value) return true;
  if (allowsLink.value && linkUrl.value.trim().length > 0) return true;
  return false;
});

async function load() {
  if (!user.value) return;
  loading.value = true;
  error.value = null;
  const slug = route.params.slug as string;
  try {
    const [s, enrollments] = await Promise.all([
      CourseService.getAssignmentSpecBySlug(slug),
      EnrollmentService.getActiveForStudent(user.value.uid),
    ]);
    spec.value = s;
    if (!s) {
      error.value = `Assignment "${slug}" not found.`;
      return;
    }
    if (enrollments.length === 0) {
      error.value = 'You are not enrolled in any active course.';
      return;
    }
    enrollment.value = enrollments[0];
    const enrollmentId =
      enrollment.value.id ?? `${enrollment.value.studentId}_${enrollment.value.cohortId}`;
    previousSubmissions.value = await SubmissionService.getSubmissionsForEnrollmentAndAssignment(
      enrollmentId,
      slug,
    );
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load assignment.';
  } finally {
    loading.value = false;
  }
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  if (f.size > maxBytes.value) {
    error.value = `File exceeds the ${spec.value?.maxFileSizeMb ?? 10} MB limit.`;
    input.value = '';
    return;
  }
  error.value = null;
  file.value = f;
}

async function handleSubmit() {
  if (!canSubmit.value || !enrollment.value || !spec.value || !user.value) return;
  submitting.value = true;
  error.value = null;
  try {
    const enrollmentId =
      enrollment.value.id ?? `${enrollment.value.studentId}_${enrollment.value.cohortId}`;

    let fileUrl: string | undefined;
    let fileName: string | undefined;
    if (file.value) {
      const safeName = file.value.name.replace(/[^A-Za-z0-9_.-]/g, '_');
      const path = `submissions/${user.value.uid}/${enrollmentId}/${Date.now()}-${safeName}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, file.value);
      fileUrl = await getDownloadURL(r);
      fileName = file.value.name;
    }

    const result = await submitAssignment({
      enrollmentId,
      assignmentSlug: spec.value.slug,
      textContent: text.value.trim() || undefined,
      fileUrl,
      fileName,
      linkUrl: linkUrl.value.trim() || undefined,
    });

    router.push({ name: 'learn-submission', params: { id: result.submissionId } });
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Submission failed.';
  } finally {
    submitting.value = false;
  }
}

function fmtDate(value: unknown) {
  return new Date(toMillis(value)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

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
        <Eyebrow class="text-brand-violet mb-2 block">Assignment</Eyebrow>
        <Heading v-if="spec" :level="1" class="mb-2">{{ spec.title }}</Heading>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="max-w-3xl flex flex-col gap-6">
        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon icon="lucide:loader-2" width="24" class="animate-spin text-brand-violet mx-auto" />
        </UiCard>

        <UiCard v-else-if="error && !spec" class="p-6 bg-surface">
          <Body class="text-red-700 text-sm">{{ error }}</Body>
        </UiCard>

        <template v-else-if="spec">
          <!-- Instructions -->
          <UiCard class="p-6 md:p-10 bg-surface">
            <Eyebrow class="text-ink/50 mb-3 block">Instructions</Eyebrow>
            <RichText :body="spec.instructions" />
          </UiCard>

          <!-- Previous submissions -->
          <UiCard v-if="previousSubmissions.length > 0" class="p-5 bg-surface">
            <Eyebrow class="text-ink/50 mb-2 block">Your previous submissions</Eyebrow>
            <ul class="divide-y divide-ink/5">
              <li v-for="s in previousSubmissions" :key="s.id">
                <RouterLink
                  :to="{ name: 'learn-submission', params: { id: s.id } }"
                  class="flex items-center gap-3 py-3 hover:bg-ink/[0.02] -mx-2 px-2 rounded"
                >
                  <Icon icon="lucide:file-check-2" width="16" class="text-ink/40" />
                  <div class="flex-1 text-sm">
                    <span class="text-ink">Submitted {{ fmtDate(s.submittedAt) }}</span>
                    <span
                      class="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize"
                      :class="
                        s.status === 'graded'
                          ? 'bg-emerald-50 text-emerald-700'
                          : s.status === 'returned'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-ink/5 text-ink/60'
                      "
                    >
                      {{ s.status }}
                    </span>
                  </div>
                  <Icon icon="lucide:chevron-right" width="14" class="text-ink/30" />
                </RouterLink>
              </li>
            </ul>
          </UiCard>

          <!-- Submit form -->
          <UiCard class="p-6 md:p-10 bg-surface">
            <Heading :level="2" class="text-lg mb-4">Submit</Heading>
            <div class="flex flex-col gap-5">
              <div v-if="allowsText" class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                  Written response
                </label>
                <textarea
                  v-model="text"
                  rows="6"
                  placeholder="Type your response here…"
                  class="w-full px-4 py-3 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet resize-none"
                />
              </div>

              <div v-if="allowsFile" class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                  File
                </label>
                <input type="file" :accept="accepts" class="block text-sm" @change="onFileChange" />
                <p class="text-xs text-ink/50">
                  Max {{ spec.maxFileSizeMb ?? 10 }} MB
                  <template v-if="spec.acceptedFileTypes && spec.acceptedFileTypes.length">
                    | accepts {{ spec.acceptedFileTypes.join(', ') }}
                  </template>
                </p>
                <p v-if="file" class="text-xs text-ink/70">Selected: {{ file.name }}</p>
              </div>

              <div v-if="allowsLink" class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                  Link
                </label>
                <input
                  v-model="linkUrl"
                  type="url"
                  placeholder="https://…"
                  class="w-full px-4 py-2.5 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet"
                />
              </div>

              <p v-if="error" class="text-sm text-red-700">{{ error }}</p>

              <UiButton variant="primary" :disabled="!canSubmit" @click="handleSubmit">
                <Icon v-if="submitting" icon="lucide:loader-2" width="14" class="animate-spin" />
                <Icon v-else icon="lucide:upload" width="14" />
                {{ submitting ? 'Submitting…' : 'Submit assignment' }}
              </UiButton>
            </div>
          </UiCard>
        </template>
      </Container>
    </Section>
  </div>
</template>
