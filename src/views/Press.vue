<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Motion } from 'motion-v';
import ScrollReveal from '../components/motion/ScrollReveal.vue';
import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Eyebrow from '../components/ui/Eyebrow.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiCard from '../components/ui/UiCard.vue';

interface Coverage {
  outlet: string;
  quote: string;
  url: string;
  date: string;
}

// Real press coverage goes here once it lands. Until then, the Coverage
// section below renders nothing rather than fabricated quotes attributed
// to publications that haven't actually written about STAIJA.
const COVERAGE: Coverage[] = [];

const ASSETS = [
  {
    label: 'Logo (color, SVG)',
    description: 'Vector wordmark on the brand gradient. For digital use.',
    href: '/STAIJA.png',
    icon: 'lucide:image',
  },
  {
    label: 'Logo (monochrome, PNG)',
    description: 'Black-on-transparent for print and single-color contexts.',
    href: '/STAIJA.png',
    icon: 'lucide:image',
  },
  {
    label: 'Brand sheet (PDF)',
    description: 'One-page brand reference: colors, typography, logo usage.',
    href: '#',
    icon: 'lucide:file-text',
  },
];

const COLOR_TOKENS = [
  { name: 'Brand Violet', hex: '#8B55FF', swatch: 'bg-brand-violet' },
  { name: 'Brand Sky', hex: '#5EDBE7', swatch: 'bg-brand-sky' },
  { name: 'Ink', hex: '#0E1217', swatch: 'bg-ink' },
  { name: 'Slate', hex: '#F1F5F9', swatch: 'bg-paper border hairline-ink' },
];
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <!-- Hero -->
    <Section class="!pt-16 md:!pt-24 wash-violet-6">
      <Container class="max-w-3xl">
        <Eyebrow class="text-brand-violet mb-4 block">Press</Eyebrow>
        <Heading :level="1" class="mb-6">
          We're building <span class="text-brand-violet">Africa's next</span> generation of
          scientist-leaders.
        </Heading>
        <Body large class="text-ink/70">
          For interviews, brand assets, or background on STAIJA's programs and outcomes, start here.
          We aim to reply to all press inquiries within one business day.
        </Body>
      </Container>
    </Section>

    <!-- Press contact -->
    <Section class="bg-surface border-y hairline-ink">
      <Container class="max-w-3xl">
        <div class="grid md:grid-cols-2 gap-8 items-start">
          <ScrollReveal>
            <Eyebrow class="text-brand-violet mb-4 block">Press contact</Eyebrow>
            <Heading :level="2" class="mb-4">Tomi Adeyemi</Heading>
            <p class="text-ink/70 mb-6">Director of Communications, STAIJA</p>
            <div class="flex flex-col gap-3">
              <a
                href="mailto:press@staija.org"
                class="inline-flex items-center gap-2 text-brand-violet font-semibold hover:underline underline-offset-2"
              >
                <Icon icon="lucide:mail" width="18" /> press@staija.org
              </a>
              <a
                href="mailto:press@staija.org?subject=Photo%20request%3A%20STAIJA%20leadership%20headshots"
                class="inline-flex items-center gap-2 text-ink/70 font-semibold hover:text-brand-violet"
              >
                <Icon icon="lucide:camera" width="18" /> Request high-res leadership photos
              </a>
            </div>
          </ScrollReveal>
          <ScrollReveal :delay="0.12">
            <UiCard class="p-6 bg-paper">
              <h3 class="font-display text-lg font-semibold mb-3 m-0">For interviews</h3>
              <p class="text-sm text-ink/70 mb-4 m-0">
                Our Executive Director and Program Directors are available for interviews and expert
                commentary on STEM education, African research capacity, and youth-led science. Most
                interviews can be scheduled within 48 hours.
              </p>
              <UiButton
                variant="primary"
                href="mailto:press@staija.org?subject=Interview%20request"
              >
                Schedule an interview
              </UiButton>
            </UiCard>
          </ScrollReveal>
        </div>
      </Container>
    </Section>

    <!-- Brand assets -->
    <Section class="bg-paper">
      <Container>
        <div class="text-center mb-12">
          <Eyebrow class="text-brand-violet mb-4 block">Brand assets</Eyebrow>
          <Heading :level="2">Use the marks correctly.</Heading>
        </div>

        <div class="grid md:grid-cols-3 gap-6 mb-12">
          <Motion
            v-for="(asset, i) in ASSETS"
            :key="asset.label"
            :initial="{ opacity: 0, y: 12 }"
            :while-in-view="{ opacity: 1, y: 0 }"
            :viewport="{ once: true }"
            :transition="{ duration: 0.4, delay: i * 0.08 }"
          >
            <UiCard class="p-6 flex flex-col gap-4 h-full">
              <Icon :icon="asset.icon" width="28" class="text-brand-violet" />
              <div>
                <h4 class="font-display text-lg font-semibold mb-1 m-0">{{ asset.label }}</h4>
                <p class="text-sm text-ink/70 m-0">{{ asset.description }}</p>
              </div>
              <a
                :href="asset.href"
                download
                class="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-brand-violet hover:underline underline-offset-2"
              >
                <Icon icon="lucide:download" width="16" /> Download
              </a>
            </UiCard>
          </Motion>
        </div>

        <!-- Color tokens -->
        <ScrollReveal>
          <div class="border-t hairline-ink pt-12">
            <h3 class="font-display text-2xl font-semibold mb-8 text-center m-0">Color palette</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
              <div
                v-for="c in COLOR_TOKENS"
                :key="c.name"
                class="flex flex-col items-center text-center gap-3"
              >
                <div :class="['w-20 h-20 rounded-2xl', c.swatch]" />
                <div>
                  <div class="font-semibold text-sm text-ink">{{ c.name }}</div>
                  <div class="font-mono text-xs text-ink/60">{{ c.hex }}</div>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </Container>
    </Section>

    <!-- Coverage (only renders once we have real press hits) -->
    <Section v-if="COVERAGE.length > 0" class="bg-surface border-t hairline-ink">
      <Container class="max-w-4xl">
        <div class="mb-12">
          <Eyebrow class="text-brand-violet mb-4 block">Coverage</Eyebrow>
          <Heading :level="2">In the press.</Heading>
        </div>

        <div class="flex flex-col gap-4">
          <a
            v-for="(c, i) in COVERAGE"
            :key="c.outlet + c.date"
            :href="c.url"
            target="_blank"
            rel="noopener"
            class="group focus-ring-brand rounded-2xl"
          >
            <Motion
              :initial="{ opacity: 0, y: 8 }"
              :while-in-view="{ opacity: 1, y: 0 }"
              :viewport="{ once: true }"
              :transition="{ duration: 0.3, delay: (i % 3) * 0.05 }"
            >
              <UiCard
                class="p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6 hover:shadow-md transition-shadow"
              >
                <div class="md:w-48 shrink-0">
                  <div
                    class="font-display text-xl font-semibold text-ink group-hover:text-brand-violet transition-colors"
                  >
                    {{ c.outlet }}
                  </div>
                  <div class="text-xs uppercase tracking-widest text-ink/50 mt-1">{{ c.date }}</div>
                </div>
                <p class="flex-1 text-lg text-ink/80 italic leading-relaxed m-0">
                  &ldquo;{{ c.quote }}&rdquo;
                </p>
                <Icon
                  icon="lucide:arrow-up-right"
                  width="20"
                  class="text-ink/40 group-hover:text-brand-violet group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all"
                />
              </UiCard>
            </Motion>
          </a>
        </div>
      </Container>
    </Section>
  </div>
</template>
