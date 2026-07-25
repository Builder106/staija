<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { Motion } from 'motion-v'
import { Icon } from '@iconify/vue'
import Container from '../components/ui/Container.vue'
import Section from '../components/ui/Section.vue'
import Heading from '../components/ui/Heading.vue'
import Body from '../components/ui/Body.vue'
import Eyebrow from '../components/ui/Eyebrow.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiCard from '../components/ui/UiCard.vue'
import UiChip from '../components/ui/UiChip.vue'
import { getEvents, type EventItem } from '../services/content'

const tab = ref<'upcoming' | 'past'>('upcoming')
const loading = ref(true)
const error = ref<string | null>(null)
const displayed = ref<EventItem[]>([])
const showEmpty = computed(() => !loading.value && displayed.value.length === 0)

async function load() {
  loading.value = true
  error.value = null
  try {
    displayed.value = await getEvents({ upcoming: tab.value === 'upcoming' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load events'
    displayed.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(tab, load)

function formatDate(iso: string) {
  const d = new Date(iso)
  return {
    month: d.toLocaleString('en-US', { month: 'short' }),
    day: d.getDate(),
  }
}
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pb-8 !pt-16 md:!pt-24 text-center">
      <Container class="max-w-2xl">
        <Eyebrow class="text-brand-violet mb-4 block text-[25px]">Community</Eyebrow>
        <Heading :level="1" class="mb-6">Gather with <span class="text-brand-violet">us</span>.</Heading>
        <Body large class="mb-12">
          From virtual demo days to in-person symposiums, our events bring together the
          brightest young minds and the mentors who support them.
        </Body>

        <div class="flex justify-center gap-2 bg-surface p-1.5 rounded-full border hairline-ink shadow-sm w-fit mx-auto">
          <button
            type="button"
            class="px-6 py-2.5 rounded-full text-sm font-semibold transition-all focus-ring-brand"
            :class="tab === 'upcoming' ? 'bg-brand-violet text-white shadow-md' : 'text-ink/60 hover:text-ink hover:bg-ink/5'"
            @click="tab = 'upcoming'"
          >
            Upcoming Events
          </button>
          <button
            type="button"
            class="px-6 py-2.5 rounded-full text-sm font-semibold transition-all focus-ring-brand"
            :class="tab === 'past' ? 'bg-brand-violet text-white shadow-md' : 'text-ink/60 hover:text-ink hover:bg-ink/5'"
            @click="tab = 'past'"
          >
            Past Events
          </button>
        </div>
      </Container>
    </Section>

    <Section class="!pt-8 !pb-24 flex-1 bg-surface border-t hairline-ink">
      <Container class="max-w-4xl">
        <Motion
          :key="String(tab) + (loading ? 'loading' : 'content')"
          :initial="{ opacity: 0, y: 10 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.2 }"
          class="flex flex-col gap-4"
        >
          <template v-if="loading">
            <UiCard
              v-for="i in 3"
              :key="i"
              class="flex flex-col md:flex-row gap-6 p-6 md:p-8 animate-pulse !border-ink/5 bg-surface"
            >
              <div class="bg-ink/5 w-20 h-24 rounded-lg shrink-0" />
              <div class="flex flex-col justify-center flex-1 gap-3 w-full">
                <div class="w-16 h-5 bg-ink/5 rounded-full" />
                <div class="w-3/4 h-7 bg-ink/5 rounded-md" />
                <div class="w-1/2 h-4 bg-ink/5 rounded-md" />
              </div>
              <div class="md:ml-auto flex items-center md:justify-end">
                <div class="w-24 h-10 bg-ink/5 rounded-xl" />
              </div>
            </UiCard>
          </template>

          <template v-else-if="showEmpty">
            <div class="py-24 text-center flex flex-col items-center justify-center max-w-lg mx-auto">
              <div class="w-32 h-32 bg-ink/5 rounded-full flex items-center justify-center mb-6 text-ink/20 relative">
                <div class="absolute inset-0 wash-violet-6 mix-blend-multiply rounded-full" />
                <Icon icon="lucide:calendar" width="48" />
              </div>
              <Heading :level="3" class="mb-2">No {{ tab === 'upcoming' ? 'upcoming' : 'past' }} events.</Heading>
              <Body class="mb-8">
                <template v-if="tab === 'upcoming'">
                  We're currently planning our next season of programs and workshops.
                </template>
                <template v-else>
                  We just launched! Our past events will appear here soon.
                </template>
              </Body>
              <UiButton variant="secondary" to="/stay-connected">
                Subscribe to our newsletter
              </UiButton>
            </div>
          </template>

          <template v-else>
            <div v-if="error" role="alert" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {{ error }}
            </div>
            <Motion
              v-for="(event, i) in displayed"
              :key="event.slug"
              :initial="{ opacity: 0, x: -10 }"
              :animate="{ opacity: 1, x: 0 }"
              :transition="{ delay: i * 0.1 }"
            >
              <RouterLink :to="`/events/${event.slug}`" class="group block focus-ring-brand rounded-2xl">
                <UiCard class="flex flex-col md:flex-row items-start md:items-center gap-6 p-6 md:p-8 hover:shadow-md transition-shadow bg-surface">
                  <div class="bg-ink/5 rounded-xl px-5 py-4 text-center min-w-[80px] shrink-0 border hairline-ink group-hover:bg-brand-violet/5 group-hover:!border-brand-violet/20 transition-colors">
                    <div class="text-sm font-semibold text-ink/60 uppercase tracking-widest group-hover:text-brand-violet transition-colors">
                      {{ formatDate(event.datetime).month }}
                    </div>
                    <div class="font-display font-bold text-3xl text-ink">{{ formatDate(event.datetime).day }}</div>
                  </div>

                  <div class="flex flex-col gap-2.5 flex-1">
                    <div class="flex items-center gap-3 mb-1">
                      <UiChip class="group-hover:bg-gradient-brand group-hover:!text-white group-hover:!border-transparent transition-all">{{ event.type }}</UiChip>
                      <span v-if="event.isVirtual" class="text-xs font-semibold text-ink/50 uppercase tracking-wider flex items-center gap-1">
                        <Icon icon="lucide:video" width="14" /> Virtual
                      </span>
                    </div>
                    <Heading :level="3" class="!text-2xl group-hover:text-brand-violet transition-colors">
                      {{ event.title }}
                    </Heading>
                    <div class="flex items-center gap-2 text-sm text-ink/70 font-medium">
                      <Icon icon="lucide:map-pin" width="16" class="text-ink/40" /> {{ event.location }}
                    </div>
                  </div>

                  <div class="mt-4 md:mt-0 md:ml-auto w-full md:w-auto flex items-center justify-end">
                    <UiButton
                      :variant="tab === 'upcoming' ? 'primary' : 'secondary'"
                      :to="`/events/${event.slug}`"
                      class="w-full md:w-auto !px-6"
                    >
                      {{ tab === 'upcoming' ? 'RSVP Now' : 'View Recap' }}
                    </UiButton>
                  </div>
                </UiCard>
              </RouterLink>
            </Motion>
          </template>
        </Motion>
      </Container>
    </Section>
  </div>
</template>
