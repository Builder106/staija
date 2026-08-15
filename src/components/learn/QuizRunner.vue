<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref } from 'vue';
import { QuizService, submitQuiz, type QuizSubmitResult } from '../../services/learn';
import type { CmsQuiz, QuizAttempt } from '../../services/types';
import UiButton from '../ui/UiButton.vue';
import UiCard from '../ui/UiCard.vue';

const props = defineProps<{
  quizId: string;
  lessonSlug: string;
  enrollmentId: string;
  moduleSlug?: string;
}>();

const emit = defineEmits<{
  (e: 'passed', score: number): void;
}>();

const loading = ref(true);
const submitting = ref(false);
const error = ref<string | null>(null);
const quiz = ref<CmsQuiz | null>(null);
const attempts = ref<QuizAttempt[]>([]);
const userAnswers = ref<Record<string, string>>({});
const result = ref<QuizSubmitResult | null>(null);

const bestAttempt = computed(() => {
  if (attempts.value.length === 0) return null;
  return [...attempts.value].sort((a, b) => b.score - a.score)[0];
});

const hasPassed = computed(() => {
  return result.value?.passed || attempts.value.some(a => a.passed);
});

const isCompleteAnswers = computed(() => {
  if (!quiz.value?.questions) return false;
  return quiz.value.questions.every(q => !!userAnswers.value[q.id]);
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [fetchedQuiz, fetchedAttempts] = await Promise.all([
      QuizService.getQuizById(props.quizId).then(async q => {
        if (q) return q;
        return QuizService.getQuizBySlug(props.quizId);
      }),
      QuizService.getAttemptsForStudent(props.enrollmentId, props.lessonSlug),
    ]);
    quiz.value = fetchedQuiz;
    attempts.value = fetchedAttempts;
    if (fetchedAttempts.some(a => a.passed)) {
      const highest = [...fetchedAttempts].sort((a, b) => b.score - a.score)[0];
      emit('passed', highest.score);
    }
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load quiz.';
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  if (!isCompleteAnswers.value || submitting.value) return;
  submitting.value = true;
  error.value = null;
  try {
    const res = await submitQuiz({
      enrollmentId: props.enrollmentId,
      quizId: props.quizId,
      lessonSlug: props.lessonSlug,
      moduleSlug: props.moduleSlug,
      answers: userAnswers.value,
    });
    result.value = res;
    if (res.passed) {
      emit('passed', res.score);
    }
    // Refresh attempt history
    attempts.value = await QuizService.getAttemptsForStudent(props.enrollmentId, props.lessonSlug);
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Quiz submission failed.';
  } finally {
    submitting.value = false;
  }
}

function resetQuiz() {
  result.value = null;
  userAnswers.value = {};
  error.value = null;
}

onMounted(load);
</script>

<template>
  <UiCard class="p-6 md:p-8 bg-surface flex flex-col gap-6">
    <div v-if="loading" class="p-8 text-center text-ink/50 flex items-center justify-center gap-2">
      <Icon icon="lucide:loader-2" width="20" class="animate-spin text-accent" />
      <span>Loading assessment...</span>
    </div>

    <div
      v-else-if="error"
      class="p-4 bg-red-50 text-red-800 rounded-lg text-sm flex items-center gap-2"
    >
      <Icon icon="lucide:alert-triangle" width="18" />
      <span>{{ error }}</span>
    </div>

    <div v-else-if="!quiz" class="p-8 text-center text-ink/50">
      Quiz details could not be found.
    </div>

    <template v-else>
      <!-- Quiz Header & Meta -->
      <div
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-ink/10"
      >
        <div>
          <span class="text-xs font-bold text-accent uppercase tracking-wider block mb-1"
            >Knowledge Check</span
          >
          <h3 class="text-xl font-bold text-ink">{{ quiz.title }}</h3>
          <p v-if="quiz.summary" class="text-sm text-ink/70 mt-1">{{ quiz.summary }}</p>
        </div>
        <div class="flex flex-col sm:items-end gap-1.5 shrink-0">
          <span
            v-if="hasPassed"
            class="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 inline-flex items-center gap-1.5"
          >
            <Icon icon="lucide:check-circle-2" width="14" /> Passed
          </span>
          <span class="text-xs font-medium text-ink/60">
            Required score: {{ quiz.passThresholdPercent ?? 70 }}%
          </span>
          <span v-if="bestAttempt" class="text-xs text-ink/50">
            Best score: {{ bestAttempt.score }}% ({{ attempts.length }}
            {{ attempts.length === 1 ? 'attempt' : 'attempts' }})
          </span>
        </div>
      </div>

      <!-- Result Banner (shown after submission) -->
      <div
        v-if="result"
        class="p-5 rounded-xl flex flex-col gap-3"
        :class="
          result.passed
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
            : 'bg-rose-50 border border-rose-200 text-rose-900'
        "
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Icon :icon="result.passed ? 'lucide:award' : 'lucide:alert-circle'" width="22" />
            <h4 class="text-base font-bold">
              {{ result.passed ? 'Quiz Passed!' : 'Pass Threshold Not Met' }}
            </h4>
          </div>
          <span class="text-lg font-black">{{ result.score }}%</span>
        </div>
        <p class="text-sm">
          You answered
          <strong>{{ result.correctCount }} of {{ result.totalQuestions }}</strong> questions
          correctly.
          <span v-if="!result.passed">
            Minimum score needed to pass is {{ result.passThresholdPercent }}%. You may retry.</span
          >
        </p>
        <div v-if="!result.passed" class="pt-2">
          <UiButton variant="secondary" size="sm" @click="resetQuiz">
            <Icon icon="lucide:rotate-ccw" width="14" class="mr-1" /> Retake Quiz
          </UiButton>
        </div>
      </div>

      <!-- Question List -->
      <div class="flex flex-col gap-8">
        <div
          v-for="(q, qIndex) in quiz.questions"
          :key="q.id"
          class="flex flex-col gap-3 pb-6 border-b border-ink/10 last:border-b-0"
        >
          <div class="flex items-start gap-2">
            <span class="text-sm font-bold text-accent shrink-0">{{ qIndex + 1 }}.</span>
            <span class="text-base font-semibold text-ink">{{ q.questionText }}</span>
          </div>

          <div class="flex flex-col gap-2 pl-6">
            <label
              v-for="opt in q.options"
              :key="opt.id"
              class="flex items-center gap-3 p-3 rounded-lg border text-sm cursor-pointer transition-colors"
              :class="[
                userAnswers[q.id] === opt.id
                  ? 'border-accent bg-accent/5 text-ink font-medium'
                  : 'border-ink/15 hover:border-ink/30 bg-background text-ink/80',
                result && result.questionFeedback[q.id]?.correctOptionId === opt.id
                  ? '!border-emerald-500 !bg-emerald-50/50 !text-emerald-900 font-semibold'
                  : '',
                result && userAnswers[q.id] === opt.id && !result.questionFeedback[q.id]?.correct
                  ? '!border-rose-400 !bg-rose-50/50 !text-rose-900'
                  : '',
              ]"
            >
              <input
                type="radio"
                :name="`q_${q.id}`"
                :value="opt.id"
                :disabled="!!result"
                :checked="userAnswers[q.id] === opt.id"
                class="accent-accent w-4 h-4 cursor-pointer"
                @change="userAnswers[q.id] = opt.id"
              />
              <span class="flex-1">{{ opt.text }}</span>
              <template v-if="result">
                <Icon
                  v-if="result.questionFeedback[q.id]?.correctOptionId === opt.id"
                  icon="lucide:check-circle"
                  width="16"
                  class="text-emerald-600"
                />
                <Icon
                  v-else-if="
                    userAnswers[q.id] === opt.id && !result.questionFeedback[q.id]?.correct
                  "
                  icon="lucide:x-circle"
                  width="16"
                  class="text-rose-600"
                />
              </template>
            </label>
          </div>

          <!-- Explanation readout after attempt -->
          <div
            v-if="result && result.questionFeedback[q.id]?.explanation"
            class="ml-6 p-3 rounded-lg bg-paper text-xs text-ink/70 border border-ink/10 flex items-start gap-2"
          >
            <Icon icon="lucide:info" width="14" class="text-accent shrink-0 mt-0.5" />
            <span>{{ result.questionFeedback[q.id].explanation }}</span>
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div v-if="!result" class="pt-4 flex items-center justify-between">
        <span class="text-xs text-ink/60">
          {{ Object.keys(userAnswers).length }} of {{ quiz.questions.length }} answered
        </span>
        <UiButton
          variant="primary"
          :disabled="!isCompleteAnswers || submitting"
          @click="handleSubmit"
        >
          <Icon v-if="submitting" icon="lucide:loader-2" width="16" class="animate-spin mr-1" />
          <span>{{ submitting ? 'Grading...' : 'Submit Answers' }}</span>
        </UiButton>
      </div>
    </template>
  </UiCard>
</template>
