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
import { CourseService } from '../../services/learn';
import type { CmsAssignmentSpec, CmsLesson, CmsModule } from '../../services/types';

const route = useRoute();

const loading = ref(true);
const module = ref<CmsModule | null>(null);
const lessons = ref<CmsLesson[]>([]);
const assignments = ref<CmsAssignmentSpec[]>([]);

async function load() {
  loading.value = true;
  const slug = route.params.slug as string;
  const m = await CourseService.getModuleBySlug(slug);
  module.value = m;
  if (m) {
    lessons.value = await CourseService.getLessonsForModule(m);
    assignments.value = await CourseService.getAssignmentsForModule(m);
  }
  loading.value = false;
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-12 !pb-8 wash-violet-6 border-b hairline-ink">
      <Container>
        <RouterLink
          to="/learn"
          class="text-xs text-ink/60 hover:text-ink mb-4 inline-flex items-center gap-1"
        >
          <Icon icon="lucide:arrow-left" width="12" /> Back to course
        </RouterLink>
        <Eyebrow class="text-brand-violet mb-3 block">Module</Eyebrow>
        <Heading v-if="module" :level="1" class="mb-3">{{ module.title }}</Heading>
        <Body v-if="module?.summary" class="text-ink/70 max-w-2xl">{{ module.summary }}</Body>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="flex flex-col gap-6">
        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon icon="lucide:loader-2" width="24" class="animate-spin text-brand-violet mx-auto" />
        </UiCard>

        <template v-else-if="module">
          <UiCard class="p-0 bg-surface overflow-hidden">
            <Eyebrow class="text-ink/50 px-5 pt-5 pb-2 block">Lessons</Eyebrow>
            <ul class="divide-y divide-ink/5">
              <li v-for="lesson in lessons" :key="lesson.slug">
                <RouterLink
                  :to="{ name: 'learn-lesson', params: { slug: lesson.slug } }"
                  class="flex items-center gap-3 px-5 py-3.5 hover:bg-ink/[0.02]"
                >
                  <Icon icon="lucide:play-circle" width="18" class="text-ink/50" />
                  <div class="flex-1">
                    <div class="text-sm font-medium text-ink">{{ lesson.title }}</div>
                    <div v-if="lesson.estimatedMinutes" class="text-xs text-ink/50">
                      {{ lesson.estimatedMinutes }} min
                    </div>
                  </div>
                  <Icon icon="lucide:chevron-right" width="16" class="text-ink/30" />
                </RouterLink>
              </li>
              <li v-if="lessons.length === 0" class="px-5 py-4 text-sm text-ink/50">
                No lessons in this module.
              </li>
            </ul>
          </UiCard>

          <UiCard v-if="assignments.length > 0" class="p-0 bg-surface overflow-hidden">
            <Eyebrow class="text-ink/50 px-5 pt-5 pb-2 block">Assignments</Eyebrow>
            <ul class="divide-y divide-ink/5">
              <li v-for="a in assignments" :key="a.slug">
                <RouterLink
                  :to="{ name: 'learn-assignment', params: { slug: a.slug } }"
                  class="flex items-center gap-3 px-5 py-3.5 hover:bg-ink/[0.02]"
                >
                  <Icon icon="lucide:file-edit" width="18" class="text-ink/50" />
                  <div class="flex-1">
                    <div class="text-sm font-medium text-ink">{{ a.title }}</div>
                    <div class="text-xs text-ink/50 capitalize">
                      {{ a.submissionType.replace('_', ' / ') }}
                    </div>
                  </div>
                  <Icon icon="lucide:chevron-right" width="16" class="text-ink/30" />
                </RouterLink>
              </li>
            </ul>
          </UiCard>
        </template>
      </Container>
    </Section>
  </div>
</template>
