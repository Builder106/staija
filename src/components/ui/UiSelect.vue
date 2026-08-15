<script setup lang="ts" generic="T extends string | number">
import { Icon } from '@iconify/vue';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

interface Option {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: T | null | undefined;
    options: Option[];
    placeholder?: string;
    disabled?: boolean;
    id?: string;
    /** Match the trigger's width on the popover. Defaults to true. */
    matchWidth?: boolean;
  }>(),
  { placeholder: 'Select…', matchWidth: true }
);

const emit = defineEmits<{ (e: 'update:modelValue', value: T): void }>();

const open = ref(false);
const triggerEl = ref<HTMLButtonElement | null>(null);
const listEl = ref<HTMLUListElement | null>(null);
const activeIndex = ref(-1);
const popoverStyle = ref<Record<string, string>>({});

const selectedIndex = computed(() => props.options.findIndex(o => o.value === props.modelValue));
const selectedLabel = computed(() => props.options[selectedIndex.value]?.label ?? '');

function reposition() {
  const t = triggerEl.value;
  if (!t) return;
  const rect = t.getBoundingClientRect();
  const gap = 6;
  const style: Record<string, string> = {
    top: `${rect.bottom + gap}px`,
    left: `${rect.left}px`,
  };
  if (props.matchWidth) {
    style.width = `${rect.width}px`;
  } else {
    style.minWidth = `${rect.width}px`;
  }
  popoverStyle.value = style;
}

function openMenu() {
  if (props.disabled || open.value) return;
  open.value = true;
  activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : 0;
  nextTick(() => {
    reposition();
    scrollActiveIntoView();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
  });
}

function closeMenu(focusTrigger = true) {
  if (!open.value) return;
  open.value = false;
  window.removeEventListener('scroll', reposition, true);
  window.removeEventListener('resize', reposition);
  if (focusTrigger) triggerEl.value?.focus();
}

function toggle() {
  if (open.value) {
    closeMenu();
  } else {
    openMenu();
  }
}

function pick(index: number) {
  const opt = props.options[index];
  if (!opt || opt.disabled) return;
  emit('update:modelValue', opt.value);
  closeMenu();
}

function scrollActiveIntoView() {
  const list = listEl.value;
  if (!list) return;
  const item = list.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`);
  item?.scrollIntoView({ block: 'nearest' });
}

watch(activeIndex, () => {
  if (open.value) scrollActiveIntoView();
});

// Type-ahead: collect printable keys within a short window and jump to
// the first matching option. Mirrors native <select> behavior so a
// keyboard-driven editor doesn't have to arrow through long lists.
let typeBuffer = '';
let typeTimer: ReturnType<typeof setTimeout> | null = null;
function handleTypeAhead(key: string) {
  typeBuffer += key.toLowerCase();
  if (typeTimer) clearTimeout(typeTimer);
  typeTimer = setTimeout(() => {
    typeBuffer = '';
  }, 500);
  const start = activeIndex.value + (typeBuffer.length === 1 ? 1 : 0);
  const len = props.options.length;
  for (let i = 0; i < len; i++) {
    const idx = (start + i) % len;
    if (props.options[idx].label.toLowerCase().startsWith(typeBuffer)) {
      activeIndex.value = idx;
      return;
    }
  }
}

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return;
  // When closed, Enter/Space/ArrowDown/ArrowUp open the menu. Letters
  // open and seed the type-ahead so the editor can jump straight to a
  // matching option in one keystroke.
  if (!open.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu();
      return;
    }
    if (e.key.length === 1 && /\S/.test(e.key)) {
      e.preventDefault();
      openMenu();
      handleTypeAhead(e.key);
      return;
    }
    return;
  }
  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      closeMenu();
      break;
    case 'Tab':
      // Don't swallow Tab — let focus move on, but close the menu so
      // it doesn't linger after the editor moves to the next field.
      closeMenu(false);
      break;
    case 'ArrowDown':
      e.preventDefault();
      activeIndex.value = Math.min(props.options.length - 1, activeIndex.value + 1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      activeIndex.value = Math.max(0, activeIndex.value - 1);
      break;
    case 'Home':
      e.preventDefault();
      activeIndex.value = 0;
      break;
    case 'End':
      e.preventDefault();
      activeIndex.value = props.options.length - 1;
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      if (activeIndex.value >= 0) pick(activeIndex.value);
      break;
    default:
      if (e.key.length === 1 && /\S/.test(e.key)) {
        e.preventDefault();
        handleTypeAhead(e.key);
      }
  }
}

function onDocumentPointerDown(e: PointerEvent) {
  if (!open.value) return;
  const target = e.target as Node | null;
  if (triggerEl.value?.contains(target as Node) || listEl.value?.contains(target as Node)) {
    return;
  }
  closeMenu(false);
}

watch(open, isOpen => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', reposition, true);
  window.removeEventListener('resize', reposition);
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  if (typeTimer) clearTimeout(typeTimer);
});

const listId = computed(() => (props.id ? `${props.id}-listbox` : undefined));
</script>

<template>
  <div class="ui-select">
    <button
      :id="id"
      ref="triggerEl"
      type="button"
      class="ui-select__trigger input"
      :class="{ 'ui-select__trigger--open': open }"
      :disabled="disabled"
      :aria-haspopup="'listbox'"
      :aria-expanded="open"
      :aria-controls="listId"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="ui-select__value" :class="{ 'ui-select__placeholder': !selectedLabel }">
        {{ selectedLabel || placeholder }}
      </span>
      <span
        class="ui-select__chevron-wrap"
        :class="{ 'ui-select__chevron-wrap--open': open }"
        aria-hidden="true"
      >
        <Icon icon="lucide:chevrons-up-down" width="16" class="ui-select__chevron" />
      </span>
    </button>

    <Teleport to="body">
      <Transition name="ui-select-pop">
        <ul
          v-if="open"
          :id="listId"
          ref="listEl"
          role="listbox"
          class="ui-select__menu"
          :style="popoverStyle"
          :aria-activedescendant="activeIndex >= 0 && id ? `${id}-opt-${activeIndex}` : undefined"
        >
          <li
            v-for="(opt, i) in options"
            :id="id ? `${id}-opt-${i}` : undefined"
            :key="String(opt.value)"
            role="option"
            :aria-selected="opt.value === modelValue"
            :aria-disabled="opt.disabled || undefined"
            :data-index="i"
            class="ui-select__option"
            :class="{
              'ui-select__option--active': i === activeIndex && !opt.disabled,
              'ui-select__option--selected': opt.value === modelValue,
              'ui-select__option--disabled': opt.disabled,
            }"
            @mousemove="opt.disabled ? null : (activeIndex = i)"
            @click="pick(i)"
          >
            <span class="ui-select__option-label">
              {{ opt.label }}
              <span v-if="opt.hint" class="ui-select__option-hint">
                {{ opt.hint }}
              </span>
            </span>
            <Icon
              v-if="opt.value === modelValue"
              icon="lucide:check"
              width="14"
              class="ui-select__check"
            />
          </li>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.ui-select {
  position: relative;
  display: block;
}
.ui-select__trigger {
  display: inline-flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 0;
  width: 100%;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.875rem;
  color: inherit;
  /* The trigger reads as "control, not field" because (1) the border
     carries a hint of brand violet so it doesn't blend into a row of
     text inputs, and (2) the right-side chevron well is permanently
     violet-tinted — staff don't have to hover to see "this is a
     dropdown". The previous design painted everything ink-gray on
     idle and only revealed the violet on interaction, which made the
     control look identical to a disabled text input until you
     reached for it. */
  border-color: rgba(139, 85, 255, 0.2) !important;
  background-color: color-mix(in srgb, var(--color-ink) 2%, transparent);
  /* Match sibling text inputs' left padding (px-4 py-3) so dropdowns
     and inputs align vertically in mixed grids. Right padding is zero
     because the chevron well sits flush against the right edge. */
  padding: 0 0 0 1rem !important;
  min-height: 2.875rem;
  overflow: hidden;
  transition:
    border-color 0.12s ease,
    background-color 0.12s ease,
    box-shadow 0.12s ease;
}
.ui-select__trigger:hover:not(:disabled) {
  border-color: rgba(139, 85, 255, 0.4) !important;
  background-color: rgba(139, 85, 255, 0.04);
}
.ui-select__trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-select__trigger--open,
.ui-select__trigger--open:hover {
  outline: none;
  /* Open state: lift onto the surface token (works in light AND dark
     where `#fff` used to punch through), and replace the border with
     a saturated brand-violet glow ring so the open control reads as
     "active" at a glance. */
  background-color: var(--color-surface);
  border-color: transparent !important;
  box-shadow:
    0 0 0 2px rgba(139, 85, 255, 0.55),
    0 4px 12px -4px rgba(139, 85, 255, 0.25);
}
.ui-select__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1 1 auto;
  align-self: center;
}
.ui-select__placeholder {
  color: color-mix(in srgb, var(--color-ink) 45%, transparent);
}
/* Right-side chevron well — always violet, even on idle. This is the
   single biggest "this is a dropdown" signal on the page; staff
   shouldn't have to hover to see it. The left border ties the well
   visually back to the trigger's violet border so the whole control
   reads as one shape. */
.ui-select__chevron-wrap {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  align-self: stretch;
  border-left: 1px solid rgba(139, 85, 255, 0.2);
  background-color: rgba(139, 85, 255, 0.08);
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease;
}
.ui-select__trigger:hover:not(:disabled) .ui-select__chevron-wrap {
  background-color: rgba(139, 85, 255, 0.15);
  border-left-color: rgba(139, 85, 255, 0.4);
}
.ui-select__chevron-wrap--open {
  background-color: rgba(139, 85, 255, 0.2) !important;
  border-left-color: rgba(139, 85, 255, 0.5) !important;
}
.ui-select__chevron {
  /* Always brand-violet — never gray. The legacy ink-70 chevron was
     near-invisible against the well at small sizes and gave staff no
     visual signal that this was a dropdown vs. a label-only field.
     The chevrons-up-down icon is symmetric, so we don't try to
     rotate it on open; the well's color shift carries the open-state
     signal instead. */
  color: #8b55ff;
}
</style>

<style>
/* Unscoped — popover lives in <body> via Teleport so scoped styles
   wouldn't reach it. Prefixed class names keep these from leaking.
   Colors derive from the `--color-*` tokens defined on `:root` (and
   flipped under `[data-theme="dark"]`) so the menu reads correctly
   on both light and dark surfaces — and even though the popover is
   in <body>, `:root` variables resolve from the document root, so
   the dark token flip cascades here automatically. */
.ui-select__menu {
  position: fixed;
  z-index: 60;
  margin: 0;
  padding: 0.25rem;
  list-style: none;
  background: var(--color-surface);
  border: 1px solid color-mix(in srgb, var(--color-ink) 12%, transparent);
  border-radius: 0.625rem;
  /* Shadows must read as depth on BOTH light and dark surfaces. The
     base shadow uses a static dark color (works on light surfaces);
     dark mode below swaps in a stronger black + a faint inner glow
     so the menu still lifts off `--color-paper` near-black. */
  box-shadow:
    0 8px 24px -8px rgba(14, 18, 23, 0.18),
    0 2px 6px -2px rgba(14, 18, 23, 0.08);
  max-height: 16rem;
  overflow-y: auto;
  font-family: 'Inter', sans-serif;
  font-size: 0.875rem;
  color: var(--color-ink);
}
[data-theme='dark'] .ui-select__menu {
  box-shadow:
    0 12px 32px -8px rgba(0, 0, 0, 0.6),
    0 4px 10px -2px rgba(0, 0, 0, 0.45),
    inset 0 0 0 1px color-mix(in srgb, var(--color-ink) 6%, transparent);
}
.ui-select__option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.625rem 0.5rem 0.875rem;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background-color 0.08s ease;
}
.ui-select__option--active {
  background-color: rgba(139, 85, 255, 0.14);
  color: #8b55ff;
}
.ui-select__option--selected {
  font-weight: 600;
  color: #8b55ff;
}
.ui-select__option--selected:not(.ui-select__option--active) {
  background-color: rgba(139, 85, 255, 0.06);
}
/* Violet accent rail on the currently-selected option — small but
   carries the brand colour through to the menu surface so the
   dropdown feels like one continuous control instead of "violet
   trigger pops a neutral menu". */
.ui-select__option--selected::before {
  content: '';
  position: absolute;
  left: 0.25rem;
  top: 0.625rem;
  bottom: 0.625rem;
  width: 2px;
  border-radius: 1px;
  background-color: #8b55ff;
}
.ui-select__option--disabled {
  cursor: not-allowed;
  color: color-mix(in srgb, var(--color-ink) 40%, transparent);
}
.ui-select__option--disabled .ui-select__option-hint {
  color: color-mix(in srgb, var(--color-ink) 45%, transparent);
  font-style: italic;
}
.ui-select__option-label {
  display: inline-flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}
.ui-select__option-hint {
  font-size: 0.75rem;
  font-weight: 400;
  color: color-mix(in srgb, var(--color-ink) 55%, transparent);
}
.ui-select__check {
  flex-shrink: 0;
  color: #8b55ff;
}
.ui-select-pop-enter-active,
.ui-select-pop-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}
.ui-select-pop-enter-from,
.ui-select-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
