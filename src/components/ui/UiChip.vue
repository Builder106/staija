<script setup lang="ts">
defineProps<{ active?: boolean }>();
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium font-sans border transition-colors"
    :class="
      active
        ? 'bg-gradient-brand text-white border-transparent'
        : 'bg-transparent text-ink border-ink/10 hover:border-ink/20'
    "
  >
    <slot />
  </span>
</template>
