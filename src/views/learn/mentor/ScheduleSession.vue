<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import Body from '../../../components/ui/Body.vue';
import Container from '../../../components/ui/Container.vue';
import Eyebrow from '../../../components/ui/Eyebrow.vue';
import Heading from '../../../components/ui/Heading.vue';
import Section from '../../../components/ui/Section.vue';
import UiButton from '../../../components/ui/UiButton.vue';
import UiCard from '../../../components/ui/UiCard.vue';
import UiSelect from '../../../components/ui/UiSelect.vue';
import { useAuth } from '../../../composables/useAuth';
import { CohortService, scheduleSession } from '../../../services/learn';
import type { Cohort } from '../../../services/types';

const router = useRouter();
const { user } = useAuth();

const cohorts = ref<Cohort[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const form = ref({
  cohortId: '',
  title: '',
  description: '',
  startsAt: '',
  endsAt: '',
  meetingUrl: '',
  meetingProvider: 'zoom' as 'zoom' | 'meet' | 'other',
});
const submitting = ref(false);

const canSubmit = computed(
  () =>
    form.value.cohortId &&
    form.value.title.trim() &&
    form.value.startsAt &&
    form.value.endsAt &&
    form.value.meetingUrl.trim(),
);

async function load() {
  if (!user.value) return;
  loading.value = true;
  try {
    const all = await CohortService.listAllCohorts();
    cohorts.value = all.filter(
      (c) => (c.mentorPool ?? []).includes(user.value!.uid) && c.status !== 'completed',
    );
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load cohorts.';
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  error.value = null;
  try {
    const result = await scheduleSession({
      cohortId: form.value.cohortId,
      title: form.value.title.trim(),
      description: form.value.description.trim() || undefined,
      startsAt: new Date(form.value.startsAt).toISOString(),
      endsAt: new Date(form.value.endsAt).toISOString(),
      meetingUrl: form.value.meetingUrl.trim(),
      meetingProvider: form.value.meetingProvider,
    });
    router.push({ name: 'learn-session', params: { id: result.sessionId } });
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Could not schedule.';
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-10 !pb-6 border-b hairline-ink">
      <Container class="max-w-2xl">
        <RouterLink
          to="/mentor"
          class="text-xs text-ink/60 hover:text-ink mb-3 inline-flex items-center gap-1"
        >
          <Icon icon="lucide:arrow-left" width="12" /> Mentor portal
        </RouterLink>
        <Eyebrow class="text-brand-violet mb-2 block">Schedule</Eyebrow>
        <Heading :level="1" class="mb-2">New live session</Heading>
        <Body class="text-ink/70">
          Set up a Zoom / Google Meet call for one of your cohorts. Students will see it on their
          dashboard immediately.
        </Body>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="max-w-2xl">
        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon icon="lucide:loader-2" width="24" class="animate-spin text-brand-violet mx-auto" />
        </UiCard>

        <UiCard v-else-if="cohorts.length === 0" class="p-6 bg-surface">
          <Body class="text-ink/70 text-sm">
            You're not currently a mentor on any active or planned cohort. Ask staff to add you to a
            cohort's mentor pool first.
          </Body>
        </UiCard>

        <UiCard v-else class="p-6 md:p-10 bg-surface">
          <div class="flex flex-col gap-5">
            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                >Cohort</label
              >
              <UiSelect
                v-model="form.cohortId"
                placeholder="Select a cohort…"
                :options="
                  cohorts.map((c) => ({
                    value: c.id ?? '',
                    label: `${c.name || c.courseSlug} (${c.program.replace('_', ' ')})`,
                  }))
                "
              />
            </div>

            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">Title</label>
              <input
                v-model="form.title"
                type="text"
                placeholder="e.g. Week 3 lab walkthrough"
                class="w-full px-4 py-2.5 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet"
              />
            </div>

            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                Description <span class="text-ink/40 normal-case">(optional)</span>
              </label>
              <textarea
                v-model="form.description"
                rows="3"
                placeholder="What will you cover?"
                class="w-full px-4 py-2.5 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet resize-none"
              />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                  >Starts</label
                >
                <input
                  v-model="form.startsAt"
                  type="datetime-local"
                  class="w-full px-4 py-2.5 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                  >Ends</label
                >
                <input
                  v-model="form.endsAt"
                  type="datetime-local"
                  class="w-full px-4 py-2.5 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet"
                />
              </div>
            </div>

            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                Meeting URL
              </label>
              <input
                v-model="form.meetingUrl"
                type="url"
                placeholder="https://zoom.us/j/…  or  https://meet.google.com/…"
                class="w-full px-4 py-2.5 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet"
              />
            </div>

            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                Provider
              </label>
              <UiSelect
                v-model="form.meetingProvider"
                :options="[
                  { value: 'zoom', label: 'Zoom' },
                  { value: 'meet', label: 'Google Meet' },
                  { value: 'other', label: 'Other' },
                ]"
              />
            </div>

            <p v-if="error" class="text-sm text-red-700">{{ error }}</p>

            <UiButton variant="primary" :disabled="!canSubmit || submitting" @click="submit">
              <Icon v-if="submitting" icon="lucide:loader-2" width="14" class="animate-spin" />
              <Icon v-else icon="lucide:calendar-plus" width="14" />
              {{ submitting ? 'Scheduling…' : 'Schedule session' }}
            </UiButton>
          </div>
        </UiCard>
      </Container>
    </Section>
  </div>
</template>
