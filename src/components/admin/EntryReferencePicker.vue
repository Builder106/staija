<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref } from 'vue';
import { listEntries, type EntrySummary, type LmsContentType } from '../../services/lmsContent';

// A multi-select picker for entries of a given content type. v-model is
// an ordered array of entry IDs. Items can be reordered with up/down
// buttons (Phase 1 — drag-and-drop is overkill for cohort-sized lists).
const props = defineProps<{
  modelValue: string[];
  contentType: LmsContentType;
  label?: string;
  // Optional. When the parent already knows which entry it's editing,
  // pass it here so we can hide it from the picker (a module shouldn't
  // be able to add itself to its own children, etc.).
  excludeId?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

const all = ref<EntrySummary[]>([]);
const loading = ref(false);
const search = ref('');

async function load() {
  loading.value = true;
  try {
    all.value = await listEntries(props.contentType, { limit: 100 });
  } catch {
    all.value = [];
  } finally {
    loading.value = false;
  }
}

// Map of id → entry for quick label lookup. Computed so adding an item
// re-renders without a refetch.
const byId = computed(() => {
  const m = new Map<string, EntrySummary>();
  for (const e of all.value) m.set(e.id, e);
  return m;
});

const selected = computed(() =>
  props.modelValue.map((id) => byId.value.get(id)).filter((e): e is EntrySummary => !!e),
);

const candidates = computed(() => {
  const term = search.value.trim().toLowerCase();
  return all.value
    .filter((e) => {
      if (props.modelValue.includes(e.id)) return false;
      if (props.excludeId && e.id === props.excludeId) return false;
      if (!term) return true;
      const title = ((e.fields.title as string) ?? '').toLowerCase();
      const slug = ((e.fields.slug as string) ?? '').toLowerCase();
      return title.includes(term) || slug.includes(term);
    })
    .slice(0, 20);
});

function add(id: string) {
  emit('update:modelValue', [...props.modelValue, id]);
}
function remove(idx: number) {
  const next = [...props.modelValue];
  next.splice(idx, 1);
  emit('update:modelValue', next);
}
function moveUp(idx: number) {
  if (idx === 0) return;
  const next = [...props.modelValue];
  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
  emit('update:modelValue', next);
}
function moveDown(idx: number) {
  if (idx === props.modelValue.length - 1) return;
  const next = [...props.modelValue];
  [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
  emit('update:modelValue', next);
}

function summarize(e: EntrySummary): string {
  const title = (e.fields.title as string) ?? '(untitled)';
  const slug = (e.fields.slug as string) ?? '';
  return slug ? `${title} | ${slug}` : title;
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-3">
    <label v-if="label" class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
      {{ label }}
    </label>

    <!-- Selected items, in author-defined order -->
    <ul v-if="selected.length > 0" class="flex flex-col gap-1">
      <li
        v-for="(item, idx) in selected"
        :key="item.id"
        class="flex items-center gap-2 px-3 py-2 rounded-md border hairline-ink bg-surface text-sm"
      >
        <span class="text-ink/40 text-xs font-mono w-5">{{ idx + 1 }}.</span>
        <span class="flex-1 text-ink truncate">{{ summarize(item) }}</span>
        <span
          v-if="item.isDraft"
          class="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded"
          >Draft</span
        >
        <button
          type="button"
          class="p-1 rounded text-ink/40 hover:text-ink hover:bg-ink/5 disabled:opacity-30 disabled:cursor-not-allowed"
          :disabled="idx === 0"
          @click="moveUp(idx)"
        >
          <Icon icon="lucide:chevron-up" width="14" />
        </button>
        <button
          type="button"
          class="p-1 rounded text-ink/40 hover:text-ink hover:bg-ink/5 disabled:opacity-30 disabled:cursor-not-allowed"
          :disabled="idx === selected.length - 1"
          @click="moveDown(idx)"
        >
          <Icon icon="lucide:chevron-down" width="14" />
        </button>
        <button type="button" class="p-1 rounded text-red-600 hover:bg-red-50" @click="remove(idx)">
          <Icon icon="lucide:x" width="14" />
        </button>
      </li>
    </ul>
    <p v-else class="text-sm text-ink/50">None selected.</p>

    <!-- Candidate search/picker -->
    <div class="flex flex-col gap-2 mt-1">
      <input
        v-model="search"
        type="text"
        :placeholder="`Search ${contentType}s by title or slug…`"
        class="w-full px-3 py-2 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet"
      />
      <div v-if="loading" class="text-xs text-ink/50">Loading…</div>
      <div v-else-if="candidates.length === 0 && search" class="text-xs text-ink/50">
        No matches.
      </div>
      <ul
        v-else-if="candidates.length > 0"
        class="flex flex-col gap-1 max-h-48 overflow-y-auto border hairline-ink rounded-md"
      >
        <li v-for="c in candidates" :key="c.id">
          <button
            type="button"
            class="flex items-center w-full text-left gap-2 px-3 py-2 text-sm hover:bg-ink/[0.03]"
            @click="add(c.id)"
          >
            <Icon icon="lucide:plus" width="14" class="text-ink/40" />
            <span class="flex-1 truncate">{{ summarize(c) }}</span>
            <span
              v-if="c.isDraft"
              class="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded"
              >Draft</span
            >
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
