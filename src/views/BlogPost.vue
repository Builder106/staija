<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Motion } from 'motion-v';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import RichText from '../components/learn/RichText.vue';
import Parallax from '../components/motion/Parallax.vue';
import ScrollProgress from '../components/motion/ScrollProgress.vue';
import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Eyebrow from '../components/ui/Eyebrow.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiButton from '../components/ui/UiButton.vue';
import { donationsEnabled } from '../config/features';
import { getBlogPost, type BlogPost } from '../services/content';

const route = useRoute();
const post = ref<BlogPost | null>(null);
const loading = ref(true);
const notFound = ref(false);

const eyebrow = computed(() => {
  if (!post.value) return '';
  const d = new Date(post.value.publishedAt);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const programLabel =
    post.value.program === 'stepup'
      ? 'StepUp'
      : post.value.program === 'dynamerge'
        ? 'Dynamerge'
        : '';
  const topicLabel = post.value.topic.charAt(0).toUpperCase() + post.value.topic.slice(1);
  return [programLabel, topicLabel, date].filter(Boolean).join(' | ');
});

async function load() {
  const slug = route.params.slug as string;
  loading.value = true;
  notFound.value = false;
  try {
    const result = await getBlogPost(slug);
    if (!result) {
      notFound.value = true;
      post.value = null;
    } else {
      post.value = result;
    }
  } finally {
    loading.value = false;
  }
}

watch(() => route.params.slug, load);
onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <ScrollProgress />
    <Section v-if="loading && !post" class="!pt-8 !pb-16">
      <Container class="max-w-3xl flex flex-col gap-6">
        <div class="h-3 w-40 bg-ink/5 rounded animate-pulse" />
        <div class="h-12 w-3/4 bg-ink/5 rounded animate-pulse" />
        <div class="h-6 w-full bg-ink/5 rounded animate-pulse" />
        <div class="h-6 w-5/6 bg-ink/5 rounded animate-pulse" />
        <div class="aspect-[21/9] bg-ink/5 rounded-2xl animate-pulse mt-8" />
      </Container>
    </Section>

    <Section v-else-if="notFound" class="!pt-24 !pb-24 text-center">
      <Container class="max-w-xl flex flex-col items-center gap-6">
        <Heading :level="2">Story not found.</Heading>
        <Body>That story doesn't exist or hasn't been published yet.</Body>
        <UiButton variant="primary" :to="'/blog'">Back to stories</UiButton>
      </Container>
    </Section>

    <template v-else-if="post">
      <Section class="!pt-8 !pb-16 border-b hairline-ink">
        <Container class="max-w-3xl">
          <RouterLink
            to="/blog"
            class="inline-flex items-center gap-2 text-sm font-semibold text-ink/60 hover:text-brand-violet transition-colors mb-10 focus-ring-brand rounded-sm"
          >
            <Icon icon="lucide:arrow-left" width="16" /> Back to stories
          </RouterLink>

          <Motion
            :initial="{ opacity: 0, y: 10 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.4 }"
          >
            <Eyebrow class="text-brand-violet mb-6 block">{{ eyebrow }}</Eyebrow>
            <Heading :level="1" class="mb-6 leading-tight">{{ post.title }}</Heading>
            <Body large class="text-ink/70 mb-10 leading-relaxed !text-xl">{{ post.dek }}</Body>

            <div class="flex items-center gap-4 pt-6 border-t hairline-ink">
              <div
                class="w-12 h-12 rounded-full overflow-hidden bg-ink/10 shrink-0 flex items-center justify-center"
              >
                <Icon icon="lucide:user" width="20" class="text-ink/40" />
              </div>
              <div class="flex flex-col">
                <span class="font-semibold text-ink leading-tight">{{ post.author }}</span>
              </div>
              <div
                v-if="post.readingTime"
                class="ml-auto flex items-center gap-1.5 text-sm font-medium text-ink/50 bg-ink/5 px-3 py-1.5 rounded-full"
              >
                <Icon icon="lucide:clock" width="14" /> {{ post.readingTime }}
              </div>
            </div>
          </Motion>
        </Container>
      </Section>

      <Section v-if="post.hero" class="!py-0 relative -mt-6 z-10">
        <Container class="max-w-4xl">
          <Motion
            class="aspect-video md:aspect-[21/9] rounded-2xl overflow-hidden shadow-xl border hairline-ink relative"
            :initial="{ opacity: 0, scale: 0.98 }"
            :animate="{ opacity: 1, scale: 1 }"
            :transition="{ duration: 0.5, delay: 0.2 }"
          >
            <div
              class="absolute inset-0 wash-violet-6 mix-blend-multiply z-10 pointer-events-none"
            />
            <Parallax :speed="-0.2" :distance="100" class="absolute inset-0">
              <img
                :src="post.hero"
                :alt="post.title"
                width="1280"
                height="720"
                class="w-full h-full object-cover scale-110"
              />
            </Parallax>
          </Motion>
        </Container>
      </Section>

      <Section class="!pt-16 !pb-24 bg-surface">
        <Container class="max-w-3xl">
          <div class="flex flex-col md:flex-row gap-12 relative">
            <!-- Social Share Sidebar -->
            <div
              class="md:w-16 shrink-0 md:sticky md:top-32 h-fit flex md:flex-col gap-4 items-center"
            >
              <span
                class="text-xs uppercase tracking-wider font-semibold text-ink/40 md:-rotate-90 md:mb-6 md:whitespace-nowrap"
                >Share</span
              >
              <button
                type="button"
                class="w-10 h-10 rounded-full border hairline-ink flex items-center justify-center text-ink/60 hover:text-brand-violet hover:border-brand-violet transition-colors"
              >
                <Icon icon="lucide:twitter" width="18" />
              </button>
              <button
                type="button"
                class="w-10 h-10 rounded-full border hairline-ink flex items-center justify-center text-ink/60 hover:text-[#0A66C2] hover:border-[#0A66C2] transition-colors"
              >
                <Icon icon="lucide:linkedin" width="18" />
              </button>
              <button
                type="button"
                class="w-10 h-10 rounded-full border hairline-ink flex items-center justify-center text-ink/60 hover:text-[#1877F2] hover:border-[#1877F2] transition-colors"
              >
                <Icon icon="lucide:facebook" width="18" />
              </button>
            </div>

            <article class="flex flex-col max-w-none w-full text-ink/80 leading-relaxed">
              <RichText :body="post.body" />
            </article>
          </div>

          <div v-if="donationsEnabled" class="mt-16 pt-12 border-t hairline-ink text-center">
            <Heading :level="3" class="mb-4">Inspired by this story?</Heading>
            <Body class="mb-8"
              >Your support makes these experiences possible for more students across Africa.</Body
            >
            <UiButton variant="primary" :to="'/donate'">Donate to STAIJA</UiButton>
          </div>
        </Container>
      </Section>
    </template>
  </div>
</template>
