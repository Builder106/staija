<template>
  <div class="applications-list">
    <header class="page-header">
      <div class="header-content">
        <h1>My Applications</h1>
        <p class="subtitle">Track and manage your STAIJA program applications</p>
      </div>
      <div class="header-actions">
        <!-- Hidden once the user has covered every program. Points
             at the polished /apply wizard, not the retired
             NewApplication form. -->
        <button
          v-if="remainingProgram"
          @click="navigateTo(`/apply/${remainingProgramSlug}`)"
          class="btn-primary"
        >
          Apply to {{ remainingProgramLabel }}
        </button>
      </div>
    </header>

    <!-- Filters and Search -->
    <div class="filters-section">
      <div class="filters-row">
        <div class="search-box">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search applications..."
            class="search-input"
          />
        </div>
        <div class="filter-controls">
          <UiSelect
            v-model="statusFilter"
            :match-width="false"
            placeholder="All Statuses"
            :options="[
              { value: '', label: 'All Statuses' },
              { value: 'draft', label: 'Draft' },
              { value: 'submitted', label: 'Submitted' },
              { value: 'under_review', label: 'Under Review' },
              { value: 'accepted', label: 'Accepted' },
              { value: 'rejected', label: 'Rejected' },
            ]"
          />
          <UiSelect
            v-model="programFilter"
            :match-width="false"
            placeholder="All Programs"
            :options="[
              { value: '', label: 'All Programs' },
              { value: 'stepup_scholars', label: 'StepUp Scholars' },
              { value: 'dynamerge', label: 'Dynamerge' },
            ]"
          />
          <UiSelect
            v-model="sortBy"
            :match-width="false"
            :options="[
              { value: 'createdAt', label: 'Date Created' },
              { value: 'submittedAt', label: 'Date Submitted' },
              { value: 'program', label: 'Program' },
              { value: 'status', label: 'Status' },
            ]"
          />
        </div>
      </div>
    </div>

    <!-- Applications List -->
    <div class="applications-container">
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Loading your applications...</p>
      </div>

      <div v-else-if="filteredApplications.length === 0" class="empty-state">
        <div class="empty-icon"><Icon icon="lucide:clipboard-list" /></div>
        <h3>No applications found</h3>
        <p v-if="hasFilters">
          No applications match your current filters. Try adjusting your search criteria.
        </p>
        <p v-else>You haven't created any applications yet. Pick a program to get started.</p>
        <!-- Filters-applied view doesn't need a Create button — empty
             rows are an artefact of the filter, not the absence of
             work. Filters-cleared zero-state sends the user to /programs
             so they choose which to apply to, then the program page's
             Apply CTA hands off to the wizard. -->
        <button v-if="!hasFilters" @click="navigateTo('/programs')" class="btn-primary">
          Browse programs
        </button>
      </div>

      <div v-else class="applications-grid">
        <div
          v-for="application in filteredApplications"
          :key="application.id"
          class="application-card"
          @click="viewApplication(application.id!)"
        >
          <div class="card-header">
            <div class="program-badge">
              {{ application.program === 'stepup_scholars' ? 'StepUp Scholars' : 'Dynamerge' }}
            </div>
            <div class="status-badge" :class="`status-${application.status}`">
              {{ formatStatus(application.status) }}
            </div>
          </div>

          <div class="card-content">
            <h3 class="applicant-name">
              {{ application.personalInfo.firstName }} {{ application.personalInfo.lastName }}
            </h3>
            <p class="applicant-email">{{ application.personalInfo.email }}</p>

            <div class="application-details">
              <div class="detail-item">
                <span class="detail-label">Created:</span>
                <span class="detail-value">{{ formatDate(application.createdAt) }}</span>
              </div>
              <div v-if="application.submittedAt" class="detail-item">
                <span class="detail-label">Submitted:</span>
                <span class="detail-value">{{ formatDate(application.submittedAt) }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Research Interests:</span>
                <span class="detail-value"
                  >{{ application.researchInterests.slice(0, 2).join(', ')
                  }}{{ application.researchInterests.length > 2 ? '...' : '' }}</span
                >
              </div>
            </div>
          </div>

          <div class="card-actions">
            <button @click.stop="viewApplication(application.id!)" class="btn-view">
              View Details
            </button>
            <button
              v-if="application.status === 'draft'"
              @click.stop="editApplication(application.id!)"
              class="btn-edit"
            >
              Continue Editing
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Statistics -->
    <div v-if="!loading && applications.length > 0" class="statistics-section">
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-number">{{ applications.length }}</span>
          <span class="stat-label">Total Applications</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">{{ submittedCount }}</span>
          <span class="stat-label">Submitted</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">{{ draftCount }}</span>
          <span class="stat-label">Drafts</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">{{ underReviewCount }}</span>
          <span class="stat-label">Under Review</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">{{ acceptedCount }}</span>
          <span class="stat-label">Accepted</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">{{ rejectedCount }}</span>
          <span class="stat-label">Rejected</span>
        </div>
      </div>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="error-message">
      <p>{{ error }}</p>
      <button @click="loadApplications" class="btn-primary">Retry</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import UiSelect from '../../components/ui/UiSelect.vue';
import { AuthService, DatabaseService, type Application } from '../../services/firebase';

const router = useRouter();

// Reactive data
const applications = ref<Application[]>([]);
const loading = ref(true);
const error = ref('');

// Filters
const searchQuery = ref('');
const statusFilter = ref('');
const programFilter = ref('');
const sortBy = ref('createdAt');

// Apply-to-another gating. Two-program system: hide the apply button
// once the user has any application (draft or decided) covering every
// program. Mirrors ApplicantDashboard's logic.
const ALL_PROGRAMS: Application['program'][] = ['stepup_scholars', 'dynamerge'];
const remainingProgram = computed<Application['program'] | null>(() => {
  const covered = new Set(applications.value.map(a => a.program));
  return ALL_PROGRAMS.find(p => !covered.has(p)) ?? null;
});
const remainingProgramSlug = computed(() =>
  remainingProgram.value === 'stepup_scholars'
    ? 'stepup-scholars'
    : remainingProgram.value === 'dynamerge'
      ? 'dynamerge'
      : ''
);
const remainingProgramLabel = computed(() =>
  remainingProgram.value === 'stepup_scholars'
    ? 'StepUp Scholars'
    : remainingProgram.value === 'dynamerge'
      ? 'Dynamerge'
      : ''
);

const filteredApplications = computed(() => {
  let filtered = applications.value;

  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(
      app =>
        app.personalInfo.firstName.toLowerCase().includes(query) ||
        app.personalInfo.lastName.toLowerCase().includes(query) ||
        app.personalInfo.email.toLowerCase().includes(query) ||
        app.researchInterests.some(interest => interest.toLowerCase().includes(query))
    );
  }

  // Apply status filter
  if (statusFilter.value) {
    filtered = filtered.filter(app => app.status === statusFilter.value);
  }

  // Apply program filter
  if (programFilter.value) {
    filtered = filtered.filter(app => app.program === programFilter.value);
  }

  // Apply sorting
  filtered.sort((a, b) => {
    switch (sortBy.value) {
      case 'createdAt':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'submittedAt':
        if (!a.submittedAt && !b.submittedAt) return 0;
        if (!a.submittedAt) return 1;
        if (!b.submittedAt) return -1;
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      case 'program':
        return a.program.localeCompare(b.program);
      case 'status':
        return a.status.localeCompare(b.status);
      default:
        return 0;
    }
  });

  return filtered;
});

const hasFilters = computed(() => {
  return searchQuery.value || statusFilter.value || programFilter.value;
});

// Statistics
const submittedCount = computed(
  () => applications.value.filter(app => app.status === 'submitted').length
);

const draftCount = computed(() => applications.value.filter(app => app.status === 'draft').length);

const underReviewCount = computed(
  () => applications.value.filter(app => app.status === 'under_review').length
);

const acceptedCount = computed(
  () => applications.value.filter(app => app.status === 'accepted').length
);

const rejectedCount = computed(
  () => applications.value.filter(app => app.status === 'rejected').length
);

// Methods
const loadApplications = async () => {
  loading.value = true;
  error.value = '';

  try {
    const currentUser = AuthService.getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }

    const userApps = await DatabaseService.getUserApplications(currentUser.uid);
    applications.value = userApps;
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Failed to load applications';
  } finally {
    loading.value = false;
  }
};

const viewApplication = (applicationId: string) => {
  router.push(`/applicant/applications/${applicationId}`);
};

const editApplication = (applicationId: string) => {
  router.push(`/applicant/applications/${applicationId}/edit`);
};

const navigateTo = (path: string) => {
  router.push(path);
};

const formatDate = (date: Date | undefined) => {
  if (!date) return 'Unknown';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatStatus = (status: string) => {
  const statusMap: Record<string, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    under_review: 'Under Review',
    accepted: 'Accepted',
    rejected: 'Rejected',
  };
  return statusMap[status] || status;
};

// Lifecycle
onMounted(() => {
  loadApplications();
});
</script>

<style scoped>
.applications-list {
  min-height: 100vh;
  background: var(--color-background);
  padding: 2rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid var(--color-border);
}

.header-content h1 {
  color: var(--color-primary);
  margin-bottom: 0.5rem;
}

.subtitle {
  color: var(--color-text-secondary);
  font-size: 1.1rem;
}

.filters-section {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.filters-row {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.search-box {
  flex: 1;
}

.search-input {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.filter-controls {
  display: flex;
  gap: 1rem;
}

.filter-select {
  padding: 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  font-size: 1rem;
  background: white;
  cursor: pointer;
}

.filter-select:focus {
  outline: none;
  border-color: var(--color-primary);
}

.applications-container {
  margin-bottom: 2rem;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--color-text-secondary);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-border);
  border-top: 4px solid var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.empty-state h3 {
  color: var(--color-text);
  margin-bottom: 0.5rem;
}

.applications-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
}

.application-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all 0.2s;
}

.application-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.program-badge {
  background: var(--color-primary);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
}

.status-draft {
  background: #fef3c7;
  color: #92400e;
}

.status-submitted {
  background: #dbeafe;
  color: #1e40af;
}

.status-under_review {
  background: #fef3c7;
  color: #92400e;
}

.status-accepted {
  background: #d1fae5;
  color: #065f46;
}

.status-rejected {
  background: #fee2e2;
  color: #991b1b;
}

.card-content {
  margin-bottom: 1rem;
}

.applicant-name {
  margin: 0 0 0.25rem;
  color: var(--color-text);
  font-size: 1.1rem;
}

.applicant-email {
  margin: 0 0 1rem;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.application-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-label {
  font-weight: 500;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.detail-value {
  color: var(--color-text);
  font-size: 0.9rem;
}

.card-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-view,
.btn-edit {
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
  flex: 1;
}

.btn-view {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.btn-view:hover {
  background: var(--color-primary);
  color: white;
}

.btn-edit {
  color: var(--color-secondary);
  border-color: var(--color-secondary);
}

.btn-edit:hover {
  background: var(--color-secondary);
  color: white;
}

.statistics-section {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.stat-card {
  text-align: center;
  padding: 1rem;
  background: var(--color-background-secondary);
  border-radius: 8px;
}

.stat-number {
  display: block;
  font-size: 2rem;
  font-weight: bold;
  color: var(--color-primary);
}

.stat-label {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

.btn-primary {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--color-primary-dark);
}

.error-message {
  text-align: center;
  padding: 2rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #dc2626;
}

.error-message p {
  margin-bottom: 1rem;
}

@media (max-width: 768px) {
  .applications-list {
    padding: 1rem;
  }

  .page-header {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }

  .filters-row {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-controls {
    flex-direction: column;
  }

  .applications-grid {
    grid-template-columns: 1fr;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
