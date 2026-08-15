<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { onMounted, ref } from 'vue';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiCard from '../../components/ui/UiCard.vue';
import { useAuth } from '../../composables/useAuth';
import {
  cancelMyDonation,
  formatNaira,
  getMyDonations,
  type Donation,
} from '../../services/donations';

const { displayName } = useAuth();
const donations = ref<Donation[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const cancelling = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    donations.value = await getMyDonations();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load donations';
  } finally {
    loading.value = false;
  }
}

async function cancel(d: Donation) {
  if (!d.paystackSubscriptionCode) return;
  if (
    !window.confirm(
      "Cancel this monthly donation? Your support so far stays counted; you just won't be charged again."
    )
  ) {
    return;
  }
  cancelling.value = d.ref;
  try {
    await cancelMyDonation(d.paystackSubscriptionCode);
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Cancellation failed';
  } finally {
    cancelling.value = null;
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusLabel(d: Donation): string {
  if (d.status === 'success' && d.frequency === 'monthly') return 'Monthly | active';
  if (d.status === 'success') return 'Completed';
  if (d.status === 'failed') return 'Failed';
  if (d.status === 'cancelled') return 'Cancelled';
  return 'Pending';
}

function statusColor(d: Donation): string {
  if (d.status === 'success') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (d.status === 'failed') return 'bg-red-50 text-red-700 border-red-200';
  if (d.status === 'cancelled') return 'bg-ink/5 text-ink/60 border-ink/10';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pb-8 !pt-12 md:!pt-16">
      <Container class="max-w-4xl">
        <Eyebrow class="text-brand-violet mb-4 block">My Donations</Eyebrow>
        <Heading :level="1" class="mb-4"
          >Thanks{{ displayName ? `, ${displayName}` : '' }}.</Heading
        >
        <Body large class="text-ink/70">
          Here's a record of your support. You can cancel any monthly donation at any time — we'll
          never charge you again after that.
        </Body>
      </Container>
    </Section>

    <Section class="!pt-4 !pb-24">
      <Container class="max-w-4xl flex flex-col gap-4">
        <div
          v-if="error"
          role="alert"
          class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
        >
          {{ error }}
        </div>

        <template v-if="loading">
          <UiCard v-for="i in 3" :key="i" class="p-6 animate-pulse">
            <div class="flex justify-between gap-4">
              <div class="flex flex-col gap-3 flex-1">
                <div class="h-4 w-32 bg-ink/5 rounded" />
                <div class="h-6 w-24 bg-ink/5 rounded" />
              </div>
              <div class="h-6 w-20 bg-ink/5 rounded-full" />
            </div>
          </UiCard>
        </template>

        <template v-else-if="donations.length === 0">
          <UiCard class="p-12 text-center flex flex-col items-center gap-4">
            <Icon icon="lucide:heart-handshake" width="40" class="text-brand-violet" />
            <Heading :level="3">No donations yet.</Heading>
            <Body>Whenever you're ready, your support funds the next cohort.</Body>
            <UiButton variant="primary" :to="'/donate'">Make a donation</UiButton>
          </UiCard>
        </template>

        <template v-else>
          <UiCard
            v-for="d in donations"
            :key="d.ref"
            class="p-6 flex flex-col md:flex-row md:items-center gap-4"
          >
            <div class="flex flex-col flex-1 gap-1">
              <div class="font-display text-2xl font-semibold text-ink">
                {{ formatNaira(d.amountKobo) }}
              </div>
              <div class="text-sm text-ink/60">
                {{ formatDate(d.createdAt) }} | ref
                <span class="font-mono text-xs">{{ d.ref }}</span>
              </div>
            </div>
            <span
              class="self-start md:self-auto inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border"
              :class="statusColor(d)"
            >
              {{ statusLabel(d) }}
            </span>
            <UiButton
              v-if="
                d.frequency === 'monthly' && d.status === 'success' && d.paystackSubscriptionCode
              "
              variant="secondary"
              :disabled="cancelling === d.ref"
              @click="cancel(d)"
            >
              {{ cancelling === d.ref ? 'Cancelling…' : 'Cancel' }}
            </UiButton>
          </UiCard>
        </template>
      </Container>
    </Section>
  </div>
</template>
