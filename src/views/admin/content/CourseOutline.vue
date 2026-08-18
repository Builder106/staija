<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import Body from '../../../components/ui/Body.vue';
import Container from '../../../components/ui/Container.vue';
import Eyebrow from '../../../components/ui/Eyebrow.vue';
import Heading from '../../../components/ui/Heading.vue';
import Section from '../../../components/ui/Section.vue';
import UiButton from '../../../components/ui/UiButton.vue';
import UiCard from '../../../components/ui/UiCard.vue';
import UiSelect from '../../../components/ui/UiSelect.vue';
import { useAdminBase } from '../../../composables/useAdminBase';
import {
  outlineCourse,
  type OutlineCoursePayload,
  type OutlineCourseResult,
} from '../../../services/ai';

// Form state. Defaults are tuned for a "typical" first run — staff can
// tweak before generating. Audience and version are optional; the
// callable substitutes sensible defaults when they're empty.
const topic = ref('');
const program = ref<'stepup_scholars' | 'dynamerge'>('stepup_scholars');
const weeks = ref(4);
const lessonsPerModule = ref(3);
const audience = ref('');
const version = ref('');

const loading = ref(false);
const error = ref<string | null>(null);
const result = ref<OutlineCourseResult | null>(null);

const router = useRouter();
const { adminBase } = useAdminBase();

const canSubmit = computed(
  () =>
    !loading.value &&
    topic.value.trim().length >= 5 &&
    weeks.value >= 1 &&
    weeks.value <= 16 &&
    lessonsPerModule.value >= 1 &&
    lessonsPerModule.value <= 10,
);

async function handleSubmit() {
  if (!canSubmit.value) return;
  error.value = null;
  result.value = null;
  loading.value = true;
  try {
    const payload: OutlineCoursePayload = {
      topic: topic.value.trim(),
      program: program.value,
      weeks: weeks.value,
      lessonsPerModule: lessonsPerModule.value,
    };
    if (audience.value.trim()) payload.audience = audience.value.trim();
    if (version.value.trim()) payload.version = version.value.trim();
    result.value = await outlineCourse(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Generation failed.';
    error.value = msg;
  } finally {
    loading.value = false;
  }
}

function openCourseEditor() {
  if (!result.value) return;
  router.push(`${adminBase.value}/content/courses/${result.value.courseId}`);
}
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-12 !pb-8 wash-violet-6 border-b hairline-ink">
      <Container class="max-w-3xl">
        <RouterLink
          :to="`${adminBase}/content`"
          class="inline-flex items-center gap-1.5 text-sm font-semibold text-ink/60 hover:text-brand-violet transition-colors mb-6 focus-ring-brand rounded-sm"
        >
          <Icon icon="lucide:arrow-left" width="14" /> Course content
        </RouterLink>
        <Eyebrow class="text-brand-violet mb-3 block">AI assist</Eyebrow>
        <Heading :level="1" class="mb-3">Outline a course.</Heading>
        <Body class="text-ink/70 max-w-2xl">
          Sketch a topic and audience; we'll draft a full course tree — modules, lessons, and
          per-module assignments — as Contentful drafts you can rewrite and publish. Treat the
          output as a scaffold, not finished curriculum.
        </Body>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="max-w-3xl">
        <UiCard class="p-6 md:p-8 bg-surface">
          <form class="flex flex-col gap-6" @submit.prevent="handleSubmit">
            <div class="flex flex-col gap-2">
              <label for="topic" class="text-sm font-semibold text-ink/80">Topic</label>
              <textarea
                id="topic"
                v-model="topic"
                required
                minlength="5"
                rows="3"
                class="w-full min-w-0 border hairline-ink rounded-xl px-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-paper resize-y"
                placeholder="e.g. Introduction to molecular biology, hands-on lab work and a literature review."
              />
              <p class="text-xs text-ink/50 m-0">
                A sentence or two describing what the course is about.
              </p>
            </div>

            <div class="grid sm:grid-cols-2 gap-4">
              <div class="flex flex-col gap-2 min-w-0">
                <label for="program" class="text-sm font-semibold text-ink/80">Program</label>
                <UiSelect
                  id="program"
                  v-model="program"
                  :options="[
                    { value: 'stepup_scholars', label: 'StepUp Scholars' },
                    { value: 'dynamerge', label: 'Dynamerge' },
                  ]"
                />
              </div>

              <div class="flex flex-col gap-2 min-w-0">
                <label for="version" class="text-sm font-semibold text-ink/80"
                  >Version (optional)</label
                >
                <input
                  id="version"
                  v-model="version"
                  type="text"
                  class="w-full min-w-0 border hairline-ink rounded-xl px-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-paper"
                  placeholder="e.g. 2026-spring"
                />
              </div>

              <div class="flex flex-col gap-2 min-w-0">
                <label for="weeks" class="text-sm font-semibold text-ink/80"
                  >Modules (1 per week)</label
                >
                <input
                  id="weeks"
                  v-model.number="weeks"
                  type="number"
                  min="1"
                  max="16"
                  required
                  class="w-full min-w-0 border hairline-ink rounded-xl px-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-paper"
                />
              </div>

              <div class="flex flex-col gap-2 min-w-0">
                <label for="lpm" class="text-sm font-semibold text-ink/80"
                  >Lessons per module</label
                >
                <input
                  id="lpm"
                  v-model.number="lessonsPerModule"
                  type="number"
                  min="1"
                  max="10"
                  required
                  class="w-full min-w-0 border hairline-ink rounded-xl px-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-paper"
                />
              </div>
            </div>

            <div class="flex flex-col gap-2 min-w-0">
              <label for="audience" class="text-sm font-semibold text-ink/80"
                >Audience (optional)</label
              >
              <input
                id="audience"
                v-model="audience"
                type="text"
                class="w-full min-w-0 border hairline-ink rounded-xl px-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-paper"
                placeholder="Defaults to high-school + gap-year students across Africa, ages 15–19."
              />
            </div>

            <div
              v-if="error"
              role="alert"
              class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
            >
              {{ error }}
            </div>

            <div class="flex items-center gap-3">
              <UiButton
                variant="primary"
                type="submit"
                class="!h-12 text-base"
                :disabled="!canSubmit"
              >
                <span class="flex items-center gap-2">
                  <Icon
                    :icon="loading ? 'lucide:loader-2' : 'lucide:wand-2'"
                    width="16"
                    :class="loading ? 'animate-spin' : ''"
                  />
                  {{ loading ? 'Generating…' : 'Generate outline' }}
                </span>
              </UiButton>
              <span v-if="loading" class="text-sm text-ink/60">
                Drafting course → modules → lessons. Usually 15–30 seconds.
              </span>
            </div>
          </form>
        </UiCard>

        <UiCard v-if="result" class="mt-6 p-6 md:p-8 bg-surface border-brand-violet/30">
          <div class="flex items-start gap-4">
            <div
              class="w-10 h-10 rounded-xl bg-brand-violet/10 flex items-center justify-center shrink-0"
            >
              <Icon icon="lucide:check-circle-2" width="20" class="text-brand-violet" />
            </div>
            <div class="flex flex-col gap-2 flex-1 min-w-0">
              <Heading :level="3" class="!text-xl">Draft created.</Heading>
              <Body class="text-ink/70">
                <strong class="text-ink">{{ result.title }}</strong> —
                {{ result.moduleCount }} modules, {{ result.lessonCount }} lessons,
                {{ result.assignmentCount }} assignments. Saved as drafts in Contentful; nothing is
                published yet.
              </Body>
              <div class="flex gap-3 mt-2">
                <UiButton variant="primary" @click="openCourseEditor">
                  <span class="flex items-center gap-2">
                    Open course editor <Icon icon="lucide:arrow-right" width="16" />
                  </span>
                </UiButton>
                <UiButton variant="secondary" @click="result = null"> Outline another </UiButton>
              </div>
            </div>
          </div>
        </UiCard>
      </Container>
    </Section>
  </div>
</template>
