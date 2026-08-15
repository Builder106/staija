<script setup lang="ts">
import { documentToHtmlString } from '@contentful/rich-text-html-renderer';
import { BLOCKS, INLINES, MARKS, type Document } from '@contentful/rich-text-types';
import { computed } from 'vue';

// Single shared Contentful Rich-Text renderer for the whole app — used by
// the LMS LessonView/AssignmentView and (going forward) BlogPost.vue.
// Uses the official @contentful/rich-text-html-renderer with custom
// node renderers so the output picks up our brand styling instead of
// looking like raw HTML.
//
// `body` arrives as a Contentful `Document`. Plain strings (legacy
// content) fall through as-is so callers can ignore the difference.

const props = defineProps<{ body: unknown }>();

const html = computed(() => {
  if (!props.body) return '';
  if (typeof props.body === 'string') return props.body;
  try {
    return documentToHtmlString(props.body as Document, {
      renderMark: {
        [MARKS.CODE]: text =>
          `<code class="font-mono text-[0.9em] bg-ink/[0.06] px-1.5 py-0.5 rounded">${text}</code>`,
      },
      renderNode: {
        [BLOCKS.PARAGRAPH]: (_node, next) =>
          `<p class="text-base leading-relaxed text-ink/85 mb-4">${next(_node.content)}</p>`,
        [BLOCKS.HEADING_1]: (_node, next) =>
          `<h1 class="font-display text-3xl font-bold text-ink mt-8 mb-3">${next(_node.content)}</h1>`,
        [BLOCKS.HEADING_2]: (_node, next) =>
          `<h2 class="font-display text-2xl font-bold text-ink mt-7 mb-3">${next(_node.content)}</h2>`,
        [BLOCKS.HEADING_3]: (_node, next) =>
          `<h3 class="font-display text-xl font-semibold text-ink mt-6 mb-2">${next(_node.content)}</h3>`,
        [BLOCKS.UL_LIST]: (_node, next) =>
          `<ul class="list-disc pl-6 mb-4 space-y-1.5 text-ink/85">${next(_node.content)}</ul>`,
        [BLOCKS.OL_LIST]: (_node, next) =>
          `<ol class="list-decimal pl-6 mb-4 space-y-1.5 text-ink/85">${next(_node.content)}</ol>`,
        [BLOCKS.QUOTE]: (_node, next) =>
          `<blockquote class="border-l-4 border-brand-violet pl-4 my-5 italic text-ink/70">${next(_node.content)}</blockquote>`,
        [BLOCKS.HR]: () => `<hr class="my-8 border-t hairline-ink" />`,
        [BLOCKS.EMBEDDED_ASSET]: node => {
          // The asset reference resolves to fields.file.url after
          // Contentful's link resolution. The mirror leaves links
          // unresolved, so callers passing raw entries may get
          // undefined here — render nothing rather than break.
          const target = (
            node.data as { target?: { fields?: { file?: { url?: string }; title?: string } } }
          ).target;
          const url = target?.fields?.file?.url;
          const title = target?.fields?.title ?? '';
          if (!url) return '';
          const src = url.startsWith('//') ? `https:${url}` : url;
          return `<img src="${src}" alt="${title}" class="my-6 rounded-lg w-full" loading="lazy" />`;
        },
        [INLINES.HYPERLINK]: (node, next) => {
          const uri = (node.data as { uri?: string }).uri ?? '#';
          return `<a href="${uri}" target="_blank" rel="noopener noreferrer" class="text-brand-violet underline hover:no-underline">${next(node.content)}</a>`;
        },
      },
    });
  } catch (err) {
    console.error('[RichText] render failed', err);
    return '';
  }
});
</script>

<template>
  <div class="rich-text" v-html="html" />
</template>
