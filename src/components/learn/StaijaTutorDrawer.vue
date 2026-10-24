<script setup lang="ts">
import { Icon } from '@iconify/vue';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { computed, defineEmits, defineProps, nextTick, onMounted, ref, watch } from 'vue';
import { askLmsTutor, type AskLmsTutorResult } from '../../services/learn';
import UiButton from '../ui/UiButton.vue';
import MermaidViewer from './MermaidViewer.vue';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestedFollowUps?: string[];
  pinned?: boolean;
}

interface WhiteboardCard {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

const props = defineProps<{
  open: boolean;
  lessonTitle: string;
  lessonBodyPlain: string;
  courseTitle?: string;
  program?: string;
  initialQuestionContext?: {
    questionText: string;
    userAnswerText?: string;
    explanation?: string;
  };
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const activeTab = ref<'chat' | 'whiteboard'>('chat');
const isExpanded = ref(false);
const activeMode = ref<'standard' | 'socratic' | 'deep' | 'diagram' | 'practice'>('standard');

const inputQuestion = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const messages = ref<Message[]>([]);
const whiteboardCards = ref<WhiteboardCard[]>([]);
const studentNotes = ref('');
const chatContainer = ref<HTMLElement | null>(null);

const notesStorageKey = computed(
  () => `staija_tutor_notes_${props.lessonTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
);

const whiteboardStorageKey = computed(
  () => `staija_tutor_board_${props.lessonTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
);

function loadSavedState() {
  try {
    const savedNotes = localStorage.getItem(notesStorageKey.value);
    if (savedNotes) studentNotes.value = savedNotes;

    const savedBoard = localStorage.getItem(whiteboardStorageKey.value);
    if (savedBoard) whiteboardCards.value = JSON.parse(savedBoard);
  } catch (err) {
    console.warn('Failed to load local tutor state:', err);
  }
}

function saveNotes() {
  try {
    localStorage.setItem(notesStorageKey.value, studentNotes.value);
  } catch (err) {
    console.warn('Failed to save notes:', err);
  }
}

function saveWhiteboard() {
  try {
    localStorage.setItem(whiteboardStorageKey.value, JSON.stringify(whiteboardCards.value));
  } catch (err) {
    console.warn('Failed to save whiteboard:', err);
  }
}

function pinToWhiteboard(msg: Message) {
  const cardId = `wb-${Date.now()}`;
  const firstLine =
    msg.content
      .split('\n')[0]
      .replace(/[#*`_]/g, '')
      .trim() || 'Concept Note';
  const cardTitle = firstLine.length > 50 ? `${firstLine.substring(0, 47)}...` : firstLine;

  whiteboardCards.value.unshift({
    id: cardId,
    title: cardTitle,
    content: msg.content,
    createdAt: Date.now(),
  });
  msg.pinned = true;
  saveWhiteboard();
}

function removeWhiteboardCard(cardId: string) {
  whiteboardCards.value = whiteboardCards.value.filter((c) => c.id !== cardId);
  saveWhiteboard();
}

function resetChat() {
  let intro = `Hi there! I am your STAIJA AI STEM Tutor. I can help explain concepts in **${props.lessonTitle}**, answer questions, or generate visual concept maps.`;
  if (props.initialQuestionContext) {
    intro = `I can help you review this quiz question: **"${props.initialQuestionContext.questionText}"**. Ask me anything about it!`;
  }
  messages.value = [
    {
      id: 'intro',
      role: 'assistant',
      content: intro,
      suggestedFollowUps: [
        'Explain key concepts visually',
        'Give a real-world example',
        'What are common misconceptions here?',
      ],
    },
  ];
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      loadSavedState();
      if (messages.value.length === 0) {
        resetChat();
      }
    }
  },
  { immediate: true },
);

async function scrollToBottom() {
  await nextTick();
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
}

async function sendQuestion(textToSend?: string) {
  let q = (textToSend || inputQuestion.value).trim();
  if (!q || loading.value) return;

  // Apply teaching workflow prefix if specific mode selected
  if (!textToSend) {
    if (activeMode.value === 'socratic') {
      q = `[Socratic Guiding Mode] Please guide me step-by-step with probing questions rather than giving away the answer directly: ${q}`;
    } else if (activeMode.value === 'deep') {
      q = `[Deep Theory Mode] Please explain this in rigorous depth with foundational STEM principles and mathematics: ${q}`;
    } else if (activeMode.value === 'diagram') {
      q = `[Visual Concept Mode] Please generate a clear Mermaid diagram or flowchart illustrating this concept: ${q}`;
    } else if (activeMode.value === 'practice') {
      q = `[Practice Exercise Mode] Please provide a short practice scenario or question to test my understanding: ${q}`;
    }
  }

  inputQuestion.value = '';
  error.value = null;

  const userMsgId = `user-${Date.now()}`;
  messages.value.push({
    id: userMsgId,
    role: 'user',
    content: q.replace(/^\[.*?\]\s*/, ''), // display clean text in bubble
  });

  await scrollToBottom();
  loading.value = true;

  try {
    const history = messages.value
      .filter((m) => m.id !== 'intro')
      .map((m) => ({ role: m.role, content: m.content }));

    const res: AskLmsTutorResult = await askLmsTutor({
      lessonTitle: props.lessonTitle,
      lessonBodyPlain: props.lessonBodyPlain,
      courseTitle: props.courseTitle,
      program: props.program,
      studentQuestion: q,
      chatHistory: history,
      questionContext: props.initialQuestionContext,
    });

    messages.value.push({
      id: `asst-${Date.now()}`,
      role: 'assistant',
      content: res.reply,
      suggestedFollowUps: res.suggestedFollowUps,
    });

    await scrollToBottom();
  } catch (err) {
    console.error('Tutor error:', err);
    error.value = 'Failed to fetch tutor response. Please check your network or try again.';
  } finally {
    loading.value = false;
  }
}

// Parses text blocks, rendering Mermaid blocks into <MermaidViewer> components
function parseContentBlocks(text: string) {
  const blocks: Array<{ type: 'text' | 'mermaid' | 'math'; content: string }> = [];

  const mermaidRegex = /```mermaid\s*([\s\S]*?)\s*```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mermaidRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }
    blocks.push({ type: 'mermaid', content: match[1].trim() });
    lastIndex = mermaidRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    blocks.push({ type: 'text', content: text.substring(lastIndex) });
  }

  return blocks;
}

// Formats text with KaTeX math and basic Markdown (bold, lists)
function formatFormattedText(text: string): string {
  if (!text) return '';

  // 1. Block math $$ ... $$
  let formatted = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return math;
    }
  });

  // 2. Inline math \( ... \) or $ ... $
  formatted = formatted.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return math;
    }
  });

  // 3. Bold, lists, code spans
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

onMounted(loadSavedState);
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 bg-ink/60 backdrop-blur-sm z-50"
        @click="emit('close')"
      />
    </Transition>

    <!-- Slide-over Drawer with Expandable Width -->
    <Transition
      enter-active-class="transition duration-300 ease-out transform"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition duration-200 ease-in transform"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="open"
        class="fixed right-0 top-0 bottom-0 w-full transition-all duration-300 bg-surface border-l border-ink/10 z-50 shadow-2xl flex flex-col"
        :class="isExpanded ? 'max-w-3xl' : 'max-w-md'"
      >
        <!-- Top Navigation Bar -->
        <div
          class="p-3.5 border-b border-ink/10 flex items-center justify-between bg-surface-raised/50"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-8 h-8 rounded-lg bg-brand-violet/10 text-brand-violet flex items-center justify-center font-bold"
            >
              <Icon icon="lucide:bot" width="18" />
            </div>
            <div>
              <h3 class="text-sm font-semibold text-ink">STAIJA STEM Tutor</h3>
              <p class="text-[11px] text-ink/50 truncate max-w-[200px]">{{ lessonTitle }}</p>
            </div>
          </div>

          <!-- Tab Controls & Expand Button -->
          <div class="flex items-center gap-2">
            <div class="flex items-center bg-ink/5 p-0.5 rounded-lg border border-ink/10">
              <button
                type="button"
                class="px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5"
                :class="
                  activeTab === 'chat'
                    ? 'bg-surface text-ink shadow-xs font-semibold'
                    : 'text-ink/60 hover:text-ink'
                "
                @click="activeTab = 'chat'"
              >
                <Icon icon="lucide:message-square" width="13" />
                Chat
              </button>
              <button
                type="button"
                class="px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5"
                :class="
                  activeTab === 'whiteboard'
                    ? 'bg-surface text-ink shadow-xs font-semibold'
                    : 'text-ink/60 hover:text-ink'
                "
                @click="activeTab = 'whiteboard'"
              >
                <Icon icon="lucide:layout-dashboard" width="13" />
                Whiteboard
                <span
                  v-if="whiteboardCards.length > 0"
                  class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-brand-violet/10 text-brand-violet"
                >
                  {{ whiteboardCards.length }}
                </span>
              </button>
            </div>

            <button
              type="button"
              class="p-1.5 rounded-lg text-ink/50 hover:text-ink hover:bg-ink/5 transition-colors hidden sm:inline-flex"
              :title="isExpanded ? 'Collapse' : 'Expand full view'"
              @click="isExpanded = !isExpanded"
            >
              <Icon :icon="isExpanded ? 'lucide:minimize-2' : 'lucide:maximize-2'" width="16" />
            </button>

            <button
              type="button"
              class="p-1.5 rounded-lg text-ink/50 hover:text-ink hover:bg-ink/5 transition-colors"
              @click="emit('close')"
            >
              <Icon icon="lucide:x" width="18" />
            </button>
          </div>
        </div>

        <!-- TAB 1: Conversational Chat Flow -->
        <template v-if="activeTab === 'chat'">
          <!-- Chat Container -->
          <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            <div
              v-for="msg in messages"
              :key="msg.id"
              :class="[
                'flex flex-col max-w-[90%]',
                msg.role === 'user' ? 'self-end items-end' : 'self-start items-start',
              ]"
            >
              <div
                :class="[
                  'p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm relative group',
                  msg.role === 'user'
                    ? 'bg-brand-violet text-white rounded-br-none'
                    : 'bg-surface-raised border border-ink/10 text-ink rounded-bl-none',
                ]"
              >
                <div v-for="(block, idx) in parseContentBlocks(msg.content)" :key="idx">
                  <MermaidViewer v-if="block.type === 'mermaid'" :code="block.content" />
                  <div v-else v-html="formatFormattedText(block.content)" />
                </div>

                <!-- Pin to Whiteboard Button -->
                <button
                  v-if="msg.role === 'assistant' && msg.id !== 'intro'"
                  type="button"
                  class="mt-2.5 pt-2 border-t border-ink/10 text-xs text-ink/60 hover:text-brand-violet flex items-center gap-1 transition-colors"
                  :disabled="msg.pinned"
                  @click="pinToWhiteboard(msg)"
                >
                  <Icon icon="lucide:pin" width="12" />
                  {{ msg.pinned ? 'Pinned to Whiteboard' : 'Pin to Whiteboard' }}
                </button>
              </div>

              <!-- Follow-up suggestion chips -->
              <div
                v-if="msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && !loading"
                class="mt-2.5 flex flex-wrap gap-1.5"
              >
                <button
                  v-for="(chip, cIdx) in msg.suggestedFollowUps"
                  :key="cIdx"
                  type="button"
                  class="text-xs bg-brand-violet/10 text-brand-violet hover:bg-brand-violet/20 font-medium px-2.5 py-1 rounded-lg border border-brand-violet/20 transition-all text-left"
                  @click="sendQuestion(chip)"
                >
                  {{ chip }}
                </button>
              </div>
            </div>

            <!-- Loading indicator -->
            <div
              v-if="loading"
              class="self-start flex items-center gap-2 p-3 bg-surface-raised border border-ink/10 rounded-2xl rounded-bl-none text-xs text-ink/60"
            >
              <Icon icon="lucide:loader-2" width="16" class="animate-spin text-brand-violet" />
              Tutor is thinking...
            </div>

            <div
              v-if="error"
              class="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl"
            >
              {{ error }}
            </div>
          </div>

          <!-- Workflow Mode Selector Bar -->
          <div
            class="px-3 py-1.5 border-t border-ink/5 bg-surface-raised/40 flex items-center gap-1 overflow-x-auto text-xs"
          >
            <span class="text-xs text-ink/60 font-medium shrink-0 mr-1">Mode</span>
            <button
              v-for="mode in [
                { id: 'standard', label: 'Standard' },
                { id: 'socratic', label: 'Socratic' },
                { id: 'deep', label: 'Deep Theory' },
                { id: 'diagram', label: 'Visual Map' },
                { id: 'practice', label: 'Practice' },
              ] as const"
              :key="mode.id"
              type="button"
              class="px-2 py-0.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap"
              :class="
                activeMode === mode.id ? 'bg-brand-violet text-white' : 'text-ink/60 hover:bg-ink/5'
              "
              @click="activeMode = mode.id"
            >
              {{ mode.label }}
            </button>
          </div>

          <!-- Input Bar -->
          <div class="p-3 border-t border-ink/10 bg-surface-raised/30">
            <form class="flex items-center gap-2" @submit.prevent="sendQuestion()">
              <input
                v-model="inputQuestion"
                type="text"
                placeholder="Ask a question, request a derivation or diagram..."
                class="flex-1 text-sm bg-surface border border-ink/15 rounded-xl px-3.5 py-2.5 text-ink placeholder:text-ink/40 focus:outline-none focus:border-brand-violet"
                :disabled="loading"
              />
              <UiButton
                type="submit"
                variant="primary"
                size="sm"
                :disabled="!inputQuestion.trim() || loading"
                class="!px-3 !py-2.5"
              >
                <Icon icon="lucide:send" width="16" />
              </UiButton>
            </form>
          </div>
        </template>

        <!-- TAB 2: Interactive Structured Whiteboard -->
        <template v-else>
          <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
            <!-- Study Notes Area -->
            <div class="p-4 rounded-xl border border-ink/10 bg-surface-raised flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Icon icon="lucide:book-open" width="14" class="text-brand-violet" />
                  My Lesson Study Notes
                </span>
                <span class="text-[11px] text-ink/40">Auto-saved</span>
              </div>
              <textarea
                v-model="studentNotes"
                rows="4"
                placeholder="Take notes on key formulas, experimental designs, and derivations here..."
                class="w-full text-xs font-mono bg-surface border border-ink/10 rounded-lg p-2.5 text-ink focus:outline-none focus:border-brand-violet resize-none"
                @input="saveNotes"
              />
            </div>

            <!-- Pinned Concept Cards -->
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-semibold text-ink">
                  Pinned Whiteboard Cards ({{ whiteboardCards.length }})
                </h4>
                <button
                  v-if="whiteboardCards.length > 0"
                  type="button"
                  class="text-xs text-red-600 hover:text-red-700 font-medium"
                  @click="
                    whiteboardCards = [];
                    saveWhiteboard();
                  "
                >
                  Clear all
                </button>
              </div>

              <div
                v-if="whiteboardCards.length === 0"
                class="text-center py-10 border border-dashed border-ink/15 rounded-xl"
              >
                <Icon icon="lucide:layout-grid" width="28" class="text-ink/20 mx-auto mb-2" />
                <p class="text-xs text-ink/50">No cards pinned yet.</p>
                <p class="text-[11px] text-ink/40 mt-1">
                  Click "Pin to Whiteboard" on any explanation or diagram in chat to keep it here.
                </p>
              </div>

              <div
                v-for="card in whiteboardCards"
                :key="card.id"
                class="p-4 rounded-xl border border-ink/10 bg-surface-raised shadow-xs flex flex-col gap-3"
              >
                <div class="flex items-center justify-between border-b border-ink/10 pb-2">
                  <span class="text-xs font-semibold text-brand-violet truncate max-w-[260px]">
                    {{ card.title }}
                  </span>
                  <button
                    type="button"
                    class="text-ink/40 hover:text-red-600 p-1 rounded transition-colors"
                    title="Remove from Whiteboard"
                    @click="removeWhiteboardCard(card.id)"
                  >
                    <Icon icon="lucide:trash-2" width="13" />
                  </button>
                </div>

                <div class="text-xs leading-relaxed text-ink/90 flex flex-col gap-2">
                  <div v-for="(block, bIdx) in parseContentBlocks(card.content)" :key="bIdx">
                    <MermaidViewer v-if="block.type === 'mermaid'" :code="block.content" />
                    <div v-else v-html="formatFormattedText(block.content)" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>
