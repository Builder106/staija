<template>
  <div class="directory-container">
    <div class="filters">
      <div class="search-box">
        <input
          v-model="filters.query"
          placeholder="Search by name, role, or company..."
          @input="debouncedSearch"
        />
      </div>
      <div class="filter-group">
        <UiSelect
          v-model="filters.skill"
          :match-width="false"
          placeholder="All Skills"
          :options="[
            { value: '', label: 'All Skills' },
            ...availableSkills.map(s => ({ value: s, label: s })),
          ]"
        />
        <UiSelect
          v-model="filters.location"
          :match-width="false"
          placeholder="All Locations"
          :options="[
            { value: '', label: 'All Locations' },
            ...availableLocations.map(l => ({ value: l, label: l })),
          ]"
        />
      </div>
    </div>

    <div v-if="loading" class="loading">Loading directory...</div>
    <div v-else class="grid">
      <div v-for="profile in filteredProfiles" :key="profile.uid" class="profile-card">
        <div class="profile-header">
          <AnimatedAvatar
            :src="
              resolveAvatarSrc({
                photoURL: profile.photoURL,
                avatarSlot: profile.avatarSlot,
                seed: profile.uid,
              })
            "
            :alt="`${profile.displayName} avatar`"
            state="idle"
            :size="64"
            class="avatar-anim"
          />
          <div class="info">
            <h3>{{ profile.displayName }}</h3>
            <p class="headline">{{ profile.headline || 'Alumni' }}</p>
            <p class="location" v-if="profile.location">
              <Icon icon="lucide:map-pin" class="icon" /> {{ profile.location }}
            </p>
          </div>
        </div>
        <div class="tags" v-if="profile.skills && profile.skills.length">
          <span v-for="skill in profile.skills.slice(0, 3)" :key="skill" class="tag">{{
            skill
          }}</span>
          <span v-if="profile.skills.length > 3" class="tag">+{{ profile.skills.length - 3 }}</span>
        </div>
        <div class="actions">
          <ConnectionButton :targetUid="profile.uid" v-if="currentUser?.uid !== profile.uid" />
          <button v-else class="btn-outline" @click="$router.push('/alumni/profile')">
            Edit Profile
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { computed, onMounted, ref } from 'vue';
import ConnectionButton from '../../components/alumni/ConnectionButton.vue';
import AnimatedAvatar from '../../components/avatars/AnimatedAvatar.vue';
import UiSelect from '../../components/ui/UiSelect.vue';
import { db } from '../../config/firebase';
import { resolveAvatarSrc } from '../../services/avatar';
import { AuthService } from '../../services/firebase';

interface AlumniProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  avatarSlot?: number | null;
  headline?: string;
  location?: string;
  skills?: string[];
}

const currentUser = AuthService.getCurrentUser();
const profiles = ref<AlumniProfile[]>([]);
const loading = ref(true);
const filters = ref({
  query: '',
  skill: '',
  location: '',
});

const availableSkills = computed(() => {
  const set = new Set<string>();
  profiles.value.forEach(p => p.skills?.forEach(s => set.add(s)));
  return Array.from(set).sort();
});

const availableLocations = computed(() => {
  const set = new Set<string>();
  profiles.value.forEach(p => p.location && set.add(p.location));
  return Array.from(set).sort();
});

const filteredProfiles = computed(() => {
  return profiles.value.filter(p => {
    const q = filters.value.query.toLowerCase();
    const matchQuery =
      !q || p.displayName.toLowerCase().includes(q) || p.headline?.toLowerCase().includes(q);

    const matchSkill = !filters.value.skill || p.skills?.includes(filters.value.skill);
    const matchLoc = !filters.value.location || p.location === filters.value.location;

    return matchQuery && matchSkill && matchLoc;
  });
});

const loadProfiles = async () => {
  loading.value = true;
  try {
    // In a real app with many users, we'd paginate and filter server-side (Algolia/Typesense recommended)
    // For Phase 3B MVP, client-side filtering of "alumni" role users is acceptable
    const q = query(collection(db, 'users'), where('role', 'in', ['alumni', 'admin']), limit(50));
    const snap = await getDocs(q);
    // directoryHidden=true is an opt-out from this directory. Filtering
    // client-side because adding a where('directoryHidden', '!=', true)
    // would also exclude every existing doc that hasn't been touched
    // since the field was introduced.
    profiles.value = snap.docs
      .map(d => ({ uid: d.id, ...d.data() }) as AlumniProfile & { directoryHidden?: boolean })
      .filter(p => !p.directoryHidden);
  } catch (e) {
    console.error('Failed to load directory', e);
  } finally {
    loading.value = false;
  }
};

const debouncedSearch = () => {
  // Client-side filtering is instant, but good practice stub
};

onMounted(loadProfiles);
</script>

<style scoped>
.directory-container {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}
.filters {
  margin-bottom: 2rem;
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.search-box input {
  padding: 0.5rem 1rem;
  border-radius: 8px;
  border: 1px solid #ddd;
  width: 300px;
}
.filter-group select {
  padding: 0.5rem;
  border-radius: 8px;
  border: 1px solid #ddd;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}
.profile-card {
  background: white;
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.profile-header {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}
.avatar-anim {
  flex-shrink: 0;
}
.info h3 {
  margin: 0;
  font-size: 1.1rem;
}
.headline {
  margin: 0.2rem 0;
  color: #666;
  font-size: 0.9rem;
}
.location {
  margin: 0;
  color: #888;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.icon {
  font-size: 0.9rem;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.tag {
  background: #f0f4ff;
  color: #0052cc;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.75rem;
}
.actions {
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}
.btn-outline {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 20px;
  cursor: pointer;
}
</style>
