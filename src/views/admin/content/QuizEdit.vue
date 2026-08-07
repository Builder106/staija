<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { Icon } from '@iconify/vue'
import Container from '../../../components/ui/Container.vue'
import Section from '../../../components/ui/Section.vue'
import Heading from '../../../components/ui/Heading.vue'
import Eyebrow from '../../../components/ui/Eyebrow.vue'
import UiCard from '../../../components/ui/UiCard.vue'
import UiButton from '../../../components/ui/UiButton.vue'
import {
  getEntry,
  createEntry,
  updateEntry,
  publishEntry,
  normalizeSlug,
  type QuizFields,
} from '../../../services/lmsContent'
import { useFormDirty } from '../../../composables/useFormDirty'
import { useAdminBase } from '../../../composables/useAdminBase'

const route = useRoute()
const router = useRouter()
const { adminBase } = useAdminBase()

const isNew = computed(() => route.params.id === 'new' || !route.params.id)
const id = ref<string | null>(isNew.value ? null : (route.params.id as string))
const loading = ref(!isNew.value)
const saving = ref(false)
const publishing = ref(false)
const error = ref<string | null>(null)
const isPublished = ref(false)

const form = ref<QuizFields>({
  slug: '',
  title: '',
  summary: '',
  passThresholdPercent: 70,
  questions: [],
})
const { isDirty, markClean } = useFormDirty(form)

async function load() {
  if (!id.value) return
  loading.value = true
  try {
    const entry = await getEntry(id.value)
    isPublished.value = entry.isPublished
    const f = entry.fields
    form.value = {
      slug: (f.slug as string) ?? '',
      title: (f.title as string) ?? '',
      summary: (f.summary as string) ?? '',
      passThresholdPercent: (f.passThresholdPercent as number) ?? 70,
      questions: (f.questions as QuizFields['questions']) ?? [],
    }
    markClean()
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load quiz.'
  } finally {
    loading.value = false
  }
}

const canSave = computed(
  () => !!form.value.slug.trim() && !!form.value.title.trim() && !saving.value,
)

function addQuestion() {
  const qId = `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  const opt1Id = `opt_${Date.now()}_1`
  const opt2Id = `opt_${Date.now()}_2`
  form.value.questions.push({
    id: qId,
    questionText: '',
    options: [
      { id: opt1Id, text: '' },
      { id: opt2Id, text: '' },
    ],
    correctOptionId: opt1Id,
    explanation: '',
  })
}

function removeQuestion(index: number) {
  form.value.questions.splice(index, 1)
}

function addOption(qIndex: number) {
  const optId = `opt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  form.value.questions[qIndex].options.push({ id: optId, text: '' })
}

function removeOption(qIndex: number, optIndex: number) {
  const q = form.value.questions[qIndex]
  if (q.options.length <= 2) return
  const removedOpt = q.options.splice(optIndex, 1)[0]
  if (q.correctOptionId === removedOpt.id && q.options.length > 0) {
    q.correctOptionId = q.options[0].id
  }
}

function moveQuestion(index: number, direction: 'up' | 'down') {
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= form.value.questions.length) return
  const temp = form.value.questions[index]
  form.value.questions[index] = form.value.questions[targetIndex]
  form.value.questions[targetIndex] = temp
}

async function save() {
  if (!canSave.value) return
  saving.value = true
  error.value = null
  try {
    if (id.value) {
      await updateEntry(id.value, { type: 'quiz', fields: form.value })
    } else {
      const created = await createEntry({ type: 'quiz', fields: form.value })
      id.value = created.id
      router.replace({ path: `${adminBase.value}/content/quizzes/${created.id}` })
    }
    markClean()
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to save quiz.'
  } finally {
    saving.value = false
  }
}

async function publish() {
  if (!id.value) return
  publishing.value = true
  error.value = null
  try {
    if (isDirty.value) await save()
    await publishEntry(id.value)
    isPublished.value = true
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to publish quiz.'
  } finally {
    publishing.value = false
  }
}

onMounted(load)
</script>

<template>
  <Section class="py-6 md:py-10">
    <Container>
      <div class="max-w-4xl mx-auto flex flex-col gap-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <RouterLink
              :to="`${adminBase}/content?tab=quizzes`"
              class="text-xs font-semibold text-accent hover:underline inline-flex items-center gap-1 mb-2"
            >
              <Icon icon="lucide:arrow-left" width="14" /> Back to content
            </RouterLink>
            <Eyebrow>LMS Authoring</Eyebrow>
            <Heading :level="1" class="text-2xl md:text-3xl">
              {{ isNew ? 'New Quiz' : form.title || 'Edit Quiz' }}
            </Heading>
          </div>
          <div class="flex items-center gap-3">
            <span
              v-if="!isNew"
              class="text-xs font-semibold px-2.5 py-1 rounded-full"
              :class="isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'"
            >
              {{ isPublished ? 'Published' : 'Draft' }}
            </span>
            <UiButton
              variant="secondary"
              size="sm"
              :disabled="!canSave || saving"
              @click="save"
            >
              {{ saving ? 'Saving...' : 'Save Draft' }}
            </UiButton>
            <UiButton
              v-if="!isNew"
              variant="primary"
              size="sm"
              :disabled="publishing"
              @click="publish"
            >
              {{ publishing ? 'Publishing...' : 'Publish' }}
            </UiButton>
          </div>
        </div>

        <div v-if="error" class="p-4 bg-red-50 text-red-800 rounded-lg text-sm flex items-center gap-2">
          <Icon icon="lucide:alert-triangle" width="18" />
          {{ error }}
        </div>

        <div v-if="loading" class="p-12 text-center text-ink/50">
          Loading quiz data...
        </div>

        <template v-else>
          <!-- Primary Settings Card -->
          <UiCard class="p-6 md:p-8 bg-surface flex flex-col gap-6">
            <Heading :level="2" class="text-lg">Quiz Settings</Heading>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <label for="quiz-title" class="text-xs font-semibold text-ink/70 uppercase tracking-wide">Title</label>
                <input
                  id="quiz-title"
                  v-model="form.title"
                  type="text"
                  placeholder="e.g. Python Basics Knowledge Check"
                  class="w-full px-3.5 py-2 rounded-lg border border-ink/20 bg-background text-ink text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  @input="isNew && !form.slug && (form.slug = normalizeSlug(form.title))"
                />
              </div>

              <div class="flex flex-col gap-2">
                <label for="quiz-slug" class="text-xs font-semibold text-ink/70 uppercase tracking-wide">Slug</label>
                <input
                  id="quiz-slug"
                  v-model="form.slug"
                  type="text"
                  placeholder="e.g. python-basics-check"
                  class="w-full px-3.5 py-2 rounded-lg border border-ink/20 bg-background text-ink text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent"
                  @blur="form.slug = normalizeSlug(form.slug)"
                />
              </div>
            </div>

            <div class="flex flex-col gap-2">
              <label for="quiz-summary" class="text-xs font-semibold text-ink/70 uppercase tracking-wide">Summary / Instructions</label>
              <textarea
                id="quiz-summary"
                v-model="form.summary"
                rows="2"
                placeholder="Brief summary of what this quiz evaluates..."
                class="w-full px-3.5 py-2 rounded-lg border border-ink/20 bg-background text-ink text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              ></textarea>
            </div>

            <div class="flex flex-col gap-2 max-w-xs">
              <label for="quiz-threshold" class="text-xs font-semibold text-ink/70 uppercase tracking-wide">Passing Threshold (%)</label>
              <div class="flex items-center gap-2">
                <input
                  id="quiz-threshold"
                  v-model.number="form.passThresholdPercent"
                  type="number"
                  min="0"
                  max="100"
                  class="w-24 px-3.5 py-2 rounded-lg border border-ink/20 bg-background text-ink text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <span class="text-xs text-ink/60">% required to pass</span>
              </div>
            </div>
          </UiCard>

          <!-- Question Builder Card -->
          <UiCard class="p-6 md:p-8 bg-surface flex flex-col gap-6">
            <div class="flex items-center justify-between">
              <div>
                <Heading :level="2" class="text-lg">Questions ({{ form.questions.length }})</Heading>
                <p class="text-xs text-ink/60 mt-1">Configure questions, options, and explanations.</p>
              </div>
              <UiButton variant="secondary" size="sm" @click="addQuestion">
                <Icon icon="lucide:plus" width="14" class="mr-1" /> Add Question
              </UiButton>
            </div>

            <div v-if="form.questions.length === 0" class="p-8 text-center border-2 border-dashed border-ink/10 rounded-xl">
              <Icon icon="lucide:help-circle" width="32" class="mx-auto text-ink/30 mb-2" />
              <p class="text-sm font-medium text-ink/70">No questions added yet.</p>
              <p class="text-xs text-ink/50 mt-1">Click "Add Question" to begin adding multiple-choice questions.</p>
            </div>

            <div v-else class="flex flex-col gap-6">
              <div
                v-for="(q, qIndex) in form.questions"
                :key="q.id"
                class="p-5 border border-ink/15 rounded-xl bg-background flex flex-col gap-4 relative group"
              >
                <!-- Question Header / Actions -->
                <div class="flex items-center justify-between gap-2 pb-3 border-b border-ink/10">
                  <span class="text-xs font-bold text-accent uppercase tracking-wider">Question {{ qIndex + 1 }}</span>
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="p-1 text-ink/50 hover:text-ink disabled:opacity-30"
                      :disabled="qIndex === 0"
                      title="Move up"
                      @click="moveQuestion(qIndex, 'up')"
                    >
                      <Icon icon="lucide:arrow-up" width="16" />
                    </button>
                    <button
                      type="button"
                      class="p-1 text-ink/50 hover:text-ink disabled:opacity-30"
                      :disabled="qIndex === form.questions.length - 1"
                      title="Move down"
                      @click="moveQuestion(qIndex, 'down')"
                    >
                      <Icon icon="lucide:arrow-down" width="16" />
                    </button>
                    <button
                      type="button"
                      class="p-1 text-red-600 hover:text-red-800 ml-2"
                      title="Delete question"
                      @click="removeQuestion(qIndex)"
                    >
                      <Icon icon="lucide:trash-2" width="16" />
                    </button>
                  </div>
                </div>

                <!-- Question Prompt -->
                <div class="flex flex-col gap-1.5">
                  <label class="text-xs font-semibold text-ink/70">Question Prompt</label>
                  <input
                    v-model="q.questionText"
                    type="text"
                    placeholder="e.g. What keyword is used to define a function in Python?"
                    class="w-full px-3.5 py-2 rounded-lg border border-ink/20 bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>

                <!-- Options -->
                <div class="flex flex-col gap-2">
                  <label class="text-xs font-semibold text-ink/70 flex items-center justify-between">
                    <span>Options (select correct answer)</span>
                    <button
                      type="button"
                      class="text-xs text-accent hover:underline font-normal inline-flex items-center gap-1"
                      @click="addOption(qIndex)"
                    >
                      <Icon icon="lucide:plus" width="12" /> Add Option
                    </button>
                  </label>

                  <div class="flex flex-col gap-2">
                    <div
                      v-for="(opt, optIndex) in q.options"
                      :key="opt.id"
                      class="flex items-center gap-3"
                    >
                      <input
                        :id="`q_${q.id}_opt_${opt.id}`"
                        type="radio"
                        :name="`correct_${q.id}`"
                        :checked="q.correctOptionId === opt.id"
                        class="accent-accent w-4 h-4 cursor-pointer"
                        @change="q.correctOptionId = opt.id"
                      />
                      <input
                        v-model="opt.text"
                        type="text"
                        :placeholder="`Option ${optIndex + 1}`"
                        class="flex-1 px-3 py-1.5 rounded-lg border border-ink/20 bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <button
                        type="button"
                        class="p-1 text-ink/40 hover:text-red-600 disabled:opacity-20"
                        :disabled="q.options.length <= 2"
                        title="Remove option"
                        @click="removeOption(qIndex, optIndex)"
                      >
                        <Icon icon="lucide:x" width="16" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Explanation -->
                <div class="flex flex-col gap-1.5 pt-2 border-t border-ink/10">
                  <label class="text-xs font-semibold text-ink/70">Explanation (shown after attempt)</label>
                  <input
                    v-model="q.explanation"
                    type="text"
                    placeholder="e.g. 'def' stands for define and initiates a function header in Python."
                    class="w-full px-3.5 py-1.5 rounded-lg border border-ink/20 bg-surface text-ink text-xs focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>
            </div>
          </UiCard>
        </template>
      </div>
    </Container>
  </Section>
</template>
