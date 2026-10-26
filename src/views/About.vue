<script setup lang="ts">
import { Motion } from 'motion-v';
import Container from '../components/ui/Container.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiCard from '../components/ui/UiCard.vue';

// Real team members and advisors go here once we're ready to list them.
// Until then, the corresponding sections below render nothing rather
// than showing the same stock photo eight times under made-up names.
//
// Shape for TEAM entries: { name, title, img, bio }
// Shape for ADVISORS entries: a string like "Name (Affiliation)".
interface TeamMember {
  name: string;
  title: string;
  img: string;
  bio: string;
}
const TEAM: TeamMember[] = [];
const ADVISORS: string[] = [];
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <!-- Mission -->
    <Section class="!pt-24 md:!pt-32 !pb-16">
      <Container class="max-w-3xl">
        <Heading :level="1" class="leading-tight">
          Talent is evenly distributed across the continent. Opportunity, equipment, and mentorship
          are not.
        </Heading>
        <p class="mt-6 text-xl md:text-2xl text-ink/70">We are here to balance the equation.</p>
      </Container>
    </Section>

    <!-- Story -->
    <Section class="bg-surface !py-24 border-t hairline-ink">
      <Container class="max-w-3xl">
        <div class="flex flex-col gap-8 text-lg md:text-xl text-ink/80 leading-relaxed font-sans">
          <p class="m-0">
            STAIJA was started in 2023 by students about to enter college who wanted to prepare high
            school students for their own college journeys.
          </p>
          <p class="m-0">
            What started as a weekend seminar for 15 high-schoolers now runs programs across Africa.
            We learned early that teaching students <em>about</em> science wasn't enough; they
            needed to <em>do</em> science. That meant pipettes, sequencers, clean data sets, and
            mentors who treated them as future colleagues.
          </p>
          <p class="m-0">
            Today STAIJA runs two programs, StepUp Scholars in Nigeria and Dynamerge across Africa,
            and hosts the STAIJA Talks series for the wider community. Around 100 students have come
            through our programs over the last three years, and roughly 200 more have joined us at
            Talks. Our alumni have gone on to publish papers and start companies.
          </p>
        </div>
      </Container>
    </Section>

    <!-- Leadership Grid (renders only once the TEAM list has real entries) -->
    <Section v-if="TEAM.length > 0" class="bg-paper !py-24">
      <Container>
        <div class="text-center mb-16">
          <Heading :level="2">Leadership Team</Heading>
        </div>
        <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <Motion
            v-for="(member, i) in TEAM"
            :key="member.name"
            :initial="{ opacity: 0, y: 20 }"
            :while-in-view="{ opacity: 1, y: 0 }"
            :viewport="{ once: true }"
            :transition="{ delay: (i % 4) * 0.1 }"
          >
            <UiCard class="overflow-hidden bg-surface group">
              <div class="aspect-square relative overflow-hidden border-b hairline-ink">
                <div
                  class="absolute inset-0 wash-violet-6 mix-blend-multiply opacity-0 group-hover:opacity-100 transition-opacity z-10"
                />
                <img
                  :src="member.img"
                  :alt="member.name"
                  width="400"
                  height="400"
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div class="p-6">
                <h4
                  class="font-display text-xl font-semibold mb-1 group-hover:text-brand-violet transition-colors m-0"
                >
                  {{ member.name }}
                </h4>
                <p class="text-sm font-semibold text-ink/60 uppercase tracking-wide mb-3 m-0">
                  {{ member.title }}
                </p>
                <p class="text-sm text-ink/80 leading-relaxed m-0">{{ member.bio }}</p>
              </div>
            </UiCard>
          </Motion>
        </div>
      </Container>
    </Section>

    <!-- Board + Advisors (renders only once the ADVISORS list has real entries) -->
    <Section v-if="ADVISORS.length > 0" class="bg-surface !py-24 border-t hairline-ink">
      <Container class="max-w-4xl text-center">
        <Heading :level="3" class="mb-12">Board & Advisors</Heading>
        <div class="flex flex-wrap justify-center gap-x-8 gap-y-4">
          <span
            v-for="advisor in ADVISORS"
            :key="advisor"
            class="text-lg font-medium text-ink/70 px-4 py-2 bg-ink/5 rounded-full"
            >{{ advisor }}</span
          >
        </div>
      </Container>
    </Section>
  </div>
</template>
