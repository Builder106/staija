<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import QuizRunner from '../../components/learn/QuizRunner.vue';
import RichText from '../../components/learn/RichText.vue';
import StaijaTutorDrawer from '../../components/learn/StaijaTutorDrawer.vue';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiCard from '../../components/ui/UiCard.vue';
import { useAuth } from '../../composables/useAuth';
import {
  CourseService,
  EnrollmentService,
  ProgressService,
  completeLesson,
} from '../../services/learn';
import type { CmsLesson, Enrollment, LessonProgress } from '../../services/types';

const route = useRoute();
const { user } = useAuth();

const loading = ref(true);
const error = ref<string | null>(null);
const lesson = ref<CmsLesson | null>(null);
const enrollment = ref<Enrollment | null>(null);
const progress = ref<LessonProgress[]>([]);
const marking = ref(false);
const tutorOpen = ref(false);

const lessonBodyPlain = computed(() => {
  if (!lesson.value?.body) return '';
  try {
    const doc = lesson.value.body as { content?: Array<{ content?: Array<{ value?: string }> }> };
    return (
      doc.content?.flatMap((c) => c.content?.map((inner) => inner.value || '') || []).join(' ') ||
      ''
    );
  } catch {
    return '';
  }
});

let progressUnsub: (() => void) | null = null;

const completed = computed(() =>
  progress.value.some((p) => p.lessonSlug === lesson.value?.slug && p.status === 'completed'),
);

const quizId = computed(() => {
  const refId = lesson.value?.quiz?.sys?.id;
  if (refId) return refId;
  if (lesson.value?.completionCriteria === 'quiz_passed') {
    return lesson.value?.slug;
  }
  return null;
});

// Convert YouTube/Vimeo URLs to embeddable form. The Contentful field is
// a plain URL field; we accept watch-page links and rewrite to the
// embed URL so a paste from the address bar works.
const embedUrl = computed(() => {
  const url = lesson.value?.videoUrl;
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.replace(/^\//, '');
      return `https://player.vimeo.com/video/${id}`;
    }
    return url;
  } catch {
    return url;
  }
});

async function load() {
  if (!user.value) return;
  loading.value = true;
  error.value = null;
  const slug = route.params.slug as string;
  try {
    const [l, enrollments] = await Promise.all([
      CourseService.getLessonBySlug(slug),
      EnrollmentService.getActiveForStudent(user.value.uid),
    ]);
    lesson.value = l;
    if (!l) error.value = `Lesson "${slug}" not found.`;
    if (enrollments.length === 0) {
      error.value = 'You are not enrolled in any active course.';
    } else {
      enrollment.value = enrollments[0];
      progressUnsub = ProgressService.subscribeProgressForEnrollment(
        enrollment.value.id ?? `${enrollment.value.studentId}_${enrollment.value.cohortId}`,
        (p) => (progress.value = p),
      );
    }
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load lesson.';
  } finally {
    loading.value = false;
  }
}

async function markComplete() {
  if (!enrollment.value || !lesson.value || marking.value || completed.value) return;
  marking.value = true;
  try {
    await completeLesson({
      enrollmentId:
        enrollment.value.id ?? `${enrollment.value.studentId}_${enrollment.value.cohortId}`,
      lessonSlug: lesson.value.slug,
    });
    // The onSnapshot listener will update progress automatically.
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Could not mark complete.';
  } finally {
    marking.value = false;
  }
}

watch(
  () => route.params.slug,
  () => load(),
);

onMounted(load);
onUnmounted(() => {
  if (progressUnsub) progressUnsub();
});
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-10 !pb-6 border-b hairline-ink">
      <Container>
        <RouterLink
          to="/learn"
          class="text-xs text-ink/60 hover:text-ink mb-3 inline-flex items-center gap-1"
        >
          <Icon icon="lucide:arrow-left" width="12" /> Back to course
        </RouterLink>
        <Eyebrow class="text-brand-violet mb-2 block">Lesson</Eyebrow>
        <Heading v-if="lesson" :level="1" class="mb-2">{{ lesson.title }}</Heading>
        <p v-if="lesson?.estimatedMinutes" class="text-sm text-ink/50">
          {{ lesson.estimatedMinutes }} min
        </p>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="max-w-3xl flex flex-col gap-8">
        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon icon="lucide:loader-2" width="24" class="animate-spin text-brand-violet mx-auto" />
        </UiCard>

        <UiCard v-else-if="error" class="p-6 bg-surface">
          <Body class="text-red-700 text-sm">{{ error }}</Body>
        </UiCard>

        <template v-else-if="lesson">
          <!-- Video -->
          <div v-if="embedUrl" class="aspect-video rounded-xl overflow-hidden bg-ink/5">
            <iframe
              :src="embedUrl"
              class="w-full h-full"
              allow="
                accelerometer;
                autoplay;
                clipboard-write;
                encrypted-media;
                gyroscope;
                picture-in-picture;
              "
              allowfullscreen
              loading="lazy"
            />
          </div>

          <!-- Body -->
          <UiCard class="p-6 md:p-10 bg-surface">
            <RichText :body="lesson.body" />
          </UiCard>

          <!-- Attachments -->
          <UiCard v-if="lesson.attachments && lesson.attachments.length > 0" class="p-5 bg-surface">
            <Eyebrow class="text-ink/50 mb-2 block">Attachments</Eyebrow>
            <ul class="flex flex-col gap-2">
              <li v-for="att in lesson.attachments" :key="att.url">
                <a
                  :href="att.url.startsWith('//') ? `https:${att.url}` : att.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-2 text-sm text-brand-violet hover:underline"
                >
                  <Icon icon="lucide:paperclip" width="14" />
                  {{ att.title || att.url.split('/').pop() }}
                </a>
              </li>
            </ul>
          </UiCard>

          <!-- Quiz assessment (if present) -->
          <QuizRunner
            v-if="quizId && enrollment"
            :quizId="quizId"
            :lessonSlug="lesson.slug"
            :enrollmentId="enrollment.id!"
            @passed="markComplete"
          />

          <!-- Completion and AI Tutor action bar -->
          <div class="flex items-center justify-between gap-4 flex-wrap pt-2">
            <div v-if="lesson.completionCriteria !== 'quiz_passed'" class="flex items-center gap-3">
              <UiButton
                v-if="!completed"
                variant="primary"
                :disabled="marking"
                @click="markComplete"
              >
                <Icon v-if="marking" icon="lucide:loader-2" width="14" class="animate-spin" />
                <Icon v-else icon="lucide:check" width="14" />
                {{ marking ? 'Marking…' : 'Mark complete' }}
              </UiButton>
              <span
                v-else
                class="inline-flex items-center gap-2 text-sm font-medium text-emerald-700"
              >
                <Icon icon="lucide:check-circle-2" width="16" />
                Completed
              </span>
            </div>

            <UiButton
              variant="secondary"
              class="!bg-brand-violet/10 !text-brand-violet hover:!bg-brand-violet/20 border border-brand-violet/30"
              @click="tutorOpen = true"
            >
              <Icon icon="lucide:bot" width="16" />
              Ask AI Tutor
            </UiButton>
          </div>

          <!-- StaijaTutorDrawer -->
          <StaijaTutorDrawer
            :open="tutorOpen"
            :lessonTitle="lesson.title"
            :lessonBodyPlain="lessonBodyPlain"
            @close="tutorOpen = false"
          />
        </template>
      </Container>
    </Section>
  </div>
</template>
