<script setup lang="ts">
defineProps<{ large?: boolean }>();
</script>

<template>
  <p
    class="font-sans text-ink/80"
    :class="large ? 'text-lg leading-[30px]' : 'text-base leading-[26px]'"
  >
    <slot />
  </p>
</template>
