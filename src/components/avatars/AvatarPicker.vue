<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { avatarThumbForSeed, avatarThumbForSlot, PORTRAIT_SLOT_COUNT } from '../../services/avatar';

/**
 * Modal portrait picker. Shows the 10 library portraits plus a
 * "use the seeded default" option, lets the user click to select,
 * and emits the chosen slot (or `null` for default) on confirm.
 *
 * Doesn't persist anything itself — the parent (Settings.vue) owns
 * the form state and save flow. This component is purely presentation
 * + selection.
 */

const props = defineProps<{
  open: boolean;
  // Currently-applied slot, used to highlight the active selection
  // when the modal opens. `null` means "default (seeded)".
  current: number | null;
  // Seed for the "use default" preview cell, so the user sees what
  // their seeded avatar would look like.
  seed: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'apply', slot: number | null): void;
}>();

const draft = ref<number | null>(props.current);

watch(
  () => [props.open, props.current] as const,
  ([open, current]) => {
    if (open) draft.value = current;
  },
);

const slots = computed(() =>
  Array.from({ length: PORTRAIT_SLOT_COUNT }, (_, i) => ({
    slot: i,
    src: avatarThumbForSlot(i),
  })),
);

const seededSrc = computed(() => avatarThumbForSeed(props.seed));

function selectSlot(slot: number | null) {
  draft.value = slot;
}

function apply() {
  emit('apply', draft.value);
  emit('close');
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="picker">
      <div
        v-if="props.open"
        class="picker-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-picker-title"
        @click.self="emit('close')"
      >
        <div class="picker-modal">
          <header class="picker-header">
            <h2 id="avatar-picker-title">Choose an avatar</h2>
            <button
              type="button"
              class="picker-close"
              aria-label="Close avatar picker"
              @click="emit('close')"
            >
              <Icon icon="lucide:x" width="18" />
            </button>
          </header>

          <p class="picker-hint">
            Pick a portrait from the gallery, or stick with the seeded default.
          </p>

          <div class="picker-grid">
            <button
              type="button"
              class="picker-cell"
              :class="{ 'picker-cell--selected': draft === null }"
              :aria-pressed="draft === null"
              aria-label="Use the seeded default avatar"
              @click="selectSlot(null)"
            >
              <img :src="seededSrc" alt="" width="72" height="72" class="picker-cell__img" />
              <span class="picker-cell__label">Default</span>
            </button>

            <button
              v-for="entry in slots"
              :key="entry.slot"
              type="button"
              class="picker-cell"
              :class="{ 'picker-cell--selected': draft === entry.slot }"
              :aria-pressed="draft === entry.slot"
              :aria-label="`Avatar option ${entry.slot + 1}`"
              @click="selectSlot(entry.slot)"
            >
              <img :src="entry.src" alt="" width="72" height="72" class="picker-cell__img" />
              <span class="picker-cell__label">{{ entry.slot + 1 }}</span>
            </button>
          </div>

          <footer class="picker-footer">
            <button type="button" class="picker-btn picker-btn--ghost" @click="emit('close')">
              Cancel
            </button>
            <button type="button" class="picker-btn picker-btn--primary" @click="apply">
              Apply
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 18, 30, 0.55);
  backdrop-filter: blur(2px);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.picker-modal {
  background: var(--color-surface, #fff);
  color: rgb(var(--color-ink-rgb, 23 23 23));
  width: min(560px, 100%);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  border-radius: 0.75rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
  padding: 1.5rem;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.picker-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.picker-close {
  background: transparent;
  border: none;
  color: rgb(var(--color-ink-rgb, 23 23 23) / 0.6);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.375rem;
}

.picker-close:hover {
  background: rgb(var(--color-ink-rgb, 23 23 23) / 0.05);
}

.picker-hint {
  font-size: 0.875rem;
  color: rgb(var(--color-ink-rgb, 23 23 23) / 0.65);
  margin: 0 0 1.25rem 0;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 0.75rem;
}

.picker-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 0.625rem;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background-color 120ms ease;
}

.picker-cell:hover {
  background: rgb(var(--color-ink-rgb, 23 23 23) / 0.04);
}

.picker-cell--selected {
  border-color: rgb(139 85 255);
  background: rgba(139, 85, 255, 0.08);
}

.picker-cell__img {
  width: 72px;
  height: 72px;
  border-radius: 9999px;
  object-fit: cover;
  display: block;
}

.picker-cell__label {
  font-size: 0.75rem;
  color: rgb(var(--color-ink-rgb, 23 23 23) / 0.65);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.picker-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.25rem;
}

.picker-btn {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
}

.picker-btn--ghost {
  background: transparent;
  border-color: rgb(var(--color-ink-rgb, 23 23 23) / 0.15);
  color: rgb(var(--color-ink-rgb, 23 23 23));
}

.picker-btn--ghost:hover {
  background: rgb(var(--color-ink-rgb, 23 23 23) / 0.05);
}

.picker-btn--primary {
  background: rgb(139 85 255);
  color: white;
}

.picker-btn--primary:hover {
  background: rgb(124 70 240);
}

.picker-enter-active,
.picker-leave-active {
  transition: opacity 160ms ease;
}
.picker-enter-active .picker-modal,
.picker-leave-active .picker-modal {
  transition:
    transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 160ms ease;
}
.picker-enter-from,
.picker-leave-to {
  opacity: 0;
}
.picker-enter-from .picker-modal,
.picker-leave-to .picker-modal {
  transform: scale(0.96) translateY(8px);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .picker-enter-active,
  .picker-leave-active,
  .picker-enter-active .picker-modal,
  .picker-leave-active .picker-modal {
    transition: none;
  }
}
</style>
