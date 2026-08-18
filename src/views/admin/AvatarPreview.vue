<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AnimatedAvatar from '../../components/avatars/AnimatedAvatar.vue';
import LottieAvatar from '../../components/avatars/LottieAvatar.vue';
import { avatarThumbForSlot, PORTRAIT_SLOT_COUNT } from '../../services/avatar';
import { hasLottieForSlot, loadLottieForSlot } from '../../services/avatar/lotties';

/**
 * Phase 1 + Phase 4 avatar preview. Mounts AnimatedAvatar in every
 * state-prop value against the test slot (portrait-afro-medium =
 * slot 1) so motion can be eyeballed without re-enabling the
 * Settings page. Below, renders all 10 slots side-by-side, plus —
 * if any slot has a Lottie animation file present — a row showing
 * the Lottie variant alongside the static one for comparison.
 *
 * This is a temporary route — delete it once the avatar work is
 * verified end-to-end and signed off.
 */

const TEST_SLOT = 1; // portrait-afro-medium

const testSrc = computed(() => avatarThumbForSlot(TEST_SLOT));

const allSlots = computed(() =>
  Array.from({ length: PORTRAIT_SLOT_COUNT }, (_, i) => ({
    slot: i,
    src: avatarThumbForSlot(i),
  })),
);

const states = ['idle', 'hero', 'static'] as const;

// Discover which slots have Lottie animations attached. The
// `hasLottieForSlot` lookup is sync (Map.has under the hood); the
// JSON itself is loaded lazily once we know we want to render it.
const lottieSlots = computed(() => allSlots.value.filter((entry) => hasLottieForSlot(entry.slot)));

const loadedLotties = ref<Record<number, Record<string, unknown> | null>>({});

onMounted(async () => {
  // Eagerly preload the small set of Lotties we know exist — preview
  // is the one place we genuinely want all of them up at once.
  for (const entry of lottieSlots.value) {
    loadedLotties.value[entry.slot] = await loadLottieForSlot(entry.slot);
  }
});
</script>

<template>
  <div class="avatar-preview">
    <header class="avatar-preview__header">
      <h1>Avatar preview</h1>
      <p>
        Phase 1 motion against slot {{ TEST_SLOT }} (portrait-afro-medium). Hover any avatar to see
        the lift transition. The full library is rendered below for sanity.
      </p>
    </header>

    <section class="avatar-preview__section">
      <h2>State presets — slot {{ TEST_SLOT }}</h2>
      <div class="avatar-preview__states">
        <figure v-for="state in states" :key="state" class="avatar-preview__cell">
          <AnimatedAvatar
            :src="testSrc"
            :state="state"
            :size="160"
            :alt="`Avatar in ${state} state`"
          />
          <figcaption>state="{{ state }}"</figcaption>
        </figure>
      </div>
    </section>

    <section class="avatar-preview__section">
      <h2>All 10 slots — idle state</h2>
      <div class="avatar-preview__library">
        <figure v-for="entry in allSlots" :key="entry.slot" class="avatar-preview__cell">
          <AnimatedAvatar
            :src="entry.src"
            state="idle"
            :size="120"
            :alt="`Avatar slot ${entry.slot}`"
          />
          <figcaption>slot {{ entry.slot }}</figcaption>
        </figure>
      </div>
    </section>

    <section v-if="lottieSlots.length > 0" class="avatar-preview__section">
      <h2>Lottie variants ({{ lottieSlots.length }})</h2>
      <p class="avatar-preview__hint">
        These slots have a rigged Lottie animation in
        <code>src/assets/avatar-lotties/</code>. Each pair shows the static thumbnail (left) next to
        its Lottie variant (right).
      </p>
      <div class="avatar-preview__library">
        <figure
          v-for="entry in lottieSlots"
          :key="`lottie-${entry.slot}`"
          class="avatar-preview__pair"
        >
          <AnimatedAvatar
            :src="entry.src"
            state="static"
            :size="120"
            :alt="`Avatar slot ${entry.slot} static`"
          />
          <LottieAvatar
            v-if="loadedLotties[entry.slot]"
            :animation-data="loadedLotties[entry.slot]"
            :fallback-src="entry.src"
            :size="120"
            :alt="`Avatar slot ${entry.slot} animated`"
          />
          <figcaption>slot {{ entry.slot }}</figcaption>
        </figure>
      </div>
    </section>
  </div>
</template>

<style scoped>
.avatar-preview {
  padding: 2rem;
  max-width: 1100px;
  margin: 0 auto;
}

.avatar-preview__header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.avatar-preview__header p {
  color: rgb(var(--color-ink-rgb) / 0.7);
  margin-bottom: 2rem;
}

.avatar-preview__section {
  margin-top: 2.5rem;
}

.avatar-preview__section h2 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: rgb(var(--color-ink-rgb) / 0.6);
}

.avatar-preview__states,
.avatar-preview__library {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
}

.avatar-preview__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.avatar-preview__cell figcaption,
.avatar-preview__pair figcaption {
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: rgb(var(--color-ink-rgb) / 0.6);
}

.avatar-preview__pair {
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem;
  border-radius: 0.5rem;
  background: rgb(var(--color-ink-rgb, 23 23 23) / 0.03);
}

.avatar-preview__pair figcaption {
  grid-column: 1 / -1;
  text-align: center;
}

.avatar-preview__hint {
  font-size: 0.875rem;
  color: rgb(var(--color-ink-rgb) / 0.65);
  max-width: 56ch;
  margin: 0 0 1rem 0;
}

.avatar-preview__hint code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: rgb(var(--color-ink-rgb) / 0.06);
  padding: 0 0.25rem;
  border-radius: 0.2rem;
}
</style>
