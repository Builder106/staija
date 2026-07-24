<script setup lang="ts">
import { Motion } from 'motion-v'
import { Icon } from '@iconify/vue'
import Container from '../ui/Container.vue'
import Section from '../ui/Section.vue'
import Heading from '../ui/Heading.vue'
import Body from '../ui/Body.vue'
import Eyebrow from '../ui/Eyebrow.vue'
import UiButton from '../ui/UiButton.vue'
import Parallax from '../motion/Parallax.vue'
import ProgramFaq from './ProgramFaq.vue'
import ProgramCtaBanner from './ProgramCtaBanner.vue'
import { trackApplyClick } from '../../services/analytics'
import { useProgram } from '../../composables/useProgram'

// StepUp Scholars — the "research journal" register.
//
// StepUp and Dynamerge used to render through one shared layout with
// swapped text, which made two genuinely different programs read as the
// same product. This page leans into what StepUp actually is (a six-month
// Nigeria-based research incubator whose scholars end with a symposium
// talk and a journal submission): specimen-label ledger instead of icon
// stats, numbered editorial rows instead of a card grid, person-forward
// 1:1 mentor bench, and slower, quieter motion. The mono ledger styling
// deliberately echoes the transactional-email refBox (see
// functions/src/emailTemplates.ts) so the register carries across media.
const SLUG = 'stepup-scholars' as const

const { program, isApplyOpen, closedReason } = useProgram(SLUG)

// Deliverable each phase of the arc leaves behind — the tangible
// artifact that makes the "first question → first paper" progression
// legible. Every value is surfaced from the matching timeline
// description (no invented content); keyed by month so it renders
// whether the timeline comes from the fallback dict or a Firestore doc
// seeded before this waypoint treatment existed.
const TIMELINE_OUTPUTS: Record<string, string> = {
  'Month 1': 'Lab safety certification',
  'Month 2–4': 'Original dataset',
  'Month 5': 'Drafted abstract',
  'Month 6': 'Submitted manuscript',
}

const FAQS = [
  { q: 'Do I need prior research experience?', a: 'Not at all. We are looking for curiosity and a willingness to learn.' },
  { q: 'How does the stipend work?', a: 'Accepted students receive a monthly stipend to cover internet, transportation, and basic needs during the program.' },
  { q: 'Is there an application fee?', a: 'No, applying to STAIJA programs is completely free.' },
  { q: 'Can I apply to both programs?', a: 'Yes, but you can only participate in one program per calendar year if accepted to both.' },
]
</script>

<template>
  <div v-if="program" class="flex flex-col">
    <!-- Hero — intentionally always-dark regardless of theme (uses the
         `*-static` tokens so it doesn't invert in dark mode). One still
         photo, a specimen-label ledger for the program facts, and slow
         reveals: the page should open like a journal, not a poster. -->
    <div class="relative min-h-svh flex items-center bg-ink-static overflow-hidden">
      <div class="absolute inset-0 z-0">
        <Parallax :speed="-0.25" :distance="120" class="absolute inset-0">
          <img :src="program.heroImg" :alt="program.name" width="1280" height="720" class="w-full h-full object-cover opacity-40 scale-110" />
        </Parallax>
        <div class="absolute inset-0 wash-violet-6 mix-blend-screen" />
        <div class="absolute inset-0 bg-gradient-to-t from-ink-static via-ink-static/60 to-transparent" />
      </div>

      <Container class="relative z-10 py-24">
        <div class="grid lg:grid-cols-[1fr_auto] gap-12 lg:gap-20 items-center">
          <div class="max-w-2xl flex flex-col gap-6 text-paper-static">
            <Motion :initial="{ opacity: 0, y: 14 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.55 }">
              <Eyebrow accent class="text-brand-sky">Research incubator — {{ program.eligibility }}<span class="ml-1.5 tracking-normal align-middle" role="img" aria-label="Nigeria">🇳🇬</span></Eyebrow>
            </Motion>

            <Motion
              class="font-display text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-white"
              as="h1"
              :initial="{ opacity: 0, y: 14 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="{ duration: 0.55, delay: 0.12 }"
            >
              {{ program.name }}
            </Motion>

            <Motion
              class="text-lg md:text-xl text-paper-static/80 leading-relaxed"
              as="p"
              :initial="{ opacity: 0, y: 14 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="{ duration: 0.55, delay: 0.24 }"
            >
              {{ program.pitch }}
            </Motion>

            <Motion
              class="mt-6 flex flex-wrap items-center gap-4"
              :initial="{ opacity: 0 }"
              :animate="{ opacity: 1 }"
              :transition="{ duration: 0.6, delay: 0.4 }"
            >
              <UiButton
                v-if="isApplyOpen"
                variant="on-gradient"
                :to="`/apply/${SLUG}`"
                @click="trackApplyClick({ program: 'stepup', source: 'program_hero' })"
              >
                Apply now
              </UiButton>
              <template v-else>
                <UiButton
                  variant="on-gradient"
                  :to="`/stay-connected?from=${SLUG}&reason=${closedReason}`"
                >
                  {{ closedReason === 'upcoming' ? 'Get notified when applications open' : 'Stay connected for the next cycle' }}
                </UiButton>
                <span class="text-sm text-paper-static/70">
                  Applications {{ closedReason === 'upcoming' ? 'open soon' : 'are closed for this cycle' }}.
                </span>
              </template>
              <UiButton variant="on-gradient-ghost" href="#arc">Read the six-month arc</UiButton>
            </Motion>
          </div>

          <!-- Specimen ledger — same visual language as the email refBox
               (hairline border, dotted ledger rules, mono labels). -->
          <Motion
            :initial="{ opacity: 0, y: 14 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.6, delay: 0.35 }"
          >
            <div class="w-full lg:w-80 border border-brand-violet/25 bg-gradient-to-b from-brand-violet/[0.12] via-white/[0.05] to-white/[0.02] backdrop-blur-sm rounded-2xl p-6 font-mono-african cursor-pin">
              <div class="text-lg font-semibold uppercase tracking-[0.16em] text-brand-violet">
                Program record
              </div>
              <dl class="m-0 mt-2">
                <div
                  v-for="stat in program.stats"
                  :key="stat.label"
                  class="flex items-baseline justify-between gap-6 py-3 border-b border-dotted border-brand-violet/25 last:border-0"
                >
                  <dt class="text-sm uppercase tracking-[0.14em] text-paper-static/60">{{ stat.label }}</dt>
                  <dd class="m-0 text-lg text-violet-100">{{ stat.value }}</dd>
                </div>
              </dl>
            </div>
          </Motion>
        </div>
      </Container>
    </div>

    <!-- The work — numbered editorial rows instead of a card grid. The
         index numerals do the "journal entry" work; alternating image
         sides keep the scroll from feeling like a template. -->
    <Section class="bg-paper">
      <Container>
        <div class="max-w-5xl mx-auto">
          <Eyebrow accent class="text-brand-violet mb-4 block">The work</Eyebrow>
          <Heading :level="2" class="mb-16 max-w-2xl">Six months of doing science, not hearing about it.</Heading>

          <div class="flex flex-col gap-16 md:gap-24">
            <Motion
              v-for="(feature, i) in program.features"
              :key="feature.title"
              class="grid md:grid-cols-2 gap-8 md:gap-14 items-center"
              :initial="{ opacity: 0, y: 24 }"
              :while-in-view="{ opacity: 1, y: 0 }"
              :viewport="{ once: true, margin: '-60px' }"
              :transition="{ duration: 0.6 }"
            >
              <div class="aspect-[4/3] rounded-2xl overflow-hidden" :class="i % 2 === 1 && 'md:order-2'">
                <img :src="feature.img" :alt="feature.title" width="600" height="400" class="w-full h-full object-cover" loading="lazy" />
              </div>
              <div>
                <div class="font-mono-african text-3xl md:text-4xl font-semibold text-brand-violet mb-3">{{ String(i + 1).padStart(2, '0') }}</div>
                <Heading :level="3" class="mb-3">{{ feature.title }}</Heading>
                <Body large>{{ feature.desc }}</Body>
              </div>
            </Motion>
          </div>
        </div>
      </Container>
    </Section>

    <!-- The six-month arc — the vertical month spine stays: a long
         program earns a long, patient timeline. (Dynamerge deliberately
         does NOT use this shape.) -->
    <Section id="arc" class="bg-surface">
      <Container>
        <div class="max-w-4xl mx-auto">
          <Eyebrow accent class="text-brand-violet mb-4 block">The arc</Eyebrow>
          <Heading :level="2" class="mb-12">From first question to first paper.</Heading>

          <!-- Shared gradient for the deliverable glyphs — violet→sky,
               matching the spine dots. (Hex mirrors --color-brand-* since
               SVG stop-color can't reliably read CSS custom properties.) -->
          <svg width="0" height="0" class="absolute" aria-hidden="true">
            <defs>
              <linearGradient id="arcGlyphGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#8B55FF" />
                <stop offset="1" stop-color="#5EDBE7" />
              </linearGradient>
            </defs>
          </svg>

          <ol class="list-none p-0 m-0 grid grid-cols-[auto_28px_1fr] md:grid-cols-[180px_28px_1fr] gap-x-5 md:gap-x-8">
            <Motion
              v-for="(step, i) in program.timeline"
              :key="step.date"
              as="li"
              class="contents"
              :initial="{ opacity: 0, x: -12 }"
              :while-in-view="{ opacity: 1, x: 0 }"
              :viewport="{ once: true, margin: '-50px' }"
              :transition="{ duration: 0.5, delay: i * 0.08 }"
            >
              <!-- Date column — mono ledger type (STAIJA Tac Mono) so the
                   month stamps read as data, echoing the hero's program
                   record. The Month label IS the sequence. -->
              <div
                class="font-mono-african text-lg md:text-2xl font-semibold text-ink md:text-right pt-1.5 self-start"
                :class="i === program.timeline.length - 1 ? 'pb-0' : 'pb-16'"
              >
                {{ step.date }}
              </div>

              <!-- Spine: the connector draws itself downward on scroll
                   (scaleY, sky→violet), each dot igniting with a glow as
                   it enters — the section literally advances as you read. -->
              <div class="relative flex flex-col items-center self-stretch">
                <Motion
                  v-if="i !== program.timeline.length - 1"
                  as="span"
                  aria-hidden="true"
                  class="absolute top-7 bottom-0 left-1/2 -translate-x-1/2 w-[2px] origin-top rounded-full bg-gradient-to-b from-brand-sky to-brand-violet"
                  :initial="{ scaleY: 0 }"
                  :while-in-view="{ scaleY: 1 }"
                  :viewport="{ once: true, margin: '-50px' }"
                  :transition="{ duration: 0.6, delay: 0.15 + i * 0.12, ease: 'easeInOut' }"
                />
                <Motion
                  as="span"
                  aria-hidden="true"
                  class="relative z-10 mt-2 grid place-items-center"
                  :initial="{ scale: 0, opacity: 0 }"
                  :while-in-view="{ scale: 1, opacity: 1 }"
                  :viewport="{ once: true, margin: '-50px' }"
                  :transition="{ duration: 0.4, delay: i * 0.12, ease: 'easeOut' }"
                >
                  <span class="absolute w-7 h-7 rounded-full bg-brand-violet/40 blur-md" />
                  <span class="relative w-7 h-7 rounded-full bg-gradient-to-br from-brand-violet to-brand-sky shadow-lg shadow-brand-violet/30 ring-4 ring-surface" />
                </Motion>
              </div>

              <div
                class="self-start pt-1.5"
                :class="i === program.timeline.length - 1 ? 'pb-0' : 'pb-16'"
              >
                <Body large class="text-ink/80 leading-relaxed">{{ step.desc }}</Body>
                <!-- Deliverable glyph — a hand-built line-art mark of the
                     artifact each phase leaves behind (award → dataset →
                     abstract → submitted paper), drawn in the page's Lucide
                     stroke voice with a violet→sky gradient stroke that
                     echoes the spine dots. The caption keeps the meaning. -->
                <div class="mt-4 flex items-center gap-3">
                  <svg
                    viewBox="0 0 24 24"
                    class="w-12 h-12 shrink-0"
                    fill="none"
                    stroke="url(#arcGlyphGrad)"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <template v-if="step.date === 'Month 1'">
                      <circle cx="12" cy="8" r="6" />
                      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
                    </template>
                    <template v-else-if="step.date === 'Month 2–4'">
                      <ellipse cx="12" cy="5" rx="9" ry="3" />
                      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
                      <path d="M3 12a9 3 0 0 0 18 0" />
                    </template>
                    <template v-else-if="step.date === 'Month 5'">
                      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
                      <path d="M14 2v5h5" />
                      <path d="M8 18v-3" />
                      <path d="M12 18v-5" />
                      <path d="M16 18v-2" />
                    </template>
                    <template v-else>
                      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
                      <path d="m21.854 2.147-10.94 10.939" />
                    </template>
                  </svg>
                  <div v-if="TIMELINE_OUTPUTS[step.date]" class="leading-tight">
                    <div class="font-mono-african text-xs uppercase tracking-[0.2em] text-brand-violet/60">Output</div>
                    <div class="font-sans text-lg font-medium text-ink mt-0.5">{{ TIMELINE_OUTPUTS[step.date] }}</div>
                  </div>
                </div>
              </div>
            </Motion>
          </ol>
        </div>
      </Container>
    </Section>

    <!-- Who it's for -->
    <Section class="bg-paper border-t hairline-ink">
      <Container>
        <div class="max-w-4xl mx-auto bg-surface rounded-3xl p-8 md:p-12 shadow-sm border hairline-ink flex flex-col md:flex-row gap-12">
          <div class="md:w-1/3">
            <Heading :level="2" class="mb-4">Who it's for</Heading>
            <Body class="text-ink/60">
              We evaluate applications based on curiosity, resilience, and potential for growth.
              We actively encourage students from underrepresented backgrounds to apply.
            </Body>
          </div>
          <div class="md:w-2/3 flex flex-col gap-4">
            <div v-for="req in program.eligibilityList" :key="req" class="flex items-start gap-3">
              <Icon icon="lucide:check-circle-2" width="20" class="text-brand-violet shrink-0 mt-1" />
              <Body>{{ req }}</Body>
            </div>
          </div>
        </div>
      </Container>
    </Section>

    <ProgramFaq :faqs="FAQS" />

    <ProgramCtaBanner
      :slug="SLUG"
      :is-apply-open="isApplyOpen"
      :closed-reason="closedReason"
    />
  </div>
  <div v-else class="p-24 text-center">Program not found.</div>
</template>
