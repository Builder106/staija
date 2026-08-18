<script setup lang="ts">
/**
 * /mentors/:uid — public-within-auth view of a mentor's profile.
 *
 * Who reads this:
 *   - Students looking at "who's my mentor?" from their dashboard
 *     or the cohort surface.
 *   - Cohort coordinators staffing mentor pools — they want to
 *     compare mentors before adding to a pool.
 *   - Staff/admin auditing.
 *
 * Rule layer (firestore.rules:users/{userId}) opens mentor user
 * docs to any authenticated user, so this view doesn't need extra
 * auth gating beyond requiresAuth on the route.
 *
 * Non-mentor uids (someone pastes a student's uid into the URL)
 * fall to the "Not a mentor" empty state — we don't expose
 * non-mentor profiles via this surface even if the underlying
 * doc happens to be readable (e.g. when the viewer is staff).
 */
import { Icon } from '@iconify/vue';
import { doc, getDoc } from 'firebase/firestore';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Eyebrow from '../components/ui/Eyebrow.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiCard from '../components/ui/UiCard.vue';
import { useAuth } from '../composables/useAuth';
import { db } from '../config/firebase';
import { resolveAvatarSrc } from '../services/avatar';
import type { UserProfile } from '../services/types';

const route = useRoute();
const { user } = useAuth();

const profile = ref<UserProfile | null>(null);
const loading = ref(true);
/** Distinguishes "doc doesn't exist" from "doc exists but isn't a
 *  mentor". The first is a bad URL; the second is a legitimate
 *  request to view someone who isn't a mentor (admin paste-error,
 *  outdated link after a role change, etc.) and deserves clearer
 *  empty-state copy. */
const errorKind = ref<'not-found' | 'not-mentor' | 'load-failed' | null>(null);

const uid = computed(() => String(route.params.uid ?? ''));
const isSelf = computed(() => user.value?.uid === uid.value);

async function load() {
  loading.value = true;
  errorKind.value = null;
  profile.value = null;
  if (!uid.value) {
    errorKind.value = 'not-found';
    loading.value = false;
    return;
  }
  try {
    const snap = await getDoc(doc(db, 'users', uid.value));
    if (!snap.exists()) {
      errorKind.value = 'not-found';
      return;
    }
    const data = snap.data() as UserProfile;
    if (data.role !== 'mentor') {
      // Doc readable but the subject isn't a mentor — surface as
      // "not a mentor" rather than "doesn't exist" so the link the
      // viewer followed can be diagnosed.
      profile.value = data;
      errorKind.value = 'not-mentor';
      return;
    }
    profile.value = data;
  } catch {
    errorKind.value = 'load-failed';
  } finally {
    loading.value = false;
  }
}

// Re-load when the route param changes (clicking a different
// mentor link without full navigation).
watch(uid, () => {
  void load();
});

const avatarSrc = computed(() => {
  if (!profile.value) return '';
  return resolveAvatarSrc({
    photoURL: profile.value.photoURL ?? null,
    avatarSlot: profile.value.avatarSlot,
    seed: profile.value.uid,
  });
});

const displayName = computed(
  () => profile.value?.displayName?.trim() || profile.value?.email || 'Mentor',
);

onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section v-if="loading" class="!py-24">
      <Container class="max-w-3xl flex flex-col gap-6">
        <div class="h-4 w-24 bg-ink/5 rounded animate-pulse" />
        <div class="h-12 w-3/4 bg-ink/5 rounded animate-pulse" />
        <div class="h-32 w-full bg-ink/5 rounded-2xl animate-pulse" />
      </Container>
    </Section>

    <Section v-else-if="errorKind === 'not-found'" class="!py-24 text-center">
      <Container class="max-w-xl flex flex-col items-center gap-6">
        <Icon icon="lucide:user-x" width="40" class="text-ink/40" />
        <Heading :level="2">Mentor not found</Heading>
        <Body class="text-ink/70">That mentor profile doesn't exist or has been removed.</Body>
        <UiButton variant="primary" :to="'/'">Back to STAIJA</UiButton>
      </Container>
    </Section>

    <Section v-else-if="errorKind === 'not-mentor'" class="!py-24 text-center">
      <Container class="max-w-xl flex flex-col items-center gap-6">
        <Icon icon="lucide:user-x" width="40" class="text-ink/40" />
        <Heading :level="2">Not a mentor</Heading>
        <Body class="text-ink/70">
          This account doesn't have the mentor role. If you followed a link, it may be out of date.
        </Body>
        <UiButton variant="primary" :to="'/'">Back to STAIJA</UiButton>
      </Container>
    </Section>

    <Section v-else-if="errorKind === 'load-failed'" class="!py-24 text-center">
      <Container class="max-w-xl flex flex-col items-center gap-6">
        <Icon icon="lucide:alert-circle" width="40" class="text-rose-700" />
        <Heading :level="2">Couldn't load this profile</Heading>
        <Body class="text-ink/70">Try refreshing in a moment.</Body>
        <UiButton variant="secondary" @click="load">Try again</UiButton>
      </Container>
    </Section>

    <template v-else-if="profile">
      <!-- Hero band: avatar + name + program affiliation (the
           program field exists on UserProfile for students; mentors
           may not have one set, in which case we just omit it). -->
      <Section class="!pt-12 !pb-8 wash-violet-6 border-b hairline-ink">
        <Container class="max-w-3xl">
          <RouterLink
            to="/"
            class="inline-flex items-center gap-2 text-sm font-semibold text-ink/60 hover:text-brand-violet transition-colors mb-6 focus-ring-brand rounded-sm"
          >
            <Icon icon="lucide:arrow-left" width="16" /> Back to STAIJA
          </RouterLink>

          <Eyebrow class="text-brand-violet mb-3 block">Mentor</Eyebrow>
          <div class="flex flex-col md:flex-row md:items-center gap-5">
            <img
              :src="avatarSrc"
              :alt="displayName"
              class="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border-2 hairline-ink !border-brand-violet/30 shrink-0"
              referrerpolicy="no-referrer"
            />
            <div class="flex-1 min-w-0 flex flex-col gap-2">
              <Heading :level="1" class="!text-3xl md:!text-4xl !m-0">
                {{ displayName }}
              </Heading>
              <div class="flex flex-wrap items-center gap-3 text-sm">
                <a
                  v-if="profile.email"
                  :href="`mailto:${profile.email}`"
                  class="text-ink/70 hover:text-brand-violet focus-ring-brand rounded-sm transition-colors"
                >
                  {{ profile.email }}
                </a>
                <span
                  v-if="isSelf"
                  class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border border-brand-violet/30 bg-brand-violet/10 text-brand-violet"
                >
                  This is you
                </span>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <Section class="!py-12">
        <Container class="max-w-3xl flex flex-col gap-6">
          <!-- Bio. Falls through to the general `bio` field if
               mentorBio is empty — onboarding makes mentorBio
               optional, but a mentor who came in via another path
               might have only the generic bio set. -->
          <UiCard class="p-6 md:p-8 bg-surface">
            <div class="flex items-center gap-3 mb-5">
              <Icon icon="lucide:sparkles" width="20" class="text-brand-violet" />
              <h2 class="font-display text-xl font-semibold m-0 text-ink">About</h2>
            </div>
            <p
              v-if="profile.mentorBio || profile.bio"
              class="text-sm text-ink/85 leading-relaxed whitespace-pre-wrap m-0"
            >
              {{ profile.mentorBio || profile.bio }}
            </p>
            <p v-else class="text-sm text-ink/55 italic m-0">
              No bio yet.<span v-if="isSelf">
                <RouterLink to="/account/settings" class="ml-1 text-brand-violet hover:underline">
                  Add one </RouterLink
                >.
              </span>
            </p>
          </UiCard>

          <UiCard class="p-6 md:p-8 bg-surface">
            <div class="flex items-center gap-3 mb-5">
              <Icon icon="lucide:clock" width="20" class="text-brand-violet" />
              <h2 class="font-display text-xl font-semibold m-0 text-ink">Availability</h2>
            </div>
            <p
              v-if="profile.mentorAvailability"
              class="text-sm text-ink/85 leading-relaxed whitespace-pre-wrap m-0"
            >
              {{ profile.mentorAvailability }}
            </p>
            <p v-else class="text-sm text-ink/55 italic m-0">
              Not specified.<span v-if="isSelf">
                <RouterLink to="/account/settings" class="ml-1 text-brand-violet hover:underline">
                  Add it </RouterLink
                >.
              </span>
            </p>
          </UiCard>

          <div v-if="isSelf" class="text-xs text-ink/50 text-center">
            Edit these fields from
            <RouterLink to="/account/settings" class="text-brand-violet hover:underline">
              account settings </RouterLink
            >.
          </div>
        </Container>
      </Section>
    </template>
  </div>
</template>
