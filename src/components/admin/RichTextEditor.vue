<script setup lang="ts">
import type { Document } from '@contentful/rich-text-types';
import { Icon } from '@iconify/vue';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { onBeforeUnmount, watch } from 'vue';
import {
  contentfulToTipTap,
  tipTapToContentful,
  type TipTapDoc,
} from '../../services/richTextSerializer';

// v-model passes Contentful RichText documents in/out. The editor
// converts to/from TipTap's internal JSON shape via the serializer.
const props = defineProps<{
  modelValue: Document | undefined | null;
  placeholder?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: Document] }>();

// Track whether the next emit was caused by our own watch updating the
// editor — avoids the infinite "set → onUpdate → emit → watch → set" loop.
let suppressEmit = false;

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      // We don't support code blocks in Contentful RichText, so disable
      // the codeBlock node. Inline `code` (mark) is still allowed and
      // round-trips cleanly.
      codeBlock: false,
      // The starter horizontalRule node is fine; matches Contentful HR.
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      protocols: ['http', 'https', 'mailto'],
      HTMLAttributes: {
        class: 'text-brand-violet underline hover:no-underline',
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    }),
    Placeholder.configure({
      placeholder: props.placeholder ?? 'Write the lesson body…',
    }),
  ],
  content: contentfulToTipTap(props.modelValue) as unknown as Record<string, unknown>,
  onUpdate({ editor: e }) {
    if (suppressEmit) return;
    const json = e.getJSON() as unknown as TipTapDoc;
    emit('update:modelValue', tipTapToContentful(json));
  },
  editorProps: {
    attributes: {
      class:
        'prose-editor focus:outline-none min-h-[280px] max-w-none px-5 py-4 text-base leading-relaxed text-ink/85',
    },
  },
});

// External updates (e.g. switching entries) need to overwrite the
// editor content. Compare references rather than deep-diff because the
// edit cycle is short and a fresh entry switch will always produce a
// new top-level reference.
watch(
  () => props.modelValue,
  (next, prev) => {
    if (!editor.value) return;
    if (next === prev) return;
    const ttDoc = contentfulToTipTap(next);
    suppressEmit = true;
    editor.value.commands.setContent(ttDoc as unknown as Record<string, unknown>, {
      emitUpdate: false,
    });
    suppressEmit = false;
  }
);

onBeforeUnmount(() => {
  editor.value?.destroy();
});

function isActive(name: string, attrs?: Record<string, unknown>) {
  return editor.value?.isActive(name, attrs) ?? false;
}

function toggleHeading(level: 1 | 2 | 3) {
  editor.value?.chain().focus().toggleHeading({ level }).run();
}
function toggleBold() {
  editor.value?.chain().focus().toggleBold().run();
}
function toggleItalic() {
  editor.value?.chain().focus().toggleItalic().run();
}
function toggleUnderline() {
  editor.value?.chain().focus().toggleUnderline().run();
}
function toggleCode() {
  editor.value?.chain().focus().toggleCode().run();
}
function toggleBulletList() {
  editor.value?.chain().focus().toggleBulletList().run();
}
function toggleOrderedList() {
  editor.value?.chain().focus().toggleOrderedList().run();
}
function toggleBlockquote() {
  editor.value?.chain().focus().toggleBlockquote().run();
}
function insertHr() {
  editor.value?.chain().focus().setHorizontalRule().run();
}

function setLink() {
  if (!editor.value) return;
  const previous = editor.value.getAttributes('link').href as string | undefined;
  const url = window.prompt('Link URL', previous ?? 'https://');
  if (url === null) return;
  if (url === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
}
</script>

<template>
  <div class="rich-text-editor border hairline-ink rounded-lg bg-surface overflow-hidden">
    <!-- Toolbar -->
    <div class="flex flex-wrap gap-1 px-3 py-2 border-b hairline-ink bg-ink/[0.02]">
      <button
        v-for="b in [
          {
            icon: 'lucide:heading-1',
            label: 'H1',
            fn: () => toggleHeading(1),
            name: 'heading',
            attrs: { level: 1 },
          },
          {
            icon: 'lucide:heading-2',
            label: 'H2',
            fn: () => toggleHeading(2),
            name: 'heading',
            attrs: { level: 2 },
          },
          {
            icon: 'lucide:heading-3',
            label: 'H3',
            fn: () => toggleHeading(3),
            name: 'heading',
            attrs: { level: 3 },
          },
        ]"
        :key="b.label"
        type="button"
        :title="b.label"
        :class="[
          'p-1.5 rounded text-ink/70 hover:bg-ink/5 transition-colors',
          isActive(b.name, b.attrs) ? 'bg-ink/10 text-ink' : '',
        ]"
        @click="b.fn"
      >
        <Icon :icon="b.icon" width="16" />
      </button>

      <span class="w-px self-stretch mx-1 bg-ink/10" />

      <button
        type="button"
        title="Bold"
        @click="toggleBold"
        :class="[
          'p-1.5 rounded text-ink/70 hover:bg-ink/5',
          isActive('bold') ? 'bg-ink/10 text-ink' : '',
        ]"
      >
        <Icon icon="lucide:bold" width="16" />
      </button>
      <button
        type="button"
        title="Italic"
        @click="toggleItalic"
        :class="[
          'p-1.5 rounded text-ink/70 hover:bg-ink/5',
          isActive('italic') ? 'bg-ink/10 text-ink' : '',
        ]"
      >
        <Icon icon="lucide:italic" width="16" />
      </button>
      <button
        type="button"
        title="Underline"
        @click="toggleUnderline"
        :class="[
          'p-1.5 rounded text-ink/70 hover:bg-ink/5',
          isActive('underline') ? 'bg-ink/10 text-ink' : '',
        ]"
      >
        <Icon icon="lucide:underline" width="16" />
      </button>
      <button
        type="button"
        title="Inline code"
        @click="toggleCode"
        :class="[
          'p-1.5 rounded text-ink/70 hover:bg-ink/5',
          isActive('code') ? 'bg-ink/10 text-ink' : '',
        ]"
      >
        <Icon icon="lucide:code" width="16" />
      </button>

      <span class="w-px self-stretch mx-1 bg-ink/10" />

      <button
        type="button"
        title="Bullet list"
        @click="toggleBulletList"
        :class="[
          'p-1.5 rounded text-ink/70 hover:bg-ink/5',
          isActive('bulletList') ? 'bg-ink/10 text-ink' : '',
        ]"
      >
        <Icon icon="lucide:list" width="16" />
      </button>
      <button
        type="button"
        title="Ordered list"
        @click="toggleOrderedList"
        :class="[
          'p-1.5 rounded text-ink/70 hover:bg-ink/5',
          isActive('orderedList') ? 'bg-ink/10 text-ink' : '',
        ]"
      >
        <Icon icon="lucide:list-ordered" width="16" />
      </button>
      <button
        type="button"
        title="Blockquote"
        @click="toggleBlockquote"
        :class="[
          'p-1.5 rounded text-ink/70 hover:bg-ink/5',
          isActive('blockquote') ? 'bg-ink/10 text-ink' : '',
        ]"
      >
        <Icon icon="lucide:quote" width="16" />
      </button>

      <span class="w-px self-stretch mx-1 bg-ink/10" />

      <button
        type="button"
        title="Link"
        @click="setLink"
        :class="[
          'p-1.5 rounded text-ink/70 hover:bg-ink/5',
          isActive('link') ? 'bg-ink/10 text-ink' : '',
        ]"
      >
        <Icon icon="lucide:link" width="16" />
      </button>
      <button
        type="button"
        title="Horizontal rule"
        @click="insertHr"
        class="p-1.5 rounded text-ink/70 hover:bg-ink/5"
      >
        <Icon icon="lucide:minus" width="16" />
      </button>
    </div>

    <!-- Editor surface -->
    <EditorContent :editor="editor" />
  </div>
</template>

<style>
/* Scoped styles for the contenteditable surface. Not scoped to this
   component because TipTap injects raw nodes that bypass scoped CSS. */
.prose-editor p {
  margin: 0 0 0.85em;
}
.prose-editor h1 {
  font-size: 1.85rem;
  font-weight: 700;
  margin: 1.4em 0 0.6em;
  line-height: 1.2;
}
.prose-editor h2 {
  font-size: 1.45rem;
  font-weight: 700;
  margin: 1.3em 0 0.5em;
  line-height: 1.25;
}
.prose-editor h3 {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 1.2em 0 0.4em;
  line-height: 1.3;
}
.prose-editor ul {
  list-style: disc;
  padding-left: 1.5em;
  margin: 0 0 0.85em;
}
.prose-editor ol {
  list-style: decimal;
  padding-left: 1.5em;
  margin: 0 0 0.85em;
}
.prose-editor li {
  margin-bottom: 0.25em;
}
.prose-editor blockquote {
  border-left: 3px solid var(--color-brand-violet);
  padding: 0.25em 0 0.25em 1em;
  margin: 0.6em 0 1.2em;
  color: rgba(14, 18, 23, 0.7);
  font-style: italic;
}
.prose-editor hr {
  border: 0;
  border-top: 1px solid rgba(14, 18, 23, 0.1);
  margin: 1.5em 0;
}
.prose-editor code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: rgba(14, 18, 23, 0.06);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}
.prose-editor a {
  color: var(--color-brand-violet);
  text-decoration: underline;
}
.prose-editor a:hover {
  text-decoration: none;
}

/* Placeholder rendered by @tiptap/extension-placeholder */
.prose-editor p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: rgba(14, 18, 23, 0.4);
  pointer-events: none;
  height: 0;
}
</style>
