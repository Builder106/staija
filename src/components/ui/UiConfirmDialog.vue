<script lang="ts">
// Module-scope counter for unique aria-labelledby / aria-describedby
// ids. A counter inside `<script setup>` would be instance-scoped (the
// setup function runs per component instance) and reset to 0 every
// mount, defeating the point. A separate `<script>` block runs once at
// module evaluation, giving us a real shared counter.
let _uidCounter = 0;
function nextDialogUid(): string {
  return `ui-confirm-${++_uidCounter}`;
}
</script>

<script setup lang="ts">
/**
 * UiConfirmDialog — STAIJA-styled replacement for window.confirm().
 *
 * Use this any time the codebase had a `window.confirm(...)` call. The
 * call site owns the visibility ref (`v-model:open`) and the on-confirm
 * handler; this component just renders the modal and emits the user's
 * choice.
 *
 * Use the `variant: 'destructive'` prop for actions that destroy data
 * (delete a draft, cancel a donation, etc.) — the confirm button turns
 * red and the leading icon becomes a triangle-warning. Default variant
 * is neutral and fine for "are you sure?" / "save changes?" prompts.
 */
import { Icon } from '@iconify/vue';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const uid = nextDialogUid();

interface Props {
  /** v-model:open. Two-way bound so the dialog can close itself when the
   *  user clicks the backdrop, hits Escape, or cancels. */
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  /** Render this iconify icon at the top-left of the dialog. Defaults
   *  vary by variant (warning for destructive, info-circle otherwise). */
  icon?: string;
}

const props = withDefaults(defineProps<Props>(), {
  body: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  variant: 'default',
  icon: '',
});

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const confirmBtn = ref<HTMLButtonElement | null>(null);

const resolvedIcon = computed(() => {
  if (props.icon) return props.icon;
  return props.variant === 'destructive' ? 'lucide:triangle-alert' : 'lucide:circle-help';
});

function close() {
  emit('update:open', false);
}

function handleConfirm() {
  emit('confirm');
  close();
}

function handleCancel() {
  emit('cancel');
  close();
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    handleCancel();
  } else if (e.key === 'Enter' && document.activeElement === confirmBtn.value) {
    // Already on the confirm button — let the default click handler fire.
    return;
  }
}

// Auto-focus the confirm button when the dialog opens so keyboard users
// can hit Enter to proceed (or Escape to back out). nextTick because the
// Teleport hasn't mounted the node yet on the same microtask.
watch(
  () => props.open,
  isOpen => {
    if (isOpen) {
      nextTick(() => confirmBtn.value?.focus());
    }
  }
);

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKeydown);
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ui-confirm">
      <div
        v-if="open"
        class="ui-confirm-overlay"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${uid}-title`"
        :aria-describedby="body ? `${uid}-body` : undefined"
        @click.self="handleCancel"
      >
        <div class="ui-confirm-modal">
          <div class="ui-confirm-head">
            <div
              class="ui-confirm-icon"
              :class="{ 'ui-confirm-icon--destructive': variant === 'destructive' }"
            >
              <Icon :icon="resolvedIcon" width="22" />
            </div>
            <div class="ui-confirm-text">
              <h2 :id="`${uid}-title`" class="ui-confirm-title">{{ title }}</h2>
              <p v-if="body" :id="`${uid}-body`" class="ui-confirm-body">{{ body }}</p>
            </div>
          </div>

          <div class="ui-confirm-actions">
            <button
              type="button"
              class="ui-confirm-btn ui-confirm-btn--ghost"
              @click="handleCancel"
            >
              {{ cancelLabel }}
            </button>
            <button
              ref="confirmBtn"
              type="button"
              class="ui-confirm-btn"
              :class="
                variant === 'destructive'
                  ? 'ui-confirm-btn--destructive'
                  : 'ui-confirm-btn--primary'
              "
              @click="handleConfirm"
            >
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
/* Unscoped — modal teleports to <body>, scoped styles wouldn't reach
   it. Class names are prefixed to keep these from leaking. */
.ui-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background-color: rgba(14, 18, 23, 0.4);
  backdrop-filter: blur(2px);
}
.ui-confirm-modal {
  width: 100%;
  max-width: 28rem;
  background-color: var(--color-surface, #fff);
  color: var(--color-ink, #0e1217);
  border-radius: 1rem;
  border: 1px solid rgba(14, 18, 23, 0.08);
  box-shadow:
    0 24px 48px -12px rgba(14, 18, 23, 0.24),
    0 8px 16px -8px rgba(14, 18, 23, 0.12);
  font-family: 'Inter', sans-serif;
  overflow: hidden;
}
.ui-confirm-head {
  display: flex;
  gap: 1rem;
  padding: 1.5rem 1.5rem 1.25rem;
}
.ui-confirm-icon {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(139, 85, 255, 0.1);
  color: #8b55ff;
}
.ui-confirm-icon--destructive {
  background-color: rgba(220, 38, 38, 0.1);
  color: #dc2626;
}
.ui-confirm-text {
  flex: 1 1 auto;
  min-width: 0;
}
.ui-confirm-title {
  font-family: 'IBM Plex Sans', 'Inter', sans-serif;
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.35;
  margin: 0 0 0.5rem 0;
}
.ui-confirm-body {
  font-size: 0.875rem;
  line-height: 1.55;
  color: rgba(14, 18, 23, 0.7);
  margin: 0;
}
.ui-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.625rem;
  padding: 1rem 1.5rem 1.5rem;
  background-color: rgba(14, 18, 23, 0.02);
  border-top: 1px solid rgba(14, 18, 23, 0.06);
}
.ui-confirm-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 1.125rem;
  border-radius: 0.625rem;
  font-size: 0.875rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}
.ui-confirm-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(139, 85, 255, 0.5);
}
.ui-confirm-btn--ghost {
  background-color: transparent;
  color: rgba(14, 18, 23, 0.75);
  border-color: rgba(14, 18, 23, 0.18);
}
.ui-confirm-btn--ghost:hover {
  background-color: rgba(14, 18, 23, 0.04);
  border-color: rgba(14, 18, 23, 0.32);
  color: var(--color-ink, #0e1217);
}
.ui-confirm-btn--primary {
  background-color: #8b55ff;
  color: #ffffff;
}
.ui-confirm-btn--primary:hover {
  background-color: #7a44ee;
}
.ui-confirm-btn--destructive {
  background-color: #dc2626;
  color: #ffffff;
}
.ui-confirm-btn--destructive:hover {
  background-color: #b91c1c;
}

/* Dark mode token-flip for the body / surface / hairlines so the
   modal reads correctly under data-theme="dark". */
[data-theme='dark'] .ui-confirm-overlay {
  background-color: rgba(0, 0, 0, 0.55);
}
[data-theme='dark'] .ui-confirm-modal {
  background-color: var(--color-surface, #161b22);
  color: var(--color-ink, #e6e6e6);
  border-color: rgba(255, 255, 255, 0.08);
}
[data-theme='dark'] .ui-confirm-body {
  color: rgba(230, 230, 230, 0.72);
}
[data-theme='dark'] .ui-confirm-actions {
  background-color: rgba(255, 255, 255, 0.025);
  border-top-color: rgba(255, 255, 255, 0.06);
}
[data-theme='dark'] .ui-confirm-btn--ghost {
  color: rgba(230, 230, 230, 0.78);
  border-color: rgba(255, 255, 255, 0.18);
}
[data-theme='dark'] .ui-confirm-btn--ghost:hover {
  background-color: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.32);
  color: var(--color-ink, #e6e6e6);
}

/* Enter / leave transition. Pairs a fade on the overlay with a small
   scale-up on the modal — the same beat as UiSelect's popover. */
.ui-confirm-enter-active,
.ui-confirm-leave-active {
  transition: opacity 0.18s ease;
}
.ui-confirm-enter-from,
.ui-confirm-leave-to {
  opacity: 0;
}
.ui-confirm-enter-active .ui-confirm-modal,
.ui-confirm-leave-active .ui-confirm-modal {
  transition:
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.18s ease;
}
.ui-confirm-enter-from .ui-confirm-modal,
.ui-confirm-leave-to .ui-confirm-modal {
  transform: scale(0.96) translateY(4px);
  opacity: 0;
}
</style>
