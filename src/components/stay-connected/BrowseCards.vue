<script setup lang="ts">
/**
 * Three lightweight links into existing public surfaces (blog, events,
 * about). The point of these cards is "if none of the above grabbed
 * you, here's where to keep poking." Intentionally simple — no images,
 * no descriptions of length, no animation budget.
 */
import { Icon } from '@iconify/vue';
import { RouterLink } from 'vue-router';
import Heading from '../ui/Heading.vue';
import UiCard from '../ui/UiCard.vue';

interface BrowseLink {
  to: string;
  label: string;
  hint: string;
  icon: string;
}

const links: BrowseLink[] = [
  {
    to: '/blog',
    label: 'Read student stories',
    hint: 'Profiles, dispatches from the lab, talks.',
    icon: 'lucide:book-open',
  },
  {
    to: '/events',
    label: 'Upcoming events',
    hint: 'Info sessions, talks, and workshops.',
    icon: 'lucide:calendar',
  },
  {
    to: '/about',
    label: 'About STAIJA',
    hint: 'Who we are and why this work exists.',
    icon: 'lucide:info',
  },
];
</script>

<template>
  <div class="flex flex-col gap-5">
    <Heading :level="2" class="!text-xl !m-0">Or browse around.</Heading>
    <div class="grid sm:grid-cols-3 gap-4">
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="block focus-ring-brand rounded-2xl"
      >
        <UiCard hoverable class="p-5 flex flex-col gap-2 h-full">
          <Icon :icon="link.icon" width="20" class="text-brand-violet" />
          <div class="font-display text-base font-semibold text-ink m-0">{{ link.label }}</div>
          <p class="text-xs text-ink/60 m-0">{{ link.hint }}</p>
        </UiCard>
      </RouterLink>
    </div>
  </div>
</template>
