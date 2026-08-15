<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useAdminBase } from '../../composables/useAdminBase';
import { listEntries, type LmsContentType } from '../../services/lmsContent';

// `newPath` is stored as a suffix relative to the admin/staff base
// (e.g. `/content/lessons/new`) so the template can prepend whichever
// prefix the current visitor is on. Avoids the onboarding card
// pivoting URLs from /staff/* to /admin/* mid-flow.
interface Step {
  key: LmsContentType;
  number: number;
  title: string;
  why: string;
  newPath: string;
  ctaLabel: string;
}

const STEPS: Step[] = [
  {
    key: 'lesson',
    number: 1,
    title: 'Write your first lesson',
    why: 'Lessons are the smallest unit — a body of rich text, a video, attachments. Authoring bottom-up means you start here.',
    newPath: '/content/lessons/new',
    ctaLabel: 'New lesson',
  },
  {
    key: 'assignmentSpec',
    number: 2,
    title: 'Add an assignment prompt',
    why: 'Assignments are the prompts students submit against. Define what type of submission you accept (text, file, link).',
    newPath: '/content/assignments/new',
    ctaLabel: 'New assignment',
  },
  {
    key: 'module',
    number: 3,
    title: 'Bundle them into a module',
    why: 'Modules group lessons + assignments and decide whether students move through them in order or jump around.',
    newPath: '/content/modules/new',
    ctaLabel: 'New module',
  },
  {
    key: 'course',
    number: 4,
    title: 'Wrap modules into a course',
    why: "Courses are the top level — pin a version (e.g. 2026-summer), choose a program, and the modules you've built fall into place.",
    newPath: '/content/courses/new',
    ctaLabel: 'New course',
  },
];

const { adminBase } = useAdminBase();

const DISMISS_KEY = 'staija:lms-onboarding-dismissed';

const counts = ref<Record<LmsContentType, number | null>>({
  course: null,
  module: null,
  lesson: null,
  assignmentSpec: null,
  quiz: null,
});
const loading = ref(true);
const dismissed = ref(false);

onMounted(async () => {
  // Read dismissal flag synchronously so the card doesn't flash in
  // for users who already hid it before counts come back.
  try {
    dismissed.value = localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    /* localStorage unavailable (private mode, SSR) — show the card */
  }
  if (dismissed.value) {
    loading.value = false;
    return;
  }
  await loadCounts();
});

async function loadCounts() {
  loading.value = true;
  try {
    // Limit=1 — we only care whether at least one exists per type, not
    // exact counts. Four parallel HEAD-like requests instead of a full
    // listing keeps the dashboard snappy.
    const types: LmsContentType[] = ['course', 'module', 'lesson', 'assignmentSpec'];
    const results = await Promise.all(types.map(t => listEntries(t, { limit: 1 }).catch(() => [])));
    types.forEach((t, i) => {
      counts.value[t] = results[i].length;
    });
  } finally {
    loading.value = false;
  }
}

const completedCount = computed(() => {
  return STEPS.filter(s => (counts.value[s.key] ?? 0) > 0).length;
});

const allDone = computed(() => completedCount.value === STEPS.length);

const nextStepKey = computed(() => {
  const next = STEPS.find(s => (counts.value[s.key] ?? 0) === 0);
  return next?.key ?? null;
});

// Hide once everything is done OR the editor has dismissed it.
// Stay hidden while counts are loading so the card doesn't flash in
// for the ~500ms–2s the Contentful query takes on populated workspaces
// (which is the common case once any content exists). On a brand-new
// workspace we accept a small pop-in once counts return — onboarding
// isn't time-sensitive on the first visit.
const visible = computed(() => {
  if (dismissed.value) return false;
  if (loading.value) return false;
  return !allDone.value;
});

function dismiss() {
  dismissed.value = true;
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* swallow — non-fatal, card just won't stay hidden across reloads */
  }
}

function isDone(step: Step) {
  return (counts.value[step.key] ?? 0) > 0;
}
</script>

<template>
  <div
    v-if="visible"
    class="rounded-2xl border hairline-ink bg-surface p-6 md:p-7 flex flex-col gap-5 shadow-sm"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="flex flex-col gap-1.5">
        <span
          class="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand-violet"
        >
          <Icon icon="lucide:sparkles" width="12" />
          Getting started
        </span>
        <h2 class="text-xl font-display font-semibold text-ink">
          Author your first course in four steps.
        </h2>
        <p class="text-sm text-ink/65 max-w-2xl leading-relaxed">
          STAIJA's LMS uses bottom-up authoring — small pieces first, then group them. Work through
          these in order and you'll have a publishable course by the end.
        </p>
      </div>
      <button
        type="button"
        class="text-xs text-ink/50 hover:text-ink underline-offset-2 hover:underline shrink-0"
        @click="dismiss"
      >
        Hide
      </button>
    </div>

    <!-- Progress bar — gives editors a sense of momentum once they
         start completing steps, even when they navigate away and come
         back. Real-counts driven, so it stays accurate. -->
    <div v-if="!loading" class="flex items-center gap-3">
      <div class="flex-1 h-1.5 rounded-full bg-ink/[0.06] overflow-hidden">
        <div
          class="h-full bg-gradient-brand transition-[width] duration-500"
          :style="{ width: `${(completedCount / STEPS.length) * 100}%` }"
        />
      </div>
      <span class="text-xs font-mono text-ink/60 tabular-nums shrink-0">
        {{ completedCount }} / {{ STEPS.length }}
      </span>
    </div>

    <ol class="flex flex-col gap-2.5">
      <li
        v-for="step in STEPS"
        :key="step.key"
        class="flex items-start gap-3 p-3.5 rounded-xl border transition-colors"
        :class="
          isDone(step)
            ? 'border-emerald-200/70 bg-emerald-50/40'
            : nextStepKey === step.key
              ? 'border-brand-violet/30 bg-brand-violet/[0.04]'
              : 'hairline-ink bg-paper/50'
        "
      >
        <div
          class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold mt-0.5"
          :class="
            isDone(step)
              ? 'bg-emerald-500 text-white'
              : nextStepKey === step.key
                ? 'bg-brand-violet text-white'
                : 'bg-ink/[0.06] text-ink/60'
          "
        >
          <Icon v-if="isDone(step)" icon="lucide:check" width="14" />
          <span v-else>{{ step.number }}</span>
        </div>
        <div class="flex flex-col gap-1 min-w-0 flex-1">
          <span
            class="text-sm font-semibold"
            :class="isDone(step) ? 'text-ink/55 line-through decoration-ink/25' : 'text-ink'"
          >
            {{ step.title }}
          </span>
          <span v-if="!isDone(step)" class="text-xs text-ink/60 leading-relaxed">
            {{ step.why }}
          </span>
        </div>
        <RouterLink
          v-if="!isDone(step)"
          :to="`${adminBase}${step.newPath}`"
          class="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors focus-ring-brand"
          :class="
            nextStepKey === step.key
              ? 'bg-brand-violet text-white hover:bg-[#9768FF]'
              : 'bg-ink/[0.04] text-ink hover:bg-ink/[0.08]'
          "
        >
          {{ step.ctaLabel }}
          <Icon icon="lucide:arrow-right" width="12" />
        </RouterLink>
      </li>
    </ol>
  </div>
</template>
