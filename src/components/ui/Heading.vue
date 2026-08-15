<script setup lang="ts">
const props = defineProps<{ level?: 1 | 2 | 3 }>();

const tag = `h${props.level ?? 1}` as 'h1' | 'h2' | 'h3';

const sizeClass = {
  1: 'font-display text-4xl leading-tight tracking-tight md:text-5xl lg:text-7xl',
  2: 'font-display text-3xl leading-tight tracking-tight md:text-4xl lg:text-5xl',
  3: 'font-display text-2xl leading-snug tracking-tight md:text-3xl',
}[props.level ?? 1];
</script>

<template>
  <component :is="tag" :class="sizeClass">
    <slot />
  </component>
</template>
