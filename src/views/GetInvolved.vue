<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Motion } from 'motion-v';
import { computed, ref } from 'vue';
import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Eyebrow from '../components/ui/Eyebrow.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiCard from '../components/ui/UiCard.vue';
import { trackInquirySubmit } from '../services/analytics';

type InquiryType = 'volunteer' | 'partner' | 'intern';
const TAB_TO_INQUIRY: Record<string, InquiryType> = {
  mentor: 'volunteer',
  partner: 'partner',
  intern: 'intern',
};

function handleInquirySubmit(e: Event) {
  e.preventDefault();
  trackInquirySubmit({ type: TAB_TO_INQUIRY[activeTab.value] ?? 'volunteer' });
  // TODO: post to backend (M2/M3 follow-up)
}

const tabs = [
  { id: 'mentor', label: 'Volunteer / Mentor', icon: 'lucide:users' },
  { id: 'partner', label: 'Partner', icon: 'lucide:building-2' },
  { id: 'intern', label: 'Intern', icon: 'lucide:graduation-cap' },
] as const;

const content = {
  mentor: {
    title: 'Guide the next generation.',
    desc: 'We are looking for scientists, researchers, and tech professionals to mentor our scholars. Share your expertise, review research proposals, or lead a virtual workshop.',
    eligibility: [
      'Currently in a STEM profession or postgraduate study',
      'Passionate about youth development',
      'Can commit 2-4 hours per month',
    ],
    success: 'Seeing your mentee confidently present their first research abstract.',
    formFields: [
      { name: 'name', label: 'Full Name', type: 'text' },
      { name: 'email', label: 'Email Address', type: 'email' },
      { name: 'linkedin', label: 'LinkedIn Profile URL', type: 'url' },
      { name: 'field', label: 'Area of Expertise', type: 'text' },
      { name: 'why', label: 'Why do you want to mentor?', type: 'textarea' },
    ],
  },
  partner: {
    title: 'Scale our impact together.',
    desc: 'Universities, research institutes, and corporations can partner with STAIJA to provide lab space, fund cohorts, or offer internships to our alumni.',
    eligibility: [
      'Registered organization or academic institution',
      'Aligned with our mission to democratize STEM access',
      'Capacity to offer resources or funding',
    ],
    success: 'Building a robust pipeline of diverse scientific talent for your organization.',
    formFields: [
      { name: 'orgName', label: 'Organization Name', type: 'text' },
      { name: 'contactName', label: 'Contact Person', type: 'text' },
      { name: 'email', label: 'Work Email', type: 'email' },
      { name: 'type', label: 'Partnership Type (Funding, Lab Space, etc.)', type: 'text' },
      { name: 'message', label: 'How would you like to collaborate?', type: 'textarea' },
    ],
  },
  intern: {
    title: 'Learn how a nonprofit works.',
    desc: 'Join our core team for a 3-month remote internship. Help us with communications, program operations, or data analysis while gaining valuable experience.',
    eligibility: [
      'Current undergraduate or recent graduate',
      'Strong communication and organizational skills',
      'Can commit 10-15 hours per week',
    ],
    success: 'Leading a key operational project and earning a glowing recommendation.',
    formFields: [
      { name: 'name', label: 'Full Name', type: 'text' },
      { name: 'email', label: 'Email Address', type: 'email' },
      { name: 'university', label: 'University', type: 'text' },
      { name: 'role', label: 'Desired Role (Ops, Comms, Data)', type: 'text' },
      { name: 'cover', label: 'Brief Cover Letter', type: 'textarea' },
    ],
  },
} as const;

type TabId = keyof typeof content;
const activeTab = ref<TabId>('mentor');
const activeContent = computed(() => content[activeTab.value]);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pb-8 !pt-16 md:!pt-24 text-center">
      <Container class="max-w-3xl">
        <Eyebrow class="text-brand-violet mb-4 block">Get Involved</Eyebrow>
        <Heading :level="1" class="mb-6"
          >Join the <span class="text-brand-violet">movement</span>.</Heading
        >
        <Body large class="mb-16">
          Whether you have an hour a month or a lab to share, there's a place for you in the STAIJA
          community. Choose a path below to apply.
        </Body>

        <div
          class="flex flex-wrap justify-center gap-4 bg-surface p-2 rounded-2xl border hairline-ink shadow-sm w-fit mx-auto"
        >
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all focus-ring-brand"
            :class="
              activeTab === tab.id
                ? 'bg-brand-violet text-white shadow-md'
                : 'text-ink/60 hover:text-ink hover:bg-ink/5'
            "
            @click="activeTab = tab.id"
          >
            <Icon :icon="tab.icon" width="18" />
            {{ tab.label }}
          </button>
        </div>
      </Container>
    </Section>

    <Section class="!pt-8 !pb-24 flex-1">
      <Container class="max-w-5xl">
        <Motion
          :key="activeTab"
          :initial="{ opacity: 0, y: 10 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.2 }"
          class="grid md:grid-cols-12 gap-12 lg:gap-16 items-start"
        >
          <div class="md:col-span-5 flex flex-col gap-8 md:sticky md:top-32">
            <div>
              <Heading :level="2" class="!text-3xl mb-4 leading-tight">{{
                activeContent.title
              }}</Heading>
              <Body class="text-ink/70">{{ activeContent.desc }}</Body>
            </div>
            <div>
              <h4 class="font-semibold text-sm uppercase tracking-wider text-brand-violet mb-3">
                Eligibility & Commitment
              </h4>
              <ul class="flex flex-col gap-2.5 list-none p-0 m-0">
                <li
                  v-for="item in activeContent.eligibility"
                  :key="item"
                  class="flex items-start gap-2 text-sm text-ink/80"
                >
                  <div class="w-1.5 h-1.5 rounded-full bg-ink/20 mt-1.5 shrink-0" />
                  {{ item }}
                </li>
              </ul>
            </div>
            <UiCard
              class="p-5 bg-surface !border-brand-violet/20 shadow-sm relative overflow-hidden"
            >
              <div class="absolute top-0 left-0 w-1 h-full bg-gradient-brand" />
              <h4 class="font-semibold text-sm uppercase tracking-wider text-ink/40 mb-2 m-0">
                What success looks like
              </h4>
              <p class="text-ink font-medium leading-relaxed m-0">"{{ activeContent.success }}"</p>
            </UiCard>
          </div>

          <UiCard class="md:col-span-7 p-8 md:p-10 bg-surface">
            <form class="flex flex-col gap-6" @submit="handleInquirySubmit">
              <div class="mb-2">
                <Heading :level="3" class="!text-2xl mb-2">Application Form</Heading>
                <p class="text-sm text-ink/60 m-0">
                  We review applications on a rolling basis. Expect a reply within 5 days.
                </p>
              </div>

              <div
                v-for="field in activeContent.formFields"
                :key="field.name"
                class="flex flex-col gap-2"
              >
                <label class="text-sm font-semibold text-ink/80">{{ field.label }}</label>
                <textarea
                  v-if="field.type === 'textarea'"
                  class="w-full border hairline-ink rounded-xl p-4 min-h-[120px] focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm resize-y bg-surface"
                  :placeholder="`Enter your ${field.label.toLowerCase()}`"
                  required
                />
                <input
                  v-else
                  :type="field.type"
                  class="w-full border hairline-ink rounded-xl p-4 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-surface"
                  :placeholder="`Enter your ${field.label.toLowerCase()}`"
                  required
                />
              </div>

              <div class="pt-4 border-t hairline-ink mt-2">
                <UiButton
                  variant="primary"
                  type="submit"
                  class="w-full md:w-auto !h-12 text-base !px-8 group"
                >
                  <span class="flex items-center gap-2">
                    Submit Application
                    <Icon
                      icon="lucide:arrow-right"
                      width="18"
                      class="transition-transform group-hover:translate-x-1"
                    />
                  </span>
                </UiButton>
              </div>
            </form>
          </UiCard>
        </Motion>
      </Container>
    </Section>
  </div>
</template>
