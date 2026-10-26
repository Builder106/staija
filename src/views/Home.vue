<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Motion } from 'motion-v';
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';

const HeroLottie = defineAsyncComponent(() => import('../components/HeroLottie.vue'));

const showHeroLottie = ref(false);

onMounted(() => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      showHeroLottie.value = true;
    });
  } else {
    // Fallback for browsers without requestIdleCallback (e.g., Safari)
    setTimeout(() => {
      showHeroLottie.value = true;
    }, 0);
  }
});

import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiCard from '../components/ui/UiCard.vue';
import UiChip from '../components/ui/UiChip.vue';
import { trackApplyClick } from '../services/analytics';
import { getBlogPosts, getEvents, type BlogPost, type EventItem } from '../services/content';

const { t, locale } = useI18n();

// Split the lead word into 3 contiguous letter groups so the hover swap
// can replace "Africa" with the map while the possessive "'s" stays put.
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
// label + caption flow through i18n. Recomputed on locale change.
const stats = computed(() => [
  {
    label: t('home.stats.studentsReached'),
    number: 100,
    caption: t('home.stats.studentsReachedCaption'),
  },
  {
    label: t('home.stats.talkAttendees'),
    number: 200,
    caption: t('home.stats.talkAttendeesCaption'),
  },
]);

// Featured story + upcoming events read from Contentful via the content
// service. Sections render only when real entries exist — no fallback to
// fabricated "Chinedu Okafor" / "StepUp 2025 info session" stubs that
// shipped fake credibility before the CMS was populated.
const featuredStory = ref<BlogPost | null>(null);
const upcomingEvents = ref<EventItem[]>([]);

// Pass the active locale to Intl so dates localize alongside the rest
// of the page. Browsers unfamiliar with a given BCP47 code (e.g. 'yo')
// fall back to the user's system default, which is acceptable for
// short month/day strings.
const featuredDate = computed(() => {
  if (!featuredStory.value) return '';
  const d = new Date(featuredStory.value.publishedAt);
  return d.toLocaleDateString(locale.value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
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
      <Container>
        <div class="grid lg:grid-cols-2 gap-8 lg:gap-8 items-center relative">
          <!-- Hero text wrapper — LCP element. Keep completely static at
               first paint (no Motion, no animation) so the <h1> paints
               immediately. The Lottie on the right carries the "alive"
               entrance via its own opacity fade. -->
          <div class="flex flex-col gap-6 sm:gap-8 max-w-xl">
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
                        <span v-for="i in [0, 1]" :key="i">{{ headlineLeadLines[i] }}</span>
                      </span>
                      <span class="africa-pop-in" aria-hidden="true" />
                    </span>
                    <span>{{ headlineLeadLines[2] }}</span>
                    <span class="flag-rule" aria-hidden="true" />
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
              class="text-sm text-white/70 hover:text-white transition-colors w-fit"
            >
              Not eligible yet, or between cycles? Stay connected
              <Icon icon="lucide:arrow-right" width="14" class="inline align-[-2px] ml-0.5" />
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

    <!-- Impact Strip -->
    <Section class="!py-12 bg-paper/50 border-b hairline-ink">
      <Container>
        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-8 md:gap-12 max-w-3xl">
          <div v-for="stat in stats" :key="stat.label" class="flex flex-col gap-1">
            <dt class="text-base font-semibold text-ink">{{ stat.label }}</dt>
            <dd
              class="order-first font-display text-4xl md:text-5xl font-semibold tracking-tight text-brand-violet"
            >
              {{ stat.number.toLocaleString(locale) }}
            </dd>
            <dd class="text-sm text-ink/70">{{ stat.caption }}</dd>
          </div>
        </dl>
      </Container>
    </Section>

    <!-- Programs Split -->
    <Section
      id="programs"
      class="bg-surface min-h-[480px] sm:min-h-[480px] md:min-h-[420px] lg:min-h-[380px]"
    >
      <Container>
        <div class="flex flex-col gap-12">
          <div class="max-w-2xl">
            <Heading :level="2">{{ t('home.programs.heading') }}</Heading>
          </div>

          <div class="grid md:grid-cols-2 gap-6 lg:gap-8">
            <div>
              <UiCard hoverable class="h-full flex flex-col">
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
            </div>

            <div>
              <UiCard hoverable class="h-full flex flex-col">
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
            </div>
          </div>
        </div>
      </Container>
    </Section>

    <!-- Featured Story and Upcoming Events render only when the CMS has
         entries. Both sit below the fold, so mounting them after the
         Contentful round-trip moves only off-screen content; an empty
         placeholder would leave a blank band on the live page instead. -->
    <Section v-if="featuredStory" class="bg-paper">
      <Container>
        <div class="grid lg:grid-cols-12 gap-8 lg:gap-16 items-center">
          <div class="lg:col-span-7 aspect-[4/3] rounded-2xl overflow-hidden relative bg-ink/5">
            <div
              class="absolute inset-0 wash-violet-6 mix-blend-multiply z-10 pointer-events-none"
            />
            <!-- width/height pin the intrinsic aspect ratio so the browser
                 reserves the box before the bytes arrive. -->
            <img
              v-if="featuredStory.hero"
              :src="featuredStory.hero"
              :alt="featuredStory.title"
              width="800"
              height="600"
              class="w-full h-full object-cover"
              decoding="async"
            />
            <div v-else class="absolute inset-0 bg-gradient-hero" aria-hidden="true" />
          </div>
          <div class="lg:col-span-5 flex flex-col gap-6">
            <p class="text-sm text-ink/60">{{ t('home.featured.eyebrow') }}, {{ featuredDate }}</p>
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
          </div>
        </div>
      </Container>
    </Section>

    <Section v-if="upcomingEvents.length > 0" class="bg-surface border-t hairline-ink">
      <Container>
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div class="max-w-2xl">
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
          <RouterLink
            v-for="event in upcomingEvents"
            :key="event.slug"
            :to="`/events/${event.slug}`"
            class="block h-full"
          >
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
        </div>
      </Container>
    </Section>
  </div>
</template>

<style scoped>
/* "Africa's" stays white so it reads against the violet hero. The
   Pan-African flag (Marcus Garvey/UNIA, 1920: red, black, green) runs as
   a three-band rule under the word instead of coloring the letters,
   where the black third disappeared into the violet. */
.flag-rule {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.06em;
  height: 0.07em;
  background: linear-gradient(
    to right,
    #ce1126 0 33.33%,
    #000000 33.33% 66.66%,
    #007a3d 66.66% 100%
  );
  pointer-events: none;
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
    .accent-text {
      transition: opacity 150ms ease-in;
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
    .accent-hover-group:hover .accent-text,
    .accent-hover-group:focus-visible .accent-text {
      transform: none;
      opacity: 1;
    }
  }
} /* @media (hover: hover) and (pointer: fine) */
</style>
