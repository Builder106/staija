<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Motion } from 'motion-v';
import { computed, ref } from 'vue';
import ScrollReveal from '../components/motion/ScrollReveal.vue';
import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Eyebrow from '../components/ui/Eyebrow.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiCard from '../components/ui/UiCard.vue';
import { donationsEnabled } from '../config/features';
import { auth } from '../config/firebase';
import { trackDonateStart } from '../services/analytics';
import { formatNaira, donate as launchPaystack } from '../services/donations';

type Frequency = 'one-time' | 'monthly';

const frequency = ref<Frequency>('monthly');
const selectedTier = ref<number>(1);
const customAmount = ref('');
const submitting = ref(false);
const errorMessage = ref<string | null>(null);
const successRef = ref<string | null>(null);

const tiers = [
  { id: 0, amount: '₦5,000', impact: 'Funds one workshop seat', bestValue: false },
  { id: 1, amount: '₦25,000', impact: 'Covers a research stipend for a month', bestValue: true },
  {
    id: 2,
    amount: '₦100,000',
    impact: 'Sponsors a full StepUp cohort placement',
    bestValue: false,
  },
];

const allocation = [
  { name: 'Student Stipends', value: 60, color: '#8B55FF' },
  { name: 'Lab Materials & Venue', value: 20, color: '#5EDBE7' },
  { name: 'Mentorship Ops', value: 10, color: '#9768FF' },
  { name: 'Admin & Overhead', value: 10, color: '#0E1217' },
];

// Build a single conic-gradient string from the allocation percentages.
const donutGradient = computed(() => {
  let acc = 0;
  const stops = allocation.map((seg) => {
    const start = acc;
    acc += seg.value;
    return `${seg.color} ${start}% ${acc}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
});

function pickTier(id: number) {
  selectedTier.value = id;
  customAmount.value = '';
}

function pickCustom(value: string) {
  customAmount.value = value;
  selectedTier.value = -1;
}

function currentAmountKobo(): number {
  if (selectedTier.value >= 0) {
    const amounts = [5000, 25000, 100000];
    return (amounts[selectedTier.value] ?? 0) * 100;
  }
  const naira = parseInt(customAmount.value, 10);
  return Number.isFinite(naira) ? naira * 100 : 0;
}

async function handleDonateClick() {
  errorMessage.value = null;
  successRef.value = null;

  const amountKobo = currentAmountKobo();
  if (amountKobo <= 0) {
    errorMessage.value = 'Pick an amount or enter a custom value above ₦100.';
    return;
  }
  if (amountKobo < 100 * 100) {
    errorMessage.value = 'Minimum donation is ₦100.';
    return;
  }

  trackDonateStart({
    amount_kobo: amountKobo,
    frequency: frequency.value,
    tier: selectedTier.value >= 0 ? 'preset' : 'custom',
  });

  // Use the signed-in user's email if available; otherwise prompt.
  let email = auth.currentUser?.email ?? '';
  if (!email) {
    const entered = window.prompt('Enter your email for the donation receipt:');
    if (!entered) return;
    email = entered.trim();
  }

  submitting.value = true;
  try {
    const result = await launchPaystack({
      amountKobo,
      email,
      frequency: frequency.value,
      fullName: auth.currentUser?.displayName ?? undefined,
    });
    if (result.status === 'success' && result.reference) {
      successRef.value = result.reference;
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Donation failed.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <!-- Compliance-pending placeholder. Renders the full page below only
       when donationsEnabled flips true in src/config/features.ts. -->
  <div v-if="!donationsEnabled" class="flex flex-col bg-paper">
    <Section class="!py-24">
      <Container class="max-w-2xl text-center flex flex-col items-center gap-6">
        <Eyebrow class="text-brand-violet">Donations</Eyebrow>
        <Heading :level="1">Coming soon.</Heading>
        <Body large class="text-ink/70">
          We're finishing the compliance work needed to accept donations responsibly. The donation
          page will return as soon as that's done. Thanks for your patience — and for wanting to
          support STAIJA scholars.
        </Body>
        <UiButton variant="secondary" :to="'/'" class="mt-2"> Back to home </UiButton>
      </Container>
    </Section>
  </div>
  <div v-else class="flex flex-col bg-paper">
    <!-- Hero -->
    <Section class="!pb-16 md:!pb-24">
      <Container>
        <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <Motion
            class="flex flex-col gap-6"
            :initial="{ opacity: 0, y: 12 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.3 }"
          >
            <Heading :level="1" class="leading-[1.1]">
              Invest in Africa's <span class="text-brand-violet">scientific future</span>.
            </Heading>
            <Body large class="text-ink/70">
              100% of your donation directly funds student research, stipends, and materials.
            </Body>
          </Motion>

          <Motion
            class="relative aspect-square md:aspect-video lg:aspect-square rounded-2xl overflow-hidden"
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
            :transition="{ duration: 0.6, delay: 0.2 }"
          >
            <div
              class="absolute inset-0 wash-violet-6 mix-blend-multiply z-10 pointer-events-none"
            />
            <img
              src="https://images.unsplash.com/photo-1658252844173-ba5de80a3015?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080"
              alt="Student smiling"
              class="w-full h-full object-cover"
              loading="lazy"
            />
            <div
              class="absolute bottom-4 left-4 right-4 bg-surface/90 backdrop-blur-sm p-4 rounded-xl shadow-lg z-20 border hairline-ink"
            >
              <p class="font-sans font-medium text-sm text-ink mb-1 m-0">
                "₦25,000 funded Aisha's first research stipend."
              </p>
              <p class="text-xs text-ink/60 m-0">Aisha T., StepUp Scholar '23</p>
            </div>
          </Motion>
        </div>
      </Container>
    </Section>

    <!-- Tier Picker -->
    <Section class="bg-surface border-y hairline-ink relative z-10 !py-20">
      <Container class="max-w-4xl flex flex-col items-center">
        <div
          class="bg-paper p-1 rounded-full flex border hairline-ink mb-12 shadow-sm w-full max-w-[320px]"
        >
          <button
            type="button"
            class="flex-1 py-2.5 px-4 rounded-full text-sm font-bold transition-all"
            :class="
              frequency === 'one-time'
                ? 'bg-brand-violet text-white shadow-md'
                : 'text-ink/60 hover:text-ink hover:bg-ink/5'
            "
            @click="frequency = 'one-time'"
          >
            One-time
          </button>
          <button
            type="button"
            class="flex-1 py-2.5 px-4 rounded-full text-sm font-bold transition-all flex items-center justify-center gap-1.5"
            :class="
              frequency === 'monthly'
                ? 'bg-brand-violet text-white shadow-md'
                : 'text-ink/60 hover:text-ink hover:bg-ink/5'
            "
            @click="frequency = 'monthly'"
          >
            Monthly
            <span class="w-1.5 h-1.5 rounded-full bg-[#FFE500] animate-pulse" />
          </button>
        </div>

        <div class="grid md:grid-cols-3 gap-6 w-full mb-8">
          <Motion
            v-for="tier in tiers"
            :key="tier.id"
            :while-hover="{ y: -2 }"
            :transition="{ duration: 0.15 }"
          >
            <div
              class="relative h-full rounded-2xl p-6 cursor-pointer flex flex-col gap-4 text-center transition-all bg-surface"
              :class="
                selectedTier === tier.id
                  ? 'border-2 border-transparent border-gradient-brand shadow-lg'
                  : 'border border-ink/10 hover:border-ink/20 shadow-sm'
              "
              @click="pickTier(tier.id)"
            >
              <div
                v-if="tier.bestValue"
                class="absolute -top-3 left-1/2 -translate-x-1/2 bg-ink text-white text-[10px] font-bold uppercase tracking-wider py-1 px-3 rounded-full"
              >
                Best Value
              </div>

              <div class="font-display text-4xl text-ink font-semibold tracking-tight mt-2">
                {{ tier.amount }}
              </div>
              <div class="text-sm text-ink/70 leading-relaxed font-medium">
                {{ tier.impact }}
              </div>

              <div
                class="w-5 h-5 rounded-full border-2 mx-auto mt-auto flex items-center justify-center transition-colors"
                :class="selectedTier === tier.id ? 'border-brand-violet' : 'border-ink/20'"
              >
                <Motion
                  v-if="selectedTier === tier.id"
                  :initial="{ scale: 0 }"
                  :animate="{ scale: 1 }"
                  :exit="{ scale: 0 }"
                  class="w-2.5 h-2.5 bg-brand-violet rounded-full"
                />
              </div>
            </div>
          </Motion>
        </div>

        <div class="w-full max-w-[400px] flex gap-3 mb-10">
          <div class="relative flex-1">
            <span
              class="absolute left-4 top-1/2 -translate-y-1/2 text-ink/40 font-semibold font-display text-xl"
              >₦</span
            >
            <input
              type="number"
              placeholder="Custom amount"
              :value="customAmount"
              class="w-full bg-paper border rounded-xl py-3 pl-10 pr-4 text-lg font-medium focus:outline-none transition-all placeholder:text-ink/30 font-display"
              :class="
                customAmount && selectedTier === -1
                  ? 'border-brand-violet shadow-[0_0_0_2px_rgba(139,85,255,0.2)]'
                  : 'border-ink/10 focus:border-brand-violet'
              "
              @input="(e) => pickCustom((e.target as HTMLInputElement).value)"
            />
          </div>
        </div>

        <UiButton
          variant="gradient"
          class="w-full max-w-[320px] !text-lg !h-14 !rounded-2xl shadow-xl shadow-brand-violet/20 font-bold"
          :disabled="submitting"
          @click="handleDonateClick"
        >
          <span v-if="submitting">Opening checkout…</span>
          <span v-else>
            Donate {{ frequency === 'monthly' ? 'Monthly' : 'Now' }}
            <span v-if="currentAmountKobo() > 0" class="opacity-80"
              >| {{ formatNaira(currentAmountKobo()) }}</span
            >
          </span>
        </UiButton>

        <div
          v-if="errorMessage"
          role="alert"
          class="mt-4 max-w-[400px] text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
        >
          {{ errorMessage }}
        </div>

        <div
          v-if="successRef"
          role="status"
          class="mt-4 max-w-[400px] text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"
        >
          Thanks — your donation went through. Reference:
          <span class="font-mono">{{ successRef }}</span
          >. A receipt is on its way to your inbox.
        </div>

        <!-- Receipt Preview -->
        <div
          class="mt-12 bg-paper border hairline-ink rounded-xl p-4 flex items-start gap-4 max-w-[400px]"
        >
          <Icon icon="lucide:receipt-text" width="24" class="text-brand-violet shrink-0 mt-0.5" />
          <div>
            <h4 class="text-sm font-semibold text-ink mb-1 m-0">What happens next?</h4>
            <p class="text-xs text-ink/70 leading-relaxed m-0">
              You'll instantly receive a tax-deductible receipt via email. Expect an impact report
              at the end of the semester, and an option to be listed in our Annual Report.
            </p>
          </div>
        </div>
      </Container>
    </Section>

    <!-- Transparency Donut -->
    <Section class="bg-ink text-white !py-24">
      <Container>
        <div class="grid md:grid-cols-2 gap-16 items-center">
          <ScrollReveal>
            <Eyebrow class="text-white/50 mb-4 block">Transparency</Eyebrow>
            <Heading :level="2" class="mb-6 !text-white">Where the money goes.</Heading>
            <Body large class="!text-white/80 mb-8">
              We believe in radical transparency. Your donation isn't just a drop in the bucket;
              it's a measurable investment in a scholar's path.
            </Body>
            <div class="flex flex-col gap-4">
              <div v-for="seg in allocation" :key="seg.name" class="flex items-center gap-3">
                <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: seg.color }" />
                <span class="font-semibold text-lg w-12">{{ seg.value }}%</span>
                <span class="text-white/70">{{ seg.name }}</span>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal :delay="0.15" class="flex items-center justify-center">
            <div
              class="relative w-[280px] h-[280px] md:w-[340px] md:h-[340px] rounded-full"
              :style="{ background: donutGradient }"
            >
              <div class="absolute inset-[18%] rounded-full bg-ink" />
            </div>
          </ScrollReveal>
        </div>
      </Container>
    </Section>

    <!-- FAQ for donors -->
    <Section class="bg-paper">
      <Container class="max-w-3xl flex flex-col gap-8">
        <div class="flex items-center gap-3 justify-center mb-4">
          <Icon icon="lucide:help-circle" width="28" class="text-brand-violet" />
          <Heading :level="2">Donor FAQ</Heading>
        </div>

        <div class="flex flex-col gap-4">
          <ScrollReveal
            v-for="(faq, i) in [
              {
                q: 'Is my donation tax-deductible?',
                a: 'Yes, STAIJA is a registered 501(c)(3) in the US and a registered NGO in Nigeria.',
              },
              {
                q: 'Can I sponsor a specific student?',
                a: 'We pool donations to ensure all accepted students receive equitable support, but at the ₦100k tier, we will pair you with a cohort and send personalized updates.',
              },
              {
                q: 'How do I update my monthly giving?',
                a: 'You will receive a secure donor portal link in your receipt email where you can pause, cancel, or change your amount at any time.',
              },
            ]"
            :key="faq.q"
            :delay="i * 0.08"
          >
            <UiCard class="p-6 bg-surface">
              <h4 class="font-semibold text-lg mb-2 m-0">{{ faq.q }}</h4>
              <p class="text-ink/70 text-sm leading-relaxed m-0">{{ faq.a }}</p>
            </UiCard>
          </ScrollReveal>
        </div>
      </Container>
    </Section>
  </div>
</template>
