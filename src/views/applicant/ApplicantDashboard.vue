<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiCard from '../../components/ui/UiCard.vue';
import UiChip from '../../components/ui/UiChip.vue';
import UiConfirmDialog from '../../components/ui/UiConfirmDialog.vue';
import { useAuth } from '../../composables/useAuth';
import {
  deleteDraft as deleteCloudDraft,
  saveDraft as saveCloudDraft,
  watchUserDrafts,
  type ApplicationDraftDoc,
} from '../../services/applicationDrafts';
import { AuthService, DatabaseService } from '../../services/firebase';
import type { Application } from '../../services/types';

const router = useRouter();
const { displayName } = useAuth();

const applications = ref<Application[]>([]);
const loading = ref(true);
const error = ref('');

// In-progress drafts. The wizard auto-saves to both localStorage
// (instant, offline-safe) and Firestore (account-bound, cross-device);
// here we read both and pick the newer entry per program so a draft
// you started on your phone shows up on your laptop and vice versa.
interface LocalDraft {
  slug: 'stepup-scholars' | 'dynamerge';
  programName: string;
  savedAt: Date;
  source: 'local' | 'cloud';
}
const localDrafts = ref<LocalDraft[]>([]);

const PROGRAM_SLUGS: Array<{ slug: LocalDraft['slug']; name: string }> = [
  { slug: 'stepup-scholars', name: 'StepUp Scholars' },
  { slug: 'dynamerge', name: 'Dynamerge' },
];

// TTL matches useAutoSave (14 days). A draft past TTL is treated as
// absent so we don't surface stale work the wizard would also discard.
const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// Whether we've already done the local→cloud auto-sync for this
// mount of the dashboard. The watcher fires the reconciler on every
// Firestore change; we only want to *push* local drafts up to cloud
// on the first reconcile. Subsequent reconciles are pure renders
// driven by remote mutations (e.g. a delete from another device).
let didInitialDraftSync = false;

// Slugs the applicant just discarded on this device that then came
// back to life via the cloud listener — almost certainly because
// another device chose "Keep editing here" on the cross-device
// discard modal. Surfaced as a banner so the user isn't left
// thinking "didn't I just delete this?" when the card reappears.
interface RestoredAfterDiscard {
  slug: LocalDraft['slug'];
  programName: string;
}
const restoredAfterDiscard = ref<RestoredAfterDiscard[]>([]);
// Discard markers are kept in sessionStorage rather than localStorage
// so they don't survive a tab close. A "this draft was restored"
// banner is only relevant if the user is actively in the dashboard
// session that did the discard; once they navigate away or close the
// tab, future restorations from elsewhere are no longer surprising.
const RECENT_DISCARD_WINDOW_MS = 30 * 60 * 1000;

function recordRecentDiscard(slug: LocalDraft['slug']) {
  try {
    sessionStorage.setItem(`staija.recentDiscard.${slug}`, String(Date.now()));
  } catch {
    /* private mode / quota — fine */
  }
}

function consumeRecentDiscardIfApplicable(slug: LocalDraft['slug']): boolean {
  try {
    const key = `staija.recentDiscard.${slug}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    sessionStorage.removeItem(key);
    return !!ts && Date.now() - ts <= RECENT_DISCARD_WINDOW_MS;
  } catch {
    return false;
  }
}

function dismissRestoredAfterDiscard(slug: LocalDraft['slug']) {
  restoredAfterDiscard.value = restoredAfterDiscard.value.filter(r => r.slug !== slug);
}

async function reconcileDrafts(uid: string, cloudDocsRaw: ApplicationDraftDoc[]) {
  if (typeof window === 'undefined') return;
  // Local pass — read every cached draft's full payload (not just the
  // timestamp) so we can re-push any that haven't reached the cloud
  // yet. Reading bytes we'd skip otherwise is cheap: 2 keys at most,
  // each a few KB.
  interface LocalEntry {
    savedAt: number;
    payload: Record<string, unknown>;
  }
  const local = new Map<LocalDraft['slug'], LocalEntry>();
  for (const { slug } of PROGRAM_SLUGS) {
    const key = `staija.draft.apply.${slug}.${uid}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as {
        v?: number;
        savedAt?: number;
        data?: Record<string, unknown>;
      };
      if (parsed.v !== 1 || typeof parsed.savedAt !== 'number') continue;
      if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
        window.localStorage.removeItem(key);
        continue;
      }
      local.set(slug, { savedAt: parsed.savedAt, payload: parsed.data ?? {} });
    } catch {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  }

  // Cloud pass — use the snapshot the live listener handed us.
  // Tombstones (__deleted: true) are split into a separate map so
  // the auto-sync below knows "was this deleted on another device?"
  // instead of just "is there no cloud doc?".
  const cloudDocs = cloudDocsRaw;
  const cloud = new Map<LocalDraft['slug'], { savedAt: number }>();
  const tombstones = new Map<LocalDraft['slug'], { deletedAt: number }>();
  for (const doc of cloudDocs) {
    if (doc.program !== 'stepup-scholars' && doc.program !== 'dynamerge') continue;
    if (doc.__deleted) {
      tombstones.set(doc.program, {
        deletedAt: typeof doc.deletedAt === 'number' ? doc.deletedAt : 0,
      });
    } else {
      cloud.set(doc.program, { savedAt: doc.savedAt });
      // "Was this draft just brought back from the dead by another
      // device?" — if we recorded a recent discard for this slug on
      // this tab and the listener now reports it as active, that's
      // almost certainly another device choosing "Keep editing here"
      // on the cross-device discard modal. Surface a banner so the
      // user knows why a draft they just deleted reappeared.
      if (consumeRecentDiscardIfApplicable(doc.program)) {
        const name = PROGRAM_SLUGS.find(p => p.slug === doc.program)?.name ?? '';
        if (!restoredAfterDiscard.value.some(r => r.slug === doc.program)) {
          restoredAfterDiscard.value = [
            ...restoredAfterDiscard.value,
            { slug: doc.program, programName: name },
          ];
        }
      }
    }
  }

  // Auto-sync: any local draft missing from the cloud is pushed *now*,
  // not at "next time the user opens that wizard". Cloud-first is the
  // contract; "this browser only" should mean "we tried and failed",
  // not "we never tried".
  //
  // BUT — first respect tombstones. If the cloud has a deletion
  // newer than the local copy, the applicant actively discarded the
  // draft on another device; we honor that by wiping the stale local
  // entry (instead of resurrecting it). Without this check, a delete
  // on PC silently un-deletes itself the moment phone's dashboard
  // loads.
  // The tombstone-wipe pass runs on every reconcile so a cross-
  // device delete that arrives mid-session immediately wipes the
  // local copy. The auto-push pass only runs on the FIRST reconcile
  // (gated below) so subsequent snapshots don't trigger redundant
  // sync writes for drafts the cloud already has.
  const syncTargets: Array<
    [LocalDraft['slug'], { savedAt: number; payload: Record<string, unknown> }]
  > = [];
  for (const [slug, entry] of local) {
    if (cloud.has(slug)) continue;
    const tomb = tombstones.get(slug);
    if (tomb && tomb.deletedAt > entry.savedAt) {
      // Cross-device deletion wins. Wipe local so the chip doesn't
      // render this draft at all, and skip the auto-sync push.
      try {
        window.localStorage.removeItem(`staija.draft.apply.${slug}.${uid}`);
      } catch {
        /* private mode / quota — fine */
      }
      local.delete(slug);
      continue;
    }
    syncTargets.push([slug, entry]);
  }

  if (syncTargets.length > 0 && !didInitialDraftSync) {
    const results = await Promise.all(
      syncTargets.map(async ([slug, { savedAt, payload }]) => {
        const ok = await saveCloudDraft(uid, slug, payload);
        return { slug, savedAt, ok };
      })
    );
    for (const { slug, savedAt, ok } of results) {
      if (ok) cloud.set(slug, { savedAt });
    }
  }

  // Merge per program. With auto-sync above, the source flips to
  // 'cloud' for every draft that has a Firestore mirror — including
  // any that JUST got pushed during this dashboard load. The 'local'
  // source is now the rare emergency state: write attempted, write
  // failed. Displayed "Saved X ago" uses the freshest of the two
  // timestamps so the time pill doesn't lie about activity.
  const found: LocalDraft[] = [];
  for (const { slug, name } of PROGRAM_SLUGS) {
    const l = local.get(slug);
    const c = cloud.get(slug);
    if (!l && !c) continue;
    const freshest = Math.max(l?.savedAt ?? 0, c?.savedAt ?? 0);
    found.push({
      slug,
      programName: name,
      savedAt: new Date(freshest),
      source: c ? 'cloud' : 'local',
    });
  }
  localDrafts.value = found;
}

// Discard-draft confirm modal. We hold the *candidate* draft in a ref
// instead of doing the delete inline so the modal can collect a
// keyboard confirm (Enter on the focused button) just as easily as a
// click. `null` keeps the modal closed.
const discardCandidate = ref<LocalDraft | null>(null);
const discardOpen = computed({
  get: () => discardCandidate.value !== null,
  set: (v: boolean) => {
    if (!v) discardCandidate.value = null;
  },
});

function requestDiscard(d: LocalDraft) {
  discardCandidate.value = d;
}

async function confirmDiscard() {
  const d = discardCandidate.value;
  if (!d) return;
  const uid = AuthService.getCurrentUser()?.uid;
  if (!uid) return;
  try {
    window.localStorage.removeItem(`staija.draft.apply.${d.slug}.${uid}`);
  } catch {
    /* ignore */
  }
  // Mark the discard so the next reconcile can tell "this draft came
  // back from cloud because of an in-flight edit elsewhere" apart
  // from "this draft is here for the usual reasons". The marker
  // lives in sessionStorage so it expires with the tab.
  recordRecentDiscard(d.slug);
  // Cloud delete is best-effort; the localStorage wipe is the primary
  // affordance the user can observe immediately.
  await deleteCloudDraft(uid, d.slug);
  localDrafts.value = localDrafts.value.filter(x => x.slug !== d.slug);
}

const firstName = computed(() => {
  const name = displayName.value ?? '';
  return name.split(/[\s@]/)[0] || 'there';
});

const sortedApplications = computed(() =>
  [...applications.value].sort((a, b) => {
    const aDate = toDate(a.updatedAt ?? a.createdAt).getTime();
    const bDate = toDate(b.updatedAt ?? b.createdAt).getTime();
    return bDate - aDate;
  })
);

const hasApplications = computed(() => applications.value.length > 0);

/** Two-program system. When this grows, the apply-button gating below
 *  becomes "show if there's any program the user hasn't applied to" —
 *  the array drives the math. */
const ALL_PROGRAMS: Application['program'][] = ['stepup_scholars', 'dynamerge'];

/** Program the user could still apply to. Returns the first program in
 *  ALL_PROGRAMS that doesn't have ANY existing application (draft,
 *  submitted, decided, declined — anything counts as "covered" because
 *  the user can resume drafts and can't re-apply once a decision is in).
 *  When all programs are covered, returns null and the "Apply to…"
 *  button hides entirely. */
const remainingProgram = computed<Application['program'] | null>(() => {
  const covered = new Set(applications.value.map(a => a.program));
  return ALL_PROGRAMS.find(p => !covered.has(p)) ?? null;
});

/** Hyphenated slug for the /apply/:program route (the apply collection
 *  stores `stepup_scholars`, the route uses `stepup-scholars`). */
const remainingProgramSlug = computed(() =>
  remainingProgram.value === 'stepup_scholars'
    ? 'stepup-scholars'
    : remainingProgram.value === 'dynamerge'
      ? 'dynamerge'
      : ''
);

/** Map the `applications` collection's underscored program key to the
 *  hyphenated draft slug. The two collections were authored against
 *  slightly different naming conventions; this is the shim. */
function applicationProgramToDraftSlug(p: Application['program']): LocalDraft['slug'] {
  return p === 'stepup_scholars' ? 'stepup-scholars' : 'dynamerge';
}

/** Slugs the applicant has already SUBMITTED an application for. A
 *  draft for any slug in this set is stale by definition — the user
 *  can't submit the same program twice, so anything the wizard had
 *  buffered for that slug shouldn't be offered to "Resume". */
const submittedSlugs = computed(() => {
  const set = new Set<LocalDraft['slug']>();
  for (const app of applications.value) {
    // status === 'draft' is the legacy NewApplication path — those
    // show up under "Your applications" as a Draft row and don't
    // shadow the wizard's separate draft surface. Only submitted-or-
    // later applications hide the wizard draft.
    if (app.status !== 'draft') set.add(applicationProgramToDraftSlug(app.program));
  }
  return set;
});

/** Drafts safe to render to the user. Filters out any slug already
 *  covered by a submitted application. Without this filter, a draft
 *  whose `savedAt` happened to be newer than the cross-device
 *  submit-tombstone would auto-resurrect on this device's reconcile
 *  (saveCloudDraft sets __deleted: false on every write), leaving the
 *  applicant looking at both a "Drafts in progress" card AND a
 *  matching "Submitted" application card for the same program. */
const visibleDrafts = computed(() =>
  localDrafts.value.filter(d => !submittedSlugs.value.has(d.slug))
);

/** When submittedSlugs grows, evict the matching local cache entry
 *  AND tombstone the cloud draft. Without the eviction, the next
 *  reconcile would auto-sync the local entry back up and resurrect
 *  the cross-device tombstone — the cycle that produced the
 *  "draft-and-submitted-at-the-same-time" UI in the first place.
 *  Best-effort: failures here are caught by the next reconcile (and
 *  next session's mount), not user-visible. */
watch(submittedSlugs, next => {
  if (next.size === 0) return;
  const uid = AuthService.getCurrentUser()?.uid;
  if (!uid) return;
  for (const d of localDrafts.value) {
    if (!next.has(d.slug)) continue;
    try {
      window.localStorage.removeItem(`staija.draft.apply.${d.slug}.${uid}`);
    } catch {
      /* private mode / quota — fine */
    }
    void deleteCloudDraft(uid, d.slug);
  }
});

// Held by the snapshot subscription so we can tear it down on
// unmount. Without the cleanup the listener leaks across route
// changes — the Firestore stream keeps firing into a detached
// component, and the per-mount didInitialDraftSync flag would never
// reset on the next visit.
let unsubscribeDrafts: (() => void) | null = null;

/**
 * Synchronous local-storage pass — reads cached drafts and populates
 * `localDrafts` so the first paint shows the applicant's work without
 * waiting on Firestore.
 *
 * Why this exists. `watchUserDrafts`' `onSnapshot` is the canonical
 * cross-device source, but its initial snapshot can stall for up to a
 * minute when the WebChannel handshake falls back to long-polling
 * under content-blocker or restrictive-network conditions (the same
 * scenario `experimentalAutoDetectLongPolling: true` in firebase.ts
 * mitigates but doesn't fully eliminate). Gating render on that
 * snapshot meant the dashboard would spin for ~60s instead of showing
 * the perfectly-good local copy that's already in IndexedDB. Painting
 * from local first means the page is interactive immediately; the
 * snapshot still runs and replaces this with reconciled data when it
 * arrives.
 *
 * Safe to call before reconcileDrafts. The listener's first callback
 * overwrites `localDrafts` with the full local-vs-cloud merge, so any
 * brief discrepancy (e.g. a cloud-only draft from another device that
 * hasn't synced to this browser yet) resolves itself within a
 * snapshot cycle.
 */
function hydrateLocalDraftsSync(uid: string) {
  if (typeof window === 'undefined') return;
  const found: LocalDraft[] = [];
  for (const { slug, name } of PROGRAM_SLUGS) {
    const key = `staija.draft.apply.${slug}.${uid}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { v?: number; savedAt?: number };
      if (parsed.v !== 1 || typeof parsed.savedAt !== 'number') continue;
      if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
        window.localStorage.removeItem(key);
        continue;
      }
      found.push({
        slug,
        programName: name,
        savedAt: new Date(parsed.savedAt),
        source: 'local',
      });
    } catch {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  }
  localDrafts.value = found;
}

async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    const currentUser = AuthService.getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }

    // First paint: cached drafts from localStorage. Synchronous, so
    // the empty-state vs. has-drafts UI resolves correctly the first
    // time it renders.
    hydrateLocalDraftsSync(currentUser.uid);

    // Open a live listener on the user's drafts. onSnapshot fires the
    // callback immediately with the current state, then again on
    // every Firestore mutation — so a delete on another device shows
    // up here in under a second, no manual refresh needed. The
    // didInitialDraftSync flag (reset to false below) lets the first
    // reconcile push local-only drafts to cloud; subsequent
    // reconciles skip the push to avoid feedback loops.
    // Note: loading remains true until the initial applications query
    // resolves; draft updates continue reconciling in the background.
    didInitialDraftSync = false;
    if (unsubscribeDrafts) unsubscribeDrafts();
    unsubscribeDrafts = watchUserDrafts(currentUser.uid, async cloudDocs => {
      await reconcileDrafts(currentUser.uid, cloudDocs);
      didInitialDraftSync = true;
    });

    // Applications are still one-shot — the user-asked symptom was
    // about draft sync; promoting submitted-app sync to live is a
    // separate UX call.
    applications.value = await DatabaseService.getUserApplications(currentUser.uid);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load your applications.';
  } finally {
    // First paint unblocks here. The drafts listener may still be
    // pending its initial snapshot — that's fine, hydrateLocalDrafts
    // already filled `localDrafts` from cache, and the reconcile will
    // update it in place when (or if) the snapshot arrives.
    loading.value = false;
  }
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return new Date(0);
}

function programLabel(p: Application['program']) {
  return p === 'stepup_scholars' ? 'StepUp Scholars' : 'Dynamerge';
}

function statusLabel(s: Application['status']) {
  switch (s) {
    case 'draft':
      return 'Draft';
    case 'submitted':
      return 'Submitted';
    case 'under_review':
      return 'Under review';
    case 'accepted':
      return 'Accepted';
    // Applicant-facing, not admin-facing. "Decision sent" reads like
    // an internal ops-system label — it doesn't tell the applicant
    // what the decision WAS. "Not selected" is plain English and
    // pairs with the rose chip below for an at-a-glance outcome.
    case 'rejected':
      return 'Not selected';
  }
}

function statusTone(s: Application['status']): 'neutral' | 'progress' | 'success' | 'rejected' {
  if (s === 'draft') return 'neutral';
  if (s === 'submitted' || s === 'under_review') return 'progress';
  if (s === 'accepted') return 'success';
  // Rejected used to collapse into a 'closed' neutral gray bucket,
  // making accepted vs. rejected indistinguishable on the dashboard
  // without reading the chip text. It now gets its own rose tone so
  // the outcome reads at a glance.
  return 'rejected';
}

function timeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function continueRoute(app: Application): string {
  if (app.status === 'draft') return `/applicant/applications/${app.id}/edit`;
  return `/applicant/applications/${app.id}`;
}

onMounted(loadData);

onBeforeUnmount(() => {
  // Tear down the Firestore snapshot listener so it doesn't keep
  // firing into a detached component after the user navigates away.
  if (unsubscribeDrafts) {
    unsubscribeDrafts();
    unsubscribeDrafts = null;
  }
});
</script>

<template>
  <Section class="!pt-12 !pb-24">
    <Container>
      <!-- Greeting -->
      <div class="flex flex-col gap-3 mb-12">
        <Eyebrow class="text-brand-violet">Applicant dashboard</Eyebrow>
        <Heading :level="1"
          >Hi, <span class="text-brand-violet">{{ firstName }}</span
          >.</Heading
        >
        <Body
          v-if="!loading && !hasApplications && visibleDrafts.length === 0"
          class="text-ink/70 max-w-xl"
        >
          You haven't started an application yet. Pick a program below to begin — it takes about 20
          minutes and your progress saves automatically.
        </Body>
        <Body v-else-if="!loading && !hasApplications" class="text-ink/70 max-w-xl">
          You have an unfinished draft below. Pick it up where you left off, or start a fresh
          application for the other program.
        </Body>
        <Body v-else-if="!loading" class="text-ink/70 max-w-xl">
          Pick up where you left off, or start a new application for the other program.
        </Body>
      </div>

      <!-- "Your discard was undone elsewhere" banner. Fires when a
           draft this tab just deleted reappears via the live cloud
           listener — almost certainly because another device chose
           "Keep editing here" on the cross-device-discard modal.
           Surfaces the cause so the reappearing card doesn't read
           as a bug. Dismissable per-program. -->
      <div v-if="restoredAfterDiscard.length > 0" class="mb-6 flex flex-col gap-2">
        <div
          v-for="r in restoredAfterDiscard"
          :key="r.slug"
          class="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 text-amber-900 text-sm"
        >
          <Icon icon="lucide:rotate-cw" width="16" class="mt-0.5 text-amber-700 shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="font-semibold">{{ r.programName }} draft was restored.</div>
            <div class="text-amber-800/80 text-xs mt-0.5">
              You discarded this on this device, but an edit on another device brought it back.
              Another discard here will fire the conflict modal on the device that's still editing —
              they need to choose "Discard" there too for it to stay gone.
            </div>
          </div>
          <button
            type="button"
            class="text-amber-700/70 hover:text-amber-900 p-1 -m-1 shrink-0"
            aria-label="Dismiss"
            @click="dismissRestoredAfterDiscard(r.slug)"
          >
            <Icon icon="lucide:x" width="14" />
          </button>
        </div>
      </div>

      <!-- In-progress localStorage drafts. Surfaced here because they
           aren't Firestore docs yet — without this card the dashboard
           reads as "empty" while the applicant's draft sits invisibly
           in browser storage. -->
      <div v-if="!loading && !error && visibleDrafts.length > 0" class="mb-10">
        <Eyebrow class="text-brand-violet mb-4 block">Drafts in progress</Eyebrow>
        <div class="flex flex-col gap-4">
          <div
            v-for="d in visibleDrafts"
            :key="d.slug"
            class="block group focus-ring-brand rounded-2xl"
          >
            <UiCard
              class="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 border-2 !border-brand-violet/20"
            >
              <!-- Text column. On mobile this stacks: title → chip →
                   meta line, each on its own row. On sm+ they
                   collapse into a tighter vertical group beside the
                   actions, but at mobile widths the chip getting its
                   own row prevents the title from squishing into
                   "Step…" and the chip from collapsing into a tall
                   vertical pill. -->
              <div class="flex-1 flex flex-col gap-2 min-w-0">
                <h3 class="font-display text-xl font-semibold m-0 truncate">
                  {{ d.programName }}
                </h3>
                <span
                  class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full self-start max-w-full"
                  :class="
                    d.source === 'cloud'
                      ? 'bg-brand-violet/10 text-brand-violet'
                      : 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                  "
                >
                  <Icon
                    :icon="d.source === 'cloud' ? 'lucide:cloud' : 'lucide:cloud-off'"
                    width="12"
                    class="shrink-0"
                  />
                  <span class="truncate">
                    {{
                      d.source === 'cloud'
                        ? 'Draft | synced to your account'
                        : 'Draft | couldn’t sync — only on this browser'
                    }}
                  </span>
                </span>
                <p class="text-sm text-ink/60 m-0">
                  Saved {{ timeAgo(d.savedAt) }} | not submitted yet
                </p>
              </div>
              <!-- Actions row. On mobile: spaced apart (Discard ←/
                   Resume →) on its own row below the text. On sm+:
                   inline beside the text, right-aligned. -->
              <div class="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                <button
                  type="button"
                  class="text-xs font-semibold text-ink/50 hover:text-red-600 transition-colors px-2 py-1 rounded focus-ring-brand"
                  @click.stop.prevent="requestDiscard(d)"
                >
                  Discard
                </button>
                <UiButton variant="primary" :to="`/apply/${d.slug}`">
                  <span class="flex items-center gap-2">
                    Resume
                    <Icon icon="lucide:arrow-right" width="16" />
                  </span>
                </UiButton>
              </div>
            </UiCard>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center gap-3 text-ink/60">
        <Icon icon="lucide:loader-2" width="18" class="animate-spin" />
        Loading your applications…
      </div>

      <!-- Error -->
      <div
        v-else-if="error"
        class="flex flex-col gap-4 rounded-2xl border border-red-200 bg-red-50/60 p-6"
      >
        <div class="flex items-center gap-3 text-red-700">
          <Icon icon="lucide:alert-circle" width="20" />
          <span class="font-semibold">Couldn't load your applications.</span>
        </div>
        <p class="text-sm text-ink/70 m-0">{{ error }}</p>
        <UiButton variant="secondary" @click="loadData" class="self-start"> Try again </UiButton>
      </div>

      <!-- Empty state: no applications -->
      <template v-else-if="!hasApplications">
        <div class="grid md:grid-cols-2 gap-6 mb-12">
          <UiCard hoverable class="h-full flex flex-col relative pt-[4px]">
            <div class="absolute top-0 left-0 right-0 h-[4px] bg-gradient-brand" />
            <div class="p-8 flex flex-col h-full gap-5">
              <div class="flex justify-between items-start gap-4">
                <Heading :level="3">StepUp Scholars</Heading>
                <UiChip>In-person</UiChip>
              </div>
              <Body class="flex-1 text-ink/75">
                A six-month research incubator in Nigeria for high-school and gap-year students. Lab
                access, a stipend, and mentorship toward a first publication.
              </Body>
              <div class="flex items-center justify-between gap-4 pt-4 border-t hairline-ink">
                <span class="text-xs font-semibold tracking-wide text-ink/55 uppercase">
                  Ages 15–19 | Nigeria
                </span>
                <UiButton variant="primary" :to="'/apply/stepup-scholars'"> Apply </UiButton>
              </div>
            </div>
          </UiCard>

          <UiCard hoverable class="h-full flex flex-col relative pt-[4px]">
            <div class="absolute top-0 left-0 right-0 h-[4px] bg-gradient-brand" />
            <div class="p-8 flex flex-col h-full gap-5">
              <div class="flex justify-between items-start gap-4">
                <Heading :level="3">Dynamerge</Heading>
                <UiChip>Virtual</UiChip>
              </div>
              <Body class="flex-1 text-ink/75">
                A four-week pan-African virtual bootcamp — project-based work with global mentors
                across coding, data, biotech, and clean energy tracks.
              </Body>
              <div class="flex items-center justify-between gap-4 pt-4 border-t hairline-ink">
                <span class="text-xs font-semibold tracking-wide text-ink/55 uppercase">
                  Ages 15–20 | Pan-African
                </span>
                <UiButton variant="primary" :to="'/apply/dynamerge'"> Apply </UiButton>
              </div>
            </div>
          </UiCard>
        </div>

        <!-- What you'll need -->
        <div class="rounded-2xl border hairline-ink p-6 md:p-8 max-w-3xl">
          <Eyebrow class="text-brand-violet mb-3 block">Before you start</Eyebrow>
          <Heading :level="3" class="mb-4">What you'll need</Heading>
          <ul class="grid sm:grid-cols-2 gap-y-3 gap-x-8 list-none p-0 m-0">
            <li class="flex items-start gap-3">
              <Icon icon="lucide:file-text" width="18" class="text-brand-violet mt-0.5 shrink-0" />
              <span class="text-sm text-ink/80">A short personal essay (300–500 words)</span>
            </li>
            <li class="flex items-start gap-3">
              <Icon icon="lucide:users" width="18" class="text-brand-violet mt-0.5 shrink-0" />
              <span class="text-sm text-ink/80">Two references — we'll email them a link</span>
            </li>
            <li class="flex items-start gap-3">
              <Icon
                icon="lucide:graduation-cap"
                width="18"
                class="text-brand-violet mt-0.5 shrink-0"
              />
              <span class="text-sm text-ink/80">A transcript or grade summary (PDF or image)</span>
            </li>
            <li class="flex items-start gap-3">
              <Icon icon="lucide:clock" width="18" class="text-brand-violet mt-0.5 shrink-0" />
              <span class="text-sm text-ink/80"
                >About 20 minutes — your progress saves as you go</span
              >
            </li>
          </ul>
        </div>
      </template>

      <!-- Has applications: list view -->
      <template v-else>
        <div class="flex items-center justify-between gap-4 mb-6">
          <Eyebrow class="text-brand-violet">Your applications</Eyebrow>
          <!-- Apply-to-the-other-program button. Hidden once the
               applicant has covered every program (two-program system,
               so this means they're done applying). When shown,
               points at the polished /apply wizard, not the retired
               NewApplication form. -->
          <UiButton
            v-if="remainingProgram"
            variant="secondary"
            :to="`/apply/${remainingProgramSlug}`"
          >
            <Icon icon="lucide:plus" width="16" class="mr-1.5" />
            Apply to {{ programLabel(remainingProgram) }}
          </UiButton>
        </div>

        <div class="flex flex-col gap-4">
          <RouterLink
            v-for="app in sortedApplications"
            :key="app.id"
            :to="continueRoute(app)"
            class="block group focus-ring-brand rounded-2xl"
          >
            <UiCard hoverable class="p-6 flex items-center gap-6">
              <div class="flex-1 flex flex-col gap-1.5 min-w-0">
                <div class="flex items-center gap-3 flex-wrap">
                  <h3 class="font-display text-xl font-semibold m-0 truncate">
                    {{ programLabel(app.program) }}
                  </h3>
                  <span
                    :class="[
                      'inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full',
                      statusTone(app.status) === 'neutral' && 'bg-ink/10 text-ink/70',
                      statusTone(app.status) === 'progress' &&
                        'bg-brand-violet/10 text-brand-violet',
                      statusTone(app.status) === 'success' && 'bg-emerald-500/10 text-emerald-700',
                      statusTone(app.status) === 'rejected' && 'bg-rose-500/10 text-rose-700',
                    ]"
                  >
                    {{ statusLabel(app.status) }}
                  </span>
                </div>
                <p class="text-sm text-ink/60 m-0">
                  <template v-if="app.status === 'draft'">
                    Last edited {{ timeAgo(toDate(app.updatedAt ?? app.createdAt)) }}
                  </template>
                  <!-- Terminal statuses get a "Decided X ago" meta
                       line anchored on reviewedAt — the date that
                       matters to the applicant is when the decision
                       landed, not when they submitted weeks earlier.
                       Falls back to updatedAt if reviewedAt is
                       missing (legacy rows). -->
                  <template
                    v-else-if="
                      (app.status === 'accepted' || app.status === 'rejected') &&
                      (app.reviewedAt || app.updatedAt)
                    "
                  >
                    Decided {{ timeAgo(toDate(app.reviewedAt ?? app.updatedAt)) }}
                  </template>
                  <template v-else-if="app.submittedAt">
                    Submitted {{ timeAgo(toDate(app.submittedAt)) }}
                  </template>
                  <template v-else> Created {{ timeAgo(toDate(app.createdAt)) }} </template>
                </p>
              </div>
              <div class="flex items-center gap-2 text-sm font-semibold text-brand-violet shrink-0">
                <span class="hidden sm:inline">
                  {{ app.status === 'draft' ? 'Continue' : 'View status' }}
                </span>
                <Icon
                  icon="lucide:arrow-right"
                  width="18"
                  class="transition-transform group-hover:translate-x-1"
                />
              </div>
            </UiCard>
          </RouterLink>
        </div>

        <!-- "Apply to the other program" nudge: only show if exactly one program is covered -->
        <div
          v-if="applications.length === 1"
          class="mt-12 rounded-2xl border hairline-ink bg-paper p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
        >
          <div>
            <Heading :level="3" class="mb-1">Apply to the other program too?</Heading>
            <p class="text-sm text-ink/70 m-0">
              StepUp and Dynamerge are independent — you can apply to both.
            </p>
          </div>
          <UiButton
            v-if="applications[0].program === 'stepup_scholars'"
            variant="secondary"
            :to="'/apply/dynamerge'"
          >
            Apply to Dynamerge
          </UiButton>
          <UiButton v-else variant="secondary" :to="'/apply/stepup-scholars'">
            Apply to StepUp
          </UiButton>
        </div>
      </template>
    </Container>
  </Section>

  <UiConfirmDialog
    v-model:open="discardOpen"
    variant="destructive"
    :title="`Discard your ${discardCandidate?.programName ?? ''} draft?`"
    body="This wipes the draft everywhere — this browser and your account. It can't be undone."
    confirm-label="Discard draft"
    cancel-label="Keep it"
    @confirm="confirmDiscard"
  />
</template>
