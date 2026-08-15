<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { ProgramStat } from '../../services/firebase';
import UiChip from '../ui/UiChip.vue';

defineProps<{
  name: string;
  pitch: string;
  eligibility: string;
  heroImg: string;
  stats: ProgramStat[];
}>();
</script>

<!--
  Mini live preview of the public program hero. No animations, smaller
  scale, so it fits inside the admin form. Updates as the editor types
  because the props are reactive.

  Approximation, not a mirror: StepUp and Dynamerge now render through
  separate layout components (src/components/programs/StepUpDetailView.vue,
  DynamergeDetailView.vue) with genuinely different hero treatments —
  StepUp keeps this dark-photo-plus-chips shape closely, but Dynamerge's
  real hero is the full brand gradient with a status chip and country
  marquee, which this preview does not reproduce. Good enough to sanity-
  check copy and stat values; not a substitute for viewing the live page.

  Intentionally only shows the hero — features, timeline, eligibility,
  and mentors are all linear lists that the editor can already see in
  their respective form sections. The hero is the part where small
  changes (hero image, stat values) compound into something hard to
  visualise without a render.
-->

<template>
  <div class="rounded-2xl overflow-hidden border hairline-ink bg-ink relative">
    <!-- Mode label -->
    <div
      class="absolute top-3 left-3 z-20 px-2.5 py-1 rounded-full bg-paper/90 text-ink text-[10px] font-semibold tracking-widest uppercase backdrop-blur-sm"
    >
      Live preview
    </div>

    <!-- Hero -->
    <div class="relative min-h-[280px] flex items-center overflow-hidden">
      <div class="absolute inset-0 z-0">
        <img
          v-if="heroImg"
          :src="heroImg"
          :alt="name"
          width="1280"
          height="720"
          class="w-full h-full object-cover opacity-40"
        />
        <div v-else class="w-full h-full bg-ink/80" />
        <div class="absolute inset-0 wash-violet-6 mix-blend-screen" />
        <div class="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-transparent" />
      </div>

      <div class="relative z-10 px-6 py-8 flex flex-col gap-4 text-paper w-full">
        <UiChip class="bg-paper/10 !text-paper border-paper/20 self-start">
          {{ eligibility || '—' }}
        </UiChip>

        <h2 class="font-display text-2xl md:text-3xl font-semibold tracking-tight text-white m-0">
          {{ name }}
        </h2>

        <p class="text-sm md:text-base text-paper/80 leading-relaxed m-0 line-clamp-3">
          {{ pitch || 'Pitch will appear here.' }}
        </p>

        <div
          v-if="stats.length > 0"
          class="flex flex-wrap gap-x-5 gap-y-3 mt-2 pt-4 border-t border-paper/20"
        >
          <div
            v-for="(stat, i) in stats"
            :key="`${stat.label}-${i}`"
            class="flex items-center gap-2"
          >
            <div class="w-7 h-7 rounded-full bg-paper/10 flex items-center justify-center shrink-0">
              <Icon :icon="stat.icon || 'lucide:circle'" width="14" class="text-white" />
            </div>
            <div class="leading-tight">
              <div class="text-[9px] text-paper/60 uppercase tracking-widest font-semibold">
                {{ stat.label || '—' }}
              </div>
              <div class="text-xs font-semibold text-white">{{ stat.value || '—' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
