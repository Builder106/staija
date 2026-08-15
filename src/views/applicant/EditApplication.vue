<template>
  <div class="edit-application">
    <header class="page-header">
      <h1>Edit Application</h1>
      <p>Update your STAIJA program application</p>
    </header>

    <div v-if="loading" class="loading">
      <p>Loading application...</p>
    </div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="loadApplication">Retry</button>
    </div>

    <div v-else-if="application && application.status === 'draft'" class="form-container">
      <!-- Restore prompt — only surfaces when local draft is newer than
           server state. We never silently clobber server data because
           the user might have edited from another device. -->
      <div v-if="restorePromptVisible" class="restore-banner" role="status">
        <div class="restore-banner-text">
          <strong>You have unsaved local changes</strong>
          <span>Saved {{ pendingDraftAt?.toLocaleString() }} — newer than the server copy.</span>
        </div>
        <div class="restore-banner-actions">
          <button type="button" class="restore-btn-secondary" @click="discardLocalDraft">Discard</button>
          <button type="button" class="restore-btn-primary" @click="acceptLocalDraft">Restore</button>
        </div>
      </div>

      <div class="autosave-status" :data-status="autoSaveStatus">
        <span v-if="autoSaveStatus === 'saving'">Saving draft…</span>
        <span v-else-if="autoSaveStatus === 'saved' && autoSavedAt">
          Draft saved at {{ autoSavedAt.toLocaleTimeString() }}
        </span>
        <span v-else-if="autoSaveStatus === 'error'">
          Couldn't save draft locally. Your work in this tab is safe; submit to save to the server.
        </span>
        <span v-else>Auto-saves every 30 seconds.</span>
      </div>

      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>Program</label>
          <UiSelect
            v-model="form.program"
            :options="[
              { value: 'stepup_scholars', label: 'StepUp Scholars' },
              { value: 'dynamerge',       label: 'Dynamerge' },
            ]"
          />
        </div>

        <div class="form-group">
          <label>First Name</label>
          <input v-model="form.personalInfo.firstName" required />
        </div>

        <div class="form-group">
          <label>Last Name</label>
          <input v-model="form.personalInfo.lastName" required />
        </div>

        <div class="form-group">
          <label>Email</label>
          <input v-model="form.personalInfo.email" type="email" required />
        </div>

        <div class="form-group">
          <label>Motivation</label>
          <textarea v-model="form.motivation" required rows="4"></textarea>
        </div>

        <div class="form-group">
          <label>Experience</label>
          <textarea v-model="form.experience" required rows="4"></textarea>
        </div>

        <div class="form-actions">
          <button type="button" @click="saveDraft">Save Draft</button>
          <button type="submit">Submit Application</button>
        </div>
      </form>
    </div>

    <!-- Locked state: anyone who lands here for a non-draft application
         (direct URL, stale bookmark) sees a friendly explainer instead
         of an empty page. Wording follows the actual status so the
         applicant understands why they can't edit. -->
    <div v-else-if="application" class="locked-card" role="status">
      <h2>{{ lockedHeadline }}</h2>
      <p>{{ lockedExplanation }}</p>
      <div class="locked-actions">
        <button type="button" class="primary" @click="router.push('/applicant/applications')">
          Back to your applications
        </button>
        <button
          type="button"
          class="secondary"
          @click="router.push(`/applicant/applications/${application.id}`)"
        >
          View status &amp; feedback
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { DatabaseService, type Application } from '../../services/firebase'
import { useAutoSave } from '../../composables/useAutoSave'
import UiSelect from '../../components/ui/UiSelect.vue'

const router = useRouter()
const route = useRoute()

const application = ref<Application | null>(null)
const loading = ref(true)
const error = ref('')

// Status-aware copy for the locked-state card. Renders only when an
// application is loaded but no longer editable (not a draft).
const lockedHeadline = computed(() => {
  switch (application.value?.status) {
    case 'submitted': return 'Your application is submitted.'
    case 'under_review': return 'Your application is under review.'
    case 'accepted': return 'You were accepted to the program.'
    case 'rejected': return 'Decision posted.'
    default: return 'This application can’t be edited.'
  }
})
const lockedExplanation = computed(() => {
  const dateLine = application.value?.submittedAt
    ? ` Submitted ${new Date(application.value.submittedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
    : ''
  switch (application.value?.status) {
    case 'submitted':
      return `It's in our queue and locked from edits while staff review it.${dateLine} You'll get an email when there's an update.`
    case 'under_review':
      return `Staff are reading through it now. The submitted version is what they'll grade — it can't be changed mid-review.${dateLine}`
    case 'accepted':
      return `Congratulations — watch your email for onboarding next steps.${dateLine}`
    case 'rejected':
      return `The decision and any feedback from the reviewer is available on the status page.${dateLine}`
    default:
      return 'Editing is only available while an application is still in draft.'
  }
})

const form = ref({
  program: '' as 'stepup_scholars' | 'dynamerge' | '',
  personalInfo: {
    firstName: '',
    lastName: '',
    email: ''
  },
  motivation: '',
  experience: ''
})

// Per-application autosave key. `apply.edit.{id}` keeps drafts scoped
// per application — editing two drafts in two tabs doesn't cross-talk.
// `skipRestore: true` because we need to load from Firestore first and
// only consider restoring if the local draft is newer than the server
// copy. Restoring blindly would clobber edits made from another device.
const applicationId = route.params.id as string
const autoSaveKey = `apply.edit.${applicationId}`
const {
  status: autoSaveStatus,
  lastSavedAt: autoSavedAt,
  clear: clearDraft,
  peek: peekDraft,
  restore: restoreDraft,
} = useAutoSave(autoSaveKey, form, { skipRestore: true })

const restorePromptVisible = ref(false)
const pendingDraftAt = ref<Date | null>(null)

const loadApplication = async () => {
  try {
    const app = await DatabaseService.getApplication(applicationId)
    if (app) {
      application.value = app
      form.value = {
        program: app.program,
        personalInfo: app.personalInfo,
        motivation: app.motivation,
        experience: app.experience
      }
      maybePromptRestore(app.updatedAt)
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Failed to load application'
  } finally {
    loading.value = false
  }
}

// Compare local-draft timestamp against the server's updatedAt and
// only show the restore prompt when local is strictly newer. Equal
// timestamps are treated as already-in-sync (the server copy IS the
// last save) so we don't nag the user about no-op restores.
function maybePromptRestore(serverUpdatedAt: Date | string | undefined) {
  const draftAt = peekDraft()
  if (!draftAt) return
  const serverAt = serverUpdatedAt ? new Date(serverUpdatedAt as string | Date) : null
  if (serverAt && draftAt.getTime() <= serverAt.getTime()) {
    // Local draft is stale (or equal). Treat as no-op; clean it up so
    // we don't keep prompting on every visit.
    clearDraft()
    return
  }
  pendingDraftAt.value = draftAt
  restorePromptVisible.value = true
}

function acceptLocalDraft() {
  restoreDraft()
  restorePromptVisible.value = false
}

function discardLocalDraft() {
  clearDraft()
  restorePromptVisible.value = false
  pendingDraftAt.value = null
}

const saveDraft = async () => {
  if (application.value?.id) {
    await DatabaseService.updateApplication(
      application.value.id,
      form.value as unknown as Partial<Application>,
    )
    // Server is now authoritative — drop the local copy so the next
    // visit doesn't prompt to restore the same content we just saved.
    clearDraft()
    router.push('/applicant/applications')
  }
}

const handleSubmit = async () => {
  if (application.value?.id) {
    await DatabaseService.updateApplication(application.value.id, {
      ...form.value,
      status: 'submitted',
      submittedAt: new Date()
    } as unknown as Partial<Application>)
    clearDraft()
    router.push('/applicant/applications')
  }
}

// Watch route param changes so the autosave key follows the right
// application if the user navigates between two edit pages without a
// full reload (rare but cheap to handle).
watch(
  () => route.params.id,
  (newId, oldId) => {
    if (newId && newId !== oldId) loadApplication()
  },
)

onMounted(() => {
  loadApplication()
})
</script>

<style scoped>
.edit-application {
  padding: 2rem;
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 2rem;
}

.form-container {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.locked-card {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
  border-left: 3px solid #8b55ff;
}
.locked-card h2 {
  margin: 0 0 0.5rem;
  color: #2c3e50;
  font-size: 1.25rem;
}
.locked-card p {
  margin: 0 0 1.5rem;
  color: #6c757d;
  line-height: 1.55;
}
.locked-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.locked-actions .primary {
  background: #8b55ff;
  color: white;
  border: 0;
  border-radius: 8px;
  padding: 0.55rem 1rem;
  font-weight: 600;
  cursor: pointer;
}
.locked-actions .primary:hover { background: #7a44e6; }
.locked-actions .secondary {
  background: transparent;
  color: #2c3e50;
  border: 1px solid rgba(14, 18, 23, 0.12);
  border-radius: 8px;
  padding: 0.55rem 1rem;
  font-weight: 600;
  cursor: pointer;
}
.locked-actions .secondary:hover { background: rgba(14, 18, 23, 0.04); }

.restore-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  color: #92400e;
  font-size: 0.9rem;
}

.restore-banner-text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.restore-banner-text strong {
  font-weight: 600;
}

.restore-banner-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.restore-btn-primary,
.restore-btn-secondary {
  padding: 0.4rem 0.85rem;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
}

.restore-btn-primary {
  background: #92400e;
  color: white;
}

.restore-btn-secondary {
  background: white;
  color: #92400e;
  border-color: #fde68a;
}

.autosave-status {
  font-size: 0.8rem;
  color: #6b7280;
  margin-bottom: 1rem;
}

.autosave-status[data-status='saving'] {
  color: #92400e;
}

.autosave-status[data-status='error'] {
  color: #b91c1c;
}

.autosave-status[data-status='saved'] {
  color: #15803d;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.form-actions {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
}

.form-actions button {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.form-actions button:first-child {
  background: #6b7280;
  color: white;
}

.form-actions button:last-child {
  background: var(--color-primary);
  color: white;
}

.loading, .error {
  text-align: center;
  padding: 2rem;
}
</style>
