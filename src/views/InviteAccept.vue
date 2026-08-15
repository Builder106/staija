<script setup lang="ts">
/**
 * /invite/:token — landing page for staff-minted mentor invites.
 *
 * Flow:
 *   1. Read the token from the URL.
 *   2. Resolve the mentorInvites/{token} doc to show context
 *      (issuer name, expiry, email restriction if any) BEFORE asking
 *      the consumer to commit. A blind "click to accept" reads as a
 *      phishing link; surfacing who issued it is the trust signal.
 *   3. If the visitor isn't signed in, bounce them to /login with a
 *      `?redirect=/invite/<token>` query param so they come back
 *      here after auth.
 *   4. Signed-in user clicks "Accept invitation" → consumeMentorInvite
 *      fires → role flips to mentor → push to /mentor on success.
 *   5. Error surfaces in-page with the server's HttpsError message
 *      (expired, already used, email mismatch, etc.).
 */
import { Icon } from '@iconify/vue';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Eyebrow from '../components/ui/Eyebrow.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiCard from '../components/ui/UiCard.vue';
import { useAuth } from '../composables/useAuth';
import { db, functions } from '../config/firebase';
import type { MentorInvite } from '../services/types';

const route = useRoute();
const router = useRouter();
const { isAuthenticated, user } = useAuth();

const token = computed(() => String(route.params.token ?? ''));

const loading = ref(true);
const invite = ref<MentorInvite | null>(null);
/** Surfaces denied-read / nonexistent-doc separately from server-side
 *  consume errors so the empty-link case (bad URL) gets clear copy
 *  instead of "you don't have permission". */
const loadError = ref<string | null>(null);
const accepting = ref(false);
const acceptError = ref<string | null>(null);
const accepted = ref(false);

/** Optional profile metadata collected before the consume call.
 *  Both are skippable — the mentor can fill them in later from
 *  account settings. The callable trims + caps server-side so
 *  unsanitised input here is fine. */
const mentorBioInput = ref('');
const mentorAvailabilityInput = ref('');

/** Pre-flight read of the invite doc. mentorInvites is `allow get`
 *  for any signed-in user, so this works regardless of role. For
 *  signed-OUT visitors the read fails — we render a CTA to sign in
 *  with the invite-aware redirect query param instead. */
async function loadInvite() {
  if (!token.value) {
    loadError.value = 'This invitation link is missing its token.';
    loading.value = false;
    return;
  }
  try {
    const snap = await getDoc(doc(db, 'mentorInvites', token.value));
    if (!snap.exists()) {
      loadError.value = 'This invitation link is invalid or has been revoked.';
      return;
    }
    invite.value = snap.data() as MentorInvite;
  } catch {
    // For signed-out visitors the rules deny the read. Don't render
    // the "invalid token" copy in that case — the redirect-to-login
    // branch below handles it without a misleading error.
    if (isAuthenticated.value) {
      loadError.value = "We couldn't load this invitation. The link may be invalid or revoked.";
    }
  } finally {
    loading.value = false;
  }
}

const expired = computed(() => {
  if (!invite.value) return false;
  return typeof invite.value.expiresAt === 'number' && invite.value.expiresAt < Date.now();
});

const alreadyConsumedByMe = computed(
  () => invite.value?.consumed === true && invite.value.consumedBy === user.value?.uid
);
const alreadyConsumedBySomeoneElse = computed(
  () => invite.value?.consumed === true && invite.value.consumedBy !== user.value?.uid
);

const emailMismatch = computed(() => {
  if (!invite.value?.email) return false;
  const callerEmail = (user.value?.email ?? '').toLowerCase();
  return callerEmail !== invite.value.email;
});

const canAccept = computed(
  () =>
    isAuthenticated.value &&
    invite.value !== null &&
    !expired.value &&
    !alreadyConsumedBySomeoneElse.value &&
    !emailMismatch.value
);

function loginUrl(): string {
  return `/login?redirect=${encodeURIComponent(`/invite/${token.value}`)}`;
}

async function acceptInvite() {
  if (!canAccept.value || accepting.value) return;
  accepting.value = true;
  acceptError.value = null;
  try {
    const fn = httpsCallable<
      { token: string; bio?: string; availability?: string },
      { ok: true; changed: boolean }
    >(functions, 'consumeMentorInvite');
    await fn({
      token: token.value,
      bio: mentorBioInput.value.trim() || undefined,
      availability: mentorAvailabilityInput.value.trim() || undefined,
    });
    accepted.value = true;
    // Tiny delay so the success state paints visibly before we
    // navigate away — bouncing instantly to /mentor would feel
    // jarring and skip the "welcome aboard" moment.
    setTimeout(() => router.push('/mentor'), 1200);
  } catch (err) {
    acceptError.value =
      err instanceof Error
        ? err.message
        : "We couldn't accept this invitation. Try again, or email contact@staija.org.";
  } finally {
    accepting.value = false;
  }
}

function formatDate(ms: number | undefined): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

onMounted(loadInvite);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!py-24">
      <Container class="max-w-xl flex flex-col items-center text-center gap-6">
        <!-- Loading skeleton -->
        <template v-if="loading">
          <div class="h-4 w-24 bg-ink/5 rounded animate-pulse" />
          <div class="h-10 w-3/4 bg-ink/5 rounded animate-pulse" />
          <div class="h-24 w-full bg-ink/5 rounded-2xl animate-pulse" />
        </template>

        <!-- Not signed in: invite-aware login CTA. We don't try to
             render any invite context here — the prospective consumer
             can't read mentorInvites without auth, and showing
             "Someone invited you" without naming the issuer would be
             worse than asking them to sign in first. -->
        <template v-else-if="!isAuthenticated">
          <Eyebrow class="text-brand-violet">Mentor invitation</Eyebrow>
          <Heading :level="1" class="!text-3xl md:!text-4xl">
            You've been invited to mentor at STAIJA.
          </Heading>
          <Body class="text-ink/70">
            Sign in or create an account to see who invited you and accept your spot.
          </Body>
          <div class="flex flex-col sm:flex-row gap-3">
            <UiButton variant="gradient" :to="loginUrl()"> Sign in to accept </UiButton>
            <UiButton
              variant="secondary"
              :to="`/signup?redirect=${encodeURIComponent(`/invite/${token}`)}`"
            >
              Create an account
            </UiButton>
          </div>
        </template>

        <!-- Load-time error (bad token, revoked) -->
        <template v-else-if="loadError || !invite">
          <Icon icon="lucide:link-2-off" width="40" class="text-rose-700" />
          <Heading :level="2" class="!text-2xl">Invitation unavailable</Heading>
          <Body class="text-ink/70">
            {{ loadError ?? "We couldn't find this invitation." }}
          </Body>
          <UiButton variant="secondary" :to="'/'">Back to STAIJA</UiButton>
        </template>

        <!-- Success: just consumed -->
        <template v-else-if="accepted">
          <Icon icon="lucide:party-popper" width="44" class="text-emerald-700" />
          <Heading :level="2" class="!text-3xl">Welcome aboard.</Heading>
          <Body class="text-ink/70">
            You're set up as a STAIJA mentor. Taking you to your dashboard…
          </Body>
        </template>

        <!-- Already consumed by THIS user (idempotent re-visit) -->
        <template v-else-if="alreadyConsumedByMe">
          <Icon icon="lucide:check-circle-2" width="40" class="text-emerald-700" />
          <Heading :level="2" class="!text-2xl">You've already accepted this invitation.</Heading>
          <Body class="text-ink/70"> You're set up as a mentor. </Body>
          <UiButton variant="primary" :to="'/mentor'">Go to your dashboard</UiButton>
        </template>

        <!-- Already consumed by someone else -->
        <template v-else-if="alreadyConsumedBySomeoneElse">
          <Icon icon="lucide:link-2-off" width="40" class="text-rose-700" />
          <Heading :level="2" class="!text-2xl">This invitation has already been used.</Heading>
          <Body class="text-ink/70">
            If you think this is a mistake, email
            <a href="mailto:contact@staija.org" class="text-brand-violet hover:underline"
              >contact@staija.org</a
            >.
          </Body>
        </template>

        <!-- Expired -->
        <template v-else-if="expired">
          <Icon icon="lucide:clock-alert" width="40" class="text-amber-700" />
          <Heading :level="2" class="!text-2xl">This invitation has expired.</Heading>
          <Body class="text-ink/70">
            The link expired on {{ formatDate(invite.expiresAt) }}. Email the team for a fresh one:
            <a href="mailto:contact@staija.org" class="text-brand-violet hover:underline"
              >contact@staija.org</a
            >.
          </Body>
        </template>

        <!-- Email mismatch -->
        <template v-else-if="emailMismatch">
          <Icon icon="lucide:user-x" width="40" class="text-rose-700" />
          <Heading :level="2" class="!text-2xl">Wrong account.</Heading>
          <Body class="text-ink/70">
            This invitation is for
            <code class="font-mono text-sm bg-ink/5 px-1.5 py-0.5 rounded">{{ invite.email }}</code
            >. You're signed in as
            <code class="font-mono text-sm bg-ink/5 px-1.5 py-0.5 rounded">{{ user?.email }}</code
            >. Sign out and back in with the right address.
          </Body>
          <div class="flex flex-col sm:flex-row gap-3">
            <RouterLink
              to="/account/settings"
              class="inline-flex items-center justify-center gap-2 text-sm font-semibold text-brand-violet hover:underline focus-ring-brand rounded-sm px-4 py-2"
            >
              Switch accounts
            </RouterLink>
          </div>
        </template>

        <!-- Happy path: ready to consume -->
        <template v-else>
          <Eyebrow class="text-brand-violet">Mentor invitation</Eyebrow>
          <Heading :level="1" class="!text-3xl md:!text-4xl">
            {{ invite.createdByName }} invited you to mentor at STAIJA.
          </Heading>
          <UiCard class="p-6 md:p-8 bg-surface text-left w-full flex flex-col gap-4">
            <div class="flex items-start gap-3">
              <Icon icon="lucide:user-plus" width="22" class="text-brand-violet mt-0.5 shrink-0" />
              <Body class="text-ink/80 m-0">
                Accepting promotes your account to a mentor. You'll be able to schedule sessions
                with assigned students, leave feedback on their submissions, and join your cohort's
                mentor pool.
              </Body>
            </div>
            <div
              v-if="invite.note"
              class="text-sm text-ink/70 italic border-l-2 border-ink/15 pl-3"
            >
              "{{ invite.note }}"
            </div>
            <div class="text-xs text-ink/50">Expires {{ formatDate(invite.expiresAt) }}.</div>

            <!-- Optional profile metadata. Both fields skippable —
                 nothing requires them up-front; mentor can fill in
                 later from account settings. The callable trims +
                 caps server-side so what we send doesn't need
                 length/format guards here. -->
            <div class="flex flex-col gap-4 pt-2 mt-2 border-t hairline-ink">
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                  What's your area of expertise?
                  <span class="text-ink/40 normal-case">(optional)</span>
                </label>
                <textarea
                  v-model="mentorBioInput"
                  rows="3"
                  maxlength="1000"
                  placeholder="e.g. ML engineer at Spotify, focus on recommender systems and time-series. PhD in stats."
                  class="border hairline-ink rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all resize-y"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                  When are you available? <span class="text-ink/40 normal-case">(optional)</span>
                </label>
                <textarea
                  v-model="mentorAvailabilityInput"
                  rows="2"
                  maxlength="500"
                  placeholder="e.g. Weeknights after 7pm WAT, 2-3 hours/week. Async messaging works too."
                  class="border hairline-ink rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all resize-y"
                />
              </div>
            </div>
          </UiCard>
          <p
            v-if="acceptError"
            role="alert"
            class="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 m-0"
          >
            {{ acceptError }}
          </p>
          <div class="flex flex-col sm:flex-row gap-3">
            <UiButton variant="gradient" :disabled="accepting" @click="acceptInvite">
              <span class="flex items-center gap-2">
                <Icon
                  :icon="accepting ? 'lucide:loader-2' : 'lucide:check'"
                  width="16"
                  :class="accepting ? 'animate-spin' : ''"
                />
                {{ accepting ? 'Accepting…' : 'Accept invitation' }}
              </span>
            </UiButton>
            <UiButton variant="secondary" :to="'/'"> Not now </UiButton>
          </div>
        </template>
      </Container>
    </Section>
  </div>
</template>
