<script setup lang="ts">
defineProps<{ as?: string }>();
</script>

<template>
  <component :is="as ?? 'div'" class="mx-auto w-full max-w-[1200px] px-6 md:px-12">
    <slot />
  </component>
</template>
