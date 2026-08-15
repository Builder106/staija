<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiCard from '../../components/ui/UiCard.vue';
import { useAuth } from '../../composables/useAuth';
import { SessionService, rsvpSession, toMillis } from '../../services/learn';
import type { LiveSession, SessionRsvp } from '../../services/types';

const route = useRoute();
const { user } = useAuth();

const loading = ref(true);
const session = ref<LiveSession | null>(null);
const myRsvp = ref<SessionRsvp | null>(null);
const updating = ref(false);
const error = ref<string | null>(null);

const isJoinable = computed(() => {
  if (!session.value) return false;
  const start = toMillis(session.value.startsAt);
  const end = toMillis(session.value.endsAt);
  const now = Date.now();
  // 15 min before start through end of session
  return now >= start - 15 * 60 * 1000 && now <= end;
});

const isPast = computed(() => session.value && toMillis(session.value.endsAt) < Date.now());

async function load() {
  if (!user.value) return;
  loading.value = true;
  try {
    const id = route.params.id as string;
    const [s, r] = await Promise.all([
      SessionService.getSession(id),
      SessionService.getRsvp(id, user.value.uid),
    ]);
    session.value = s;
    myRsvp.value = r;
    if (!s) error.value = 'Session not found.';
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load session.';
  } finally {
    loading.value = false;
  }
}

async function setRsvp(value: 'yes' | 'no' | 'maybe') {
  if (!session.value || updating.value) return;
  updating.value = true;
  error.value = null;
  try {
    await rsvpSession({ sessionId: session.value.id ?? '', rsvped: value });
    myRsvp.value = await SessionService.getRsvp(session.value.id ?? '', user.value!.uid);
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'RSVP failed.';
  } finally {
    updating.value = false;
  }
}

function fmtFull(ts: unknown) {
  return new Date(toMillis(ts)).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-10 !pb-6 border-b hairline-ink">
      <Container class="max-w-3xl">
        <RouterLink
          :to="{ name: 'learn-sessions' }"
          class="text-xs text-ink/60 hover:text-ink mb-3 inline-flex items-center gap-1"
        >
          <Icon icon="lucide:arrow-left" width="12" /> All sessions
        </RouterLink>
        <Eyebrow class="text-brand-violet mb-2 block">Live session</Eyebrow>
        <Heading v-if="session" :level="1" class="mb-2">{{ session.title }}</Heading>
        <p v-if="session" class="text-sm text-ink/70">{{ fmtFull(session.startsAt) }}</p>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="max-w-3xl flex flex-col gap-6">
        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon icon="lucide:loader-2" width="24" class="animate-spin text-brand-violet mx-auto" />
        </UiCard>

        <UiCard v-else-if="error" class="p-6 bg-surface">
          <Body class="text-red-700 text-sm">{{ error }}</Body>
        </UiCard>

        <template v-else-if="session">
          <UiCard v-if="session.description" class="p-6 md:p-8 bg-surface">
            <p class="text-sm text-ink/85 whitespace-pre-line leading-relaxed">
              {{ session.description }}
            </p>
          </UiCard>

          <UiCard class="p-6 md:p-8 bg-surface">
            <div class="flex items-start justify-between gap-4 mb-5">
              <div>
                <Eyebrow class="text-ink/50 mb-2 block">Will you attend?</Eyebrow>
                <p v-if="myRsvp" class="text-xs text-ink/60">
                  Your RSVP: <strong class="capitalize">{{ myRsvp.rsvped }}</strong>
                </p>
              </div>
              <div class="flex gap-2">
                <button
                  v-for="option in ['yes', 'maybe', 'no'] as const"
                  :key="option"
                  type="button"
                  :disabled="updating || !!isPast"
                  class="px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide border hairline-ink transition-colors capitalize"
                  :class="
                    myRsvp?.rsvped === option
                      ? 'bg-brand-violet text-white border-brand-violet'
                      : 'bg-surface text-ink/70 hover:bg-ink/5'
                  "
                  @click="setRsvp(option)"
                >
                  {{ option }}
                </button>
              </div>
            </div>

            <div v-if="isJoinable && session.meetingUrl" class="flex flex-col gap-2">
              <a
                :href="session.meetingUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-brand-violet text-white text-sm font-semibold hover:opacity-90 transition-opacity w-fit"
              >
                <Icon icon="lucide:video" width="14" />
                Join session
              </a>
              <p class="text-xs text-ink/50">Opens {{ session.meetingProvider }} in a new tab.</p>
            </div>
            <div v-else-if="!isPast" class="text-sm text-ink/60">
              The join link will appear here 15 minutes before the session starts.
            </div>
            <div v-else class="text-sm text-ink/60">
              <span v-if="session.recordingUrl">
                <a
                  :href="session.recordingUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-brand-violet underline"
                >
                  Watch recording
                </a>
              </span>
              <span v-else>This session has ended.</span>
            </div>

            <p v-if="error" class="text-sm text-red-700 mt-3">{{ error }}</p>
          </UiCard>
        </template>
      </Container>
    </Section>
  </div>
</template>
