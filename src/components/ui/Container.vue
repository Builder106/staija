<script setup lang="ts">
import { computed, useAttrs } from 'vue';

defineOptions({ inheritAttrs: false });
defineProps<{ as?: string }>();

const attrs = useAttrs();

// Callers narrow the container with their own max-w-* class. Two max-width
// utilities on one element resolve by stylesheet order, and the arbitrary
// 1200px value sorts last, so the default steps aside whenever the caller
// sets a width.
const hasCustomWidth = computed(() => /(^|[\s:])max-w-/.test(String(attrs.class ?? '')));
</script>

<template>
  <component
    :is="as ?? 'div'"
    v-bind="attrs"
    :class="['mx-auto w-full px-6 md:px-12', { 'max-w-[1200px]': !hasCustomWidth }]"
  >
    <slot />
  </component>
</template>
