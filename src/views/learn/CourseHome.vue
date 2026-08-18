<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiCard from '../../components/ui/UiCard.vue';
import { useAuth } from '../../composables/useAuth';
import {
  CohortService,
  CourseService,
  EnrollmentService,
  ProgressService,
  SessionService,
  completionFraction,
  toMillis,
} from '../../services/learn';
import type {
  CmsCourse,
  CmsLesson,
  CmsModule,
  Cohort,
  Enrollment,
  LessonProgress,
  LiveSession,
} from '../../services/types';

const { user } = useAuth();

const loading = ref(true);
const error = ref<string | null>(null);
const course = ref<CmsCourse | null>(null);
const cohort = ref<Cohort | null>(null);
const enrollment = ref<Enrollment | null>(null);
const modules = ref<{ module: CmsModule; lessons: CmsLesson[] }[]>([]);
const progress = ref<LessonProgress[]>([]);
const upcoming = ref<LiveSession[]>([]);

let progressUnsub: (() => void) | null = null;

const totalLessons = computed(() => modules.value.reduce((acc, m) => acc + m.lessons.length, 0));
const fraction = computed(() => completionFraction(progress.value, totalLessons.value));
const completedSlugs = computed(
  () => new Set(progress.value.filter((p) => p.status === 'completed').map((p) => p.lessonSlug)),
);

function lessonStatus(lesson: CmsLesson) {
  return completedSlugs.value.has(lesson.slug) ? 'completed' : 'pending';
}

async function load() {
  if (!user.value) return;
  loading.value = true;
  error.value = null;
  try {
    // Active enrollment for the signed-in student. Phase 1 assumes one
    // active enrollment at a time; if more, pick the first.
    const enrollments = await EnrollmentService.getActiveForStudent(user.value.uid);
    if (enrollments.length === 0) {
      error.value = 'You are not enrolled in any active course yet.';
      loading.value = false;
      return;
    }
    enrollment.value = enrollments[0];

    const [c, co] = await Promise.all([
      CourseService.getCourseBySlug(enrollment.value.courseSlug),
      CohortService.getCohort(enrollment.value.cohortId),
    ]);
    course.value = c;
    cohort.value = co;

    if (!c) {
      error.value = `Course "${enrollment.value.courseSlug}" hasn't been mirrored from Contentful yet.`;
      loading.value = false;
      return;
    }

    const mods = await CourseService.getModulesForCourse(c);
    const hydrated = await Promise.all(
      mods.map(async (m) => ({ module: m, lessons: await CourseService.getLessonsForModule(m) })),
    );
    modules.value = hydrated;

    if (cohort.value) {
      upcoming.value = await SessionService.upcomingForCohort(cohort.value.id ?? '', 3);
    }

    progressUnsub = ProgressService.subscribeProgressForEnrollment(
      enrollment.value.id ?? `${enrollment.value.studentId}_${enrollment.value.cohortId}`,
      (p) => (progress.value = p),
    );
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load course.';
  } finally {
    loading.value = false;
  }
}

function fmtSession(s: LiveSession) {
  const ms = toMillis(s.startsAt);
  return new Date(ms).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

onMounted(load);
onUnmounted(() => {
  if (progressUnsub) progressUnsub();
});
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-12 !pb-8 wash-violet-6 border-b hairline-ink">
      <Container>
        <Eyebrow class="text-brand-violet mb-3 block">Your course</Eyebrow>
        <template v-if="course">
          <Heading :level="1" class="mb-3">{{ course.title }}</Heading>
          <Body class="text-ink/70 max-w-2xl">{{ course.summary }}</Body>
        </template>
        <template v-else-if="loading">
          <Heading :level="1" class="mb-3">Loading…</Heading>
        </template>
        <template v-else>
          <Heading :level="1" class="mb-3">No course yet</Heading>
        </template>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="flex flex-col gap-8">
        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon
            icon="lucide:loader-2"
            width="24"
            class="animate-spin text-brand-violet mx-auto mb-3"
          />
          <Body class="text-ink/60 text-sm">Loading course…</Body>
        </UiCard>

        <UiCard v-else-if="error" class="p-6 bg-surface">
          <div class="flex items-start gap-3">
            <Icon icon="lucide:info" width="20" class="text-ink/40 mt-0.5" />
            <Body class="text-ink/70 text-sm">{{ error }}</Body>
          </div>
        </UiCard>

        <template v-else-if="course">
          <!-- Progress -->
          <UiCard class="p-6 md:p-8 bg-surface">
            <div class="flex items-baseline justify-between mb-3">
              <Heading :level="2" class="text-lg">Progress</Heading>
              <span class="text-sm font-semibold text-ink">{{ Math.round(fraction * 100) }}%</span>
            </div>
            <div class="w-full h-2 bg-ink/5 rounded-full overflow-hidden">
              <div
                class="h-full bg-brand-violet transition-all"
                :style="{ width: `${fraction * 100}%` }"
              ></div>
            </div>
            <p class="text-xs text-ink/50 mt-2">
              {{ completedSlugs.size }} of {{ totalLessons }} lessons complete
            </p>
          </UiCard>

          <!-- Upcoming session -->
          <UiCard v-if="upcoming.length > 0" class="p-6 md:p-8 bg-surface">
            <Eyebrow class="text-brand-violet mb-2 block">Upcoming session</Eyebrow>
            <RouterLink
              :to="{ name: 'learn-session', params: { id: upcoming[0].id } }"
              class="flex items-start justify-between gap-4 hover:bg-ink/[0.02] -m-2 p-2 rounded-md transition-colors"
            >
              <div>
                <div class="font-medium text-ink">{{ upcoming[0].title }}</div>
                <div class="text-sm text-ink/60 mt-0.5">{{ fmtSession(upcoming[0]) }}</div>
              </div>
              <Icon icon="lucide:chevron-right" width="20" class="text-ink/40 mt-1" />
            </RouterLink>
            <RouterLink
              :to="{ name: 'learn-sessions' }"
              class="text-xs text-brand-violet hover:underline mt-3 inline-block"
            >
              See all sessions →
            </RouterLink>
          </UiCard>

          <!-- Modules + lessons -->
          <div class="flex flex-col gap-6">
            <div v-for="(m, idx) in modules" :key="m.module.slug">
              <Eyebrow class="text-ink/50 mb-2 block">Module {{ idx + 1 }}</Eyebrow>
              <Heading :level="2" class="text-xl mb-1">{{ m.module.title }}</Heading>
              <Body v-if="m.module.summary" class="text-ink/70 text-sm mb-4">
                {{ m.module.summary }}
              </Body>
              <UiCard class="p-0 bg-surface overflow-hidden">
                <ul class="divide-y divide-ink/5">
                  <li v-for="lesson in m.lessons" :key="lesson.slug">
                    <RouterLink
                      :to="{ name: 'learn-lesson', params: { slug: lesson.slug } }"
                      class="flex items-center gap-3 px-5 py-3.5 hover:bg-ink/[0.02] transition-colors"
                    >
                      <Icon
                        :icon="
                          lessonStatus(lesson) === 'completed'
                            ? 'lucide:check-circle-2'
                            : 'lucide:circle'
                        "
                        width="18"
                        :class="
                          lessonStatus(lesson) === 'completed' ? 'text-emerald-600' : 'text-ink/30'
                        "
                      />
                      <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium text-ink truncate">{{ lesson.title }}</div>
                        <div v-if="lesson.estimatedMinutes" class="text-xs text-ink/50">
                          {{ lesson.estimatedMinutes }} min
                        </div>
                      </div>
                      <Icon icon="lucide:chevron-right" width="16" class="text-ink/30" />
                    </RouterLink>
                  </li>
                  <li v-if="m.lessons.length === 0" class="px-5 py-4 text-sm text-ink/50">
                    No lessons in this module yet.
                  </li>
                </ul>
              </UiCard>
            </div>
          </div>
        </template>
      </Container>
    </Section>
  </div>
</template>
