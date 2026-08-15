<script setup lang="ts">
/**
 * /admin/referrals — leaderboard of who's bringing the most new
 * /stay-connected subscribers in.
 *
 * Reads `referralStats` ordered by `signupCount desc`. Signed-in
 * referrers (rows with id `u-<uid>`) get a name + a deep link to
 * their user profile; anonymous referrers (`a-<short>`) display the
 * short id so admin can correlate with copy-link analytics later.
 *
 * Rule layer (`firestore.rules: referralStats/{id}`) gates this read
 * to staff/admin — route also requires `view_all_users` so the page
 * matches the surfaces alongside it in the Quick Actions panel.
 */
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiCard from '../../components/ui/UiCard.vue';
import { useAdminBase } from '../../composables/useAdminBase';
import {
  fetchReferralLeaderboard,
  type ReferralLeaderboardRow,
} from '../../services/referralLeaderboard';

const { adminBase } = useAdminBase();

const rows = ref<ReferralLeaderboardRow[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const totalSignups = computed(() => rows.value.reduce((sum, r) => sum + r.signupCount, 0));
const identifiedCount = computed(() => rows.value.filter(r => r.identified).length);
const anonymousCount = computed(() => rows.value.filter(r => !r.uid).length);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    rows.value = await fetchReferralLeaderboard(25);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load referrals.';
  } finally {
    loading.value = false;
  }
}

function timeAgo(value: Date | null): string {
  if (!value) return '—';
  const ms = Date.now() - value.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  return value.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

onMounted(load);
</script>

<template>
  <Section class="!pt-12 !pb-24">
    <Container class="max-w-4xl">
      <div class="flex flex-col gap-3 mb-10">
        <Eyebrow class="text-brand-violet">Admin</Eyebrow>
        <Heading :level="1">Referral leaderboard.</Heading>
        <Body class="text-ink/70 max-w-2xl">
          Top referrers from the /stay-connected share links. Counts increment when a referred
          visitor confirms a newsletter signup, so the ranking only credits conversions, not raw
          clicks.
        </Body>
      </div>

      <!-- Stat strip -->
      <div v-if="!loading && !error && rows.length > 0" class="grid grid-cols-3 gap-4 mb-8">
        <UiCard class="p-5 flex flex-col gap-1.5">
          <Eyebrow class="text-brand-violet">Referrers shown</Eyebrow>
          <div class="font-display text-3xl font-semibold tracking-tight text-ink">
            {{ rows.length }}
          </div>
          <p class="text-xs text-ink/60 m-0">Top 25 by signup count</p>
        </UiCard>
        <UiCard class="p-5 flex flex-col gap-1.5">
          <Eyebrow class="text-brand-violet">Signups attributed</Eyebrow>
          <div class="font-display text-3xl font-semibold tracking-tight text-ink">
            {{ totalSignups }}
          </div>
          <p class="text-xs text-ink/60 m-0">From the visible rows</p>
        </UiCard>
        <UiCard class="p-5 flex flex-col gap-1.5">
          <Eyebrow class="text-brand-violet">Named / anonymous</Eyebrow>
          <div class="font-display text-3xl font-semibold tracking-tight text-ink">
            {{ identifiedCount }} <span class="text-ink/40 text-xl">/ {{ anonymousCount }}</span>
          </div>
          <p class="text-xs text-ink/60 m-0">Signed-in vs. cold visitors</p>
        </UiCard>
      </div>

      <div v-if="loading" class="flex items-center gap-3 text-ink/60">
        <Icon icon="lucide:loader-2" width="18" class="animate-spin" />
        Loading…
      </div>

      <UiCard v-else-if="error" class="p-6 flex flex-col gap-3 !border-red-200 bg-red-50/60">
        <div class="flex items-center gap-3 text-red-700">
          <Icon icon="lucide:alert-circle" width="20" />
          <span class="font-semibold">Couldn't load referrals.</span>
        </div>
        <p class="text-sm text-ink/70 m-0">{{ error }}</p>
        <UiButton variant="secondary" class="self-start" @click="load"> Try again </UiButton>
      </UiCard>

      <UiCard
        v-else-if="rows.length === 0"
        class="p-10 flex flex-col items-center gap-3 text-center"
      >
        <div class="w-12 h-12 rounded-full bg-brand-violet/10 flex items-center justify-center">
          <Icon icon="lucide:share-2" width="22" class="text-brand-violet" />
        </div>
        <Heading :level="3" class="!text-lg !m-0">No referrals yet.</Heading>
        <Body class="text-ink/65 text-sm m-0 max-w-md">
          The leaderboard fills in once visitors start subscribing through someone's share link from
          /stay-connected.
        </Body>
      </UiCard>

      <UiCard v-else class="p-0 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-paper/50 border-b hairline-ink">
            <tr class="text-left">
              <th class="px-5 py-3 text-xs font-semibold text-ink/70 uppercase tracking-wide w-12">
                #
              </th>
              <th class="px-5 py-3 text-xs font-semibold text-ink/70 uppercase tracking-wide">
                Referrer
              </th>
              <th
                class="px-5 py-3 text-xs font-semibold text-ink/70 uppercase tracking-wide text-right"
              >
                Signups
              </th>
              <th class="px-5 py-3 text-xs font-semibold text-ink/70 uppercase tracking-wide">
                Most recent
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in rows"
              :key="row.id"
              class="border-b last:border-b-0 hairline-ink hover:bg-paper/40 transition-colors"
            >
              <td class="px-5 py-4 align-middle">
                <span
                  :class="
                    i === 0
                      ? 'font-display font-semibold text-base text-brand-violet'
                      : 'font-display text-base text-ink/55'
                  "
                >
                  {{ i + 1 }}
                </span>
              </td>
              <td class="px-5 py-4 align-middle">
                <div class="flex flex-col gap-0.5 min-w-0">
                  <template v-if="row.identified && row.uid">
                    <RouterLink
                      :to="`${adminBase}/users?uid=${row.uid}`"
                      class="font-semibold text-ink hover:text-brand-violet transition-colors truncate focus-ring-brand rounded-sm"
                    >
                      {{ row.displayName }}
                    </RouterLink>
                    <span class="text-xs text-ink/50 font-mono truncate">{{ row.id }}</span>
                  </template>
                  <template v-else>
                    <div class="flex items-center gap-2">
                      <Icon icon="lucide:user-round" width="14" class="text-ink/40 shrink-0" />
                      <span class="font-semibold text-ink/85">Anonymous</span>
                    </div>
                    <span class="text-xs text-ink/50 font-mono truncate">{{ row.id }}</span>
                  </template>
                </div>
              </td>
              <td class="px-5 py-4 align-middle text-right">
                <span class="font-display text-lg font-semibold tabular-nums text-ink">
                  {{ row.signupCount }}
                </span>
              </td>
              <td class="px-5 py-4 align-middle text-sm text-ink/65">
                {{ timeAgo(row.lastSignupAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </UiCard>

      <p class="mt-6 text-xs text-ink/55 max-w-2xl">
        Counts come from <code class="font-mono text-ink/70">referralStats</code> — incremented
        server-side by <code class="font-mono text-ink/70">subscribeNewsletter</code> on every
        confirmed signup, so cancelled or bounced subscriptions don't deflate the leaderboard.
        Anonymous rows use the visitor's locally-minted share id, which stays stable per browser.
      </p>
    </Container>
  </Section>
</template>
