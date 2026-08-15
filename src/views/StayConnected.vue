<script setup lang="ts">
/**
 * /stay-connected — public hub for visitors who can't (or aren't
 * ready to) apply.
 *
 * Serves three roles in one page:
 *   1. Apply-flow fallback: closed-cycle or failed-eligibility
 *      visitors land here from `/apply/:program` with `?from=…&reason=…`
 *      query params. The hero adapts to that context.
 *   2. Permanent destination: linked from the home hero so future
 *      applicants and mentor-curious adults have a public landing.
 *   3. Mentor showcase: opted-in mentors surface here (read-only)
 *      so prospective applicants can see who's behind the program.
 *
 * No auth required — this page must work cold for anyone landing
 * from a referral link or a search result.
 *
 * Ambassador slot for the PCSE Campus Ambassador Kits ships separately
 * in Oct/Nov 2026, once the physical kits are out the door. The card
 * will slot in below ReferAFriend.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import BrowseCards from '../components/stay-connected/BrowseCards.vue';
import NotifyMeForm from '../components/stay-connected/NotifyMeForm.vue';
import OtherProgramSuggestion from '../components/stay-connected/OtherProgramSuggestion.vue';
import PublicMentorShowcase from '../components/stay-connected/PublicMentorShowcase.vue';
import ReferAFriend from '../components/stay-connected/ReferAFriend.vue';
import StayConnectedHero from '../components/stay-connected/StayConnectedHero.vue';
import Container from '../components/ui/Container.vue';
import Section from '../components/ui/Section.vue';

const route = useRoute();

// Query params arrive as string | string[] from vue-router; coerce to
// the first string and normalize. Empty string ("") is the "direct
// visit" sentinel that the sub-components treat as "no context."
const from = computed(() => {
  const v = route.query.from;
  return typeof v === 'string' ? v : '';
});
const reason = computed(() => {
  const v = route.query.reason;
  return typeof v === 'string' ? v : '';
});
// Referrer attribution from the URL. The shape (`u-<uid>` /
// `a-<short>`) is validated centrally inside `referrals.ts` — passing
// the raw value through to the hero is fine.
const referrerId = computed(() => {
  const v = route.query.ref;
  return typeof v === 'string' && v.length > 0 ? v : null;
});
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <StayConnectedHero :from="from" :reason="reason" :referrer-id="referrerId" />

    <Section class="!py-12">
      <Container class="max-w-3xl flex flex-col gap-8">
        <!-- Primary CTA: tagged newsletter opt-in. Above the fold on
             every screen size — this is what most visitors should do. -->
        <NotifyMeForm :from="from" :reason="reason" />

        <!-- Context-aware cross-promo: only renders for closed-cycle
             visitors (StepUp closed → see Dynamerge, etc.). Silent on
             direct visits and eligibility bounces. -->
        <OtherProgramSuggestion :from="from" :reason="reason" />

        <!-- Secondary CTA: refer someone who fits. -->
        <ReferAFriend :from="from" />

        <!-- Mentor showcase. Loads from getPublicMentors; empty
             state is acceptable until mentors opt in. -->
        <PublicMentorShowcase />

        <!-- Browse hub: blog / events / about. -->
        <BrowseCards />
      </Container>
    </Section>
  </div>
</template>
