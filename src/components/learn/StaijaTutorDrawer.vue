<script setup lang="ts">
import { Icon } from '@iconify/vue';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { computed, defineEmits, defineProps, nextTick, ref, watch } from 'vue';
import {
  askLmsTutorStream,
  deleteTutorSession,
  getTutorSession,
  listTutorSessions,
  saveTutorPage,
  type AskLmsTutorPayload,
  type AskLmsTutorResult,
  type TutorSessionRecord,
  type TutorStreamEvent,
} from '../../services/learn';
import UiButton from '../ui/UiButton.vue';
import MermaidViewer from './MermaidViewer.vue';
import JsxGraphViewer from './JsxGraphViewer.vue';

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

const activeTab = ref<'chat' | 'whiteboard' | 'history'>('chat');
const isExpanded = ref(false);
const activeMode = ref<'standard' | 'socratic' | 'deep' | 'diagram' | 'practice'>('standard');

const inputQuestion = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const messages = ref<Message[]>([]);
const whiteboardCards = ref<WhiteboardCard[]>([]);
const studentNotes = ref('');
const chatContainer = ref<HTMLElement | null>(null);

const activeSessionId = ref<string | null>(null);
const pastSessions = ref<TutorSessionRecord[]>([]);
const loadingSessions = ref(false);

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
    console.warn('Failed to save whiteboard locally:', err);
  }
}

async function pinToWhiteboard(msg: Message) {
  const cardId = `wb-${Date.now()}`;
  const firstLine =
    msg.content
      .split('\n')[0]
      .replace(/[#*`_]/g, '')
      .trim() || 'Concept Note';
  const cardTitle = firstLine.length > 50 ? `${firstLine.substring(0, 47)}...` : firstLine;

  const card: WhiteboardCard = {
    id: cardId,
    title: cardTitle,
    content: msg.content,
    createdAt: Date.now(),
  };

  whiteboardCards.value.unshift(card);
  msg.pinned = true;
  saveWhiteboard();

  if (activeSessionId.value) {
    try {
      await saveTutorPage({
        sessionId: activeSessionId.value,
        pageId: cardId,
        title: cardTitle,
        kind: 'notes',
        content: msg.content,
      });
    } catch (err) {
      console.warn('Could not sync whiteboard card to cloud:', err);
    }
  }
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
        'Plot an interactive STEM geometry diagram',
        'Give a real-world example',
        'What are common misconceptions here?',
      ],
    },
  ];
}

async function refreshSessions() {
  loadingSessions.value = true;
  try {
    const list = await listTutorSessions({ limit: 15 });
    pastSessions.value = list;
  } catch (err) {
    console.warn('Could not load past tutor sessions:', err);
  } finally {
    loadingSessions.value = false;
  }
}

async function loadSession(sessionId: string) {
  loading.value = true;
  try {
    const detail = await getTutorSession(sessionId);
    activeSessionId.value = detail.session.id;
    activeMode.value = detail.session.mode || 'standard';

    messages.value = detail.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      suggestedFollowUps: m.suggestedFollowUps,
    }));

    if (detail.pages && detail.pages.length > 0) {
      whiteboardCards.value = detail.pages.map((p) => {
        let cardContent = p.content;
        if (p.kind === 'mermaid' && !cardContent.includes('```mermaid')) {
          cardContent = `\`\`\`mermaid\n${cardContent}\n\`\`\``;
        } else if (p.kind === 'geometry' && !cardContent.includes('```geometry')) {
          cardContent = `\`\`\`geometry\n${cardContent}\n\`\`\``;
        }
        return {
          id: p.id,
          title: p.title,
          content: cardContent,
          createdAt: p.createdAt,
        };
      });
      saveWhiteboard();
    }

    activeTab.value = 'chat';
    await scrollToBottom();
  } catch (err) {
    console.error('Could not load session:', err);
    error.value = 'Failed to load session details.';
  } finally {
    loading.value = false;
  }
}

async function startNewSession() {
  activeSessionId.value = null;
  resetChat();
  activeTab.value = 'chat';
}

async function handleDeleteSession(sessionId: string) {
  try {
    await deleteTutorSession(sessionId);
    pastSessions.value = pastSessions.value.filter((s) => s.id !== sessionId);
    if (activeSessionId.value === sessionId) {
      activeSessionId.value = null;
      resetChat();
    }
  } catch (err) {
    console.error('Failed to delete session:', err);
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      loadSavedState();
      if (messages.value.length === 0) {
        resetChat();
      }
      refreshSessions();
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
    content: q.replace(/^\[.*?\]\s*/, ''),
  });

  const assistantMsgId = `asst-${Date.now()}`;
  const assistantMessage: Message = {
    id: assistantMsgId,
    role: 'assistant',
    content: '',
    suggestedFollowUps: [],
  };
  messages.value.push(assistantMessage);

  await scrollToBottom();
  loading.value = true;

  try {
    const history = messages.value
      .filter((m) => m.id !== 'intro' && m.id !== assistantMsgId)
      .map((m) => ({ role: m.role, content: m.content }));

    const payload: AskLmsTutorPayload = {
      sessionId: activeSessionId.value || undefined,
      clientMessageId: userMsgId,
      lessonTitle: props.lessonTitle,
      lessonBodyPlain: props.lessonBodyPlain,
      courseTitle: props.courseTitle,
      program: props.program,
      studentQuestion: q,
      mode: activeMode.value,
      chatHistory: history,
      questionContext: props.initialQuestionContext,
    };

    const result: AskLmsTutorResult = await askLmsTutorStream(
      payload,
      (event: TutorStreamEvent) => {
        if (event.type === 'message-start') {
          if (event.sessionId) activeSessionId.value = event.sessionId;
        } else if (event.type === 'text-delta') {
          assistantMessage.content += event.text;
          scrollToBottom();
        } else if (event.type === 'page-complete') {
          if (!whiteboardCards.value.some((c) => c.id === event.page.id)) {
            let cardContent = event.page.content;
            if (event.page.kind === 'mermaid' && !cardContent.includes('```mermaid')) {
              cardContent = `\`\`\`mermaid\n${cardContent}\n\`\`\``;
            } else if (event.page.kind === 'geometry' && !cardContent.includes('```geometry')) {
              cardContent = `\`\`\`geometry\n${cardContent}\n\`\`\``;
            }
            whiteboardCards.value.unshift({
              id: event.page.id,
              title: event.page.title,
              content: cardContent,
              createdAt: event.page.createdAt,
            });
            saveWhiteboard();
          }
        } else if (event.type === 'suggestions') {
          assistantMessage.suggestedFollowUps = event.items;
        } else if (event.type === 'done') {
          if (event.sessionId) activeSessionId.value = event.sessionId;
        }
      },
    );

    if (!assistantMessage.content && result.reply) {
      assistantMessage.content = result.reply;
      assistantMessage.suggestedFollowUps = result.suggestedFollowUps;
    }
    if (result.sessionId) {
      activeSessionId.value = result.sessionId;
    }

    await scrollToBottom();
  } catch (err) {
    console.error('Tutor error:', err);
    error.value = 'Failed to fetch tutor response. Please check your network or try again.';
  } finally {
    loading.value = false;
  }
}

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
      return [{ type: 'mermaid', content: trimmed }];
    }
    if (trimmed.startsWith('{') && trimmed.includes('"elements"')) {
      return [{ type: 'geometry', content: trimmed }];
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

const pedagogicalModes = [
  { id: 'standard' as const, label: 'Standard' },
  { id: 'socratic' as const, label: 'Socratic' },
  { id: 'deep' as const, label: 'Deep Theory' },
  { id: 'diagram' as const, label: 'Visual Map' },
  { id: 'practice' as const, label: 'Practice' },
];
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop Overlay -->
    <Transition
      enter-active-class="transition-opacity duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 bg-ink/30 backdrop-blur-xs"
        @click="emit('close')"
      />
    </Transition>

    <!-- Slide-over Drawer Panel -->
    <Transition
      enter-active-class="transition-transform duration-300 ease-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-200 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <aside
        v-if="open"
        class="fixed right-0 top-0 bottom-0 w-full transition-all duration-300 bg-surface border-l border-ink/10 z-50 shadow-2xl flex flex-col"
        :class="isExpanded ? 'max-w-3xl' : 'max-w-md'"
      >
        <!-- Top Header & Navigation -->
        <div
          class="px-4 py-3.5 border-b border-ink/10 flex items-center justify-between gap-2 bg-surface-raised/40"
        >
          <div class="flex items-center gap-2 overflow-hidden">
            <div
              class="w-8 h-8 rounded-lg bg-brand-violet/10 text-brand-violet flex items-center justify-center shrink-0"
            >
              <Icon icon="lucide:sparkles" width="18" />
            </div>
            <div class="truncate">
              <h3 class="text-sm font-semibold text-ink leading-tight">STAIJA STEM Tutor</h3>
              <p class="text-xs text-ink/50 truncate">
                {{ props.lessonTitle }}
              </p>
            </div>
          </div>

          <!-- Tabs, Expand & Close -->
          <div class="flex items-center gap-1.5 shrink-0">
            <div class="flex items-center bg-ink/5 p-0.5 rounded-lg border border-ink/10">
              <button
                type="button"
                class="px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1"
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
              <button
                type="button"
                class="px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1"
                :class="
                  activeTab === 'history'
                    ? 'bg-surface text-ink shadow-xs font-semibold'
                    : 'text-ink/60 hover:text-ink'
                "
                @click="
                  activeTab = 'history';
                  refreshSessions();
                "
              >
                <Icon icon="lucide:history" width="13" />
                History
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
              v-for="(msg, idx) in messages"
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
                <div v-for="(block, bIdx) in parseContentBlocks(msg.content)" :key="bIdx">
                  <MermaidViewer v-if="block.type === 'mermaid'" :code="block.content" />
                  <JsxGraphViewer v-else-if="block.type === 'geometry'" :spec="block.content" />
                  <div
                    v-else
                    class="whitespace-pre-wrap"
                    v-html="formatFormattedText(block.content)"
                  />
                </div>

                <!-- Pin to Whiteboard Action -->
                <div
                  v-if="msg.role === 'assistant' && idx > 0 && msg.content"
                  class="mt-3 pt-2 border-t border-ink/10 flex items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    class="text-xs font-medium text-brand-violet hover:text-brand-violet/80 flex items-center gap-1 transition-colors"
                    :disabled="msg.pinned"
                    @click="pinToWhiteboard(msg)"
                  >
                    <Icon :icon="msg.pinned ? 'lucide:check' : 'lucide:pin'" width="13" />
                    {{ msg.pinned ? 'Pinned to Whiteboard' : 'Pin to Whiteboard' }}
                  </button>
                </div>
              </div>

              <!-- Suggested Follow-ups -->
              <div
                v-if="
                  msg.suggestedFollowUps &&
                  msg.suggestedFollowUps.length > 0 &&
                  idx === messages.length - 1
                "
                class="mt-3 flex flex-wrap gap-1.5"
              >
                <button
                  v-for="(suggestion, sIdx) in msg.suggestedFollowUps"
                  :key="sIdx"
                  type="button"
                  class="text-xs bg-brand-violet/10 text-brand-violet hover:bg-brand-violet/20 font-medium px-2.5 py-1 rounded-lg border border-brand-violet/20 transition-all text-left"
                  :disabled="loading"
                  @click="sendQuestion(suggestion)"
                >
                  {{ suggestion }}
                </button>
              </div>
            </div>

            <!-- Loading indicator -->
            <div
              v-if="loading && (!messages.length || messages[messages.length - 1]?.role === 'user')"
              class="flex items-center gap-2 self-start bg-surface-raised border border-ink/10 px-3.5 py-2.5 rounded-2xl text-xs text-ink/60"
            >
              <Icon icon="lucide:loader-2" class="animate-spin text-brand-violet" width="16" />
              <span>Tutor is formulating response...</span>
            </div>

            <!-- Error message -->
            <div
              v-if="error"
              class="p-3 bg-red-500/10 border border-red-500/20 text-red-600 rounded-xl text-xs"
            >
              {{ error }}
            </div>
          </div>

          <!-- Pedagogical Modes Bar -->
          <div
            class="px-4 py-2 border-t border-ink/10 bg-surface-raised/20 flex items-center gap-1.5 overflow-x-auto"
          >
            <span class="text-xs text-ink/60 font-medium shrink-0 mr-1">Mode</span>
            <button
              v-for="mode in pedagogicalModes"
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
        <template v-else-if="activeTab === 'whiteboard'">
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
                    <JsxGraphViewer v-else-if="block.type === 'geometry'" :spec="block.content" />
                    <div v-else v-html="formatFormattedText(block.content)" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- TAB 3: Past Sessions History -->
        <template v-else>
          <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="text-sm font-semibold text-ink">Tutor Session History</h4>
                <p class="text-xs text-ink/50">
                  Select a past session to continue learning or review derivations.
                </p>
              </div>
              <UiButton variant="primary" size="sm" @click="startNewSession">
                <Icon icon="lucide:plus" width="14" class="mr-1" />
                New Chat
              </UiButton>
            </div>

            <div v-if="loadingSessions" class="py-12 flex justify-center text-ink/40 text-xs">
              <Icon icon="lucide:loader-2" class="animate-spin mr-2" width="18" />
              Loading sessions...
            </div>

            <div
              v-else-if="pastSessions.length === 0"
              class="text-center py-12 border border-dashed border-ink/15 rounded-xl"
            >
              <Icon icon="lucide:message-square-off" width="28" class="text-ink/20 mx-auto mb-2" />
              <p class="text-xs text-ink/60 font-medium">No past sessions found</p>
              <p class="text-[11px] text-ink/40 mt-1">
                Your future AI tutoring conversations will be saved and archived here.
              </p>
            </div>

            <div v-else class="flex flex-col gap-2.5">
              <div
                v-for="s in pastSessions"
                :key="s.id"
                class="p-3.5 rounded-xl border border-ink/10 bg-surface-raised hover:border-brand-violet/40 transition-colors flex flex-col gap-1.5 cursor-pointer relative group"
                :class="activeSessionId === s.id ? 'ring-2 ring-brand-violet/30' : ''"
                @click="loadSession(s.id)"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold text-ink truncate max-w-[240px]">
                    {{ s.lessonTitle || 'General Session' }}
                  </span>
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] text-ink/40">
                      {{ new Date(s.updatedAt).toLocaleDateString() }}
                    </span>
                    <button
                      type="button"
                      class="text-ink/30 hover:text-red-600 p-0.5 rounded transition-colors"
                      title="Delete Session"
                      @click.stop="handleDeleteSession(s.id)"
                    >
                      <Icon icon="lucide:trash-2" width="12" />
                    </button>
                  </div>
                </div>

                <p v-if="s.lastMessage" class="text-[11px] text-ink/60 line-clamp-2">
                  {{ s.lastMessage }}
                </p>

                <div class="flex items-center gap-2 mt-1">
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-ink/5 text-ink/60 font-mono">
                    {{ s.messageCount || 0 }} messages
                  </span>
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded bg-brand-violet/10 text-brand-violet font-medium capitalize"
                  >
                    {{ s.mode || 'standard' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </aside>
    </Transition>
  </Teleport>
</template>
