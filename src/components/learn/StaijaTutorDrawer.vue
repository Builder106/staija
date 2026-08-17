<script setup lang="ts">
import { Icon } from '@iconify/vue';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { nextTick, ref, watch } from 'vue';
import { askLmsTutor, type AskLmsTutorResult } from '../../services/learn';
import UiButton from '../ui/UiButton.vue';
import MermaidViewer from './MermaidViewer.vue';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestedFollowUps?: string[];
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

const inputQuestion = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const messages = ref<Message[]>([]);
const chatContainer = ref<HTMLElement | null>(null);

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
  isOpen => {
    if (isOpen && messages.value.length === 0) {
      resetChat();
    }
  },
  { immediate: true }
);

async function scrollToBottom() {
  await nextTick();
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
}

async function sendQuestion(textToSend?: string) {
  const q = (textToSend || inputQuestion.value).trim();
  if (!q || loading.value) return;

  inputQuestion.value = '';
  error.value = null;

  const userMsgId = `user-${Date.now()}`;
  messages.value.push({
    id: userMsgId,
    role: 'user',
    content: q,
  });

  await scrollToBottom();
  loading.value = true;

  try {
    const history = messages.value
      .filter(m => m.id !== 'intro')
      .map(m => ({ role: m.role, content: m.content }));

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
  } catch (err: unknown) {
    console.error('Tutor error:', err);
    error.value = 'Failed to fetch tutor response. Please check your network or try again.';
  } finally {
    loading.value = false;
  }
}

// Parses text blocks, rendering Mermaid blocks into <MermaidViewer> components
function parseContentBlocks(text: string) {
  const blocks: Array<{ type: 'text' | 'mermaid' | 'math'; content: string }> = [];

  // Split by mermaid code blocks ```mermaid ... ```
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

  // 1. Render block math $$ ... $$
  let formatted = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return math;
    }
  });

  // 2. Render inline math \( ... \) or $ ... $
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
      '<code class="px-1 py-0.5 bg-ink/10 rounded text-brand-violet font-mono text-xs">$1</code>'
    )
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc">$1</li>');

  return formatted;
}
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

    <!-- Slide-over Drawer -->
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
        class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-surface border-l border-ink/10 z-50 shadow-2xl flex flex-col"
      >
        <!-- Header -->
        <div
          class="p-4 border-b border-ink/10 flex items-center justify-between bg-surface-raised/50"
        >
          <div class="flex items-center gap-2">
            <div
              class="w-8 h-8 rounded-lg bg-brand-violet/10 text-brand-violet flex items-center justify-center font-bold"
            >
              <Icon icon="lucide:bot" width="18" />
            </div>
            <div>
              <h3 class="text-sm font-semibold text-ink">STAIJA AI Tutor</h3>
              <p class="text-[11px] text-ink/50 truncate max-w-[220px]">{{ lessonTitle }}</p>
            </div>
          </div>
          <button
            type="button"
            class="p-1.5 rounded-lg text-ink/50 hover:text-ink hover:bg-ink/5 transition-colors"
            @click="emit('close')"
          >
            <Icon icon="lucide:x" width="18" />
          </button>
        </div>

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
                'p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm',
                msg.role === 'user'
                  ? 'bg-brand-violet text-white rounded-br-none'
                  : 'bg-surface-raised border border-ink/10 text-ink rounded-bl-none',
              ]"
            >
              <div v-for="(block, idx) in parseContentBlocks(msg.content)" :key="idx">
                <MermaidViewer v-if="block.type === 'mermaid'" :code="block.content" />
                <div v-else v-html="formatFormattedText(block.content)" />
              </div>
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
                class="text-xs bg-brand-violet/10 text-brand-violet hover:bg-brand-violet/20 font-medium px-2.5 py-1 rounded-full border border-brand-violet/20 transition-all text-left"
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

        <!-- Input Bar -->
        <div class="p-3 border-t border-ink/10 bg-surface-raised/30">
          <form class="flex items-center gap-2" @submit.prevent="sendQuestion()">
            <input
              v-model="inputQuestion"
              type="text"
              placeholder="Ask a question or request a diagram..."
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
      </div>
    </Transition>
  </Teleport>
</template>
