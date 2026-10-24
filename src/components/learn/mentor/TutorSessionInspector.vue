<script setup lang="ts">
import { Icon } from '@iconify/vue';
import katex from 'katex';
import { computed, ref, watch } from 'vue';
import {
  getTutorSession,
  saveTutorAnnotation,
  type TutorSessionDetail,
} from '../../../services/learn';
import UiButton from '../../ui/UiButton.vue';
import UiChip from '../../ui/UiChip.vue';
import JsxGraphViewer from '../JsxGraphViewer.vue';
import MermaidViewer from '../MermaidViewer.vue';

interface Props {
  show: boolean;
  sessionId: string;
  studentName?: string;
}

const props = withDefaults(defineProps<Props>(), {
  studentName: 'Student',
});

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const loading = ref(false);
const error = ref<string | null>(null);
const detail = ref<TutorSessionDetail | null>(null);
const activeTab = ref<'whiteboard' | 'transcript'>('whiteboard');

const drafts = ref<Record<string, string>>({});
const submitting = ref<Record<string, boolean>>({});
const annotationErrors = ref<Record<string, string>>({});

const cardsCount = computed(() => detail.value?.pages?.length ?? 0);
const messagesCount = computed(() => detail.value?.messages?.length ?? 0);

async function load() {
  if (!props.sessionId || !props.show) return;
  loading.value = true;
  error.value = null;
  try {
    const res = await getTutorSession(props.sessionId);
    detail.value = res;
    if ((res.pages?.length ?? 0) === 0 && (res.messages?.length ?? 0) > 0) {
      activeTab.value = 'transcript';
    } else {
      activeTab.value = 'whiteboard';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load tutor session.';
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.show, props.sessionId],
  ([show, id]) => {
    if (show && id) {
      load();
    } else {
      detail.value = null;
      drafts.value = {};
      submitting.value = {};
      annotationErrors.value = {};
    }
  },
  { immediate: true },
);

function parseContentBlocks(text: string) {
  const blocks: Array<{ type: 'text' | 'mermaid' | 'geometry'; content: string }> = [];
  const blockRegex = /```(mermaid|geometry|jsxgraph)\s*([\s\S]*?)\s*```/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }
    const blockKind = match[1].toLowerCase() === 'mermaid' ? 'mermaid' : 'geometry';
    blocks.push({
      type: blockKind,
      content: match[2].trim(),
    });
    lastIndex = blockRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    blocks.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  if (blocks.length === 1 && blocks[0].type === 'text') {
    const trimmed = text.trim();
    if (
      trimmed.startsWith('graph ') ||
      trimmed.startsWith('flowchart ') ||
      trimmed.startsWith('sequenceDiagram') ||
      trimmed.startsWith('classDiagram') ||
      trimmed.startsWith('stateDiagram') ||
      trimmed.startsWith('erDiagram')
    ) {
      return [{ type: 'mermaid' as const, content: trimmed }];
    }
    if (trimmed.startsWith('{') && trimmed.includes('"elements"')) {
      return [{ type: 'geometry' as const, content: trimmed }];
    }
  }

  return blocks;
}

function formatFormattedText(text: string): string {
  if (!text) return '';

  let formatted = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return math;
    }
  });

  formatted = formatted.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return math;
    }
  });

  formatted = formatted
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(
      /`([^`]+)`/g,
      '<code class="px-1 py-0.5 bg-ink/10 rounded text-brand-violet font-mono text-xs">$1</code>',
    )
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc">$1</li>');

  return formatted;
}

function fmtDate(ms: number) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function submitAnnotation(pageId: string) {
  const content = (drafts.value[pageId] || '').trim();
  if (!content || submitting.value[pageId] || !props.sessionId) return;

  submitting.value[pageId] = true;
  annotationErrors.value[pageId] = '';

  try {
    const res = await saveTutorAnnotation({
      sessionId: props.sessionId,
      pageId,
      content,
    });

    if (res.ok && res.annotation && detail.value) {
      const page = detail.value.pages.find((p) => p.id === pageId);
      if (page) {
        if (!page.annotations) page.annotations = [];
        page.annotations.push(res.annotation);
      }
      drafts.value[pageId] = '';
    }
  } catch (err) {
    annotationErrors.value[pageId] =
      err instanceof Error ? err.message : 'Failed to save annotation.';
  } finally {
    submitting.value[pageId] = false;
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.show) {
    emit('close');
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-ink/40 backdrop-blur-xs"
      tabindex="-1"
      @keydown="handleKeydown"
    >
      <div
        class="bg-paper border hairline-ink rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspector-title"
      >
        <!-- Modal Header -->
        <div
          class="px-6 py-4 border-b hairline-ink flex items-center justify-between shrink-0 bg-surface"
        >
          <div class="flex flex-col gap-1 min-w-0 pr-4">
            <div class="flex items-center gap-2 flex-wrap">
              <h3
                id="inspector-title"
                class="font-display text-lg font-semibold text-ink truncate m-0"
              >
                {{ detail?.session.lessonTitle || 'AI STEM Tutor Session' }}
              </h3>
              <UiChip v-if="detail?.session.mode" class="capitalize">
                {{ detail.session.mode }}
              </UiChip>
            </div>
            <p class="text-xs text-ink/60 m-0">
              Student: <span class="font-medium text-ink">{{ studentName }}</span>
              <span v-if="detail?.session.createdAt" class="ml-2">
                Started {{ fmtDate(detail.session.createdAt) }}
              </span>
            </p>
          </div>
          <button
            type="button"
            class="text-ink/50 hover:text-ink p-2 rounded-xl hover:bg-ink/5 transition-colors focus-ring-brand shrink-0"
            aria-label="Close session inspector"
            @click="emit('close')"
          >
            <Icon icon="lucide:x" width="18" />
          </button>
        </div>

        <!-- Tab Switcher -->
        <div class="px-6 border-b hairline-ink flex items-center gap-2 shrink-0 bg-surface">
          <button
            type="button"
            class="py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 focus:outline-none"
            :class="
              activeTab === 'whiteboard'
                ? 'border-brand-violet text-brand-violet'
                : 'border-transparent text-ink/60 hover:text-ink'
            "
            @click="activeTab = 'whiteboard'"
          >
            <Icon icon="lucide:layout-grid" width="14" />
            Whiteboard cards
            <span class="px-1.5 py-0.5 rounded-full text-[10px] bg-ink/10 text-ink/80">
              {{ cardsCount }}
            </span>
          </button>
          <button
            type="button"
            class="py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 focus:outline-none"
            :class="
              activeTab === 'transcript'
                ? 'border-brand-violet text-brand-violet'
                : 'border-transparent text-ink/60 hover:text-ink'
            "
            @click="activeTab = 'transcript'"
          >
            <Icon icon="lucide:message-square" width="14" />
            Dialogue transcript
            <span class="px-1.5 py-0.5 rounded-full text-[10px] bg-ink/10 text-ink/80">
              {{ messagesCount }}
            </span>
          </button>
        </div>

        <!-- Modal Content Body -->
        <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-6 bg-paper">
          <div
            v-if="loading"
            class="py-16 text-center text-ink/60 flex flex-col items-center gap-3"
          >
            <Icon icon="lucide:loader-2" width="28" class="animate-spin text-brand-violet" />
            <p class="text-sm">Loading session details and concept cards…</p>
          </div>

          <div
            v-else-if="error"
            class="p-6 rounded-xl border border-red-200 bg-red-50/60 text-red-700 flex flex-col gap-2"
          >
            <div class="flex items-center gap-2 font-semibold text-sm">
              <Icon icon="lucide:alert-circle" width="16" />
              <span>Failed to load session</span>
            </div>
            <p class="text-xs m-0">{{ error }}</p>
            <UiButton variant="secondary" size="sm" class="self-start mt-2" @click="load">
              Try again
            </UiButton>
          </div>

          <!-- Whiteboard Tab -->
          <template v-else-if="activeTab === 'whiteboard'">
            <div
              v-if="cardsCount === 0"
              class="text-center py-16 border border-dashed hairline-ink rounded-xl flex flex-col items-center gap-2"
            >
              <Icon icon="lucide:layout-grid" width="32" class="text-ink/20" />
              <p class="text-sm font-medium text-ink/70 m-0">
                No whiteboard cards in this session.
              </p>
              <p class="text-xs text-ink/50 m-0 max-w-sm">
                Whiteboard cards are pinned when the student or AI tutor generates structured
                diagrams or notes.
              </p>
            </div>

            <div v-else class="flex flex-col gap-6">
              <div
                v-for="card in detail?.pages"
                :key="card.id"
                class="rounded-xl border hairline-ink bg-surface shadow-xs p-5 flex flex-col gap-4"
              >
                <!-- Card Header -->
                <div
                  class="flex items-center justify-between border-b hairline-ink pb-3 flex-wrap gap-2"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold text-brand-violet">
                      {{ card.title }}
                    </span>
                    <span
                      class="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-ink/5 text-ink/70"
                    >
                      {{ card.kind }}
                    </span>
                  </div>
                  <span class="text-xs text-ink/50"> Created {{ fmtDate(card.createdAt) }} </span>
                </div>

                <!-- Card Content Display -->
                <div class="text-xs leading-relaxed text-ink/90 flex flex-col gap-3">
                  <div v-for="(block, bIdx) in parseContentBlocks(card.content)" :key="bIdx">
                    <MermaidViewer v-if="block.type === 'mermaid'" :code="block.content" />
                    <JsxGraphViewer v-else-if="block.type === 'geometry'" :spec="block.content" />
                    <div v-else v-html="formatFormattedText(block.content)" />
                  </div>
                </div>

                <!-- Pinned Annotations / Feedback Section -->
                <div class="pt-4 border-t hairline-ink flex flex-col gap-3">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-semibold text-ink flex items-center gap-1.5">
                      <Icon icon="lucide:message-square" width="13" class="text-brand-violet" />
                      Pinned mentor notes ({{ card.annotations?.length || 0 }})
                    </span>
                  </div>

                  <!-- Existing Notes -->
                  <div
                    v-if="card.annotations && card.annotations.length > 0"
                    class="flex flex-col gap-2"
                  >
                    <div
                      v-for="ann in card.annotations"
                      :key="ann.id"
                      class="p-3 rounded-lg bg-surface-raised border border-brand-violet/20 flex flex-col gap-1 text-xs"
                    >
                      <div class="flex items-center justify-between text-[11px] text-ink/60">
                        <span class="font-medium text-ink">{{ ann.authorName }}</span>
                        <span>{{ fmtDate(ann.createdAt) }}</span>
                      </div>
                      <p class="text-ink whitespace-pre-wrap m-0">{{ ann.content }}</p>
                    </div>
                  </div>

                  <!-- Inline Annotation Composer for Mentor -->
                  <div class="flex flex-col gap-2 mt-1">
                    <textarea
                      v-model="drafts[card.id]"
                      rows="2"
                      placeholder="Add mentor feedback or notes on this whiteboard card..."
                      class="w-full text-xs bg-paper border hairline-ink rounded-lg p-3 text-ink focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet resize-y"
                    />
                    <div class="flex items-center justify-between flex-wrap gap-2">
                      <p v-if="annotationErrors[card.id]" class="text-xs text-rose-700 m-0">
                        {{ annotationErrors[card.id] }}
                      </p>
                      <span v-else class="text-[11px] text-ink/50">
                        The student will see this note on their whiteboard card.
                      </span>

                      <UiButton
                        variant="primary"
                        size="sm"
                        :disabled="!drafts[card.id]?.trim() || submitting[card.id]"
                        @click="submitAnnotation(card.id)"
                      >
                        <Icon
                          v-if="submitting[card.id]"
                          icon="lucide:loader-2"
                          width="12"
                          class="animate-spin mr-1"
                        />
                        <Icon v-else icon="lucide:pin" width="12" class="mr-1" />
                        Pin note
                      </UiButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Transcript Tab -->
          <template v-else>
            <div
              v-if="messagesCount === 0"
              class="text-center py-16 border border-dashed hairline-ink rounded-xl flex flex-col items-center gap-2"
            >
              <Icon icon="lucide:message-square-off" width="32" class="text-ink/20" />
              <p class="text-sm font-medium text-ink/70 m-0">No messages found in this session.</p>
            </div>

            <div v-else class="flex flex-col gap-4">
              <div
                v-for="msg in detail?.messages"
                :key="msg.id"
                class="flex flex-col gap-1.5"
                :class="msg.role === 'user' ? 'items-end' : 'items-start'"
              >
                <div class="flex items-center gap-1.5 text-[11px] text-ink/50 px-1">
                  <span v-if="msg.role === 'user'">{{ studentName }}</span>
                  <span v-else class="font-medium text-brand-violet">AI STEM Tutor</span>
                  <span>{{ fmtDate(msg.createdAt) }}</span>
                </div>

                <div
                  class="rounded-xl p-4 text-xs max-w-[85%] leading-relaxed border"
                  :class="
                    msg.role === 'user'
                      ? 'bg-brand-violet text-white border-transparent'
                      : 'bg-surface text-ink hairline-ink shadow-xs'
                  "
                >
                  <div v-if="msg.role === 'user'" class="whitespace-pre-wrap font-sans text-xs">
                    {{ msg.content }}
                  </div>
                  <div v-else class="flex flex-col gap-2">
                    <div v-for="(block, bIdx) in parseContentBlocks(msg.content)" :key="bIdx">
                      <MermaidViewer v-if="block.type === 'mermaid'" :code="block.content" />
                      <JsxGraphViewer v-else-if="block.type === 'geometry'" :spec="block.content" />
                      <div v-else v-html="formatFormattedText(block.content)" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Modal Footer -->
        <div
          class="px-6 py-3 border-t hairline-ink flex items-center justify-between shrink-0 bg-surface"
        >
          <span class="text-xs text-ink/50"> Session ID: {{ sessionId }} </span>
          <UiButton variant="secondary" size="sm" @click="emit('close')"> Done reviewing </UiButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>
