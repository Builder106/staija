<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { ref } from 'vue';
import Container from '../ui/Container.vue';
import Heading from '../ui/Heading.vue';
import Section from '../ui/Section.vue';
import UiCard from '../ui/UiCard.vue';

// Shared FAQ accordion for the program detail pages. The two pages pass
// different question sets (StepUp leads with stipend/research questions,
// Dynamerge with cost/connectivity ones) but share the interaction.
defineProps<{ faqs: { q: string; a: string }[] }>();

const openFaq = ref<number | null>(0);
function toggleFaq(i: number) {
  openFaq.value = openFaq.value === i ? null : i;
}
</script>

<template>
  <Section class="bg-paper border-t hairline-ink">
    <Container class="max-w-3xl">
      <Heading :level="2" class="text-center mb-12">Frequently Asked Questions</Heading>
      <div class="flex flex-col gap-4">
        <UiCard v-for="(faq, i) in faqs" :key="faq.q" class="overflow-hidden" @click="toggleFaq(i)">
          <div class="p-6 flex items-center justify-between font-semibold text-lg cursor-clickable">
            <span>{{ faq.q }}</span>
            <Icon
              icon="lucide:chevron-down"
              width="20"
              class="transition-transform duration-300"
              :class="openFaq === i && 'rotate-180'"
            />
          </div>
          <div
            class="px-6 text-ink/70 transition-all duration-300 ease-in-out"
            :class="
              openFaq === i ? 'pb-6 max-h-[200px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
            "
          >
            {{ faq.a }}
          </div>
        </UiCard>
      </div>
    </Container>
  </Section>
</template>
