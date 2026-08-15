<script setup lang="ts">
defineProps<{ hoverable?: boolean }>();
</script>

<template>
  <div
    class="overflow-hidden rounded-2xl border border-ink/10 bg-paper transition-[transform,border-color,box-shadow] duration-150"
    :class="hoverable && 'hover:-translate-y-[1px] hover:border-ink/20 hover:shadow-md'"
  >
    <slot />
  </div>
</template>
