<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Motion } from 'motion-v';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { defineAsyncComponent } from 'vue';

const HeroLottie = defineAsyncComponent(() => import('../components/HeroLottie.vue'));

const showHeroLottie = ref(false);

onMounted(() => {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => {
      showHeroLottie.value = true;
    });
  } else {
    // Fallback for browsers without requestIdleCallback (e.g., Safari)
    setTimeout(() => {
      showHeroLottie.value = true;
    }, 0);
  }
});

import CountUp from '../components/motion/CountUp.vue';
import Hairline from '../components/motion/Hairline.vue';
import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Eyebrow from '../components/ui/Eyebrow.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiCard from '../components/ui/UiCard.vue';
import UiChip from '../components/ui/UiChip.vue';
import { trackApplyClick } from '../services/analytics';
import { getBlogPosts, getEvents, type BlogPost, type EventItem } from '../services/content';

const { t, locale } = useI18n();

// Split the lead word into 3 contiguous letter groups, stacked as 3
// lines — reproduces the Pan-African flag's actual 3-horizontal-band
// structure using whole legible letters per band, not a pixel-height
// slice through each glyph (see .flag-line-* below for why that
// in-glyph version was dropped) and not a per-letter color cycle
// (tried in between — read as noisy/random rather than "the flag").
const headlineLeadLines = computed(() => {
  const chars = Array.from(t('home.hero.headlineLead'));
  const size = Math.ceil(chars.length / 3);
  return [
    chars.slice(0, size).join(''),
    chars.slice(size, size * 2).join(''),
    chars.slice(size * 2).join(''),
  ];
});

// Stats: numbers stay hardcoded (they're data, not language) but the
// eyebrow + caption flow through i18n. Recomputed on locale change.
const stats = computed(() => [
  {
    eyebrow: t('home.stats.studentsReached'),
    number: 100,
    caption: t('home.stats.studentsReachedCaption'),
  },
  {
    eyebrow: t('home.stats.talkAttendees'),
    number: 200,
    caption: t('home.stats.talkAttendeesCaption'),
  },
  {
    eyebrow: t('home.stats.programs'),
    number: 2,
    caption: t('home.stats.programsCaption'),
  },
]);

// Featured story + upcoming events read from Contentful via the content
// service. Sections render only when real entries exist — no fallback to
// fabricated "Chinedu Okafor" / "StepUp 2025 info session" stubs that
// shipped fake credibility before the CMS was populated.
const featuredStory = ref<BlogPost | null>(null);
const upcomingEvents = ref<EventItem[]>([]);
// CLS guard: the CMS-driven sections below are mounted asynchronously
// (Contentful round-trip in `onMounted`). Without a placeholder, when
// they pop into existence they push the footer down by ~700px and
// ~470px respectively — a huge cumulative layout shift on every page
// load. We render a fixed-height skeleton while loading so the
// destination space is already reserved at first paint. Once
// `contentLoaded` flips, sections without data collapse to nothing —
// still a shift, but it only happens on empty-CMS deploys, not in
// production.
const contentLoaded = ref(false);

// Pass the active locale to Intl so dates localize alongside the rest
// of the page. Browsers unfamiliar with a given BCP47 code (e.g. 'yo')
// fall back to the user's system default, which is acceptable for
// short month/day strings.
const featuredEyebrow = computed(() => {
  if (!featuredStory.value) return '';
  const d = new Date(featuredStory.value.publishedAt);
  return d.toLocaleDateString(locale.value, { month: 'short', day: 'numeric', year: 'numeric' });
});

function eventDateParts(iso: string) {
  const d = new Date(iso);
  return {
    month: d.toLocaleString(locale.value, { month: 'short' }).toUpperCase(),
    day: d.getDate(),
  };
}

onMounted(async () => {
  try {
    const [blog, events] = await Promise.all([
      getBlogPosts({ limit: 1 }),
      getEvents({ upcoming: true, limit: 3 }),
    ]);
    featuredStory.value = blog.items[0] ?? null;
    upcomingEvents.value = events;
  } catch {
    // Soft-fail: leave both null/empty so the sections stay hidden.
  } finally {
    contentLoaded.value = true;
  }
});
</script>

<template>
  <div class="flex flex-col">
    <!-- Hero — gradient-forward "brand-mark territory". The site is
         otherwise paper/ink/editorial; the hero is where the brand
         gradient gets to be loud, so the page feels like a cousin of
         the violet→cyan logo instead of a foil to it. -->
    <!-- min-h-svh (small viewport height) is locked to the smallest possible
         viewport for the device. min-h-dvh recalculates as mobile browser
         chrome (URL bar) shows/hides during scroll, causing the hero to
         resize and pushing everything below it — a CLS source.

         FIX: Use min-h-dvh (dynamic viewport height) which is stable,
         or better yet, remove min-height entirely and let content dictate
         height. The flex items-center centers content regardless.
         The !pt/!pb utilities provide consistent padding. -->
    <Section
      class="flex items-center min-h-[800px] sm:min-h-[850px] md:min-h-[900px] lg:min-h-[700px] !pt-8 !pb-16 sm:!pt-12 sm:!pb-20 md:!pt-20 md:!pb-28 relative overflow-hidden bg-gradient-hero text-white dark:text-ink-static"
    >
      <!-- Soft accent glow behind the Lottie. Hidden on small screens
           where the artwork stacks below the copy and the glow would
           wash out the headline. -->
      <div
        class="hidden lg:block absolute -right-24 top-1/2 -translate-y-1/2 w-[640px] h-[640px] gradient-blob pointer-events-none"
        aria-hidden="true"
      />
      <Container>
        <div class="grid lg:grid-cols-2 gap-8 lg:gap-8 items-center relative">
          <!-- Hero text wrapper — LCP element. Keep completely static at
               first paint (no Motion, no animation) so the <h1> paints
               immediately. The Lottie on the right carries the "alive"
               entrance via its own opacity fade. -->
          <div class="flex flex-col gap-6 sm:gap-8 max-w-xl">
            <a
              href="https://github.com/Builder106/staija"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium text-white/90 border border-white/20 rounded-full hover:bg-white/10 hover:text-white transition-colors w-fit group"
            >
              <Icon icon="lucide:github" class="w-4 h-4" />
              {{ t('home.hero.githubPill') }}
              <Icon
                icon="lucide:arrow-right"
                class="w-4 h-4 text-white/40 group-hover:text-white/80 transition-colors"
              />
            </a>
            <Heading :level="1">
              <!-- i18n-t with a slot for the accent so translators can
                   move the italicized word to wherever the sentence
                   structure demands in their language. Yorùbá word
                   order isn't a 1:1 with English — a 3-part split
                   (part1 / accent / part2) wouldn't survive contact
                   with the language. -->
              <i18n-t keypath="home.hero.headline" tag="span">
                <template #lead>
                  <!-- Only the first two letter-groups ("Afr"/"ica") swap
                       for the Africa silhouette on hover — the third
                       group (the possessive "'s") stays put as ordinary
                       text next to it, so the swap reads as "Africa" →
                       [map] while "'s" holds its place. -->
                  <span class="font-accent-african-tertiary lead-hover-group" tabindex="0">
                    <span class="lead-swap">
                      <span class="lead-text">
                        <span v-for="i in [0, 1]" :key="i" :class="`flag-line-${i}`">{{
                          headlineLeadLines[i]
                        }}</span>
                      </span>
                      <span class="africa-pop-in" aria-hidden="true" />
                    </span>
                    <span class="flag-line-2">{{ headlineLeadLines[2] }}</span>
                  </span>
                </template>
                <template #accent>
                  <!-- A single flask centered under a two-word phrase this
                       long left most of the vacated width empty — swapped
                       for a row of icons (same lucide set used elsewhere
                       on this page, e.g. the GitHub pill above) spanning
                       closer to the phrase's actual width. -->
                  <span class="italic text-brand-sky accent-hover-group" tabindex="0">
                    <span class="accent-text">{{ t('home.hero.headlineAccent') }}</span>
                    <!-- Enter stagger (arrive left to right) is set in CSS
                         via :hover …:nth-child rules, not inline here, so
                         it applies only on the way in and the exit stays
                         un-staggered. -->
                    <span class="science-pop-in" aria-hidden="true">
                      <Icon icon="lucide:flask-conical" class="science-icon" />
                      <Icon icon="lucide:atom" class="science-icon" />
                      <Icon icon="lucide:lightbulb" class="science-icon" />
                    </span>
                  </span>
                </template>
              </i18n-t>
            </Heading>
            <Body large class="!text-white/85 dark:!text-ink-static/85">
              {{ t('home.hero.dek') }}
            </Body>
            <div class="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 w-full sm:w-auto">
              <UiButton
                variant="on-gradient"
                :to="'/apply/stepup-scholars'"
                class="w-full sm:w-auto text-center justify-center"
                @click="trackApplyClick({ program: 'stepup', source: 'home_hero' })"
              >
                {{ t('home.hero.ctaPrimary') }}
              </UiButton>
              <UiButton
                variant="on-gradient-ghost"
                href="#programs"
                class="w-full sm:w-auto text-center justify-center"
              >
                {{ t('home.hero.ctaSecondary') }}
              </UiButton>
            </div>
            <!-- Tertiary path for visitors who can't (or aren't ready
                 to) apply. One quiet line under the CTAs — discoverable
                 without competing with the primary action. -->
            <RouterLink
              to="/stay-connected"
              class="text-sm text-white/70 hover:text-white inline-flex items-center gap-1.5 transition-colors w-fit"
            >
              Not eligible yet, or between cycles? Stay connected
              <Icon icon="lucide:arrow-right" width="14" />
            </RouterLink>
          </div>

          <!-- Pure opacity fade — the previous scale 0.95 → 1 triggered GPU
               compositor work during the LCP window (headline paint).
               Dropping the scale frees that budget. The aspect-ratio
               container already reserves the box, so no CLS even though
               the Lottie content paints in asynchronously.

               Lottie intrinsic size is 1080x950 (1.137:1). Using
               aspect-[1080/950] reserves the exact box so the async
               SVG paint cannot shift layout.

               REMOVED max-h constraints that conflicted with aspect-ratio
               on mobile (375px width → ~330px needed, but max-h-300
               capped it at 300px, causing CLS when Lottie loaded). -->
          <Motion
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
            :transition="{ duration: 0.5, delay: 0.2 }"
            class="relative w-full aspect-[1080/950] lg:aspect-square flex items-center justify-center lg:max-h-none"
          >
            <HeroLottie v-if="showHeroLottie" class="w-full h-full max-w-[560px] relative" />
          </Motion>
        </div>
      </Container>
    </Section>

    <Hairline />
    <!-- Impact Strip -->
    <Section class="!py-12 bg-paper/50 min-h-[200px] sm:min-h-[220px] md:min-h-[180px]">
      <Container>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          <Motion
            v-for="(stat, i) in stats"
            :key="stat.eyebrow"
            :initial="{ opacity: 0, y: 10 }"
            :while-in-view="{ opacity: 1, y: 0 }"
            :viewport="{ once: true, margin: '-50px' }"
            :transition="{ duration: 0.4, delay: i * 0.08 }"
            class="flex flex-col gap-2"
          >
            <Eyebrow class="text-brand-violet">{{ stat.eyebrow }}</Eyebrow>
            <div
              class="font-display text-4xl md:text-5xl font-semibold tracking-tight text-brand-violet"
            >
              <CountUp :value="stat.number" :locale="locale" />
            </div>
            <p class="text-sm text-ink/70">{{ stat.caption }}</p>
          </Motion>
        </div>
      </Container>
    </Section>

    <Hairline />
    <!-- Programs Split -->
    <Section
      id="programs"
      class="bg-surface min-h-[480px] sm:min-h-[480px] md:min-h-[420px] lg:min-h-[380px]"
    >
      <Container>
        <div class="flex flex-col gap-12">
          <div class="max-w-2xl">
            <Eyebrow class="text-brand-violet mb-4 block">{{ t('home.programs.eyebrow') }}</Eyebrow>
            <Heading :level="2">{{ t('home.programs.heading') }}</Heading>
          </div>

          <div class="grid md:grid-cols-2 gap-6 lg:gap-8">
            <Motion
              :initial="{ opacity: 0, y: 20 }"
              :while-in-view="{ opacity: 1, y: 0 }"
              :viewport="{ once: true }"
              :transition="{ duration: 0.5 }"
            >
              <UiCard hoverable class="h-full flex flex-col relative pt-[4px]">
                <div class="absolute top-0 left-0 right-0 h-[4px] bg-gradient-brand" />
                <div class="p-8 md:p-10 flex flex-col h-full gap-6">
                  <div class="flex justify-between items-start gap-4">
                    <!-- Program names ("StepUp Scholars" / "Dynamerge")
                         are proper nouns — left untranslated. Same
                         convention applies in nav, footer, etc. -->
                    <Heading :level="3">StepUp Scholars</Heading>
                    <UiChip>{{ t('home.programs.stepupChip') }}</UiChip>
                  </div>
                  <Body class="flex-1">
                    {{ t('home.programs.stepupBlurb') }}
                  </Body>
                  <div class="pt-6 border-t hairline-ink flex items-center justify-between">
                    <span class="text-sm font-semibold text-ink/60">{{
                      t('home.programs.stepupAge')
                    }}</span>
                    <UiButton
                      variant="tertiary"
                      :to="'/programs/stepup-scholars'"
                      class="text-brand-violet"
                    >
                      <span class="flex items-center gap-1 group">
                        {{ t('home.programs.learnMore') }}
                        <Icon
                          icon="lucide:arrow-right"
                          width="16"
                          class="transition-transform group-hover:translate-x-1"
                        />
                      </span>
                    </UiButton>
                  </div>
                </div>
              </UiCard>
            </Motion>

            <Motion
              :initial="{ opacity: 0, y: 20 }"
              :while-in-view="{ opacity: 1, y: 0 }"
              :viewport="{ once: true }"
              :transition="{ duration: 0.5, delay: 0.1 }"
            >
              <UiCard hoverable class="h-full flex flex-col relative pt-[4px]">
                <div class="absolute top-0 left-0 right-0 h-[4px] bg-gradient-brand" />
                <div class="p-8 md:p-10 flex flex-col h-full gap-6">
                  <div class="flex justify-between items-start gap-4">
                    <Heading :level="3">Dynamerge</Heading>
                    <UiChip>{{ t('home.programs.dynamergeChip') }}</UiChip>
                  </div>
                  <Body class="flex-1">
                    {{ t('home.programs.dynamergeBlurb') }}
                  </Body>
                  <div class="pt-6 border-t hairline-ink flex items-center justify-between">
                    <span class="text-sm font-semibold text-ink/60">{{
                      t('home.programs.dynamergeAge')
                    }}</span>
                    <UiButton
                      variant="tertiary"
                      :to="'/programs/dynamerge'"
                      class="text-brand-violet"
                    >
                      <span class="flex items-center gap-1 group">
                        {{ t('home.programs.learnMore') }}
                        <Icon
                          icon="lucide:arrow-right"
                          width="16"
                          class="transition-transform group-hover:translate-x-1"
                        />
                      </span>
                    </UiButton>
                  </div>
                </div>
              </UiCard>
            </Motion>
          </div>
        </div>
      </Container>
    </Section>

    <!-- Featured Story (renders only when CMS has at least one published post).
         CLS guard: while the CMS fetch is in flight we keep the section
         mounted with a min-height matching its loaded state so the footer
         doesn't jump down ~700px once Contentful resolves. After load:
         ALWAYS render the section to prevent layout shift — if no story,
         render an empty state placeholder instead of collapsing entirely. -->
    <Section class="bg-paper">
      <Container>
        <div
          class="grid lg:grid-cols-12 gap-8 lg:gap-16 items-center min-h-[450px] lg:min-h-[520px]"
        >
          <template v-if="featuredStory">
            <Motion
              class="lg:col-span-7 aspect-[4/3] rounded-2xl overflow-hidden relative bg-ink/5"
              :initial="{ opacity: 0, scale: 0.98 }"
              :while-in-view="{ opacity: 1, scale: 1 }"
              :viewport="{ once: true }"
              :transition="{ duration: 0.6 }"
            >
              <div
                class="absolute inset-0 wash-violet-6 mix-blend-multiply z-10 pointer-events-none"
              />
              <!-- width/height pin the intrinsic aspect ratio so the browser
                 reserves the box before the bytes arrive. The parent Motion
                 already has aspect-[4/3], but a width-less <img> can still
                 race against decode in some browsers. eager loading because
                 this image is the second visible block below the fold — by
                 the time most users hit it, prefetching is cheap and lazy
                 risks a visible decode pop. -->
              <img
                v-if="featuredStory.hero"
                :src="featuredStory.hero"
                :alt="featuredStory.title"
                width="800"
                height="600"
                class="w-full h-full object-cover"
                decoding="async"
              />
            </Motion>
            <Motion
              class="lg:col-span-5 flex flex-col gap-6"
              :initial="{ opacity: 0, x: 20 }"
              :while-in-view="{ opacity: 1, x: 0 }"
              :viewport="{ once: true }"
              :transition="{ duration: 0.6, delay: 0.2 }"
            >
              <Eyebrow class="text-brand-violet"
                >{{ t('home.featured.eyebrow') }} | {{ featuredEyebrow }}</Eyebrow
              >
              <!-- Story title + dek come from CMS — they're translator-
                 owned at the Contentful layer (locale variants per
                 entry), not via i18n keys here. -->
              <Heading :level="2">{{ featuredStory.title }}</Heading>
              <Body>{{ featuredStory.dek }}</Body>
              <div class="mt-2 flex flex-col gap-4">
                <div class="text-sm text-ink/70">
                  {{ t('home.featured.byline', { author: featuredStory.author }) }}
                </div>
                <UiButton
                  variant="tertiary"
                  :to="`/blog/${featuredStory.slug}`"
                  class="self-start text-brand-violet"
                >
                  <span class="flex items-center gap-1 group">
                    {{ t('home.featured.readMore') }}
                    <Icon
                      icon="lucide:arrow-right"
                      width="16"
                      class="transition-transform group-hover:translate-x-1"
                    />
                  </span>
                </UiButton>
              </div>
            </Motion>
          </template>
          <template v-else>
            <!-- Empty state placeholder — maintains the same min-height so
                 no layout shift when Contentful resolves with no data.
                 Hidden on lg+ where the aspect-[4/3] grid area is reserved. -->
            <div
              class="lg:col-span-12 flex items-center justify-center min-h-[450px] lg:min-h-[520px]"
            >
              <div class="text-center text-ink/50">
                <Icon icon="lucide:book-open" class="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p class="text-sm">{{ t('home.featured.emptyState', 'No stories yet') }}</p>
              </div>
            </div>
          </template>
        </div>
      </Container>
    </Section>

    <Hairline />
    <!-- Upcoming Events (renders only when CMS has at least one upcoming event).
         CLS guard: ALWAYS render the section to prevent layout shift — if no events,
         render an empty state placeholder instead of collapsing entirely. -->
    <Section class="bg-surface">
      <!-- min-h floor applied unconditionally so the section maintains a stable
           height regardless of Contentful data. Without this, the section collapses
           to fit loaded events content (or empties out, on empty CMS), causing the
           footer to shift. -->
      <Container class="min-h-[400px] lg:min-h-[440px]">
        <template v-if="upcomingEvents.length > 0">
          <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div class="max-w-2xl">
              <Eyebrow class="text-brand-violet mb-4 block">{{ t('home.events.eyebrow') }}</Eyebrow>
              <Heading :level="2">{{ t('home.events.heading') }}</Heading>
            </div>
            <UiButton variant="tertiary" :to="'/events'">
              <span class="flex items-center gap-1 group pb-1">
                {{ t('home.events.viewAll') }}
                <Icon
                  icon="lucide:arrow-right"
                  width="16"
                  class="transition-transform group-hover:translate-x-1"
                />
              </span>
            </UiButton>
          </div>

          <div class="grid lg:grid-cols-3 gap-6">
            <Motion
              v-for="(event, i) in upcomingEvents"
              :key="event.slug"
              :initial="{ opacity: 0, y: 15 }"
              :while-in-view="{ opacity: 1, y: 0 }"
              :viewport="{ once: true }"
              :transition="{ duration: 0.4, delay: i * 0.1 }"
            >
              <RouterLink :to="`/events/${event.slug}`" class="block h-full">
                <UiCard hoverable class="p-6 flex flex-col gap-6 h-full">
                  <div class="flex justify-between items-start">
                    <div class="bg-ink/5 rounded-lg px-4 py-3 text-center min-w-[70px]">
                      <div class="text-sm font-semibold text-ink/60 uppercase">
                        {{ eventDateParts(event.datetime).month }}
                      </div>
                      <div class="font-display font-semibold text-2xl text-ink">
                        {{ eventDateParts(event.datetime).day }}
                      </div>
                    </div>
                    <UiChip>{{ event.type }}</UiChip>
                  </div>
                  <div class="flex-1">
                    <h4 class="font-sans font-semibold text-lg leading-snug mb-3">
                      {{ event.title }}
                    </h4>
                    <div class="flex items-center gap-1.5 text-sm text-ink/60">
                      <Icon icon="lucide:map-pin" width="16" />
                      {{ event.location }}
                    </div>
                  </div>
                </UiCard>
              </RouterLink>
            </Motion>
          </div>
        </template>
        <template v-else>
          <!-- Empty state placeholder — maintains the same min-height so
               no layout shift when Contentful resolves with no data. -->
          <div class="flex items-center justify-center min-h-[400px] lg:min-h-[440px]">
            <div class="text-center text-ink/50">
              <Icon icon="lucide:calendar" class="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p class="text-sm">{{ t('home.events.emptyState', 'No upcoming events') }}</p>
            </div>
          </div>
        </template>
      </Container>
    </Section>
  </div>
</template>

<style scoped>
/* The actual Pan-African flag (Marcus Garvey/UNIA, 1920) — red, black,
   green — not the African Union's red/gold/green, which an earlier
   version of this mistakenly used instead. Three earlier approaches
   were tried and dropped:
   1. A banded gradient (each color as a horizontal third of the glyph
      height) cut straight through each letter's most identifying
      strokes on this serif display face, and black-on-violet lost
      definition instead of standing out — the word stopped reading as
      "Africa's" and started reading as an abstract color-block
      pattern.
   2. Cycling one color per individual letter kept every glyph legible
      but read as noisy/random rather than "the flag."
   3. Splitting the word into 3 letter groups stacked as 3 separate
      lines matched the flag's band structure but broke the word out
      of normal horizontal reading flow.
   This version keeps the word on one normal horizontal line and
   splits it into the same 3 contiguous letter groups, each a solid
   flag color, sitting inline left to right — legible per letter,
   reads as one word, and still visibly cycles through all three flag
   colors across the word.

   A desaturated variant (deep maroon/warm charcoal/muted forest) was
   tried and reverted — the actual flag's pure red/black/green is the
   point of this treatment. */
.flag-line-0 {
  color: #ce1126;
}
.flag-line-1 {
  color: #000000;
}
.flag-line-2 {
  color: #007a3d;
}

/* Idle cues for "Africa's" and "scientist-leaders", running whether or
   not the device can hover — touch visitors get no benefit from the
   :hover pop-swap above, so this is the only signal they get that these
   words do something.

   "Africa's": each flag-colored group does a little hop with a rotational
   wiggle on the way down, then rests. Staggered across the three groups,
   the hop travels left→right as a wave and then pauses before repeating,
   which reads far more alive than a constant sine bob. Transform-only, so
   the flag colors are untouched and it doesn't preview the pop-swap.

   "scientist-leaders": a light glances across the cyan letters — a narrow
   highlight band sweeping through the fill (animated background-position
   on a background-clipped gradient), parked off-screen between passes so
   it glints periodically rather than shimmering nonstop. Because it drives
   background-position, not opacity or transform, it can't collide with the
   pop-swap's fade/scale at all; a gentle float rides underneath for life.
   The whole thing drops to a solid cyan fill under reduced-motion and
   forced-colors (see those blocks below). */
@keyframes idle-hop {
  0%,
  48%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  16% {
    transform: translateY(-0.22em) rotate(-4deg);
  }
  30% {
    transform: translateY(0) rotate(2.5deg);
  }
  38% {
    transform: translateY(0) rotate(0deg);
  }
}

@keyframes idle-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-0.1em);
  }
}

/* Sweeps one full period of the (tiling) gradient. The fill tiles rather
   than clipping to a finite image, so the cyan always covers every glyph —
   a no-repeat image slid off the text box mid-sweep, leaving letters with
   no background and therefore an invisible transparent fill. Endpoints
   land with the highlight off the text, so the loop restarts seamlessly. */
@keyframes idle-sheen {
  from {
    transform: translateX(50%);
  }
  to {
    transform: translateX(-50%);
  }
}

.flag-line-0,
.flag-line-1,
.flag-line-2 {
  display: inline-block;
  transform-origin: bottom center;
  animation: idle-hop 2.8s ease-in-out infinite;
}
.flag-line-0 {
  animation-delay: 0ms;
}
.flag-line-1 {
  animation-delay: 150ms;
}
.flag-line-2 {
  animation-delay: 300ms;
}

.accent-text {
  /* Cyan fill delivered as a background-clipped gradient so the sheen has
     something to sweep through; `color` stays brand-sky (from the utility
     class) as the fallback and for currentColor. */
  position: relative;
  background-image: linear-gradient(
    100deg,
    var(--color-brand-sky) 0%,
    var(--color-brand-sky) 43%,
    #eafdff 50%,
    var(--color-brand-sky) 57%,
    var(--color-brand-sky) 100%
  );
  background-size: 200% 100%;
  /* background-repeat left at its default (repeat) on purpose: the tiling
     cyan guarantees full coverage so no glyph ever falls on an empty area
     and vanishes. Endpoints of both ends of the gradient are the same cyan,
     so the tiled seams are invisible. */
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  /* The 0.8s start delay is load-bearing for the hover-exit, not cosmetic:
     when the pointer leaves, the hover rule's `animation: none` is dropped
     and these restart from their delay phase. With fill-mode:none nothing
     is applied during that 0.8s, so the float's transform-return
     transition runs cleanly instead of snapping the word back over the
     still-exiting icons. */
  animation: idle-float 3s ease-in-out 0.8s infinite;
}

/* Sheen sweep via composited transform on a pseudo-element — avoids
   background-position animation which cannot be GPU-composited and
   contributes to CLS. The pseudo-element covers the text bounds and
   sweeps the highlight gradient across it via translateX. */
.accent-text::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: linear-gradient(
    100deg,
    transparent 0%,
    transparent 43%,
    #eafdff 50%,
    transparent 57%,
    transparent 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: idle-sheen 4.5s linear 0.8s infinite;
  pointer-events: none;
  z-index: -1;
}

@media (prefers-reduced-motion: reduce) {
  .flag-line-0,
  .flag-line-1,
  .flag-line-2,
  .accent-text,
  .accent-text::before {
    animation: none;
  }
  /* Drop the clipped gradient back to a plain cyan fill so a parked sheen
     highlight doesn't sit frozen mid-word. */
  .accent-text {
    background-image: none;
    -webkit-text-fill-color: currentColor;
  }
}

@media (forced-colors: active) {
  /* background-clip:text + transparent fill would render the phrase
     invisible in high-contrast mode — restore a system-colored solid
     fill and stop the sweep. */
  .accent-text,
  .accent-text::before {
    background-image: none;
    -webkit-text-fill-color: currentColor;
    animation: none;
  }
}

/* Baseline layout and positioning rules apply unconditionally across all
   input methods (touch and mouse/hover), ensuring elements remain correctly
   positioned and hidden by default on mobile touch screens. */
.lead-hover-group {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  outline: none;
  white-space: nowrap;
}

.lead-swap {
  position: relative;
  display: inline-flex;
  white-space: nowrap;
}

.lead-text {
  display: inline-flex;
  white-space: nowrap;
  transition:
    transform 220ms ease-in,
    opacity 220ms ease-in;
}

.africa-pop-in {
  position: absolute;
  left: 50%;
  bottom: 0.05em;
  width: 1.3em;
  height: 1.3em;
  transform: translate(-50%, 0) scale(0.4);
  background: linear-gradient(
    to bottom,
    #ce1126 0%,
    #ce1126 33.33%,
    #000000 33.33%,
    #000000 66.66%,
    #007a3d 66.66%,
    #007a3d 100%
  );
  -webkit-mask-image: url('/images/africa-mask.svg');
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-image: url('/images/africa-mask.svg');
  mask-position: center;
  mask-size: contain;
  mask-repeat: no-repeat;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 250ms ease-out,
    transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
  transition-delay: 0ms;
}

.accent-hover-group {
  position: relative;
  display: inline-flex;
  outline: none;
  max-width: 100%;
}

.accent-text {
  display: inline-flex;
  transition:
    transform 240ms ease-out 150ms,
    opacity 240ms ease-out 150ms;
}

.science-pop-in {
  position: absolute;
  left: 50%;
  bottom: 0.05em;
  display: flex;
  align-items: flex-end;
  gap: 0.5em;
  transform: translateX(-50%);
  pointer-events: none;
}

.science-icon {
  width: 1.15em;
  height: 1.15em;
  opacity: 0;
  transform: scale(0.3);
  transition:
    opacity 150ms ease-in,
    transform 190ms ease-in;
}

/* Hover/focus animations are gated to devices with real hover (mouse/trackpad). */
@media (hover: hover) and (pointer: fine) {
  .lead-hover-group:hover .lead-text,
  .lead-hover-group:focus-visible .lead-text {
    transform: scale(1.15);
    opacity: 0;
  }

  .lead-hover-group:hover .flag-line-0,
  .lead-hover-group:hover .flag-line-1,
  .lead-hover-group:hover .flag-line-2,
  .lead-hover-group:focus-visible .flag-line-0,
  .lead-hover-group:focus-visible .flag-line-1,
  .lead-hover-group:focus-visible .flag-line-2 {
    /* Drop (not pause) the idle bob so the trailing "'s", which stays
     visible during the swap, snaps back to the baseline instead of
     freezing mid-bob. */
    animation: none;
  }

  .lead-hover-group:hover .africa-pop-in,
  .lead-hover-group:focus-visible .africa-pop-in {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
    transition-delay: 100ms;
  }

  @media (prefers-reduced-motion: reduce) {
    .lead-text {
      transition: opacity 150ms ease-in;
    }
    .lead-hover-group:hover .lead-text,
    .lead-hover-group:focus-visible .lead-text {
      transform: none;
    }
    .africa-pop-in {
      transition: opacity 150ms ease-out;
      transition-delay: 0ms;
    }
    .lead-hover-group:hover .africa-pop-in,
    .lead-hover-group:focus-visible .africa-pop-in {
      transform: translate(-50%, 0) scale(1);
      transition-delay: 0ms;
    }
  }

  @media (forced-colors: active) {
    .flag-line-0,
    .flag-line-1,
    .flag-line-2 {
      color: CanvasText;
      forced-color-adjust: none;
    }
    .africa-pop-in {
      display: none;
    }
    .lead-hover-group:hover .lead-text,
    .lead-hover-group:focus-visible .lead-text {
      transform: none;
      opacity: 1;
    }
  }

  .accent-hover-group:hover .accent-text,
  .accent-hover-group:focus-visible .accent-text {
    transform: scale(1.15);
    opacity: 0;
    transition:
      transform 200ms ease-in,
      opacity 200ms ease-in;
    animation: none;
  }

  .accent-hover-group:hover .science-icon,
  .accent-hover-group:focus-visible .science-icon {
    opacity: 1;
    transform: scale(1);
    transition:
      opacity 250ms ease-out,
      transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* Enter-only stagger: arrives left to right. */
  .accent-hover-group:hover .science-icon:nth-child(1),
  .accent-hover-group:focus-visible .science-icon:nth-child(1) {
    transition-delay: 60ms;
  }
  .accent-hover-group:hover .science-icon:nth-child(2),
  .accent-hover-group:focus-visible .science-icon:nth-child(2) {
    transition-delay: 140ms;
  }
  .accent-hover-group:hover .science-icon:nth-child(3),
  .accent-hover-group:focus-visible .science-icon:nth-child(3) {
    transition-delay: 220ms;
  }

  @media (prefers-reduced-motion: reduce) {
    .accent-text,
    .accent-text::before {
      transition: opacity 150ms ease-in;
      animation: none;
    }
    .accent-hover-group:hover .accent-text,
    .accent-hover-group:focus-visible .accent-text {
      transform: none;
    }
    .science-icon {
      transition: opacity 150ms ease-out;
      transition-delay: 0ms !important;
    }
    .accent-hover-group:hover .science-icon,
    .accent-hover-group:focus-visible .science-icon {
      transform: none;
    }
  }

  @media (forced-colors: active) {
    .science-icon {
      display: none;
    }
    .accent-text,
    .accent-text::before {
      background-image: none;
      -webkit-text-fill-color: currentColor;
      animation: none;
    }
    .accent-hover-group:hover .accent-text,
    .accent-hover-group:focus-visible .accent-text {
      transform: none;
      opacity: 1;
    }
  }
} /* @media (hover: hover) and (pointer: fine) */
</style>
