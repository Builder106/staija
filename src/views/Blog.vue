<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Motion } from 'motion-v';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Eyebrow from '../components/ui/Eyebrow.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiCard from '../components/ui/UiCard.vue';
import { donationsEnabled } from '../config/features';
import { getBlogPosts, type BlogPost, type BlogProgram, type BlogTopic } from '../services/content';

type FilterChip = { label: string; program?: BlogProgram | 'all'; topic?: BlogTopic | 'all' };
const filters: FilterChip[] = [
  { label: 'All', program: 'all', topic: 'all' },
  { label: 'StepUp', program: 'stepup' },
  { label: 'Dynamerge', program: 'dynamerge' },
  { label: 'Research', topic: 'research' },
  { label: 'Stories', topic: 'stories' },
  { label: 'News', topic: 'news' },
];

const activeFilter = ref<FilterChip>(filters[0]);
const search = ref('');
const page = ref(1);
const PAGE_SIZE = 9;

const items = ref<BlogPost[]>([]);
const total = ref(0);
const loading = ref(true);
const error = ref<string | null>(null);

const featured = computed<BlogPost | null>(() => items.value[0] ?? null);
const gridPosts = computed<BlogPost[]>(() => items.value.slice(1));
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

function eyebrowFor(p: BlogPost): string {
  const d = new Date(p.publishedAt);
  const month = d.toLocaleString('en-US', { month: 'short' });
  const day = d.getDate();
  const programLabel =
    p.program === 'stepup' ? 'StepUp' : p.program === 'dynamerge' ? 'Dynamerge' : '';
  const topicLabel = p.topic.charAt(0).toUpperCase() + p.topic.slice(1);
  return [programLabel, topicLabel, `${month} ${day}`].filter(Boolean).join(' | ');
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await getBlogPosts({
      program: activeFilter.value.program,
      topic: activeFilter.value.topic,
      search: search.value.trim() || undefined,
      limit: PAGE_SIZE + 1, // +1 for the featured slot
      skip: (page.value - 1) * PAGE_SIZE,
    });
    items.value = res.items;
    total.value = res.total;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load stories';
  } finally {
    loading.value = false;
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    load();
  }, 250);
});
watch(activeFilter, () => {
  page.value = 1;
  load();
});
watch(page, load);
onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pb-8 !pt-12 md:!pt-16">
      <Container>
        <Heading :level="1" class="mb-12"
          >Stories from <span class="text-brand-violet">the lab</span>.</Heading
        >

        <div v-if="loading && !featured" class="aspect-[5/2] rounded-2xl bg-ink/5 animate-pulse" />

        <Motion
          v-else-if="featured"
          :initial="{ opacity: 0, y: 10 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.4 }"
        >
          <RouterLink
            :to="`/blog/${featured.slug}`"
            class="group block focus-ring-brand rounded-2xl"
          >
            <UiCard
              class="grid md:grid-cols-2 lg:grid-cols-5 gap-0 overflow-hidden relative transition-all duration-300 hover:shadow-lg hover:shadow-ink/5"
            >
              <div
                class="lg:col-span-3 aspect-[4/3] md:aspect-auto h-full w-full relative overflow-hidden"
              >
                <div
                  class="absolute inset-0 bg-ink/10 group-hover:bg-transparent transition-colors z-10"
                />
                <img
                  :src="featured.hero"
                  :alt="featured.title"
                  class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div class="lg:col-span-2 p-8 md:p-12 flex flex-col justify-center bg-surface h-full">
                <Eyebrow class="text-brand-violet mb-4">{{ eyebrowFor(featured) }}</Eyebrow>
                <Heading
                  :level="2"
                  class="!text-3xl md:!text-4xl mb-4 group-hover:text-brand-violet transition-colors"
                >
                  {{ featured.title }}
                </Heading>
                <Body large class="mb-8">{{ featured.dek }}</Body>
                <div class="mt-auto pt-6 border-t hairline-ink flex items-center justify-between">
                  <span class="text-sm font-semibold text-ink/70">By {{ featured.author }}</span>
                  <Icon
                    icon="lucide:arrow-right"
                    width="20"
                    class="text-brand-violet transition-transform group-hover:translate-x-1"
                  />
                </div>
              </div>
            </UiCard>
          </RouterLink>
        </Motion>
      </Container>
    </Section>

    <Section
      class="!py-8 sticky top-[80px] z-40 bg-paper/80 backdrop-blur-md border-y hairline-ink"
    >
      <Container>
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="flex overflow-x-auto pb-2 md:pb-0 gap-2 -mx-6 px-6 md:mx-0 md:px-0">
            <button
              v-for="f in filters"
              :key="f.label"
              type="button"
              class="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold font-sans border transition-colors whitespace-nowrap"
              :class="
                activeFilter.label === f.label
                  ? 'bg-gradient-brand text-white border-transparent shadow-sm'
                  : 'bg-surface text-ink border-ink/10 hover:border-ink/20'
              "
              @click="activeFilter = f"
            >
              {{ f.label }}
            </button>
          </div>
          <div class="relative shrink-0 md:w-64">
            <Icon
              icon="lucide:search"
              width="18"
              class="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 pointer-events-none"
            />
            <input
              v-model="search"
              type="text"
              placeholder="Search stories..."
              class="w-full pl-10 pr-4 py-2 bg-surface border hairline-ink rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet transition-all"
            />
          </div>
        </div>
      </Container>
    </Section>

    <Section class="!pt-12 !pb-24 bg-surface">
      <Container>
        <div
          v-if="error"
          role="alert"
          class="mb-8 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
        >
          {{ error }}
        </div>

        <div
          v-if="loading && gridPosts.length === 0"
          class="grid md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12"
        >
          <div v-for="i in 6" :key="i" class="flex flex-col gap-4">
            <div class="aspect-[16/10] rounded-xl bg-ink/5 animate-pulse" />
            <div class="h-3 w-32 bg-ink/5 rounded animate-pulse" />
            <div class="h-6 w-3/4 bg-ink/5 rounded animate-pulse" />
            <div class="h-4 w-full bg-ink/5 rounded animate-pulse" />
          </div>
        </div>

        <div v-else-if="gridPosts.length === 0 && !loading" class="py-24 text-center text-ink/60">
          <Heading :level="3" class="mb-2">No stories match.</Heading>
          <Body>Try a different filter or clear the search.</Body>
        </div>

        <div v-else class="grid md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
          <Motion
            v-for="(post, i) in gridPosts"
            :key="post.slug"
            :initial="{ opacity: 0, y: 20 }"
            :while-in-view="{ opacity: 1, y: 0 }"
            :viewport="{ once: true, margin: '-50px' }"
            :transition="{ duration: 0.4, delay: (i % 3) * 0.1 }"
          >
            <RouterLink
              :to="`/blog/${post.slug}`"
              class="group flex flex-col h-full focus-ring-brand rounded-2xl p-2 -m-2"
            >
              <div
                class="aspect-[16/10] rounded-xl overflow-hidden mb-6 relative border hairline-ink"
              >
                <div
                  class="absolute inset-0 bg-ink/5 group-hover:bg-transparent transition-colors z-10 pointer-events-none"
                />
                <img
                  :src="post.hero"
                  :alt="post.title"
                  class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <div class="flex flex-col flex-1 gap-3">
                <Eyebrow class="text-ink/50">{{ eyebrowFor(post) }}</Eyebrow>
                <Heading
                  :level="3"
                  class="!text-2xl group-hover:text-brand-violet transition-colors line-clamp-2"
                >
                  {{ post.title }}
                </Heading>
                <Body class="text-ink/70 line-clamp-2 mb-4">{{ post.dek }}</Body>
                <div class="mt-auto pt-4 border-t hairline-ink text-sm font-semibold text-ink/60">
                  By {{ post.author }}
                </div>
              </div>
            </RouterLink>
          </Motion>
        </div>

        <div v-if="totalPages > 1" class="mt-16 flex items-center justify-center gap-2">
          <UiButton
            variant="secondary"
            class="!w-10 !h-10 !p-0 !rounded-full"
            :disabled="page === 1"
            @click="page = Math.max(1, page - 1)"
          >
            <Icon icon="lucide:chevron-left" width="18" />
          </UiButton>
          <span class="text-sm font-semibold mx-4 text-ink/60"
            >Page {{ page }} of {{ totalPages }}</span
          >
          <UiButton
            variant="secondary"
            class="!w-10 !h-10 !p-0 !rounded-full"
            :disabled="page === totalPages"
            @click="page = Math.min(totalPages, page + 1)"
          >
            <Icon icon="lucide:chevron-right" width="18" />
          </UiButton>
        </div>
      </Container>
    </Section>

    <!-- Donate Prompt (hidden until compliance is complete) -->
    <Section v-if="donationsEnabled" class="bg-paper border-t hairline-ink text-center">
      <Container class="max-w-2xl flex flex-col items-center">
        <Heading :level="2" class="mb-4">Power more stories.</Heading>
        <Body large class="mb-8 text-ink/70">
          Every breakthrough starts with an opportunity. Your donation funds stipends, materials,
          and travel for our scholars.
        </Body>
        <UiButton variant="primary" :to="'/donate'" class="!px-8 text-base">
          Donate to STAIJA
        </UiButton>
      </Container>
    </Section>
  </div>
</template>
