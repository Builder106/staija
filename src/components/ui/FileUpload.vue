<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, ref } from 'vue';
import { compressFile, formatBytes } from '../../services/fileCompression';

const props = withDefaults(
  defineProps<{
    label?: string;
    accept?: string;
    maxSizeBytes?: number;
    /** Disable client-side image compression — useful for non-image documents that should pass through unchanged. */
    skipCompress?: boolean;
    /** Metadata about a file the applicant already uploaded into
     *  staging on a previous session. When present and no new file
     *  has been picked, the component renders a pre-attached state
     *  ("transcript-CV.pdf · 2.3 MB" with Keep / Replace / Remove)
     *  instead of the empty drop-zone. Required for cross-device
     *  resume — the FileUpload itself can't hold a File reference
     *  across reload, but it CAN show what was previously attached. */
    attachedFile?: { name: string; sizeBytes: number; contentType?: string } | null;
    /** When true, shows an inline "Uploading…" hint inside the
     *  filled-state card. Wired by Apply.vue's per-kind in-flight
     *  set so the applicant sees feedback while the staging upload
     *  is still in progress. */
    uploading?: boolean;
  }>(),
  {
    label: 'Upload file',
    accept: 'image/*,application/pdf',
    maxSizeBytes: 2 * 1024 * 1024,
    skipCompress: false,
    attachedFile: null,
    uploading: false,
  },
);

const emit = defineEmits<{
  (e: 'update:file', file: File | null): void;
  (e: 'error', message: string): void;
  /** Applicant clicked Remove on the pre-attached card. Parent
   *  should wipe the staged-file metadata (and best-effort delete
   *  the Storage object). Distinct from `update:file(null)` which
   *  also fires for clearing a freshly-picked file — the parent
   *  needs to know the difference to avoid trying to delete a
   *  Storage object that was never written for this device. */
  (e: 'clear-attached'): void;
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const selected = ref<File | null>(null);
const compressing = ref(false);
const compressionInfo = ref<{ original: number; output: number; compressed: boolean } | null>(null);

const isImage = computed(() => selected.value?.type.startsWith('image/') ?? false);

/** Render priority — picked-this-session beats pre-attached beats
 *  empty. Once the applicant picks a new file in this session, the
 *  attached prop is shadowed even if it's still being passed. */
const showFilled = computed(() => selected.value !== null);
const showAttached = computed(() => !showFilled.value && props.attachedFile !== null);

function attachedIcon(): string {
  const ct = props.attachedFile?.contentType ?? '';
  return ct.startsWith('image/') ? 'lucide:image' : 'lucide:file-text';
}

function pickNewFile() {
  // Replace: tell the parent to wipe the staged metadata + Storage
  // object FIRST, then open the picker. The picker's onChange will
  // emit `update:file` with the new file, which the parent uploads
  // to a fresh staging path. Doing clear-attached before the picker
  // means the parent doesn't have a stale path lingering during
  // the brief moment between picker-open and new-upload-start.
  emit('clear-attached');
  fileInput.value?.click();
}

function removeAttached() {
  emit('clear-attached');
}

async function onChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const raw = input.files?.[0];
  if (!raw) return;

  if (props.skipCompress || !raw.type.startsWith('image/')) {
    if (raw.size > props.maxSizeBytes) {
      emit(
        'error',
        `${raw.name} is ${formatBytes(raw.size)} — bigger than the ${formatBytes(props.maxSizeBytes)} limit. Compress it externally and try again.`,
      );
      input.value = '';
      return;
    }
    selected.value = raw;
    compressionInfo.value = null;
    emit('update:file', raw);
    return;
  }

  compressing.value = true;
  try {
    const result = await compressFile(raw, { maxSizeBytes: props.maxSizeBytes });
    if (result.outputBytes > props.maxSizeBytes) {
      emit(
        'error',
        `Couldn't shrink ${raw.name} below ${formatBytes(props.maxSizeBytes)} — current ${formatBytes(result.outputBytes)}. Try a smaller / lower-resolution photo.`,
      );
      input.value = '';
      return;
    }
    selected.value = result.file;
    compressionInfo.value = {
      original: result.originalBytes,
      output: result.outputBytes,
      compressed: result.compressed,
    };
    emit('update:file', result.file);
  } catch (err) {
    emit('error', err instanceof Error ? err.message : 'File processing failed');
    input.value = '';
  } finally {
    compressing.value = false;
  }
}

function clear() {
  selected.value = null;
  compressionInfo.value = null;
  if (fileInput.value) fileInput.value.value = '';
  emit('update:file', null);
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <label class="text-sm font-semibold text-ink/80">{{ label }}</label>

    <!-- Pre-attached state: applicant uploaded this file in a
         previous session; bytes live in staging. Distinct visual
         treatment (violet wash + "From your previous session" hint)
         so they know this didn't come from this device's picker —
         vs. the regular filled state below which means "you just
         picked this". Replace wipes + reopens the picker; Remove
         wipes without reopening. -->
    <div
      v-if="showAttached && attachedFile"
      class="flex items-center gap-3 border-2 hairline-ink !border-brand-violet/30 rounded-xl px-4 py-3 bg-brand-violet/5"
    >
      <Icon :icon="attachedIcon()" width="20" class="text-brand-violet shrink-0" />
      <div class="flex flex-col flex-1 min-w-0">
        <span class="text-sm font-semibold text-ink truncate">{{ attachedFile.name }}</span>
        <span class="text-xs text-ink/55">
          {{ formatBytes(attachedFile.sizeBytes) }} | From your previous session
        </span>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <button
          type="button"
          class="text-sm font-semibold text-ink/60 hover:text-brand-violet focus-ring-brand rounded-sm"
          @click="pickNewFile"
        >
          Replace
        </button>
        <button
          type="button"
          class="text-sm font-semibold text-ink/50 hover:text-red-600 focus-ring-brand rounded-sm"
          @click="removeAttached"
        >
          Remove
        </button>
      </div>
    </div>

    <!-- Empty drop zone. Visible when no file is picked this session
         AND nothing was pre-attached. -->
    <div
      v-else-if="!selected"
      class="flex items-center justify-center gap-3 border-2 border-dashed hairline-ink rounded-xl px-6 py-8 cursor-pointer hover:border-brand-violet/40 hover:bg-brand-violet/5 transition-colors"
      @click="fileInput?.click()"
    >
      <Icon icon="lucide:upload-cloud" width="24" class="text-ink/40" />
      <div class="flex flex-col">
        <span class="text-sm font-semibold text-ink">{{
          compressing ? 'Compressing…' : 'Choose a file'
        }}</span>
        <span class="text-xs text-ink/50"
          >Up to {{ formatBytes(maxSizeBytes) }} | {{ accept }}</span
        >
      </div>
    </div>

    <!-- Filled state: applicant just picked this file. `uploading`
         from the parent surfaces the staging upload's in-flight
         status so Continue can wait without the applicant guessing
         what's happening. -->
    <div v-else class="flex items-center gap-3 border hairline-ink rounded-xl px-4 py-3 bg-surface">
      <Icon
        :icon="isImage ? 'lucide:image' : 'lucide:file-text'"
        width="20"
        class="text-brand-violet shrink-0"
      />
      <div class="flex flex-col flex-1 min-w-0">
        <span class="text-sm font-semibold text-ink truncate">{{ selected.name }}</span>
        <span v-if="uploading" class="text-xs text-brand-violet inline-flex items-center gap-1.5">
          <Icon icon="lucide:loader-2" width="12" class="animate-spin" />
          Uploading to your account…
        </span>
        <span v-else-if="compressionInfo?.compressed" class="text-xs text-ink/50">
          Compressed from {{ formatBytes(compressionInfo.original) }} →
          {{ formatBytes(compressionInfo.output) }}
        </span>
        <span v-else class="text-xs text-ink/50">
          {{ formatBytes(selected.size) }}
        </span>
      </div>
      <button
        type="button"
        class="text-sm font-semibold text-ink/60 hover:text-brand-violet focus-ring-brand rounded-sm"
        @click="clear"
      >
        Remove
      </button>
    </div>

    <input ref="fileInput" type="file" class="sr-only" :accept="accept" @change="onChange" />
  </div>
</template>
