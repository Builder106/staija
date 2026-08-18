<script setup lang="ts">
/**
 * /mentors — public-within-auth grid of every active mentor.
 *
 * Rule layer (firestore.rules:users/{userId}) allows any
 * authenticated user to read a user doc when role='mentor', and
 * Firestore evaluates list rules against each candidate doc — as
 * long as we filter the query by `role == 'mentor'`, every result
 * satisfies the rule and the list comes back cleanly.
 *
 * Why a list page when /mentors/:uid already exists: students who
 * haven't been paired yet (e.g. in the queue before cohort start)
 * have no entry point to discover mentors; cohort coordinators
 * staffing mentor pools want to compare bios side-by-side before
 * picking; and prospective applicants want a "what kind of people
 * mentor here" signal during the apply flow. The detail page
 * answers "who is this specific mentor"; the index answers "who
 * are the mentors at all".
 */
import { Icon } from '@iconify/vue';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Eyebrow from '../components/ui/Eyebrow.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiCard from '../components/ui/UiCard.vue';
import { db } from '../config/firebase';
import { resolveAvatarSrc } from '../services/avatar';
import type { UserProfile } from '../services/types';

const mentors = ref<UserProfile[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const searchQuery = ref('');

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const q = query(collection(db, 'users'), where('role', '==', 'mentor'), orderBy('displayName'));
    const snap = await getDocs(q);
    mentors.value = snap.docs.map((d) => d.data() as UserProfile);
  } catch (err) {
    // The `orderBy('displayName')` query needs an index for some
    // Firestore setups; if it errors, fall back to an unordered
    // fetch and sort client-side. Better than showing an empty
    // page on a missing-index error.
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'mentor')));
      mentors.value = snap.docs
        .map((d) => d.data() as UserProfile)
        .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
    } catch (inner) {
      error.value =
        inner instanceof Error
          ? inner.message
          : err instanceof Error
            ? err.message
            : 'Failed to load mentors.';
    }
  } finally {
    loading.value = false;
  }
}

/** Client-side substring filter — keep the matching surface (name,
 *  bio, availability) generous so a search for "stats" or "evenings"
 *  catches a mentor whose bio mentions either. Mentor counts are
 *  small enough that filtering in JS is cheap. */
const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return mentors.value;
  return mentors.value.filter((m) => {
    const haystack = [
      m.displayName ?? '',
      m.email ?? '',
      m.mentorBio ?? '',
      m.mentorAvailability ?? '',
      m.bio ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
});

function avatarFor(m: UserProfile): string {
  return resolveAvatarSrc({
    photoURL: m.photoURL ?? null,
    avatarSlot: m.avatarSlot,
    seed: m.uid,
  });
}

function bioSnippet(m: UserProfile): string {
  const text = (m.mentorBio || m.bio || '').trim();
  if (!text) return '';
  if (text.length <= 140) return text;
  return text.slice(0, 137).trimEnd() + '…';
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-12 !pb-8 wash-violet-6 border-b hairline-ink">
      <Container class="max-w-5xl">
        <Eyebrow class="text-brand-violet mb-3 block">Network</Eyebrow>
        <Heading :level="1" class="!text-3xl md:!text-4xl !m-0">
          The mentors behind STAIJA.
        </Heading>
        <Body class="text-ink/70 mt-4 max-w-2xl">
          Scientists, engineers, and builders volunteering time to STAIJA students across StepUp
          Scholars and Dynamerge. Click any mentor to see their background and when they're
          available.
        </Body>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="max-w-5xl flex flex-col gap-6">
        <!-- Search -->
        <div class="relative">
          <Icon
            icon="lucide:search"
            width="16"
            class="absolute left-4 top-1/2 -translate-y-1/2 text-ink/40 pointer-events-none"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by name, expertise, or availability…"
            class="w-full border hairline-ink rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-surface"
          />
        </div>

        <div v-if="loading" class="grid sm:grid-cols-2 gap-4">
          <div v-for="i in 4" :key="i" class="h-40 bg-ink/5 rounded-2xl animate-pulse" />
        </div>

        <div
          v-else-if="error"
          role="alert"
          class="rounded-2xl border border-rose-200 bg-rose-50 text-rose-900 p-4 text-sm"
        >
          {{ error }}
        </div>

        <UiCard
          v-else-if="filtered.length === 0"
          class="p-10 bg-surface flex flex-col items-center gap-3 text-center"
        >
          <div class="w-14 h-14 rounded-full bg-brand-violet/10 flex items-center justify-center">
            <Icon icon="lucide:users" width="28" class="text-brand-violet" />
          </div>
          <Heading :level="3" class="!text-xl !m-0">
            {{ searchQuery ? 'No mentors match that search.' : 'No mentors yet.' }}
          </Heading>
          <Body v-if="!searchQuery" class="text-ink/65 m-0 max-w-md">
            Mentors join via invite links from the admin team.
          </Body>
        </UiCard>

        <div v-else class="grid sm:grid-cols-2 gap-4">
          <RouterLink
            v-for="m in filtered"
            :key="m.uid"
            :to="`/mentors/${m.uid}`"
            class="block focus-ring-brand rounded-2xl"
          >
            <UiCard hoverable class="p-5 flex items-start gap-4 h-full">
              <img
                :src="avatarFor(m)"
                :alt="m.displayName ?? 'Mentor'"
                class="w-14 h-14 rounded-full object-cover border-2 hairline-ink !border-brand-violet/30 shrink-0"
                referrerpolicy="no-referrer"
              />
              <div class="flex-1 min-w-0 flex flex-col gap-1.5">
                <h3 class="font-display text-lg font-semibold m-0 truncate text-ink">
                  {{ m.displayName ?? m.email ?? 'Mentor' }}
                </h3>
                <p v-if="bioSnippet(m)" class="text-sm text-ink/70 m-0 leading-snug">
                  {{ bioSnippet(m) }}
                </p>
                <p
                  v-if="m.mentorAvailability"
                  class="text-xs text-ink/55 m-0 inline-flex items-center gap-1.5 truncate"
                >
                  <Icon icon="lucide:clock" width="12" class="text-brand-violet shrink-0" />
                  <span class="truncate">{{ m.mentorAvailability }}</span>
                </p>
              </div>
            </UiCard>
          </RouterLink>
        </div>
      </Container>
    </Section>
  </div>
</template>
