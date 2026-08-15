<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { computed, ref } from 'vue';
import { publicStorage } from '../../config/firebase';

const props = defineProps<{
  modelValue: string;
  /** Storage prefix to upload into, e.g. "programs/stepup-scholars/hero". */
  pathPrefix: string;
  /** Visual aspect ratio for the thumbnail + drop zone. */
  shape?: 'landscape' | 'square' | 'portrait' | 'circle';
  /** Used as the alt text for the rendered preview and the dropzone aria-label. */
  ariaLabel?: string;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const uploading = ref(false);
const error = ref('');
const dragActive = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const showUrlInput = ref(false);

const aspectClass = computed(() => {
  switch (props.shape ?? 'landscape') {
    case 'square':
      return 'aspect-square';
    case 'portrait':
      return 'aspect-[3/4]';
    case 'circle':
      return 'aspect-square rounded-full';
    case 'landscape':
    default:
      return 'aspect-[4/3]';
  }
});

const previewWidth = computed(() => {
  return (props.shape ?? 'landscape') === 'circle' ? 'w-24' : 'w-40';
});

async function handleFile(file: File) {
  if (!file.type.startsWith('image/')) {
    error.value = 'Please choose an image file.';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    error.value = 'Image must be under 5 MB.';
    return;
  }
  uploading.value = true;
  error.value = '';
  try {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    // Unique filename keeps old upload URLs working (cached pages, version
    // history) — no overwrite. A future cleanup job can reap orphans.
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${props.pathPrefix}/${stamp}-${rand}.${ext}`;
    // Always use publicStorage — these are program-page assets, served
    // unauthenticated to the world. publicStorage points at the no-cost
    // multi-region bucket; falls back to the default bucket if
    // VITE_FIREBASE_PUBLIC_BUCKET isn't set in the environment.
    const r = storageRef(publicStorage, path);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    emit('update:modelValue', url);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Upload failed.';
  } finally {
    uploading.value = false;
  }
}

function onPick() {
  fileInputRef.value?.click();
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) handleFile(file);
  // Reset so re-picking the same file fires change again.
  input.value = '';
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  dragActive.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
  dragActive.value = true;
}

function onDragLeave(e: DragEvent) {
  e.preventDefault();
  dragActive.value = false;
}

function clearImage() {
  emit('update:modelValue', '');
  showUrlInput.value = false;
}

function onUrlInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Has image: thumbnail + replace/remove -->
    <div v-if="modelValue && !uploading" class="flex items-start gap-4">
      <div
        :class="[
          'overflow-hidden border hairline-ink bg-ink/5 shrink-0',
          previewWidth,
          aspectClass,
        ]"
      >
        <img
          :src="modelValue"
          :alt="ariaLabel || 'Image preview'"
          width="600"
          height="400"
          class="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
      <div class="flex flex-col gap-1.5 text-sm">
        <button
          type="button"
          class="font-semibold text-brand-violet hover:underline self-start"
          @click="onPick"
        >
          Replace
        </button>
        <button
          type="button"
          class="font-semibold text-ink/60 hover:text-red-700 self-start"
          @click="clearImage"
        >
          Remove
        </button>
      </div>
    </div>

    <!-- Uploading -->
    <div
      v-else-if="uploading"
      class="rounded-xl border-2 border-dashed hairline-ink p-6 flex flex-col items-center gap-3"
    >
      <Icon icon="lucide:loader-2" width="24" class="animate-spin text-brand-violet" />
      <span class="text-sm text-ink/70">Uploading…</span>
    </div>

    <!-- Empty: drop zone -->
    <div
      v-else
      :class="[
        'rounded-xl border-2 border-dashed p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors text-center',
        dragActive
          ? 'border-brand-violet bg-brand-violet/5'
          : 'hairline-ink hover:border-brand-violet/40 hover:bg-brand-violet/5',
      ]"
      role="button"
      :aria-label="`Upload image. ${ariaLabel || ''}`"
      tabindex="0"
      @click="onPick"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @keydown.enter.prevent="onPick"
      @keydown.space.prevent="onPick"
    >
      <Icon icon="lucide:upload" width="22" class="text-ink/50" />
      <span class="text-sm text-ink/70">
        <span class="font-semibold text-brand-violet">Click to upload</span>
        or drag &amp; drop
      </span>
      <span class="text-xs text-ink/50">PNG, JPG, GIF, WebP — up to 5&nbsp;MB</span>
    </div>

    <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="onFileChange" />

    <!-- URL fallback for power users / pasting from external hosts -->
    <button
      v-if="!showUrlInput && !modelValue"
      type="button"
      class="text-xs text-ink/55 hover:text-ink/80 self-start flex items-center gap-1"
      @click="showUrlInput = true"
    >
      <Icon icon="lucide:link" width="12" />
      Or paste a URL instead
    </button>
    <input
      v-if="showUrlInput && !modelValue"
      :value="modelValue"
      type="url"
      placeholder="https://…"
      class="rounded-lg border hairline-ink bg-paper px-3 py-2 text-sm font-mono"
      @input="onUrlInput"
    />

    <p v-if="error" role="alert" class="text-sm text-red-700 m-0">
      {{ error }}
    </p>
  </div>
</template>
