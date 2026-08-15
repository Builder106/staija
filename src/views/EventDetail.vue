<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Motion } from 'motion-v';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiCard from '../components/ui/UiCard.vue';
import UiChip from '../components/ui/UiChip.vue';
import UiSelect from '../components/ui/UiSelect.vue';
import { trackEventRsvp } from '../services/analytics';
import { getEvent, type EventItem } from '../services/content';

const route = useRoute();
const event = ref<EventItem | null>(null);
const loading = ref(true);
const notFound = ref(false);

const formattedDate = computed(() => {
  if (!event.value) return '';
  return new Date(event.value.datetime).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
});

const formattedTime = computed(() => {
  if (!event.value) return '';
  return new Date(event.value.datetime).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: event.value.timezone,
  });
});

async function load() {
  const slug = route.params.slug as string;
  loading.value = true;
  notFound.value = false;
  try {
    const result = await getEvent(slug);
    if (!result) {
      notFound.value = true;
      event.value = null;
    } else {
      event.value = result;
    }
  } finally {
    loading.value = false;
  }
}

watch(() => route.params.slug, load);
onMounted(load);

const rsvpState = ref<'idle' | 'loading' | 'success'>('idle');
// Local model for the prospective-student UiSelect on the RSVP form.
const rsvpProspect = ref('');

function handleRSVP(e: Event) {
  e.preventDefault();
  rsvpState.value = 'loading';
  if (event.value) {
    trackEventRsvp({ event_slug: event.value.slug, is_virtual: event.value.isVirtual });
  }
  setTimeout(() => {
    rsvpState.value = 'success';
  }, 800);
}
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen pb-24">
    <Section v-if="loading && !event" class="!pt-12">
      <Container>
        <div class="aspect-[3/1] bg-ink/5 rounded-3xl animate-pulse mb-8" />
        <div class="max-w-3xl flex flex-col gap-4">
          <div class="h-6 w-24 bg-ink/5 rounded animate-pulse" />
          <div class="h-12 w-3/4 bg-ink/5 rounded animate-pulse" />
          <div class="h-6 w-full bg-ink/5 rounded animate-pulse" />
        </div>
      </Container>
    </Section>

    <Section v-else-if="notFound" class="!pt-24 !pb-24 text-center">
      <Container class="max-w-xl flex flex-col items-center gap-6">
        <Heading :level="2">Event not found.</Heading>
        <Body>That event doesn't exist or hasn't been published yet.</Body>
        <UiButton variant="primary" :to="'/events'">Back to events</UiButton>
      </Container>
    </Section>

    <template v-else-if="event">
      <Section class="!pt-8 !pb-0">
        <Container>
          <RouterLink
            to="/events"
            class="inline-flex items-center gap-2 text-sm font-semibold text-ink/60 hover:text-brand-violet transition-colors mb-6 focus-ring-brand rounded-sm"
          >
            <Icon icon="lucide:arrow-left" width="16" /> Back to events
          </RouterLink>

          <Motion
            v-if="event.hero"
            class="aspect-[21/9] md:aspect-[3/1] rounded-3xl overflow-hidden relative border hairline-ink"
            :initial="{ opacity: 0, y: 10 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.5 }"
          >
            <div
              class="absolute inset-0 wash-violet-6 mix-blend-multiply z-10 pointer-events-none"
            />
            <img :src="event.hero" :alt="event.title" class="w-full h-full object-cover" />
          </Motion>
        </Container>
      </Section>

      <Section class="!pt-12 !pb-16">
        <Container>
          <div class="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start relative">
            <div class="lg:col-span-7 xl:col-span-8 flex flex-col gap-10">
              <Motion
                :initial="{ opacity: 0, x: -10 }"
                :animate="{ opacity: 1, x: 0 }"
                :transition="{ delay: 0.2 }"
              >
                <UiChip class="mb-4 bg-ink !text-white !border-transparent">{{
                  event.type
                }}</UiChip>
                <Heading :level="1" class="mb-6">{{ event.title }}</Heading>
                <div
                  class="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 py-4 border-y hairline-ink bg-surface/50 px-2"
                >
                  <div class="flex items-center gap-3 text-ink font-semibold">
                    <Icon icon="lucide:calendar" width="20" class="text-brand-violet" />
                    {{ formattedDate }}
                  </div>
                  <div class="flex items-center gap-3 text-ink font-semibold">
                    <Icon icon="lucide:clock" width="20" class="text-brand-violet" />
                    {{ formattedTime }} ({{ event.timezone }})
                  </div>
                </div>
                <div
                  class="flex items-center gap-3 py-4 border-b hairline-ink bg-surface/50 px-2 text-ink font-semibold"
                >
                  <Icon
                    :icon="event.isVirtual ? 'lucide:video' : 'lucide:map-pin'"
                    width="20"
                    class="text-brand-violet"
                  />
                  {{ event.location }}
                </div>
              </Motion>

              <div v-if="event.dek">
                <Heading :level="3" class="mb-4">About this event</Heading>
                <Body large class="text-ink/80 leading-relaxed">{{ event.dek }}</Body>
              </div>
            </div>

            <div class="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-32">
              <UiCard
                class="p-8 bg-surface shadow-xl shadow-ink/5 !border-2 !border-brand-violet/10"
              >
                <Motion
                  v-if="rsvpState === 'success'"
                  :initial="{ opacity: 0, scale: 0.95 }"
                  :animate="{ opacity: 1, scale: 1 }"
                  class="flex flex-col items-center text-center py-8 gap-4"
                >
                  <div
                    class="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-2"
                  >
                    <Icon icon="lucide:calendar" width="32" />
                  </div>
                  <Heading :level="3">You're all set!</Heading>
                  <Body>We've sent a calendar invite and details to your email address.</Body>
                  <UiButton variant="secondary" :to="'/events'" class="mt-4 w-full">
                    Browse more events
                  </UiButton>
                </Motion>

                <Motion v-else :initial="{ opacity: 0 }" :animate="{ opacity: 1 }">
                  <div class="mb-6 border-b hairline-ink pb-6">
                    <Heading :level="3" class="mb-2">Secure your spot</Heading>
                    <p class="text-sm text-ink/60 m-0">
                      This event is free, but space is limited. Register to receive the streaming
                      link.
                    </p>
                  </div>

                  <form class="flex flex-col gap-5" @submit="handleRSVP">
                    <div class="flex flex-col gap-2">
                      <label class="text-sm font-semibold text-ink/80">Full Name</label>
                      <input
                        type="text"
                        required
                        placeholder="Amina Yusuf"
                        class="border hairline-ink rounded-xl px-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-surface"
                      />
                    </div>
                    <div class="flex flex-col gap-2">
                      <label class="text-sm font-semibold text-ink/80">Email Address</label>
                      <input
                        type="email"
                        required
                        placeholder="amina@example.com"
                        class="border hairline-ink rounded-xl px-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-surface"
                      />
                    </div>
                    <div class="flex flex-col gap-2">
                      <label class="text-sm font-semibold text-ink/80"
                        >Are you a prospective student?</label
                      >
                      <UiSelect
                        v-model="rsvpProspect"
                        placeholder="Select an option"
                        :options="[
                          { value: 'yes', label: 'Yes, I want to apply' },
                          { value: 'no', label: 'No, I’m a parent/educator/mentor' },
                        ]"
                      />
                    </div>

                    <UiButton
                      variant="gradient"
                      type="submit"
                      :disabled="rsvpState === 'loading'"
                      class="w-full mt-4 !h-12 text-base font-bold group"
                    >
                      <span v-if="rsvpState === 'loading'">Processing…</span>
                      <span v-else class="flex items-center gap-2">
                        Complete RSVP
                        <Icon
                          icon="lucide:arrow-right"
                          width="18"
                          class="transition-transform group-hover:translate-x-1"
                        />
                      </span>
                    </UiButton>
                  </form>
                </Motion>
              </UiCard>
            </div>
          </div>
        </Container>
      </Section>
    </template>
  </div>
</template>
