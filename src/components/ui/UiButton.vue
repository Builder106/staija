<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

type Variant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'gradient'
  // Inverse variants — for use on dark or gradient surfaces (e.g. the
  // homepage hero) where the standard variants would disappear into the
  // background or visually compete with it.
  | 'on-gradient'
  | 'on-gradient-ghost';

const props = withDefaults(
  defineProps<{
    variant?: Variant;
    to?: RouteLocationRaw;
    href?: string;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
  }>(),
  { variant: 'primary', type: 'button' },
);

defineEmits<{ (e: 'click', payload: MouseEvent): void }>();

// No cursor-pointer here: Tailwind's utility lives in the `utilities`
// cascade layer, which comes after `base` in this file's
// `@layer legacy, theme, base, components, utilities;` order — so it
// would silently outrank .brand-surface a/button's --cursor-clickable
// rule (also in @layer base) regardless of specificity, showing the
// native OS pointer on every button instead of the custom cursor. This
// component always renders as a real <button>/<a>/RouterLink (see
// `tag` below), so the base rule already applies cursor: pointer as a
// fallback anyway.
const base =
  'inline-flex items-center justify-center font-sans text-sm font-semibold transition-[background-color,border-color,box-shadow,transform,opacity] disabled:opacity-50 disabled:pointer-events-none';

const variantClass = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'focus-ring-brand bg-brand-violet text-white min-h-11 h-auto px-6 py-2.5 rounded-xl hover:-translate-y-[1px] hover:bg-[#9768FF]';
    case 'secondary':
      return 'focus-ring-brand bg-transparent text-ink border border-ink/10 min-h-11 h-auto px-6 py-2.5 rounded-xl hover:bg-ink/5';
    case 'tertiary':
      return 'focus-ring-brand bg-transparent text-ink h-auto p-0 underline-offset-2 hover:underline';
    case 'gradient':
      return 'focus-ring-brand bg-gradient-brand text-white min-h-11 h-auto px-6 py-2.5 rounded-xl hover:-translate-y-[1px] hover:shadow-lg hover:shadow-brand-violet/20';
    case 'on-gradient':
      return 'focus-ring-inverse bg-white text-ink-static min-h-11 h-auto px-6 py-2.5 rounded-xl hover:-translate-y-[1px] hover:bg-white/90';
    case 'on-gradient-ghost':
      return 'focus-ring-inverse bg-transparent text-white border border-white/40 min-h-11 h-auto px-6 py-2.5 rounded-xl hover:bg-white/10 hover:border-white/60';
    default:
      return 'focus-ring-brand bg-brand-violet text-white min-h-11 h-auto px-6 py-2.5 rounded-xl hover:-translate-y-[1px] hover:bg-[#9768FF]';
  }
});

const tag = computed(() => {
  if (props.to !== undefined) return RouterLink;
  if (props.href !== undefined) return 'a';
  return 'button';
});
</script>

<template>
  <component
    :is="tag"
    :to="to"
    :href="href"
    :type="tag === 'button' ? type : undefined"
    :disabled="tag === 'button' ? disabled : undefined"
    :class="[base, variantClass]"
    @click="$emit('click', $event)"
  >
    <slot />
  </component>
</template>
