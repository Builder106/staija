<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiCard from '../../components/ui/UiCard.vue';
import { useAuth } from '../../composables/useAuth';
import { EnrollmentService, SessionService, toMillis } from '../../services/learn';
import type { LiveSession } from '../../services/types';

const { user } = useAuth();

const loading = ref(true);
const sessions = ref<LiveSession[]>([]);
const error = ref<string | null>(null);

const upcoming = computed(() =>
  sessions.value
    .filter((s) => toMillis(s.startsAt) >= Date.now())
    .sort((a, b) => toMillis(a.startsAt) - toMillis(b.startsAt)),
);
const past = computed(() =>
  sessions.value
    .filter((s) => toMillis(s.startsAt) < Date.now())
    .sort((a, b) => toMillis(b.startsAt) - toMillis(a.startsAt)),
);

async function load() {
  if (!user.value) return;
  loading.value = true;
  try {
    const enrollments = await EnrollmentService.getActiveForStudent(user.value.uid);
    if (enrollments.length === 0) {
      error.value = 'You are not enrolled in any active course.';
      return;
    }
    sessions.value = await SessionService.listForCohort(enrollments[0].cohortId);
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load sessions.';
  } finally {
    loading.value = false;
  }
}

function fmt(s: LiveSession) {
  return new Date(toMillis(s.startsAt)).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-12 !pb-8 wash-violet-6 border-b hairline-ink">
      <Container>
        <Eyebrow class="text-brand-violet mb-3 block">Live sessions</Eyebrow>
        <Heading :level="1" class="mb-3">Cohort calendar.</Heading>
        <Body class="text-ink/70 max-w-2xl">
          Mentor-led sessions for your cohort. Click any session to RSVP and grab the meeting link.
        </Body>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="flex flex-col gap-8">
        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon icon="lucide:loader-2" width="24" class="animate-spin text-brand-violet mx-auto" />
        </UiCard>

        <UiCard v-else-if="error" class="p-6 bg-surface">
          <Body class="text-ink/70 text-sm">{{ error }}</Body>
        </UiCard>

        <template v-else>
          <div>
            <Eyebrow class="text-ink/50 mb-3 block">Upcoming</Eyebrow>
            <UiCard v-if="upcoming.length === 0" class="p-6 bg-surface">
              <Body class="text-ink/60 text-sm">No upcoming sessions.</Body>
            </UiCard>
            <UiCard v-else class="p-0 bg-surface overflow-hidden">
              <ul class="divide-y divide-ink/5">
                <li v-for="s in upcoming" :key="s.id">
                  <RouterLink
                    :to="{ name: 'learn-session', params: { id: s.id } }"
                    class="flex items-center gap-3 px-5 py-4 hover:bg-ink/[0.02]"
                  >
                    <Icon icon="lucide:video" width="18" class="text-brand-violet" />
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-ink">{{ s.title }}</div>
                      <div class="text-xs text-ink/50">{{ fmt(s) }}</div>
                    </div>
                    <Icon icon="lucide:chevron-right" width="16" class="text-ink/30" />
                  </RouterLink>
                </li>
              </ul>
            </UiCard>
          </div>

          <div v-if="past.length > 0">
            <Eyebrow class="text-ink/50 mb-3 block">Past</Eyebrow>
            <UiCard class="p-0 bg-surface overflow-hidden">
              <ul class="divide-y divide-ink/5">
                <li v-for="s in past" :key="s.id">
                  <RouterLink
                    :to="{ name: 'learn-session', params: { id: s.id } }"
                    class="flex items-center gap-3 px-5 py-4 hover:bg-ink/[0.02] text-ink/60"
                  >
                    <Icon icon="lucide:history" width="18" class="text-ink/40" />
                    <div class="flex-1 min-w-0">
                      <div class="font-medium">{{ s.title }}</div>
                      <div class="text-xs">{{ fmt(s) }}</div>
                    </div>
                  </RouterLink>
                </li>
              </ul>
            </UiCard>
          </div>
        </template>
      </Container>
    </Section>
  </div>
</template>
