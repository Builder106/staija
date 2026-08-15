<script setup lang="ts">
import { trackApplyClick } from '../../services/analytics';
import type { ProgramSlug } from '../../services/programContent';
import Container from '../ui/Container.vue';
import Heading from '../ui/Heading.vue';
import UiButton from '../ui/UiButton.vue';

// The closing gradient CTA banner — deliberately identical on both
// program pages. The pages diverge everywhere else; this banner (and the
// site nav/footer around them) is the shared STAIJA chrome that says
// "same organization, one application funnel."
const props = defineProps<{
  slug: ProgramSlug;
  isApplyOpen: boolean;
  closedReason: 'upcoming' | 'closed';
}>();

function onApplyClick() {
  trackApplyClick({
    program: props.slug === 'stepup-scholars' ? 'stepup' : 'dynamerge',
    source: 'program_cta_banner',
  });
}
</script>

<template>
  <section class="bg-gradient-brand w-full py-24 px-6">
    <Container>
      <div class="text-center flex flex-col items-center">
        <Heading :level="2" class="!text-white mb-8 max-w-2xl">
          <template v-if="isApplyOpen">Ready to start your journey with STAIJA?</template>
          <template v-else>Not this cycle? Stay close for the next one.</template>
        </Heading>
        <UiButton
          v-if="isApplyOpen"
          :to="'/signup'"
          class="!bg-transparent !text-white !border-2 !border-white hover:!bg-white hover:!text-brand-violet text-lg !px-8 !h-auto !py-4"
          @click="onApplyClick"
        >
          Apply now
        </UiButton>
        <UiButton
          v-else
          :to="`/stay-connected?from=${slug}&reason=${closedReason}`"
          class="!bg-transparent !text-white !border-2 !border-white hover:!bg-white hover:!text-brand-violet text-lg !px-8 !h-auto !py-4"
        >
          {{
            closedReason === 'upcoming'
              ? 'Get notified when applications open'
              : 'Stay connected for the next cycle'
          }}
        </UiButton>
      </div>
    </Container>
  </section>
</template>
