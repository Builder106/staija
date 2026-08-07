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
import UiSelect from '../../../components/ui/UiSelect.vue'
import EntryReferencePicker from '../../../components/admin/EntryReferencePicker.vue'
import RichTextEditor from '../../../components/admin/RichTextEditor.vue'
import {
  getEntry,
  createEntry,
  updateEntry,
  publishEntry,
  normalizeSlug,
  detectVideoProvider,
  type LessonFields,
} from '../../../services/lmsContent'
import { emptyDocument } from '../../../services/richTextSerializer'
import { lessonMediaAssist, type LessonMediaResult } from '../../../services/ai'
import { useFormDirty } from '../../../composables/useFormDirty'
import { useAdminBase } from '../../../composables/useAdminBase'
import type { Document, TopLevelBlock } from '@contentful/rich-text-types'
import { BLOCKS } from '@contentful/rich-text-types'

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

const form = ref<LessonFields>({
  slug: '',
  title: '',
  body: emptyDocument(),
  videoUrl: '',
  estimatedMinutes: undefined,
  completionCriteria: 'viewed',
  quiz: undefined,
})
const { isDirty, markClean } = useFormDirty(form)

async function load() {
  if (!id.value) return
  loading.value = true
  try {
    const entry = await getEntry(id.value)
    isPublished.value = entry.isPublished
    const f = entry.fields
    const quizRef = (f.quiz as { sys?: { id: string } } | string | undefined)
    const quizId = typeof quizRef === 'string' ? quizRef : quizRef?.sys?.id
    form.value = {
      slug: (f.slug as string) ?? '',
      title: (f.title as string) ?? '',
      body: (f.body as Document) ?? emptyDocument(),
      videoUrl: (f.videoUrl as string) ?? '',
      estimatedMinutes: f.estimatedMinutes as number | undefined,
      completionCriteria: ((f.completionCriteria as 'viewed' | 'assignment_submitted' | 'quiz_passed') ?? 'viewed'),
      quiz: quizId,
    }
    markClean()
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load lesson.'
  } finally {
    loading.value = false
  }
}

const canSave = computed(
  () => !!form.value.slug.trim() && !!form.value.title.trim() && !saving.value,
)

// Pure detection lives in lmsContent so it can be unit-tested and
// re-used by any preview surface. Hint text in the template branches
// on this value.
const videoProvider = computed(() => detectVideoProvider(form.value.videoUrl))

async function save() {
  if (!canSave.value) return
  saving.value = true
  error.value = null
  try {
    if (id.value) {
      await updateEntry(id.value, { type: 'lesson', fields: form.value })
    } else {
      const created = await createEntry({ type: 'lesson', fields: form.value })
      id.value = created.id
      router.replace({ path: `${adminBase.value}/content/lessons/${created.id}` })
    }
    markClean()
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Save failed.'
  } finally {
    saving.value = false
  }
}

async function saveAndPublish() {
  if (!canSave.value) return
  publishing.value = true
  error.value = null
  try {
    let entryId = id.value
    if (entryId) {
      await updateEntry(entryId, { type: 'lesson', fields: form.value })
    } else {
      const created = await createEntry({ type: 'lesson', fields: form.value })
      entryId = created.id
      id.value = created.id
      router.replace({ path: `${adminBase.value}/content/lessons/${created.id}` })
    }
    await publishEntry(entryId!)
    isPublished.value = true
    markClean()
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Publish failed.'
  } finally {
    publishing.value = false
  }
}

// --- AI media assist ---------------------------------------------------

const aiOpen = ref(false)
const aiLoading = ref(false)
const aiError = ref<string | null>(null)
const aiResult = ref<LessonMediaResult | null>(null)
const aiCopiedKey = ref<string | null>(null)

// Walk the Contentful Document tree and collect text-node values. Good
// enough as input to the AI — Groq doesn't need our markup, just the
// prose. Falls back to the title alone if the body is empty.
function flattenBody(doc: Document | undefined): string {
  if (!doc) return ''
  const out: string[] = []
  const walk = (node: { nodeType?: string; value?: string; content?: unknown[] }) => {
    if (node.nodeType === 'text' && typeof node.value === 'string') out.push(node.value)
    if (Array.isArray(node.content)) node.content.forEach((c) => walk(c as Parameters<typeof walk>[0]))
  }
  walk(doc as Parameters<typeof walk>[0])
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

const canAssist = computed(() => {
  const plain = flattenBody(form.value.body)
  return form.value.title.trim().length >= 3 && plain.length >= 30
})

async function runAssist() {
  if (!canAssist.value) return
  aiLoading.value = true
  aiError.value = null
  aiResult.value = null
  try {
    aiResult.value = await lessonMediaAssist({
      title: form.value.title,
      bodyPlain: flattenBody(form.value.body),
    })
  } catch (err) {
    aiError.value = (err as { message?: string }).message ?? 'AI assist failed.'
  } finally {
    aiLoading.value = false
  }
}

async function copyText(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text)
    aiCopiedKey.value = key
    setTimeout(() => { if (aiCopiedKey.value === key) aiCopiedKey.value = null }, 1500)
  } catch {
    aiCopiedKey.value = null
  }
}

function youtubeSearchUrl(q: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
}

function unsplashSearchUrl(q: string) {
  return `https://unsplash.com/s/photos/${encodeURIComponent(q)}`
}

// --- Rich-text append helpers -----------------------------------------
//
// The body is a Contentful Document. To get RichTextEditor to pick up the
// change we have to assign a NEW Document — the editor watches by
// reference, not by deep equality. So we build a fresh content array.

function textNode(value: string) {
  return { nodeType: 'text' as const, value, marks: [], data: {} }
}

function paragraph(value: string): TopLevelBlock {
  return {
    nodeType: BLOCKS.PARAGRAPH,
    data: {},
    content: [textNode(value)],
  } as TopLevelBlock
}

function headingThree(value: string): TopLevelBlock {
  return {
    nodeType: BLOCKS.HEADING_3,
    data: {},
    content: [textNode(value)],
  } as TopLevelBlock
}

function bulletList(items: string[]): TopLevelBlock {
  return {
    nodeType: BLOCKS.UL_LIST,
    data: {},
    content: items.map((value) => ({
      nodeType: BLOCKS.LIST_ITEM,
      data: {},
      content: [
        {
          nodeType: BLOCKS.PARAGRAPH,
          data: {},
          content: [textNode(value)],
        },
      ],
    })),
  } as unknown as TopLevelBlock
}

function appendBlocks(doc: Document | undefined, blocks: TopLevelBlock[]): Document {
  const base = doc ?? emptyDocument()
  // Drop the empty leading paragraph the editor renders by default so we
  // don't leave an awkward blank line at the top of the body.
  const existing = (base.content ?? []).filter((b, i) => {
    if (i !== 0) return true
    if (b.nodeType !== BLOCKS.PARAGRAPH) return true
    const text = (b.content ?? [])
      .map((c) => ('value' in c ? (c as { value: string }).value : ''))
      .join('')
    return text.trim().length > 0
  })
  return {
    ...base,
    nodeType: BLOCKS.DOCUMENT,
    data: base.data ?? {},
    content: [...existing, ...blocks],
  }
}

function insertNarration() {
  if (!aiResult.value) return
  form.value.body = appendBlocks(form.value.body, [paragraph(aiResult.value.narrationScript)])
  aiCopiedKey.value = 'narration-inserted'
  setTimeout(() => {
    if (aiCopiedKey.value === 'narration-inserted') aiCopiedKey.value = null
  }, 1500)
}

function insertKeyConcepts() {
  if (!aiResult.value) return
  form.value.body = appendBlocks(form.value.body, [
    headingThree('Key concepts'),
    bulletList(aiResult.value.keyConcepts),
  ])
  aiCopiedKey.value = 'concepts-inserted'
  setTimeout(() => {
    if (aiCopiedKey.value === 'concepts-inserted') aiCopiedKey.value = null
  }, 1500)
}

onMounted(load)
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-10 !pb-6 border-b hairline-ink">
      <Container class="max-w-3xl">
        <RouterLink
          :to="`${adminBase}/content/lessons`"
          class="text-xs text-ink/60 hover:text-ink mb-3 inline-flex items-center gap-1"
        >
          <Icon icon="lucide:arrow-left" width="12" /> All lessons
        </RouterLink>
        <Eyebrow class="text-brand-violet mb-2 block">Lesson</Eyebrow>
        <Heading :level="1" class="mb-2">
          {{ isNew ? 'New lesson' : (form.title || 'Edit lesson') }}
        </Heading>
        <span
          v-if="!isNew"
          class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold"
          :class="isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'"
        >
          {{ isPublished ? 'Published' : 'Draft' }}
        </span>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="max-w-3xl flex flex-col gap-6">
        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon icon="lucide:loader-2" width="24" class="animate-spin text-brand-violet mx-auto" />
        </UiCard>

        <template v-else>
          <UiCard class="p-6 md:p-8 bg-surface flex flex-col gap-5">
            <div class="grid md:grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">Slug</label>
                <input
                  :value="form.slug"
                  type="text"
                  class="input font-mono"
                  @input="form.slug = ($event.target as HTMLInputElement).value.toLowerCase()"
                  @blur="form.slug = normalizeSlug(form.slug)"
                />
                <p class="text-[11px] text-ink/50">Lowercase letters, numbers, and hyphens only. Anything else gets normalized on save.</p>
              </div>
              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">Estimated minutes</label>
                <input v-model.number="form.estimatedMinutes" type="number" min="1" class="input" />
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">Title</label>
              <input v-model="form.title" type="text" class="input" />
            </div>
            <div class="grid md:grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                  Video URL <span class="text-ink/40 normal-case">(optional)</span>
                </label>
                <input
                  v-model="form.videoUrl"
                  type="url"
                  class="input"
                  placeholder="https://www.youtube.com/watch?v=…"
                />
                <p v-if="videoProvider === 'youtube'" class="text-[11px] text-emerald-700 inline-flex items-center gap-1">
                  <Icon icon="lucide:check-circle-2" width="11" /> YouTube link — embeds inline in the lesson player.
                </p>
                <p v-else-if="videoProvider === 'vimeo'" class="text-[11px] text-emerald-700 inline-flex items-center gap-1">
                  <Icon icon="lucide:check-circle-2" width="11" /> Vimeo link — embeds inline in the lesson player.
                </p>
                <p v-else-if="videoProvider === 'other'" class="text-[11px] text-amber-700 inline-flex items-center gap-1">
                  <Icon icon="lucide:alert-triangle" width="11" /> Not a YouTube or Vimeo URL — the player loads it raw, which only works if the host allows iframe embedding.
                </p>
                <p v-else-if="videoProvider === 'invalid'" class="text-[11px] text-red-700 inline-flex items-center gap-1">
                  <Icon icon="lucide:x-circle" width="11" /> Doesn't look like a URL.
                </p>
                <p v-else class="text-[11px] text-ink/50">
                  Paste a YouTube or Vimeo watch-page link. The lesson player auto-converts it to an embed. Leave blank for a text-only lesson.
                </p>
              </div>
              <div class="flex flex-col gap-2">
                <label for="lesson-completion-criteria" class="text-xs font-semibold text-ink/70 uppercase tracking-wide">Completion criteria</label>
                <UiSelect
                  id="lesson-completion-criteria"
                  v-model="form.completionCriteria"
                  :options="[
                    { value: 'viewed', label: 'Viewed', hint: 'Opening counts' },
                    { value: 'assignment_submitted', label: 'Assignment submitted' },
                    { value: 'quiz_passed', label: 'Quiz passed' },
                  ]"
                />
              </div>

              <div v-if="form.completionCriteria === 'quiz_passed'" class="flex flex-col gap-2 pt-2 border-t border-ink/10">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">Linked Quiz</label>
                <EntryReferencePicker
                  contentType="quiz"
                  :modelValue="form.quiz ? [form.quiz] : []"
                  :multiple="false"
                  placeholder="Select a quiz for this lesson..."
                  @update:modelValue="form.quiz = $event[0]"
                />
              </div>
            </div>
          </UiCard>

          <UiCard class="p-6 md:p-8 bg-surface">
            <Heading :level="2" class="text-base mb-3">Body</Heading>
            <RichTextEditor v-model="form.body!" />
          </UiCard>

          <!-- AI media assist — collapsed by default so it doesn't dominate
               the editor for staff who don't want it. Suggests media to
               find rather than generating it: lower cost, no licensing or
               cultural-appropriateness landmines. -->
          <UiCard class="p-6 md:p-8 bg-surface">
            <button
              type="button"
              class="w-full flex items-center gap-2 text-left"
              @click="aiOpen = !aiOpen"
            >
              <Icon icon="lucide:sparkles" width="16" class="text-brand-violet" />
              <Heading :level="2" class="text-base flex-1 m-0">AI media assist</Heading>
              <span class="text-[11px] text-ink/50 font-normal">optional</span>
              <Icon
                icon="lucide:chevron-down"
                width="16"
                class="text-ink/40 transition-transform"
                :class="aiOpen ? 'rotate-180' : ''"
              />
            </button>

            <div v-if="aiOpen" class="mt-5 flex flex-col gap-5">
              <p class="text-xs text-ink/60 m-0 leading-relaxed">
                Suggests YouTube searches, image searches, a 90-second narration script
                you can record, and key-concept bullets — based on the title and body
                above. Editors curate; nothing is inserted automatically.
              </p>

              <div class="flex items-center gap-3 flex-wrap">
                <UiButton
                  variant="primary"
                  :disabled="!canAssist || aiLoading"
                  @click="runAssist"
                >
                  <Icon
                    v-if="aiLoading"
                    icon="lucide:loader-2"
                    width="14"
                    class="animate-spin"
                  />
                  <Icon v-else icon="lucide:sparkles" width="14" />
                  {{ aiLoading ? 'Thinking…' : aiResult ? 'Suggest again' : 'Suggest media' }}
                </UiButton>
                <span v-if="!canAssist" class="text-[11px] text-ink/50">
                  Add a title and at least a paragraph of body before asking.
                </span>
              </div>

              <p v-if="aiError" role="alert" class="text-sm text-red-700 m-0">{{ aiError }}</p>

              <div v-if="aiResult" class="flex flex-col gap-6">
                <!-- Video search queries -->
                <div class="flex flex-col gap-2">
                  <Eyebrow class="text-ink/50 block">Video searches</Eyebrow>
                  <ul class="flex flex-col gap-2">
                    <li
                      v-for="(item, i) in aiResult.videoQueries"
                      :key="'v' + i"
                      class="border hairline-ink rounded-lg p-3 bg-paper/50 flex flex-col gap-1"
                    >
                      <a
                        :href="youtubeSearchUrl(item.query)"
                        target="_blank"
                        rel="noopener"
                        class="text-sm font-semibold text-brand-violet hover:underline underline-offset-2 inline-flex items-center gap-1.5"
                      >
                        <Icon icon="lucide:youtube" width="14" />
                        {{ item.query }}
                        <Icon icon="lucide:external-link" width="11" class="text-ink/30" />
                      </a>
                      <p class="text-xs text-ink/60 m-0">{{ item.rationale }}</p>
                    </li>
                  </ul>
                </div>

                <!-- Image search queries -->
                <div class="flex flex-col gap-2">
                  <Eyebrow class="text-ink/50 block">Image searches</Eyebrow>
                  <ul class="flex flex-col gap-2">
                    <li
                      v-for="(item, i) in aiResult.imageQueries"
                      :key="'i' + i"
                      class="border hairline-ink rounded-lg p-3 bg-paper/50 flex flex-col gap-1"
                    >
                      <a
                        :href="unsplashSearchUrl(item.query)"
                        target="_blank"
                        rel="noopener"
                        class="text-sm font-semibold text-brand-violet hover:underline underline-offset-2 inline-flex items-center gap-1.5"
                      >
                        <Icon icon="lucide:image" width="14" />
                        {{ item.query }}
                        <Icon icon="lucide:external-link" width="11" class="text-ink/30" />
                      </a>
                      <p class="text-xs text-ink/60 m-0">{{ item.rationale }}</p>
                    </li>
                  </ul>
                </div>

                <!-- Narration script -->
                <div class="flex flex-col gap-2">
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <Eyebrow class="text-ink/50 block">Narration script</Eyebrow>
                    <div class="flex items-center gap-3">
                      <button
                        type="button"
                        class="text-xs font-semibold text-brand-violet hover:underline underline-offset-2 inline-flex items-center gap-1"
                        @click="copyText(aiResult.narrationScript, 'narration')"
                      >
                        <Icon
                          :icon="aiCopiedKey === 'narration' ? 'lucide:check' : 'lucide:clipboard-copy'"
                          width="12"
                        />
                        {{ aiCopiedKey === 'narration' ? 'Copied' : 'Copy' }}
                      </button>
                      <button
                        type="button"
                        class="text-xs font-semibold text-brand-violet hover:underline underline-offset-2 inline-flex items-center gap-1"
                        @click="insertNarration"
                      >
                        <Icon
                          :icon="aiCopiedKey === 'narration-inserted' ? 'lucide:check' : 'lucide:plus-circle'"
                          width="12"
                        />
                        {{ aiCopiedKey === 'narration-inserted' ? 'Added to body' : 'Insert into body' }}
                      </button>
                    </div>
                  </div>
                  <p
                    class="text-sm text-ink/80 leading-relaxed border-l-2 border-brand-violet/40 pl-3 italic m-0"
                  >
                    {{ aiResult.narrationScript }}
                  </p>
                  <p class="text-[11px] text-ink/50 m-0">
                    Read it aloud, record yourself, paste the file URL into Video URL above.
                  </p>
                </div>

                <!-- Key concepts -->
                <div class="flex flex-col gap-2">
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <Eyebrow class="text-ink/50 block">Key concepts</Eyebrow>
                    <div class="flex items-center gap-3">
                      <button
                        type="button"
                        class="text-xs font-semibold text-brand-violet hover:underline underline-offset-2 inline-flex items-center gap-1"
                        @click="copyText(aiResult.keyConcepts.map((k) => '• ' + k).join('\n'), 'concepts')"
                      >
                        <Icon
                          :icon="aiCopiedKey === 'concepts' ? 'lucide:check' : 'lucide:clipboard-copy'"
                          width="12"
                        />
                        {{ aiCopiedKey === 'concepts' ? 'Copied' : 'Copy as bullets' }}
                      </button>
                      <button
                        type="button"
                        class="text-xs font-semibold text-brand-violet hover:underline underline-offset-2 inline-flex items-center gap-1"
                        @click="insertKeyConcepts"
                      >
                        <Icon
                          :icon="aiCopiedKey === 'concepts-inserted' ? 'lucide:check' : 'lucide:plus-circle'"
                          width="12"
                        />
                        {{ aiCopiedKey === 'concepts-inserted' ? 'Added to body' : 'Insert as section' }}
                      </button>
                    </div>
                  </div>
                  <ul class="flex flex-col gap-1.5">
                    <li
                      v-for="(c, i) in aiResult.keyConcepts"
                      :key="'k' + i"
                      class="text-sm text-ink/80 inline-flex items-start gap-2"
                    >
                      <Icon
                        icon="lucide:check-circle-2"
                        width="14"
                        class="text-brand-violet mt-0.5 shrink-0"
                      />
                      <span>{{ c }}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </UiCard>

          <p v-if="error" class="text-sm text-red-700">{{ error }}</p>

          <div class="flex flex-wrap gap-2">
            <UiButton variant="secondary" :disabled="!canSave || saving" @click="save">
              <Icon v-if="saving" icon="lucide:loader-2" width="14" class="animate-spin" />
              {{ saving ? 'Saving…' : 'Save draft' }}
            </UiButton>
            <UiButton
              variant="primary"
              :disabled="!canSave || publishing || (isPublished && !isDirty)"
              @click="saveAndPublish"
            >
              <Icon v-if="publishing" icon="lucide:loader-2" width="14" class="animate-spin" />
              <Icon
                v-else-if="isPublished && !isDirty"
                icon="lucide:check"
                width="14"
              />
              <template v-if="publishing">Publishing…</template>
              <template v-else-if="isPublished && !isDirty">Published</template>
              <template v-else>Save &amp; publish</template>
            </UiButton>
          </div>
        </template>
      </Container>
    </Section>
  </div>
</template>

<style scoped>
.input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid rgba(14, 18, 23, 0.08);
  background: #fff;
  font-size: 0.875rem;
}
.input:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(139, 85, 255, 0.5);
}
</style>
