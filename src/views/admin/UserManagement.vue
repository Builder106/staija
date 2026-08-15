<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { collection, limit as fsLimit, getDocs, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiCard from '../../components/ui/UiCard.vue';
import { useAuth } from '../../composables/useAuth';
import { auth, db, functions } from '../../config/firebase';
import {
  ALL_ROLES,
  AuditService,
  AuthService,
  PermissionService,
  type AuditLog,
  type UserRole,
} from '../../services/firebase';
import type { MentorInvite } from '../../services/types';

interface EnrichedUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole | null;
  emailVerified: boolean;
  disabled: boolean;
  creationTime: string | null;
  lastSignInTime: string | null;
  program: string | null;
  applicationStatus: string | null;
}

const { userProfile } = useAuth();

const users = ref<EnrichedUser[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const searchQuery = ref('');
const activeFilter = ref<UserRole | null>(null);
const currentPage = ref(1);
const itemsPerPage = 12;

const showRoleModal = ref(false);
const showUserDetails = ref(false);
const selectedUser = ref<EnrichedUser | null>(null);
const newRole = ref<UserRole | null>(null);

// Mentor-invite state. The page mounts with the modal closed; staff
// clicks "Invite a mentor" in the hero, fills in optional context
// (note + email restriction + expiry), and submits to the
// createMentorInvite callable. On success the modal swaps from the
// form state to a result state with the copyable URL — staff pastes
// it into their preferred channel (email, LinkedIn, WhatsApp).
const showInviteModal = ref(false);
const inviteNote = ref('');
const inviteEmail = ref('');
const inviteExpiresInDays = ref<number | null>(30);
const inviteCount = ref<number>(1);
const inviteSubmitting = ref(false);
const inviteError = ref<string | null>(null);
/** Array because bulk minting returns N invites — single-mint is
 *  `inviteResults.value.length === 1`, which collapses to the same
 *  UI shape (one row, one Copy button) for the common case. */
const inviteResults = ref<Array<{ url: string; expiresAt: number }>>([]);
/** Per-URL copy-feedback state. Keys are the URLs themselves so we
 *  don't need to track index → URL separately. */
const copiedFlags = ref<Record<string, boolean>>({});
const copiedAll = ref(false);

function openInviteModal() {
  inviteNote.value = '';
  inviteEmail.value = '';
  inviteExpiresInDays.value = 30;
  inviteCount.value = 1;
  inviteError.value = null;
  inviteResults.value = [];
  copiedFlags.value = {};
  copiedAll.value = false;
  showInviteModal.value = true;
}

function closeInviteModal() {
  showInviteModal.value = false;
  setTimeout(() => {
    inviteNote.value = '';
    inviteEmail.value = '';
    inviteResults.value = [];
    inviteError.value = null;
  }, 200);
}

async function submitInvite() {
  if (inviteSubmitting.value) return;
  inviteSubmitting.value = true;
  inviteError.value = null;
  try {
    const fn = httpsCallable<
      { note?: string; email?: string; expiresInDays?: number; count?: number },
      { invites: Array<{ token: string; url: string; expiresAt: number }> }
    >(functions, 'createMentorInvite');
    const res = await fn({
      note: inviteNote.value.trim() || undefined,
      // Email restriction is ignored server-side when count > 1, but
      // we still send it for the single-invite case where staff
      // wants to lock to a specific recipient.
      email:
        inviteCount.value === 1 && inviteEmail.value.trim() ? inviteEmail.value.trim() : undefined,
      expiresInDays: inviteExpiresInDays.value ?? undefined,
      count: inviteCount.value,
    });
    inviteResults.value = res.data.invites.map(i => ({
      url: i.url,
      expiresAt: i.expiresAt,
    }));
    // Reload the pending-invites table so the newly minted rows show
    // up immediately without a manual refresh.
    void loadMentorInvites();
  } catch (err) {
    inviteError.value = err instanceof Error ? err.message : 'Could not mint invite.';
  } finally {
    inviteSubmitting.value = false;
  }
}

async function copyInviteLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    copiedFlags.value = { ...copiedFlags.value, [url]: true };
    setTimeout(() => {
      copiedFlags.value = { ...copiedFlags.value, [url]: false };
    }, 1500);
  } catch {
    inviteError.value = "Couldn't copy automatically — select the URL and copy by hand.";
  }
}

/** "Copy all" packs the URLs into a newline-separated string —
 *  suitable for pasting into an email, a Slack message, a spreadsheet
 *  cell. Falls back to individual-copy errors silently; the per-row
 *  Copy buttons are the recovery path. */
async function copyAllInviteLinks() {
  if (inviteResults.value.length === 0) return;
  try {
    await navigator.clipboard.writeText(inviteResults.value.map(i => i.url).join('\n'));
    copiedAll.value = true;
    setTimeout(() => {
      copiedAll.value = false;
    }, 1500);
  } catch {
    inviteError.value = "Couldn't copy automatically — copy each link by hand.";
  }
}

// Pending-invites table state. Loaded on mount + after each mint /
// revoke so the staff doesn't have to manually refresh. Caps at 50
// recent rows; older invites are still queryable via Firestore
// Console if needed, but the operational surface is "recent
// pending + recently-consumed", not the full history.
type InviteRow = MentorInvite & {
  id: string;
  status: 'pending' | 'consumed' | 'expired' | 'revoked';
};
const mentorInvites = ref<InviteRow[]>([]);
const mentorInvitesLoading = ref(false);
const revokingTokens = ref<Set<string>>(new Set());

function inviteStatus(invite: MentorInvite): InviteRow['status'] {
  if (invite.revoked === true) return 'revoked';
  if (invite.consumed === true) return 'consumed';
  if (typeof invite.expiresAt === 'number' && invite.expiresAt < Date.now()) return 'expired';
  return 'pending';
}

async function loadMentorInvites() {
  mentorInvitesLoading.value = true;
  try {
    const q = query(collection(db, 'mentorInvites'), orderBy('createdAt', 'desc'), fsLimit(50));
    const snap = await getDocs(q);
    mentorInvites.value = snap.docs.map(d => {
      const data = d.data() as MentorInvite;
      return { ...data, id: d.id, status: inviteStatus(data) };
    });
  } catch (err) {
    // Non-fatal — the list is auxiliary; UserManagement still
    // functions without it.
    console.warn('[UserManagement] loadMentorInvites failed', err);
    mentorInvites.value = [];
  } finally {
    mentorInvitesLoading.value = false;
  }
}

async function revokeInvite(token: string) {
  if (revokingTokens.value.has(token)) return;
  revokingTokens.value = new Set([...revokingTokens.value, token]);
  try {
    const fn = httpsCallable<{ token: string }, { ok: true; changed: boolean }>(
      functions,
      'revokeMentorInvite'
    );
    await fn({ token });
    await loadMentorInvites();
  } catch (err) {
    console.warn('[UserManagement] revokeMentorInvite failed', err);
  } finally {
    const next = new Set(revokingTokens.value);
    next.delete(token);
    revokingTokens.value = next;
  }
}

function formatInviteDate(ms: number | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Rebuild the public invite URL from a token. The originally-minted
 *  URL is returned in the createMentorInvite response (and we still
 *  use that for fresh mints), but the pending-invites list reads the
 *  stored doc and re-assembles the URL client-side from the
 *  document's token. Using window.location.origin keeps preview /
 *  dev deploys honest — a staging environment shouldn't copy
 *  production URLs out of staff's clipboard. */
function inviteUrlFor(token: string): string {
  if (typeof window === 'undefined') return `/invite/${token}`;
  return `${window.location.origin}/invite/${token}`;
}
const changeReason = ref('');
const roleChanging = ref(false);
const userAuditLogs = ref<AuditLog[]>([]);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const allRoles: UserRole[] = ALL_ROLES;

const filteredUsers = computed(() => {
  let list = users.value;
  if (activeFilter.value) list = list.filter(u => u.role === activeFilter.value);
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      u =>
        u.displayName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q)
    );
  }
  return list;
});

const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  return filteredUsers.value.slice(start, start + itemsPerPage);
});

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredUsers.value.length / itemsPerPage))
);

const assignableRoles = computed(() =>
  allRoles.filter(role =>
    PermissionService.canAssignRole(userProfile.value?.role ?? 'applicant', role)
  )
);

watch([activeFilter, searchQuery], () => {
  currentPage.value = 1;
});

async function loadUsers() {
  loading.value = true;
  loadError.value = null;
  try {
    const callable = httpsCallable<Record<string, never>, { users: EnrichedUser[] }>(
      functions,
      'adminListUsers'
    );
    const result = await callable({});
    users.value = result.data.users;
  } catch (err) {
    const msg = (err as { message?: string }).message ?? 'Failed to load users.';
    loadError.value = msg;
    users.value = [];
  } finally {
    loading.value = false;
  }
}

function getRoleCount(role: UserRole) {
  return users.value.filter(u => u.role === role).length;
}

function getInitials(name: string | null) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatAbsoluteDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatRelative(iso: string | null) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never';
  const diff = Date.now() - d.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

const roleColors: Record<string, string> = {
  admin: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  staff: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  alumni: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  student: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  mentor: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  applicant: 'bg-ink/5 text-ink/70 ring-1 ring-ink/10',
};

function roleClass(role: string | null) {
  return role
    ? (roleColors[role] ?? roleColors.applicant)
    : 'bg-ink/5 text-ink/50 ring-1 ring-ink/10';
}

function openRoleModal(user: EnrichedUser) {
  if (user.uid === auth.currentUser?.uid) return;
  selectedUser.value = user;
  newRole.value = user.role;
  changeReason.value = '';
  showRoleModal.value = true;
}

function closeRoleModal() {
  showRoleModal.value = false;
  selectedUser.value = null;
  newRole.value = null;
  changeReason.value = '';
}

async function viewUserDetails(user: EnrichedUser) {
  selectedUser.value = user;
  showUserDetails.value = true;
  try {
    userAuditLogs.value = await AuditService.getAuditLogs(user.uid, 10);
  } catch {
    userAuditLogs.value = [];
  }
}

function closeUserDetails() {
  showUserDetails.value = false;
  selectedUser.value = null;
  userAuditLogs.value = [];
}

async function confirmRoleChange() {
  if (!selectedUser.value || !newRole.value || !changeReason.value.trim()) return;
  if (newRole.value === selectedUser.value.role) {
    showMessage('error', 'Pick a role different from the current one.');
    return;
  }
  roleChanging.value = true;
  try {
    await AuthService.assignRole(selectedUser.value.uid, newRole.value, changeReason.value);
    const idx = users.value.findIndex(u => u.uid === selectedUser.value?.uid);
    if (idx !== -1) users.value[idx] = { ...users.value[idx], role: newRole.value };
    showMessage('success', `Role updated to ${newRole.value}.`);
    closeRoleModal();
  } catch (err) {
    const msg = (err as { message?: string }).message ?? 'Could not change role.';
    showMessage('error', msg);
  } finally {
    roleChanging.value = false;
  }
}

function showMessage(type: 'success' | 'error', text: string) {
  message.value = { type, text };
  setTimeout(() => (message.value = null), 5000);
}

function getActivityIcon(type: string) {
  if (type === 'role_change') return 'lucide:refresh-cw';
  if (type === 'permission_check') return 'lucide:lock';
  return 'lucide:file-edit';
}

function getActivityText(log: AuditLog) {
  if (log.type === 'role_change') return `Role changed from ${log.previousRole} to ${log.newRole}`;
  if (log.type === 'permission_check')
    return `${log.granted ? 'Granted' : 'Denied'} access to ${log.permission}`;
  return 'Activity logged';
}

onMounted(() => {
  loadUsers();
  void loadMentorInvites();
});
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-12 !pb-8 wash-violet-6 border-b hairline-ink">
      <Container>
        <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <Eyebrow class="text-brand-violet mb-3 block">Admin</Eyebrow>
            <Heading :level="1" class="mb-3">
              User <span class="text-brand-violet">management</span>.
            </Heading>
            <Body class="text-ink/70"
              >Roles, permissions, and account status across all users.</Body
            >
          </div>
          <UiButton variant="primary" @click="openInviteModal">
            <span class="flex items-center gap-2">
              <Icon icon="lucide:user-plus" width="16" />
              Invite a mentor
            </span>
          </UiButton>
        </div>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="flex flex-col gap-8">
        <!-- Toast -->
        <Transition
          enter-active-class="transition duration-200"
          enter-from-class="opacity-0 -translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition duration-150"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <div
            v-if="message"
            class="fixed top-24 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium"
            :class="
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                : 'bg-red-50 text-red-800 ring-1 ring-red-200'
            "
          >
            {{ message.text }}
          </div>
        </Transition>

        <!-- Filters -->
        <UiCard class="p-5 md:p-6 bg-surface">
          <div class="relative mb-4">
            <Icon
              icon="lucide:search"
              width="18"
              class="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40"
            />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search by name, email, or role…"
              class="w-full pl-10 pr-4 py-2.5 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet"
            />
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="role in allRoles"
              :key="role"
              type="button"
              class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide transition-colors"
              :class="
                activeFilter === role
                  ? 'bg-brand-violet text-white'
                  : 'bg-ink/5 text-ink/70 hover:bg-ink/10'
              "
              @click="activeFilter = role"
            >
              {{ role.replace('_', ' ') }}
              <span
                class="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                :class="activeFilter === role ? 'bg-white/20' : 'bg-ink/10'"
              >
                {{ getRoleCount(role) }}
              </span>
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide transition-colors"
              :class="
                activeFilter === null
                  ? 'bg-brand-violet text-white'
                  : 'bg-ink/5 text-ink/70 hover:bg-ink/10'
              "
              @click="activeFilter = null"
            >
              All
              <span
                class="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                :class="activeFilter === null ? 'bg-white/20' : 'bg-ink/10'"
              >
                {{ users.length }}
              </span>
            </button>
          </div>
        </UiCard>

        <!-- Loading / error -->
        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon
            icon="lucide:loader-2"
            width="24"
            class="animate-spin text-brand-violet mx-auto mb-3"
          />
          <Body class="text-ink/60 text-sm">Loading users…</Body>
        </UiCard>

        <UiCard v-else-if="loadError" class="p-6 bg-surface">
          <div class="flex items-start gap-3">
            <Icon icon="lucide:triangle-alert" width="20" class="text-red-600 mt-0.5" />
            <div class="flex-1">
              <p class="text-sm font-semibold text-ink mb-1">Couldn't load users</p>
              <p class="text-sm text-ink/70 mb-4">{{ loadError }}</p>
              <UiButton variant="secondary" @click="loadUsers">Retry</UiButton>
            </div>
          </div>
        </UiCard>

        <UiCard v-else-if="filteredUsers.length === 0" class="p-10 bg-surface text-center">
          <Body class="text-ink/60">No users match these filters.</Body>
        </UiCard>

        <!-- Table -->
        <UiCard v-else class="bg-surface overflow-hidden p-0">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-ink/[0.03] text-ink/60">
                <tr>
                  <th class="text-left font-semibold px-5 py-3 w-2/5">User</th>
                  <th class="text-left font-semibold px-5 py-3">Role</th>
                  <th class="text-left font-semibold px-5 py-3">Status</th>
                  <th class="text-left font-semibold px-5 py-3">Joined</th>
                  <th class="text-left font-semibold px-5 py-3">Last seen</th>
                  <th class="text-right font-semibold px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="user in paginatedUsers"
                  :key="user.uid"
                  class="border-t hairline-ink hover:bg-ink/[0.015] transition-colors"
                >
                  <td class="px-5 py-3">
                    <div class="flex items-center gap-3">
                      <div
                        class="w-9 h-9 rounded-full bg-brand-violet/10 text-brand-violet flex items-center justify-center text-xs font-semibold flex-shrink-0"
                      >
                        {{ getInitials(user.displayName || user.email) }}
                      </div>
                      <div class="min-w-0">
                        <div class="text-ink font-medium truncate">
                          {{ user.displayName || 'No name' }}
                        </div>
                        <div class="text-ink/60 text-xs truncate flex items-center gap-1.5">
                          {{ user.email || '(no email)' }}
                          <Icon
                            v-if="user.emailVerified"
                            icon="lucide:badge-check"
                            width="12"
                            class="text-emerald-600 flex-shrink-0"
                          />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="px-5 py-3">
                    <span
                      class="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold capitalize"
                      :class="roleClass(user.role)"
                    >
                      {{ user.role || 'none' }}
                    </span>
                  </td>
                  <td class="px-5 py-3">
                    <span
                      v-if="user.disabled"
                      class="inline-flex items-center gap-1 text-xs font-medium text-red-700"
                    >
                      <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                      Disabled
                    </span>
                    <span
                      v-else
                      class="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"
                    >
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Active
                    </span>
                  </td>
                  <td class="px-5 py-3 text-ink/70 text-xs whitespace-nowrap">
                    {{ formatAbsoluteDate(user.creationTime) }}
                  </td>
                  <td class="px-5 py-3 text-ink/70 text-xs whitespace-nowrap">
                    {{ formatRelative(user.lastSignInTime) }}
                  </td>
                  <td class="px-5 py-3 text-right whitespace-nowrap">
                    <!-- Mentor public profile link. Only renders for
                         users with role='mentor' — the page itself
                         renders a "not a mentor" empty state for
                         everyone else, but offering the link only
                         where it works keeps the row tidy. -->
                    <RouterLink
                      v-if="user.role === 'mentor'"
                      :to="`/mentors/${user.uid}`"
                      class="text-xs font-medium text-brand-violet hover:underline"
                    >
                      View profile
                    </RouterLink>
                    <span
                      v-if="user.role === 'mentor'"
                      class="inline-block w-px h-3 bg-ink/20 mx-2"
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      class="text-xs font-medium text-brand-violet hover:underline disabled:text-ink/30 disabled:cursor-not-allowed disabled:no-underline"
                      :disabled="user.uid === auth.currentUser?.uid"
                      @click="openRoleModal(user)"
                    >
                      Change role
                    </button>
                    <span class="inline-block w-px h-3 bg-ink/20 mx-2" aria-hidden="true" />
                    <button
                      type="button"
                      class="text-xs font-medium text-ink/70 hover:text-ink hover:underline"
                      @click="viewUserDetails(user)"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div
            v-if="filteredUsers.length > itemsPerPage"
            class="flex items-center justify-between px-5 py-3 border-t hairline-ink bg-ink/[0.02] text-xs text-ink/60"
          >
            <span>Page {{ currentPage }} of {{ totalPages }}</span>
            <div class="flex gap-2">
              <button
                type="button"
                class="px-3 py-1.5 rounded-md border hairline-ink hover:bg-ink/5 disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="currentPage === 1"
                @click="currentPage--"
              >
                Previous
              </button>
              <button
                type="button"
                class="px-3 py-1.5 rounded-md border hairline-ink hover:bg-ink/5 disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="currentPage === totalPages"
                @click="currentPage++"
              >
                Next
              </button>
            </div>
          </div>
        </UiCard>

        <!-- Pending mentor invites. Top 50 recent invites across all
             states (pending / consumed / expired / revoked) — covers
             the "did I send that link?" and "did they ever click?"
             operational questions without a full history view. -->
        <UiCard class="overflow-hidden bg-surface">
          <div class="px-5 py-4 flex items-center justify-between border-b hairline-ink">
            <div>
              <h2 class="font-display text-lg font-semibold m-0 text-ink">Mentor invites</h2>
              <p class="text-xs text-ink/55 m-0 mt-1">
                Most recent 50. Refreshes after mint or revoke.
              </p>
            </div>
            <button
              type="button"
              class="text-xs font-semibold text-brand-violet hover:underline focus-ring-brand rounded-sm"
              :disabled="mentorInvitesLoading"
              @click="loadMentorInvites"
            >
              {{ mentorInvitesLoading ? 'Loading…' : 'Refresh' }}
            </button>
          </div>
          <div
            v-if="mentorInvites.length === 0 && !mentorInvitesLoading"
            class="px-5 py-10 text-center text-sm text-ink/55"
          >
            No invites yet. Mint one via "Invite a mentor" above.
          </div>
          <div
            v-else-if="mentorInvitesLoading && mentorInvites.length === 0"
            class="px-5 py-10 text-center text-sm text-ink/55"
          >
            <Icon icon="lucide:loader-2" width="20" class="animate-spin inline" />
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-ink/[0.03] text-ink/60">
                <tr>
                  <th class="text-left font-semibold px-5 py-3">Status</th>
                  <th class="text-left font-semibold px-5 py-3">Issued by</th>
                  <th class="text-left font-semibold px-5 py-3">Issued</th>
                  <th class="text-left font-semibold px-5 py-3">Expires</th>
                  <th class="text-left font-semibold px-5 py-3">Restricted to</th>
                  <th class="text-left font-semibold px-5 py-3">Note</th>
                  <th class="text-right font-semibold px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="invite in mentorInvites"
                  :key="invite.id"
                  class="border-t hairline-ink hover:bg-ink/[0.015]"
                >
                  <td class="px-5 py-3">
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize"
                      :class="{
                        'bg-brand-violet/10 text-brand-violet': invite.status === 'pending',
                        'bg-emerald-50 text-emerald-700': invite.status === 'consumed',
                        'bg-amber-50 text-amber-700': invite.status === 'expired',
                        'bg-rose-50 text-rose-700': invite.status === 'revoked',
                      }"
                    >
                      {{ invite.status }}
                    </span>
                  </td>
                  <td class="px-5 py-3 text-ink/80 text-xs">{{ invite.createdByName }}</td>
                  <td class="px-5 py-3 text-ink/70 text-xs whitespace-nowrap">
                    {{ formatInviteDate(invite.createdAt) }}
                  </td>
                  <td class="px-5 py-3 text-ink/70 text-xs whitespace-nowrap">
                    {{ formatInviteDate(invite.expiresAt) }}
                  </td>
                  <td class="px-5 py-3 text-ink/70 text-xs">{{ invite.email ?? '—' }}</td>
                  <td class="px-5 py-3 text-ink/70 text-xs max-w-[16rem] truncate">
                    {{ invite.note ?? '—' }}
                  </td>
                  <td class="px-5 py-3 text-right whitespace-nowrap">
                    <button
                      v-if="invite.status === 'pending'"
                      type="button"
                      class="text-xs font-medium text-brand-violet hover:underline mr-3"
                      @click="copyInviteLink(inviteUrlFor(invite.id))"
                    >
                      {{ copiedFlags[inviteUrlFor(invite.id)] ? 'Copied' : 'Copy link' }}
                    </button>
                    <button
                      v-if="invite.status === 'pending'"
                      type="button"
                      class="text-xs font-medium text-rose-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      :disabled="revokingTokens.has(invite.id)"
                      @click="revokeInvite(invite.id)"
                    >
                      {{ revokingTokens.has(invite.id) ? 'Revoking…' : 'Revoke' }}
                    </button>
                    <span v-else-if="invite.status === 'consumed'" class="text-xs text-ink/50">
                      claimed
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UiCard>
      </Container>
    </Section>

    <!-- Role change modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showRoleModal"
          class="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4"
          @click="closeRoleModal"
        >
          <div
            class="bg-surface rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            @click.stop
          >
            <div class="flex items-center justify-between px-6 py-4 border-b hairline-ink">
              <Heading :level="3" class="text-lg">Change user role</Heading>
              <button
                type="button"
                class="text-ink/40 hover:text-ink p-1 -m-1"
                aria-label="Close"
                @click="closeRoleModal"
              >
                <Icon icon="lucide:x" width="20" />
              </button>
            </div>

            <div class="px-6 py-5 flex flex-col gap-5">
              <div class="flex items-center gap-3 p-3 bg-ink/[0.03] rounded-lg">
                <div
                  class="w-10 h-10 rounded-full bg-brand-violet/10 text-brand-violet flex items-center justify-center text-xs font-semibold"
                >
                  {{ getInitials(selectedUser?.displayName || selectedUser?.email || '') }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-ink font-medium text-sm truncate">
                    {{ selectedUser?.displayName || 'No name' }}
                  </div>
                  <div class="text-ink/60 text-xs truncate">{{ selectedUser?.email }}</div>
                  <div class="text-ink/50 text-xs mt-0.5">
                    Current role:
                    <span class="capitalize font-medium">{{ selectedUser?.role || 'none' }}</span>
                  </div>
                </div>
              </div>

              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                  >New role</label
                >
                <div class="grid grid-cols-2 gap-2">
                  <label
                    v-for="role in assignableRoles"
                    :key="role"
                    class="flex items-center gap-2 px-3 py-2 rounded-md border hairline-ink hover:bg-ink/[0.02] cursor-pointer text-sm capitalize"
                    :class="newRole === role ? 'border-brand-violet bg-brand-violet/5' : ''"
                  >
                    <input
                      v-model="newRole"
                      type="radio"
                      :value="role"
                      class="accent-brand-violet"
                    />
                    {{ role.replace('_', ' ') }}
                  </label>
                </div>
              </div>

              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                  Reason <span class="text-red-600 font-normal normal-case">(required)</span>
                </label>
                <textarea
                  v-model="changeReason"
                  rows="3"
                  placeholder="Why is this role change being made? This is recorded in the audit log."
                  class="w-full px-3 py-2 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet resize-none"
                ></textarea>
              </div>
            </div>

            <div class="flex justify-end gap-2 px-6 py-4 border-t hairline-ink bg-ink/[0.02]">
              <UiButton variant="secondary" @click="closeRoleModal">Cancel</UiButton>
              <UiButton
                variant="primary"
                :disabled="!newRole || !changeReason.trim() || roleChanging"
                @click="confirmRoleChange"
              >
                <Icon v-if="roleChanging" icon="lucide:loader-2" width="14" class="animate-spin" />
                {{ roleChanging ? 'Changing…' : 'Change role' }}
              </UiButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- User details modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showUserDetails && selectedUser"
          class="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4"
          @click="closeUserDetails"
        >
          <div
            class="bg-surface rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            @click.stop
          >
            <div class="flex items-center justify-between px-6 py-4 border-b hairline-ink">
              <Heading :level="3" class="text-lg">User details</Heading>
              <button
                type="button"
                class="text-ink/40 hover:text-ink p-1 -m-1"
                aria-label="Close"
                @click="closeUserDetails"
              >
                <Icon icon="lucide:x" width="20" />
              </button>
            </div>

            <div class="px-6 py-5 flex flex-col gap-6">
              <div class="flex items-center gap-4">
                <div
                  class="w-14 h-14 rounded-full bg-brand-violet/10 text-brand-violet flex items-center justify-center text-base font-semibold"
                >
                  {{ getInitials(selectedUser.displayName || selectedUser.email) }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-ink font-semibold text-base truncate">
                    {{ selectedUser.displayName || 'No name' }}
                  </div>
                  <div class="text-ink/60 text-sm truncate flex items-center gap-1.5">
                    {{ selectedUser.email }}
                    <Icon
                      v-if="selectedUser.emailVerified"
                      icon="lucide:badge-check"
                      width="14"
                      class="text-emerald-600"
                    />
                  </div>
                  <div class="mt-1">
                    <span
                      class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize"
                      :class="roleClass(selectedUser.role)"
                    >
                      {{ selectedUser.role || 'none' }}
                    </span>
                  </div>
                </div>
              </div>

              <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt class="text-ink/50 text-xs uppercase tracking-wide font-semibold mb-0.5">
                    UID
                  </dt>
                  <dd class="text-ink font-mono text-xs break-all">{{ selectedUser.uid }}</dd>
                </div>
                <div>
                  <dt class="text-ink/50 text-xs uppercase tracking-wide font-semibold mb-0.5">
                    Status
                  </dt>
                  <dd class="text-ink">{{ selectedUser.disabled ? 'Disabled' : 'Active' }}</dd>
                </div>
                <div>
                  <dt class="text-ink/50 text-xs uppercase tracking-wide font-semibold mb-0.5">
                    Joined
                  </dt>
                  <dd class="text-ink">{{ formatAbsoluteDate(selectedUser.creationTime) }}</dd>
                </div>
                <div>
                  <dt class="text-ink/50 text-xs uppercase tracking-wide font-semibold mb-0.5">
                    Last sign in
                  </dt>
                  <dd class="text-ink">{{ formatRelative(selectedUser.lastSignInTime) }}</dd>
                </div>
                <div v-if="selectedUser.program">
                  <dt class="text-ink/50 text-xs uppercase tracking-wide font-semibold mb-0.5">
                    Program
                  </dt>
                  <dd class="text-ink capitalize">{{ selectedUser.program.replace('_', ' ') }}</dd>
                </div>
                <div v-if="selectedUser.applicationStatus">
                  <dt class="text-ink/50 text-xs uppercase tracking-wide font-semibold mb-0.5">
                    Application
                  </dt>
                  <dd class="text-ink capitalize">
                    {{ selectedUser.applicationStatus.replace('_', ' ') }}
                  </dd>
                </div>
              </dl>

              <div>
                <Eyebrow class="text-brand-violet mb-2 block">Recent activity</Eyebrow>
                <div v-if="userAuditLogs.length === 0" class="text-ink/50 text-sm">
                  No recorded activity.
                </div>
                <ul v-else class="flex flex-col gap-2">
                  <li
                    v-for="log in userAuditLogs"
                    :key="log.id"
                    class="flex items-start gap-3 p-3 rounded-md bg-ink/[0.03]"
                  >
                    <Icon :icon="getActivityIcon(log.type)" width="16" class="text-ink/50 mt-0.5" />
                    <div class="flex-1 min-w-0 text-sm">
                      <div class="text-ink">{{ getActivityText(log) }}</div>
                      <div v-if="log.reason" class="text-ink/60 text-xs mt-0.5">
                        Reason: {{ log.reason }}
                      </div>
                      <div class="text-ink/40 text-xs mt-0.5">
                        {{ formatAbsoluteDate(new Date(log.timestamp).toISOString()) }}
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </div>

            <div class="flex justify-end px-6 py-4 border-t hairline-ink bg-ink/[0.02]">
              <UiButton variant="secondary" @click="closeUserDetails">Close</UiButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Mentor-invite modal. Two states inside one modal:
           (a) form — collect optional note, optional email
               restriction, and expiry days. Submit mints the token
               server-side via createMentorInvite.
           (b) result — show the generated URL with a copy-button.
               Staff pastes into the channel of their choice. -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-150"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showInviteModal"
          class="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
          @click.self="closeInviteModal"
        >
          <div
            role="dialog"
            aria-modal="true"
            class="bg-surface rounded-2xl shadow-xl max-w-md w-full border hairline-ink"
          >
            <!-- Result state. One row per minted invite — single-mint
                 collapses to a single row, bulk-mint renders N rows
                 with per-row Copy and a single "Copy all" affordance
                 at the bottom. -->
            <template v-if="inviteResults.length > 0">
              <div class="p-6 flex flex-col gap-5">
                <div class="flex items-start gap-3">
                  <div
                    class="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"
                  >
                    <Icon icon="lucide:check-circle-2" width="20" />
                  </div>
                  <div>
                    <Heading :level="3" class="!text-lg !m-0">
                      {{
                        inviteResults.length === 1
                          ? 'Invite link ready'
                          : `${inviteResults.length} invite links ready`
                      }}
                    </Heading>
                    <p class="text-sm text-ink/60 m-0 mt-1">
                      Each is single-use, expiring
                      {{
                        new Date(inviteResults[0].expiresAt).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      }}.
                    </p>
                  </div>
                </div>
                <div class="flex flex-col gap-2 max-h-72 overflow-y-auto">
                  <div v-for="invite in inviteResults" :key="invite.url" class="flex gap-2">
                    <input
                      type="text"
                      :value="invite.url"
                      readonly
                      class="flex-1 border hairline-ink rounded-lg px-3 py-2 text-sm font-mono bg-paper text-ink/85 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet"
                      @focus="($event.target as HTMLInputElement).select()"
                    />
                    <button
                      type="button"
                      class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold border transition-colors focus-ring-brand shrink-0"
                      :class="
                        copiedFlags[invite.url]
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-brand-violet/10 text-brand-violet border-brand-violet/30 hover:bg-brand-violet/15'
                      "
                      @click="copyInviteLink(invite.url)"
                    >
                      <Icon
                        :icon="copiedFlags[invite.url] ? 'lucide:check' : 'lucide:clipboard'"
                        width="14"
                      />
                      {{ copiedFlags[invite.url] ? 'Copied' : 'Copy' }}
                    </button>
                  </div>
                </div>
                <p v-if="inviteError" class="text-xs text-rose-700 m-0">{{ inviteError }}</p>
              </div>
              <div class="flex justify-between gap-2 px-6 py-4 border-t hairline-ink bg-ink/[0.02]">
                <button
                  v-if="inviteResults.length > 1"
                  type="button"
                  class="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-2 border transition-colors focus-ring-brand"
                  :class="
                    copiedAll
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-brand-violet/10 text-brand-violet border-brand-violet/30 hover:bg-brand-violet/15'
                  "
                  @click="copyAllInviteLinks"
                >
                  <Icon :icon="copiedAll ? 'lucide:check' : 'lucide:copy'" width="14" />
                  {{ copiedAll ? 'All copied' : 'Copy all' }}
                </button>
                <div class="flex items-center gap-2 ml-auto">
                  <UiButton variant="secondary" @click="openInviteModal"> Mint more </UiButton>
                  <UiButton variant="primary" @click="closeInviteModal"> Done </UiButton>
                </div>
              </div>
            </template>

            <!-- Form state -->
            <template v-else>
              <div class="p-6 flex flex-col gap-5">
                <div>
                  <Heading :level="3" class="!text-lg !m-0">Invite a mentor</Heading>
                  <p class="text-sm text-ink/60 m-0 mt-1">
                    Mints a single-use link. When the recipient signs in and accepts, their account
                    becomes a mentor.
                  </p>
                </div>

                <div class="flex flex-col gap-2">
                  <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                    Note <span class="text-ink/40 normal-case">(optional, audit-only)</span>
                  </label>
                  <textarea
                    v-model="inviteNote"
                    rows="2"
                    maxlength="500"
                    placeholder="e.g. Met at the Lagos demo day, wants to mentor StepUp"
                    class="border hairline-ink rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all resize-y"
                  />
                </div>

                <div class="flex flex-col gap-2">
                  <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                    Restrict to email
                    <span class="text-ink/40 normal-case">(optional, single invite only)</span>
                  </label>
                  <input
                    v-model="inviteEmail"
                    type="email"
                    :disabled="inviteCount > 1"
                    placeholder="recipient@example.com"
                    class="border hairline-ink rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p class="text-xs text-ink/50 m-0">
                    {{
                      inviteCount > 1
                        ? 'Email restriction only applies when minting a single invite.'
                        : 'Leave blank to let anyone with the link consume it.'
                    }}
                  </p>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div class="flex flex-col gap-2">
                    <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                      How many?
                    </label>
                    <input
                      v-model.number="inviteCount"
                      type="number"
                      min="1"
                      max="50"
                      class="border hairline-ink rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all"
                    />
                  </div>
                  <div class="flex flex-col gap-2">
                    <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                      Expires in (days)
                    </label>
                    <input
                      v-model.number="inviteExpiresInDays"
                      type="number"
                      min="1"
                      max="180"
                      class="border hairline-ink rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all"
                    />
                  </div>
                </div>

                <p
                  v-if="inviteError"
                  class="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 m-0"
                >
                  {{ inviteError }}
                </p>
              </div>
              <div class="flex justify-end gap-2 px-6 py-4 border-t hairline-ink bg-ink/[0.02]">
                <UiButton
                  variant="secondary"
                  :disabled="inviteSubmitting"
                  @click="closeInviteModal"
                >
                  Cancel
                </UiButton>
                <UiButton variant="primary" :disabled="inviteSubmitting" @click="submitInvite">
                  <span v-if="inviteSubmitting" class="flex items-center gap-2">
                    <Icon icon="lucide:loader-2" width="14" class="animate-spin" />
                    Minting…
                  </span>
                  <span v-else class="flex items-center gap-2">
                    <Icon icon="lucide:link" width="14" />
                    Generate link
                  </span>
                </UiButton>
              </div>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
