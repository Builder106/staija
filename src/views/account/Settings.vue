<script setup lang="ts">
import { Icon } from '@iconify/vue';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  updatePassword,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import AnimatedAvatar from '../../components/avatars/AnimatedAvatar.vue';
import AvatarPicker from '../../components/avatars/AvatarPicker.vue';
import LottieAvatar from '../../components/avatars/LottieAvatar.vue';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiCard from '../../components/ui/UiCard.vue';
import { useAuth } from '../../composables/useAuth';
import { functions } from '../../config/firebase';
import { AuthService } from '../../services/auth';
import { avatarSeedFor, resolveAvatarSrc } from '../../services/avatar';
import { hasLottieForSlot, loadLottieForSlot } from '../../services/avatar/lotties';
import { DatabaseService } from '../../services/database';
import { StorageService } from '../../services/storageService';
import type { EmailPreferences } from '../../services/types';

const router = useRouter();
const { user, userProfile, displayName, signOut, refreshProfile } = useAuth();

// --- Profile editor ---------------------------------------------------

const BIO_MAX = 280;

interface ProfileForm {
  displayName: string;
  bio: string;
  photoURL: string;
  avatarSlot: number | null;
}

const form = ref<ProfileForm>({ displayName: '', bio: '', photoURL: '', avatarSlot: null });
const original = ref<ProfileForm>({ displayName: '', bio: '', photoURL: '', avatarSlot: null });

watch(
  userProfile,
  (p) => {
    form.value.displayName = p?.displayName ?? '';
    form.value.bio = p?.bio ?? '';
    form.value.photoURL = p?.photoURL ?? '';
    form.value.avatarSlot = p?.avatarSlot ?? null;
    original.value = { ...form.value };
  },
  { immediate: true },
);

const dirty = computed(
  () =>
    form.value.displayName !== original.value.displayName ||
    form.value.bio !== original.value.bio ||
    form.value.photoURL !== original.value.photoURL ||
    form.value.avatarSlot !== original.value.avatarSlot,
);
const bioOver = computed(() => form.value.bio.length > BIO_MAX);
const canSave = computed(() => dirty.value && !bioOver.value && !saving.value && !uploading.value);

const saving = ref(false);
const uploading = ref(false);
const saveError = ref<string | null>(null);
const saveSuccess = ref(false);

async function handleAvatar(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !user.value) return;
  if (!file.type.startsWith('image/')) {
    saveError.value = 'Avatar must be an image.';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    saveError.value = 'Avatar must be under 2 MB.';
    return;
  }
  uploading.value = true;
  saveError.value = null;
  try {
    const path = `avatars/${user.value.uid}/${Date.now()}_${file.name}`;
    const url = await StorageService.uploadFile(file, path);
    form.value.photoURL = url;
    await AuthService.updateProfile({ photoURL: url });
  } catch (err) {
    saveError.value = (err as { message?: string }).message ?? 'Upload failed.';
  } finally {
    uploading.value = false;
    input.value = '';
  }
}

// --- Avatar picker ---------------------------------------------------

const pickerOpen = ref(false);

function openPicker() {
  pickerOpen.value = true;
}

function applyPickedSlot(slot: number | null) {
  // Picking a slot is a deliberate choice. Drop the uploaded photo so
  // the picked portrait is the one that renders. The user can re-upload
  // any time; the slot persists underneath.
  form.value.avatarSlot = slot;
  if (slot !== null) form.value.photoURL = '';
}

async function handleSave() {
  if (!canSave.value || !user.value) return;
  saving.value = true;
  saveError.value = null;
  saveSuccess.value = false;
  try {
    const updates: Record<string, string | number | null> = {};
    if (form.value.displayName !== original.value.displayName)
      updates.displayName = form.value.displayName.trim();
    if (form.value.bio !== original.value.bio) updates.bio = form.value.bio.trim();
    if (form.value.photoURL !== original.value.photoURL) updates.photoURL = form.value.photoURL;
    if (form.value.avatarSlot !== original.value.avatarSlot)
      updates.avatarSlot = form.value.avatarSlot;

    await DatabaseService.updateUserProfile(user.value.uid, updates);

    if ('displayName' in updates || 'photoURL' in updates) {
      await AuthService.updateProfile({
        displayName:
          typeof updates.displayName === 'string' ? updates.displayName : form.value.displayName,
        photoURL: typeof updates.photoURL === 'string' ? updates.photoURL : form.value.photoURL,
      });
    }

    await refreshProfile();
    original.value = { ...form.value };
    saveSuccess.value = true;
    setTimeout(() => (saveSuccess.value = false), 3000);
  } catch (err) {
    saveError.value = (err as { message?: string }).message ?? 'Could not save changes.';
  } finally {
    saving.value = false;
  }
}

function handleReset() {
  form.value = { ...original.value };
  saveError.value = null;
}

// --- Mentor profile editor -------------------------------------------
//
// Only rendered when userProfile.role === 'mentor'. mentorBio +
// mentorAvailability are initially captured on the /invite landing
// page during onboarding (both optional there), and this surface
// lets mentors edit them after the fact without going through
// admin. Lives in its own form (not the public-profile form above)
// so saving "what I'm an expert in" doesn't accidentally commit a
// half-finished displayName edit and vice versa.

const MENTOR_BIO_MAX = 1000;
const MENTOR_AVAILABILITY_MAX = 500;

interface MentorForm {
  mentorBio: string;
  mentorAvailability: string;
  mentorPublicProfile: boolean;
}

const mentorForm = ref<MentorForm>({
  mentorBio: '',
  mentorAvailability: '',
  mentorPublicProfile: false,
});
const mentorOriginal = ref<MentorForm>({
  mentorBio: '',
  mentorAvailability: '',
  mentorPublicProfile: false,
});

watch(
  userProfile,
  (p) => {
    mentorForm.value.mentorBio = p?.mentorBio ?? '';
    mentorForm.value.mentorAvailability = p?.mentorAvailability ?? '';
    mentorForm.value.mentorPublicProfile = p?.mentorPublicProfile === true;
    mentorOriginal.value = { ...mentorForm.value };
  },
  { immediate: true },
);

const mentorDirty = computed(
  () =>
    mentorForm.value.mentorBio !== mentorOriginal.value.mentorBio ||
    mentorForm.value.mentorAvailability !== mentorOriginal.value.mentorAvailability ||
    mentorForm.value.mentorPublicProfile !== mentorOriginal.value.mentorPublicProfile,
);
const mentorBioOver = computed(() => mentorForm.value.mentorBio.length > MENTOR_BIO_MAX);
const mentorAvailabilityOver = computed(
  () => mentorForm.value.mentorAvailability.length > MENTOR_AVAILABILITY_MAX,
);
const mentorSaving = ref(false);
const mentorSaveError = ref<string | null>(null);
const mentorSaveSuccess = ref(false);
const canSaveMentor = computed(
  () =>
    mentorDirty.value &&
    !mentorBioOver.value &&
    !mentorAvailabilityOver.value &&
    !mentorSaving.value,
);

async function handleSaveMentor() {
  if (!canSaveMentor.value || !user.value) return;
  mentorSaving.value = true;
  mentorSaveError.value = null;
  mentorSaveSuccess.value = false;
  try {
    const updates: Record<string, string | boolean> = {};
    if (mentorForm.value.mentorBio !== mentorOriginal.value.mentorBio) {
      updates.mentorBio = mentorForm.value.mentorBio.trim();
    }
    if (mentorForm.value.mentorAvailability !== mentorOriginal.value.mentorAvailability) {
      updates.mentorAvailability = mentorForm.value.mentorAvailability.trim();
    }
    if (mentorForm.value.mentorPublicProfile !== mentorOriginal.value.mentorPublicProfile) {
      updates.mentorPublicProfile = mentorForm.value.mentorPublicProfile;
    }
    await DatabaseService.updateUserProfile(user.value.uid, updates);
    await refreshProfile();
    mentorOriginal.value = { ...mentorForm.value };
    mentorSaveSuccess.value = true;
    setTimeout(() => (mentorSaveSuccess.value = false), 3000);
  } catch (err) {
    mentorSaveError.value = (err as { message?: string }).message ?? 'Could not save changes.';
  } finally {
    mentorSaving.value = false;
  }
}

function handleResetMentor() {
  mentorForm.value = { ...mentorOriginal.value };
  mentorSaveError.value = null;
}

function getInitials(name: string | null | undefined) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Avatar shown in the profile editor. Uses the resolver in the
// avatar service so the precedence (uploaded > picked slot > seeded
// default) stays in one place.
const avatarSeed = computed(() =>
  user.value ? avatarSeedFor({ uid: user.value.uid, email: user.value.email }) : 'staija-default',
);

const resolvedAvatarSrc = computed(() => {
  if (!user.value) return null;
  return resolveAvatarSrc({
    photoURL: form.value.photoURL || null,
    avatarSlot: form.value.avatarSlot,
    seed: avatarSeed.value,
  });
});

// True when the resolved avatar is the user's uploaded photo (vs.
// generated). Affects which display container the markup uses.
const showingUploadedPhoto = computed(() => Boolean(form.value.photoURL));

// The actual slot whose portrait is currently displayed. Used to
// decide whether to swap in the Lottie variant. `null` when no
// generated avatar applies (uploaded photo or pre-load).
const UNIVERSAL_DEFAULT_SLOT = 6;
const displayedSlot = computed<number | null>(() => {
  if (!user.value || form.value.photoURL) return null;
  return typeof form.value.avatarSlot === 'number' ? form.value.avatarSlot : UNIVERSAL_DEFAULT_SLOT;
});

const lottieAvailable = computed(
  () => displayedSlot.value !== null && hasLottieForSlot(displayedSlot.value),
);

// Lazily-loaded Lottie JSON for the displayed slot. Reloaded when
// the slot changes (picker apply, photo upload/clear).
const lottieAnimation = ref<Record<string, unknown> | null>(null);
watch(
  displayedSlot,
  async (slot) => {
    if (slot === null || !hasLottieForSlot(slot)) {
      lottieAnimation.value = null;
      return;
    }
    lottieAnimation.value = await loadLottieForSlot(slot);
  },
  { immediate: true },
);

function formatDate(date: unknown): string {
  if (!date) return '—';
  const candidate =
    typeof (date as { toDate?: () => Date })?.toDate === 'function'
      ? (date as { toDate: () => Date }).toDate()
      : (date as Date | string);
  const d = new Date(candidate as Date | string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// --- Notifications ----------------------------------------------------

// Newsletter is omitted until the Mailgun mailing list is set up
// (MAILGUN_LIST_ADDRESS secret + setNewsletterSubscription re-exported
// from functions/src/index.ts). Showing a toggle that doesn't actually
// affect Mailgun list membership would mislead users.
const notifKeys: { key: keyof EmailPreferences; label: string; description: string }[] = [
  {
    key: 'eventReminders',
    label: 'Event reminders',
    description: 'Reminders before workshops, info sessions, and other events you registered for.',
  },
  {
    key: 'mentorNotifications',
    label: 'Mentor notifications',
    description: 'New feedback from your mentor, session check-ins, and assignment updates.',
  },
  {
    key: 'productUpdates',
    label: 'Product updates',
    description: 'Occasional notes about new STAIJA features or programs.',
  },
];

const notifPrefs = ref<EmailPreferences>({});
const notifOriginal = ref<EmailPreferences>({});
watch(
  userProfile,
  (p) => {
    notifPrefs.value = { ...(p?.emailPreferences ?? {}) };
    notifOriginal.value = { ...notifPrefs.value };
  },
  { immediate: true },
);

const notifDirty = computed(() =>
  notifKeys.some(
    (k) => isEnabled(notifPrefs.value, k.key) !== isEnabled(notifOriginal.value, k.key),
  ),
);
const notifSaving = ref(false);
const notifMessage = ref<string | null>(null);

function isEnabled(prefs: EmailPreferences, key: keyof EmailPreferences): boolean {
  // Default to true: missing field means "opted in" so we don't silently
  // mute users who predate the toggles.
  return prefs[key] !== false;
}

function toggleNotif(key: keyof EmailPreferences) {
  notifPrefs.value = { ...notifPrefs.value, [key]: !isEnabled(notifPrefs.value, key) };
}

async function saveNotifs() {
  if (!user.value || !notifDirty.value) return;
  notifSaving.value = true;
  notifMessage.value = null;
  try {
    await DatabaseService.updateUserProfile(user.value.uid, {
      emailPreferences: { ...notifPrefs.value },
    });
    notifOriginal.value = { ...notifPrefs.value };
    await refreshProfile();
    notifMessage.value = 'Saved.';
    setTimeout(() => (notifMessage.value = null), 3000);
  } catch (err) {
    notifMessage.value = (err as { message?: string }).message ?? 'Could not save preferences.';
  } finally {
    notifSaving.value = false;
  }
}

// --- Security ---------------------------------------------------------

const hasPasswordProvider = computed(
  () => user.value?.providerData?.some((p) => p.providerId === 'password') ?? false,
);
const sendingVerification = ref(false);
const verificationMessage = ref<string | null>(null);

async function resendVerification() {
  if (!user.value || sendingVerification.value) return;
  sendingVerification.value = true;
  verificationMessage.value = null;
  try {
    await sendEmailVerification(user.value);
    verificationMessage.value = `Verification email sent to ${user.value.email}.`;
  } catch (err) {
    verificationMessage.value = (err as { message?: string }).message ?? 'Could not send.';
  } finally {
    sendingVerification.value = false;
  }
}

const showPwForm = ref(false);
const pwCurrent = ref('');
const pwNew = ref('');
const pwNewConfirm = ref('');
const pwSaving = ref(false);
const pwError = ref<string | null>(null);
const pwSuccess = ref(false);

const pwValid = computed(
  () => pwCurrent.value.length > 0 && pwNew.value.length >= 8 && pwNew.value === pwNewConfirm.value,
);

async function changePassword() {
  if (!pwValid.value || !user.value || !user.value.email || pwSaving.value) return;
  pwSaving.value = true;
  pwError.value = null;
  pwSuccess.value = false;
  try {
    const cred = EmailAuthProvider.credential(user.value.email, pwCurrent.value);
    await reauthenticateWithCredential(user.value, cred);
    await updatePassword(user.value, pwNew.value);
    pwCurrent.value = '';
    pwNew.value = '';
    pwNewConfirm.value = '';
    showPwForm.value = false;
    pwSuccess.value = true;
    setTimeout(() => (pwSuccess.value = false), 4000);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      pwError.value = 'Current password is incorrect.';
    } else if (code === 'auth/weak-password') {
      pwError.value = 'New password is too weak. Use at least 8 characters.';
    } else {
      pwError.value = (err as { message?: string }).message ?? 'Could not change password.';
    }
  } finally {
    pwSaving.value = false;
  }
}

const signingOutEverywhere = ref(false);
const signOutMessage = ref<string | null>(null);

async function signOutEverywhere() {
  if (signingOutEverywhere.value) return;
  signingOutEverywhere.value = true;
  signOutMessage.value = null;
  try {
    const callable = httpsCallable<Record<string, never>, { ok: boolean }>(
      functions,
      'signOutEverywhere',
    );
    await callable({});
    await signOut();
    router.replace({ path: '/login', query: { signedOutEverywhere: '1' } });
  } catch (err) {
    signOutMessage.value =
      (err as { message?: string }).message ?? 'Could not sign out other sessions.';
    signingOutEverywhere.value = false;
  }
}

// --- Privacy ----------------------------------------------------------

const directoryHidden = ref(false);
watch(
  userProfile,
  (p) => {
    directoryHidden.value = p?.directoryHidden === true;
  },
  { immediate: true },
);
const showDirectoryToggle = computed(() =>
  ['alumni', 'admin'].includes(userProfile.value?.role ?? ''),
);
const directorySaving = ref(false);

async function toggleDirectory() {
  if (!user.value || directorySaving.value) return;
  directorySaving.value = true;
  const next = !directoryHidden.value;
  try {
    await DatabaseService.updateUserProfile(user.value.uid, { directoryHidden: next });
    directoryHidden.value = next;
    await refreshProfile();
  } catch (err) {
    console.error('toggle directory', err);
  } finally {
    directorySaving.value = false;
  }
}

const exporting = ref(false);
const exportError = ref<string | null>(null);

async function exportData() {
  if (exporting.value) return;
  exporting.value = true;
  exportError.value = null;
  try {
    const callable = httpsCallable<Record<string, never>, Record<string, unknown>>(
      functions,
      'exportUserData',
    );
    const result = await callable({});
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `staija-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    exportError.value = (err as { message?: string }).message ?? 'Could not export data.';
  } finally {
    exporting.value = false;
  }
}

// --- Account deletion -------------------------------------------------

const SELF_DELETABLE = new Set(['applicant', 'student', 'alumni', 'mentor']);
const canSelfDelete = computed(() =>
  userProfile.value?.role ? SELF_DELETABLE.has(userProfile.value.role) : true,
);

const showConfirm = ref(false);
const confirmText = ref('');
const deleting = ref(false);
const deleteError = ref<string | null>(null);
const confirmReady = computed(() => confirmText.value.trim() === 'DELETE');

async function handleDelete() {
  if (!confirmReady.value || deleting.value) return;
  deleting.value = true;
  deleteError.value = null;
  try {
    const callable = httpsCallable<Record<string, never>, { ok: boolean }>(
      functions,
      'deleteAccount',
    );
    await callable({});
    await signOut();
    router.replace({ path: '/', query: { deleted: '1' } });
  } catch (err) {
    deleteError.value =
      (err as { message?: string }).message ?? 'Could not delete your account. Try again.';
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-12 !pb-8 wash-violet-6 border-b hairline-ink">
      <Container class="max-w-3xl">
        <Eyebrow class="text-brand-violet mb-3 block">Account settings</Eyebrow>
        <Heading :level="1" class="mb-3">
          Your <span class="text-brand-violet">account</span>.
        </Heading>
        <Body class="text-ink/70"
          >Manage your STAIJA profile, account info, and personal data.</Body
        >
      </Container>
    </Section>

    <Section class="!py-12">
      <Container class="max-w-3xl flex flex-col gap-8">
        <!-- Profile editor -->
        <UiCard class="p-6 md:p-10 bg-surface">
          <Eyebrow class="text-brand-violet mb-3 block">Profile</Eyebrow>
          <Heading :level="2" class="mb-2 text-xl">Public profile</Heading>
          <Body class="text-ink/60 text-sm mb-8">
            How you appear to mentors, peers, and the rest of the STAIJA community.
          </Body>

          <div class="flex flex-col gap-6">
            <div class="flex items-center gap-5">
              <!--
                Lottie variant when an animation exists for the user's
                slot, otherwise AnimatedAvatar. state="idle" runs the
                shared breath cycle (1.8% scale, 4.2s sine, infinite,
                phase-jittered per mount). Now safe to leave on with
                PNG rendering — the bitmap is rasterized once and
                composited via GPU.
              -->
              <LottieAvatar
                v-if="lottieAvailable && lottieAnimation && !showingUploadedPhoto"
                :animation-data="lottieAnimation"
                :fallback-src="resolvedAvatarSrc!"
                :alt="`${displayName ?? 'Your'} avatar`"
                :size="80"
                class="flex-shrink-0"
              />
              <AnimatedAvatar
                v-else-if="resolvedAvatarSrc && !showingUploadedPhoto"
                :src="resolvedAvatarSrc"
                :alt="`${displayName ?? 'Your'} avatar`"
                state="idle"
                :size="80"
                class="flex-shrink-0"
              />
              <div
                v-else
                class="w-20 h-20 rounded-full bg-brand-violet/10 text-brand-violet flex items-center justify-center text-xl font-semibold flex-shrink-0 overflow-hidden"
              >
                <img
                  v-if="showingUploadedPhoto"
                  :src="form.photoURL"
                  alt=""
                  class="w-full h-full object-cover"
                />
                <span v-else>{{ getInitials(displayName) }}</span>
              </div>
              <div class="flex flex-col gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <label
                    class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border hairline-ink text-xs font-medium cursor-pointer hover:bg-ink/5 transition-colors w-fit"
                    :class="uploading ? 'opacity-50 pointer-events-none' : ''"
                  >
                    <Icon
                      :icon="uploading ? 'lucide:loader-2' : 'lucide:upload'"
                      width="14"
                      :class="uploading ? 'animate-spin' : ''"
                    />
                    {{ uploading ? 'Uploading…' : 'Upload photo' }}
                    <input
                      type="file"
                      accept="image/*"
                      class="hidden"
                      :disabled="uploading"
                      @change="handleAvatar"
                    />
                  </label>
                  <button
                    type="button"
                    class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border hairline-ink text-xs font-medium hover:bg-ink/5 transition-colors w-fit"
                    @click="openPicker"
                  >
                    <Icon icon="lucide:images" width="14" />
                    Choose from gallery
                  </button>
                </div>
                <p class="text-xs text-ink/50">
                  PNG or JPG, max 2 MB. Or pick a portrait from the gallery.
                </p>
              </div>
            </div>

            <AvatarPicker
              :open="pickerOpen"
              :current="form.avatarSlot"
              :seed="avatarSeed"
              @close="pickerOpen = false"
              @apply="applyPickedSlot"
            />

            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                >Display name</label
              >
              <input
                v-model="form.displayName"
                type="text"
                placeholder="Your name"
                maxlength="80"
                class="w-full px-4 py-2.5 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet"
              />
            </div>

            <div class="flex flex-col gap-2">
              <div class="flex items-end justify-between">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">Bio</label>
                <span
                  class="text-xs"
                  :class="bioOver ? 'text-red-600 font-semibold' : 'text-ink/40'"
                >
                  {{ form.bio.length }} / {{ BIO_MAX }}
                </span>
              </div>
              <textarea
                v-model="form.bio"
                rows="4"
                placeholder="A short intro — what you're studying, what you're curious about."
                class="w-full px-4 py-3 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet resize-none"
              ></textarea>
            </div>

            <p v-if="saveError" class="text-sm text-red-700">{{ saveError }}</p>
            <p v-else-if="saveSuccess" class="text-sm text-emerald-700">
              <Icon icon="lucide:check" width="14" class="inline -mt-0.5" /> Saved.
            </p>

            <div class="flex flex-wrap gap-3 pt-2">
              <UiButton variant="primary" :disabled="!canSave" @click="handleSave">
                <Icon v-if="saving" icon="lucide:loader-2" width="14" class="animate-spin" />
                {{ saving ? 'Saving…' : 'Save changes' }}
              </UiButton>
              <UiButton variant="secondary" :disabled="!dirty || saving" @click="handleReset"
                >Reset</UiButton
              >
            </div>
          </div>
        </UiCard>

        <!-- Mentor profile (mentors only). The bio + availability
             fields were captured optionally on the /invite landing
             page during onboarding; this is where mentors edit them
             later. Both are visible to students viewing the
             mentor-profile page, so this is "public to authenticated
             users" in practice — the placeholder copy reflects that. -->
        <UiCard v-if="userProfile?.role === 'mentor'" class="p-6 md:p-10 bg-surface">
          <Eyebrow class="text-brand-violet mb-3 block">Mentor</Eyebrow>
          <Heading :level="2" class="mb-2 text-xl">Mentor profile</Heading>
          <Body class="text-ink/60 text-sm mb-6">
            Visible to your assigned students and cohort coordinators on your mentor profile page.
          </Body>
          <div class="flex flex-col gap-5">
            <div class="flex flex-col gap-2">
              <label
                for="mentorBio"
                class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
              >
                Area of expertise
              </label>
              <textarea
                id="mentorBio"
                v-model="mentorForm.mentorBio"
                rows="4"
                :maxlength="MENTOR_BIO_MAX + 200"
                placeholder="e.g. ML engineer at Spotify, focus on recommender systems and time-series. PhD in stats."
                class="border hairline-ink rounded-xl px-4 py-3 text-sm bg-paper focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all resize-y"
              />
              <div class="flex justify-between text-xs">
                <span class="text-ink/50"
                  >Helps students know if you're the right fit for their interests.</span
                >
                <span :class="mentorBioOver ? 'text-red-600 font-semibold' : 'text-ink/40'">
                  {{ mentorForm.mentorBio.length }} / {{ MENTOR_BIO_MAX }}
                </span>
              </div>
            </div>

            <div class="flex flex-col gap-2">
              <label
                for="mentorAvailability"
                class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
              >
                Availability
              </label>
              <textarea
                id="mentorAvailability"
                v-model="mentorForm.mentorAvailability"
                rows="2"
                :maxlength="MENTOR_AVAILABILITY_MAX + 200"
                placeholder="e.g. Weeknights after 7pm WAT, 2-3 hours/week. Async messaging works too."
                class="border hairline-ink rounded-xl px-4 py-3 text-sm bg-paper focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all resize-y"
              />
              <div class="flex justify-between text-xs">
                <span class="text-ink/50">When + how often you can show up for sessions.</span>
                <span
                  :class="mentorAvailabilityOver ? 'text-red-600 font-semibold' : 'text-ink/40'"
                >
                  {{ mentorForm.mentorAvailability.length }} / {{ MENTOR_AVAILABILITY_MAX }}
                </span>
              </div>
            </div>

            <!-- Public showcase opt-in. Off by default. When on, this
                 mentor's name, photo, bio, and availability surface to
                 anonymous visitors on /stay-connected via the
                 getPublicMentors callable. Email + emailPreferences
                 are never returned by that endpoint regardless of
                 this toggle. -->
            <label
              class="flex items-start justify-between gap-4 cursor-pointer pt-4 border-t hairline-ink"
            >
              <div class="flex-1">
                <div class="text-sm font-medium text-ink mb-1">
                  Show me on the public mentor showcase
                </div>
                <div class="text-xs text-ink/60">
                  When on, your name, photo, bio, and availability appear on
                  <RouterLink to="/stay-connected" class="text-brand-violet hover:underline"
                    >/stay-connected</RouterLink
                  >
                  — the page we point prospective applicants and curious visitors at. Your email and
                  notification preferences stay private either way.
                </div>
              </div>
              <button
                type="button"
                class="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors mt-0.5"
                :class="mentorForm.mentorPublicProfile ? 'bg-brand-violet' : 'bg-ink/20'"
                role="switch"
                :aria-checked="mentorForm.mentorPublicProfile"
                @click.prevent="mentorForm.mentorPublicProfile = !mentorForm.mentorPublicProfile"
              >
                <span
                  class="inline-block h-5 w-5 rounded-full bg-surface shadow translate-y-0.5 transition-transform"
                  :class="mentorForm.mentorPublicProfile ? 'translate-x-5' : 'translate-x-0.5'"
                />
              </button>
            </label>

            <p v-if="mentorSaveError" class="text-sm text-red-600">{{ mentorSaveError }}</p>
            <p v-else-if="mentorSaveSuccess" class="text-sm text-emerald-700">
              <Icon icon="lucide:check" width="14" class="inline -mt-0.5" /> Saved.
            </p>

            <div class="flex flex-wrap gap-3 pt-2">
              <UiButton variant="primary" :disabled="!canSaveMentor" @click="handleSaveMentor">
                <Icon v-if="mentorSaving" icon="lucide:loader-2" width="14" class="animate-spin" />
                {{ mentorSaving ? 'Saving…' : 'Save changes' }}
              </UiButton>
              <UiButton
                variant="secondary"
                :disabled="!mentorDirty || mentorSaving"
                @click="handleResetMentor"
              >
                Reset
              </UiButton>
            </div>
          </div>
        </UiCard>

        <!-- Account info (read-only) -->
        <UiCard class="p-6 md:p-10 bg-surface">
          <Eyebrow class="text-ink/60 mb-3 block">Account</Eyebrow>
          <Heading :level="2" class="mb-2 text-xl">Account info</Heading>
          <Body class="text-ink/60 text-sm mb-6"
            >Read-only. Email and role are managed by an admin.</Body
          >
          <dl class="flex flex-col gap-3 text-sm">
            <div class="flex justify-between gap-4">
              <dt class="text-ink/60">Email</dt>
              <dd class="text-ink flex items-center gap-1.5">
                {{ user?.email || '—' }}
                <Icon
                  v-if="user?.emailVerified"
                  icon="lucide:badge-check"
                  width="14"
                  class="text-emerald-600"
                />
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-ink/60">Role</dt>
              <dd class="text-ink capitalize">{{ userProfile?.role || '—' }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-ink/60">Joined</dt>
              <dd class="text-ink">{{ formatDate(userProfile?.createdAt) }}</dd>
            </div>
          </dl>
        </UiCard>

        <!-- Notifications -->
        <UiCard class="p-6 md:p-10 bg-surface">
          <Eyebrow class="text-brand-violet mb-3 block">Notifications</Eyebrow>
          <Heading :level="2" class="mb-2 text-xl">Email preferences</Heading>
          <Body class="text-ink/60 text-sm mb-6">
            Transactional emails (welcome, application status, password resets, reference invites)
            are always sent — they're tied to your account.
          </Body>

          <div class="flex flex-col divide-y divide-ink/10">
            <label
              v-for="entry in notifKeys"
              :key="entry.key"
              class="flex items-start gap-4 py-4 cursor-pointer first:pt-0 last:pb-0"
            >
              <button
                type="button"
                class="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors mt-0.5"
                :class="isEnabled(notifPrefs, entry.key) ? 'bg-brand-violet' : 'bg-ink/20'"
                role="switch"
                :aria-checked="isEnabled(notifPrefs, entry.key)"
                @click.prevent="toggleNotif(entry.key)"
              >
                <span
                  class="inline-block h-5 w-5 rounded-full bg-surface shadow translate-y-0.5 transition-transform"
                  :class="isEnabled(notifPrefs, entry.key) ? 'translate-x-5' : 'translate-x-0.5'"
                />
              </button>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-ink">{{ entry.label }}</div>
                <div class="text-xs text-ink/60 mt-0.5">{{ entry.description }}</div>
              </div>
            </label>
          </div>

          <p v-if="notifMessage" class="text-sm text-emerald-700 mt-4">{{ notifMessage }}</p>

          <div class="pt-6">
            <UiButton variant="primary" :disabled="!notifDirty || notifSaving" @click="saveNotifs">
              <Icon v-if="notifSaving" icon="lucide:loader-2" width="14" class="animate-spin" />
              {{ notifSaving ? 'Saving…' : 'Save preferences' }}
            </UiButton>
          </div>
        </UiCard>

        <!-- Security -->
        <UiCard class="p-6 md:p-10 bg-surface">
          <Eyebrow class="text-brand-violet mb-3 block">Security</Eyebrow>
          <Heading :level="2" class="mb-2 text-xl">Sign-in & sessions</Heading>
          <Body class="text-ink/60 text-sm mb-6">Keep your account secure.</Body>

          <div class="flex flex-col gap-6">
            <!-- Email verification -->
            <div class="flex items-start justify-between gap-4 pb-6 border-b hairline-ink">
              <div class="flex-1">
                <div class="text-sm font-medium text-ink mb-1">Email verification</div>
                <div class="text-xs text-ink/60">
                  <template v-if="user?.emailVerified">
                    <Icon
                      icon="lucide:badge-check"
                      width="12"
                      class="inline -mt-0.5 text-emerald-600"
                    />
                    Your email is verified.
                  </template>
                  <template v-else>Your email isn't verified yet.</template>
                </div>
                <p v-if="verificationMessage" class="text-xs text-emerald-700 mt-2">
                  {{ verificationMessage }}
                </p>
              </div>
              <UiButton
                v-if="!user?.emailVerified"
                variant="secondary"
                :disabled="sendingVerification"
                @click="resendVerification"
              >
                <Icon
                  v-if="sendingVerification"
                  icon="lucide:loader-2"
                  width="14"
                  class="animate-spin"
                />
                {{ sendingVerification ? 'Sending…' : 'Send verification' }}
              </UiButton>
            </div>

            <!-- Password change -->
            <div v-if="hasPasswordProvider" class="pb-6 border-b hairline-ink">
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                  <div class="text-sm font-medium text-ink mb-1">Password</div>
                  <div class="text-xs text-ink/60">Change your sign-in password.</div>
                </div>
                <UiButton
                  v-if="!showPwForm"
                  variant="secondary"
                  @click="
                    showPwForm = true;
                    pwError = null;
                  "
                >
                  Change password
                </UiButton>
              </div>

              <div v-if="showPwForm" class="flex flex-col gap-3 mt-5">
                <input
                  v-model="pwCurrent"
                  type="password"
                  placeholder="Current password"
                  autocomplete="current-password"
                  class="w-full px-3 py-2 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet"
                />
                <input
                  v-model="pwNew"
                  type="password"
                  placeholder="New password (8+ characters)"
                  autocomplete="new-password"
                  class="w-full px-3 py-2 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet"
                />
                <input
                  v-model="pwNewConfirm"
                  type="password"
                  placeholder="Confirm new password"
                  autocomplete="new-password"
                  class="w-full px-3 py-2 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet"
                />
                <p v-if="pwError" class="text-sm text-red-700">{{ pwError }}</p>
                <div class="flex gap-2 pt-1">
                  <UiButton
                    variant="primary"
                    :disabled="!pwValid || pwSaving"
                    @click="changePassword"
                  >
                    <Icon v-if="pwSaving" icon="lucide:loader-2" width="14" class="animate-spin" />
                    {{ pwSaving ? 'Saving…' : 'Update password' }}
                  </UiButton>
                  <UiButton
                    variant="secondary"
                    :disabled="pwSaving"
                    @click="
                      showPwForm = false;
                      pwCurrent = '';
                      pwNew = '';
                      pwNewConfirm = '';
                      pwError = null;
                    "
                  >
                    Cancel
                  </UiButton>
                </div>
              </div>
              <p v-if="pwSuccess" class="text-sm text-emerald-700 mt-3">
                <Icon icon="lucide:check" width="14" class="inline -mt-0.5" /> Password updated.
              </p>
            </div>

            <!-- Sign out everywhere -->
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1">
                <div class="text-sm font-medium text-ink mb-1">Sign out of all devices</div>
                <div class="text-xs text-ink/60">
                  Invalidates every signed-in browser, phone, or tab. Useful if you suspect someone
                  else has access. Other devices will be asked to sign in again within an hour.
                </div>
                <p v-if="signOutMessage" class="text-xs text-red-700 mt-2">{{ signOutMessage }}</p>
              </div>
              <UiButton
                variant="secondary"
                :disabled="signingOutEverywhere"
                @click="signOutEverywhere"
              >
                <Icon
                  v-if="signingOutEverywhere"
                  icon="lucide:loader-2"
                  width="14"
                  class="animate-spin"
                />
                {{ signingOutEverywhere ? 'Signing out…' : 'Sign out everywhere' }}
              </UiButton>
            </div>
          </div>
        </UiCard>

        <!-- Privacy -->
        <UiCard class="p-6 md:p-10 bg-surface">
          <Eyebrow class="text-brand-violet mb-3 block">Privacy</Eyebrow>
          <Heading :level="2" class="mb-2 text-xl">Visibility & data</Heading>
          <Body class="text-ink/60 text-sm mb-6"
            >Control what's visible and download a copy of your data.</Body
          >

          <div class="flex flex-col gap-6">
            <!-- Directory visibility (alumni) -->
            <label
              v-if="showDirectoryToggle"
              class="flex items-start justify-between gap-4 cursor-pointer pb-6 border-b hairline-ink"
            >
              <div class="flex-1">
                <div class="text-sm font-medium text-ink mb-1">Show me in the alumni directory</div>
                <div class="text-xs text-ink/60">
                  When off, your profile is hidden from other alumni searching the directory. You
                  can still send and receive connection requests directly.
                </div>
              </div>
              <button
                type="button"
                class="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors mt-0.5"
                :class="!directoryHidden ? 'bg-brand-violet' : 'bg-ink/20'"
                role="switch"
                :aria-checked="!directoryHidden"
                :disabled="directorySaving"
                @click.prevent="toggleDirectory"
              >
                <span
                  class="inline-block h-5 w-5 rounded-full bg-surface shadow translate-y-0.5 transition-transform"
                  :class="!directoryHidden ? 'translate-x-5' : 'translate-x-0.5'"
                />
              </button>
            </label>

            <!-- Data export -->
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1">
                <div class="text-sm font-medium text-ink mb-1">Export your data</div>
                <div class="text-xs text-ink/60">
                  Download a JSON file containing every record we hold about you — profile,
                  applications, donations, notifications, audit log, and signed download URLs for
                  any files you've uploaded.
                </div>
                <p v-if="exportError" class="text-xs text-red-700 mt-2">{{ exportError }}</p>
              </div>
              <UiButton variant="secondary" :disabled="exporting" @click="exportData">
                <Icon v-if="exporting" icon="lucide:loader-2" width="14" class="animate-spin" />
                <Icon v-else icon="lucide:download" width="14" />
                {{ exporting ? 'Preparing…' : 'Download' }}
              </UiButton>
            </div>
          </div>
        </UiCard>

        <!-- Danger zone -->
        <UiCard class="p-6 md:p-10 bg-surface border border-red-200">
          <Eyebrow class="text-red-700 mb-3 block">Danger zone</Eyebrow>
          <Heading :level="2" class="mb-3 text-xl">Delete your account</Heading>
          <Body class="text-ink/70 mb-2">
            Permanently removes your profile, applications, uploaded files (transcripts, IDs), and
            any connections you've made.
          </Body>
          <Body class="text-ink/60 text-sm mb-6">
            We retain donation receipts (with your name removed) for tax and accounting, audit logs
            for compliance, and any mentor feedback you wrote about students as program records.
          </Body>

          <template v-if="!canSelfDelete">
            <Body class="text-ink/70 text-sm">
              Staff and admin accounts must be deleted by another admin. Email
              <a href="mailto:contact@staija.org" class="text-brand-violet underline"
                >contact@staija.org</a
              >
              and we'll handle it.
            </Body>
          </template>
          <template v-else-if="!showConfirm">
            <UiButton
              variant="secondary"
              class="!border-red-300 !text-red-700 hover:!bg-red-50"
              @click="showConfirm = true"
            >
              <Icon icon="lucide:trash-2" width="16" />
              Delete account
            </UiButton>
          </template>
          <template v-else>
            <div class="flex flex-col gap-4">
              <Body class="text-ink text-sm">
                This is permanent. Type <strong class="font-mono">DELETE</strong> below to confirm.
              </Body>
              <input
                v-model="confirmText"
                type="text"
                placeholder="DELETE"
                autocomplete="off"
                spellcheck="false"
                class="w-full px-4 py-3 rounded-md border hairline-ink bg-surface font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet"
                :disabled="deleting"
              />
              <p v-if="deleteError" class="text-sm text-red-700">{{ deleteError }}</p>
              <div class="flex flex-wrap gap-3">
                <UiButton
                  variant="secondary"
                  class="!border-red-300 !text-red-700 hover:!bg-red-50"
                  :disabled="!confirmReady || deleting"
                  @click="handleDelete"
                >
                  <Icon v-if="deleting" icon="lucide:loader-2" width="16" class="animate-spin" />
                  <Icon v-else icon="lucide:trash-2" width="16" />
                  {{ deleting ? 'Deleting…' : 'Permanently delete my account' }}
                </UiButton>
                <UiButton
                  variant="secondary"
                  :disabled="deleting"
                  @click="
                    showConfirm = false;
                    confirmText = '';
                    deleteError = null;
                  "
                >
                  Cancel
                </UiButton>
              </div>
            </div>
          </template>
        </UiCard>
      </Container>
    </Section>
  </div>
</template>
