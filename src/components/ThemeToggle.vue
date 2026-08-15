<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed } from 'vue';
import { useTheme } from '../composables/useTheme';

const { choice, toggle } = useTheme();

// Each cycle position: which icon, what label. Keeping it a single
// button (not a popover) for header real-estate; cycle order is
// light → dark → system → light.
const display = computed(() => {
  if (choice.value === 'light') {
    return { icon: 'lucide:sun', label: 'Light theme', next: 'dark' };
  }
  if (choice.value === 'dark') {
    return { icon: 'lucide:moon', label: 'Dark theme', next: 'system' };
  }
  return { icon: 'lucide:monitor', label: 'System theme', next: 'light' };
});
</script>

<template>
  <!-- Styled to live on a paper-colored surface (the SiteHeader). Uses
       semantic ink-based colors so token-flip inverts them in dark
       mode without per-mode overrides. Icon-only keeps the header
       compact; the label is in aria-label for screen readers. -->
  <button
    type="button"
    class="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink/60 hover:text-ink hover:bg-ink/[0.04] transition-colors focus-ring-brand"
    :aria-label="`${display.label}. Click to switch to ${display.next}.`"
    :title="display.label"
    @click="toggle"
  >
    <Icon :icon="display.icon" width="18" />
  </button>
</template>
