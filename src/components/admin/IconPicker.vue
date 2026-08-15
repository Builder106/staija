<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{
  modelValue: string;
  ariaLabel?: string;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const open = ref(false);
const search = ref('');
const triggerRef = ref<HTMLButtonElement | null>(null);
const popoverRef = ref<HTMLDivElement | null>(null);
const searchRef = ref<HTMLInputElement | null>(null);

// Curated set of lucide icons relevant to STAIJA program contexts: people,
// time, money, education, science, tech, location, achievement, comms, and
// general flair. Editors who need an icon outside this list can still type
// it manually via the underlying string field on the program — but for the
// 95% case, picking from this grid is much faster than browsing lucide.dev.
const ICONS: { name: string; label: string }[] = [
  { name: 'lucide:users', label: 'Users' },
  { name: 'lucide:user', label: 'User' },
  { name: 'lucide:user-check', label: 'User check' },
  { name: 'lucide:user-plus', label: 'User plus' },
  { name: 'lucide:graduation-cap', label: 'Graduation' },
  { name: 'lucide:clock', label: 'Clock' },
  { name: 'lucide:calendar', label: 'Calendar' },
  { name: 'lucide:calendar-days', label: 'Calendar days' },
  { name: 'lucide:hourglass', label: 'Hourglass' },
  { name: 'lucide:timer', label: 'Timer' },
  { name: 'lucide:banknote', label: 'Banknote' },
  { name: 'lucide:coins', label: 'Coins' },
  { name: 'lucide:wallet', label: 'Wallet' },
  { name: 'lucide:gift', label: 'Gift' },
  { name: 'lucide:hand-coins', label: 'Hand coins' },
  { name: 'lucide:book', label: 'Book' },
  { name: 'lucide:book-open', label: 'Book open' },
  { name: 'lucide:school', label: 'School' },
  { name: 'lucide:library', label: 'Library' },
  { name: 'lucide:pen-line', label: 'Pen' },
  { name: 'lucide:microscope', label: 'Microscope' },
  { name: 'lucide:beaker', label: 'Beaker' },
  { name: 'lucide:flask-conical', label: 'Flask' },
  { name: 'lucide:atom', label: 'Atom' },
  { name: 'lucide:dna', label: 'DNA' },
  { name: 'lucide:telescope', label: 'Telescope' },
  { name: 'lucide:laptop', label: 'Laptop' },
  { name: 'lucide:code', label: 'Code' },
  { name: 'lucide:database', label: 'Database' },
  { name: 'lucide:terminal', label: 'Terminal' },
  { name: 'lucide:cpu', label: 'CPU' },
  { name: 'lucide:wifi', label: 'WiFi' },
  { name: 'lucide:map-pin', label: 'Map pin' },
  { name: 'lucide:globe', label: 'Globe' },
  { name: 'lucide:map', label: 'Map' },
  { name: 'lucide:navigation', label: 'Navigation' },
  { name: 'lucide:compass', label: 'Compass' },
  { name: 'lucide:award', label: 'Award' },
  { name: 'lucide:trophy', label: 'Trophy' },
  { name: 'lucide:target', label: 'Target' },
  { name: 'lucide:medal', label: 'Medal' },
  { name: 'lucide:star', label: 'Star' },
  { name: 'lucide:flame', label: 'Flame' },
  { name: 'lucide:mail', label: 'Mail' },
  { name: 'lucide:phone', label: 'Phone' },
  { name: 'lucide:video', label: 'Video' },
  { name: 'lucide:message-circle', label: 'Message' },
  { name: 'lucide:megaphone', label: 'Megaphone' },
  { name: 'lucide:heart', label: 'Heart' },
  { name: 'lucide:lightbulb', label: 'Lightbulb' },
  { name: 'lucide:sparkles', label: 'Sparkles' },
  { name: 'lucide:shield-check', label: 'Shield check' },
  { name: 'lucide:zap', label: 'Zap' },
  { name: 'lucide:rocket', label: 'Rocket' },
  { name: 'lucide:check-circle-2', label: 'Check' },
  { name: 'lucide:circle-help', label: 'Help' },
];

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return ICONS;
  return ICONS.filter(i => i.name.toLowerCase().includes(q) || i.label.toLowerCase().includes(q));
});

const currentLabel = computed(() => {
  const found = ICONS.find(i => i.name === props.modelValue);
  return found?.label ?? props.modelValue;
});

function toggle() {
  open.value = !open.value;
  if (open.value) {
    // Defer focus to next paint so the popover is rendered.
    setTimeout(() => searchRef.value?.focus(), 0);
  }
}

function pick(name: string) {
  emit('update:modelValue', name);
  open.value = false;
  search.value = '';
}

function onDocClick(e: MouseEvent) {
  if (!open.value) return;
  const target = e.target as Node;
  if (triggerRef.value?.contains(target)) return;
  if (popoverRef.value?.contains(target)) return;
  open.value = false;
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    open.value = false;
    triggerRef.value?.focus();
  }
}

onMounted(() => {
  document.addEventListener('mousedown', onDocClick);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div class="relative">
    <button
      ref="triggerRef"
      type="button"
      :aria-label="ariaLabel || 'Pick icon'"
      :aria-expanded="open"
      class="flex items-center gap-2 rounded-lg border hairline-ink bg-paper px-3 py-2 text-sm font-sans w-full hover:border-brand-violet/40 focus:outline-none focus:border-brand-violet/50 focus:ring-2 focus:ring-brand-violet/20"
      @click="toggle"
    >
      <Icon v-if="modelValue" :icon="modelValue" width="18" class="text-brand-violet shrink-0" />
      <Icon v-else icon="lucide:image-plus" width="18" class="text-ink/40 shrink-0" />
      <span class="flex-1 text-left truncate">
        {{ modelValue ? currentLabel : 'Pick an icon' }}
      </span>
      <Icon icon="lucide:chevron-down" width="14" class="text-ink/40 shrink-0" />
    </button>

    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-100"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="open"
        ref="popoverRef"
        class="absolute z-30 left-0 right-0 top-full mt-1.5 rounded-xl border hairline-ink bg-paper shadow-xl shadow-ink/10 p-3 flex flex-col gap-3 min-w-[280px]"
        role="dialog"
        :aria-label="ariaLabel || 'Choose an icon'"
      >
        <input
          ref="searchRef"
          v-model="search"
          type="text"
          placeholder="Search icons…"
          class="rounded-lg border hairline-ink bg-paper px-3 py-1.5 text-sm font-sans focus:outline-none focus:border-brand-violet/50 focus:ring-2 focus:ring-brand-violet/20"
        />
        <div v-if="filtered.length === 0" class="text-sm text-ink/55 text-center py-6">
          No icons match "{{ search }}".
        </div>
        <div v-else class="grid grid-cols-6 gap-1 max-h-64 overflow-y-auto">
          <button
            v-for="i in filtered"
            :key="i.name"
            type="button"
            :title="i.label"
            :aria-label="i.label"
            :aria-pressed="modelValue === i.name"
            :class="[
              'flex items-center justify-center aspect-square rounded-lg hover:bg-brand-violet/10 focus:outline-none focus:bg-brand-violet/10',
              modelValue === i.name && 'bg-brand-violet/15 ring-2 ring-brand-violet',
            ]"
            @click="pick(i.name)"
          >
            <Icon :icon="i.name" width="20" class="text-ink" />
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
