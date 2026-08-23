<script setup lang="ts">
/**
 * Anonymous read-only mentor grid for /stay-connected.
 *
 * Fetches the `getPublicMentors` Cloud Function via `publicMentors`
 * service. Only mentors who flipped `mentorPublicProfile: true` in
 * account settings appear; non-opted-in mentors stay invisible.
 *
 * Degrades to an "empty state" card when the endpoint isn't
 * configured or returns nothing, so the rest of the page always
 * renders. There's intentionally no contact button — visitors who
 * want to mentor join the notify-me list at the top of the page.
 */
import { Icon } from '@iconify/vue';
import { onMounted, ref } from 'vue';
import { resolveAvatarSrc } from '../../services/avatar';
import { resolveAvatarSrc } from '../../services/avatar/index';
import { fetchPublicMentors, type PublicMentor } from '../../services/publicMentors';
import Body from '../ui/Body.vue';
import Heading from '../ui/Heading.vue';
import UiCard from '../ui/UiCard.vue';

const mentors = ref<PublicMentor[]>([]);
const loading = ref(true);

function avatarFor(m: PublicMentor): string {
  return resolveAvatarSrc({
    photoURL: m.photoURL,
    avatarSlot: m.avatarSlot,
    seed: m.uid,
  });
}

function bioSnippet(m: PublicMentor): string {
  const text = m.mentorBio.trim();
  if (!text) return '';
  if (text.length <= 140) return text;
  return text.slice(0, 137).trimEnd() + '…';
}

onMounted(async () => {
  loading.value = true;
  try {
    mentors.value = await fetchPublicMentors();
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center gap-3">
      <Icon icon="lucide:users" width="20" class="text-brand-violet" />
      <Heading :level="2" class="!text-xl !m-0">Who's mentoring at STAIJA.</Heading>
    </div>
    <Body class="text-ink/65 text-sm m-0 -mt-2">
      A few of the researchers, engineers, and builders who volunteer time to STAIJA students. If
      you'd like to join them, add yourself to the notify-me list above.
    </Body>

    <div v-if="loading" class="grid sm:grid-cols-2 gap-4">
      <div v-for="i in 4" :key="i" class="h-32 bg-ink/5 rounded-2xl animate-pulse" />
    </div>

    <UiCard
      v-else-if="mentors.length === 0"
      class="p-8 bg-surface flex flex-col items-center gap-3 text-center"
    >
      <div class="w-12 h-12 rounded-full bg-brand-violet/10 flex items-center justify-center">
        <Icon icon="lucide:user-plus" width="22" class="text-brand-violet" />
      </div>
      <Heading :level="3" class="!text-lg !m-0">Mentor profiles coming soon.</Heading>
      <Body class="text-ink/65 text-sm m-0 max-w-md">
        Our mentors haven't all opted into the public showcase yet. In the meantime, the notify-me
        list above is the best way to hear when new ones come on board.
      </Body>
    </UiCard>

    <div v-else class="grid sm:grid-cols-2 gap-4">
      <UiCard v-for="m in mentors" :key="m.uid" class="p-5 flex items-start gap-4 h-full">
        <img
          :src="avatarFor(m)"
          :alt="m.displayName"
          width="56"
          height="56"
          class="w-14 h-14 rounded-full object-cover border-2 hairline-ink !border-brand-violet/30 shrink-0"
          referrerpolicy="no-referrer"
          loading="lazy"
        />
        <div class="flex-1 min-w-0 flex flex-col gap-1.5">
          <h3 class="font-display text-lg font-semibold m-0 truncate text-ink">
            {{ m.displayName }}
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
    </div>
  </div>
</template>
