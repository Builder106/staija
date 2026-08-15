<template>
  <section class="profile">
    <div class="header">
      <h1>My Alumni Profile</h1>
      <div class="visibility-toggle">
        <span>Public visibility</span>
        <label class="switch">
          <input
            type="checkbox"
            v-model="form.visibility"
            :true-value="'public'"
            :false-value="'private'"
          />
          <span class="slider round"></span>
        </label>
      </div>
    </div>

    <form @submit.prevent="save">
      <div class="avatar-section">
        <div class="avatar-preview">
          <AnimatedAvatar
            :src="
              resolveAvatarSrc({
                photoURL: form.photoURL,
                avatarSlot: form.avatarSlot,
                seed: currentUid,
              })
            "
            alt="Profile Photo"
            state="hero"
            :size="100"
          />
        </div>
        <div class="avatar-actions">
          <label class="btn-outline">
            Upload Photo
            <input type="file" @change="handleFileChange" accept="image/*" hidden />
          </label>
          <span v-if="uploading" class="uploading">Uploading...</span>
        </div>
      </div>

      <div class="grid">
        <label>
          <span>Display name</span>
          <input v-model="form.displayName" required />
        </label>
        <label>
          <span>Headline</span>
          <input v-model="form.headline" placeholder="e.g., ML Engineer at X" />
        </label>

        <label class="full">
          <span>Bio</span>
          <textarea
            v-model="form.bio"
            rows="4"
            placeholder="Tell us about your journey..."
          ></textarea>
        </label>

        <label>
          <span>Location</span>
          <input v-model="form.location" placeholder="City, Country" />
        </label>

        <label class="full">
          <span>Social Links</span>
          <div class="links-grid">
            <input v-model="form.links.linkedin" placeholder="LinkedIn URL" />
            <input v-model="form.links.twitter" placeholder="Twitter URL" />
            <input v-model="form.links.github" placeholder="GitHub URL" />
            <input v-model="form.links.website" placeholder="Personal Website" />
          </div>
        </label>

        <label class="full">
          <span>Skills</span>
          <div class="chip-input">
            <div class="chips">
              <span v-for="(skill, index) in form.skills" :key="index" class="chip">
                {{ skill }}
                <button type="button" @click="removeSkill(index)" class="chip-remove">×</button>
              </span>
            </div>
            <input
              v-model="newSkill"
              @keydown.enter.prevent="addSkill"
              placeholder="Type skill and press Enter"
            />
          </div>
        </label>
      </div>

      <div class="actions">
        <button class="btn" type="submit" :disabled="saving || uploading">
          {{ saving ? 'Saving…' : 'Save changes' }}
        </button>
        <p v-if="message" class="message" :class="{ error: isError }">{{ message }}</p>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { computed, onMounted, ref } from 'vue';
import AnimatedAvatar from '../../components/avatars/AnimatedAvatar.vue';
import { db } from '../../config/firebase';
import { resolveAvatarSrc } from '../../services/avatar';
import { AuthService, StorageService, type UserProfile } from '../../services/firebase';

type AlumniProfile = UserProfile & {
  headline?: string;
  bio?: string;
  location?: string;
  skills?: string[];
  links?: {
    linkedin?: string;
    twitter?: string;
    github?: string;
    website?: string;
  };
  visibility?: 'public' | 'private';
};

const form = ref({
  displayName: '',
  photoURL: '',
  avatarSlot: null as number | null,
  headline: '',
  bio: '',
  location: '',
  skills: [] as string[],
  links: {
    linkedin: '',
    twitter: '',
    github: '',
    website: '',
  },
  visibility: 'public' as 'public' | 'private',
});

const currentUid = computed(() => AuthService.getCurrentUser()?.uid ?? 'staija-default');

const newSkill = ref('');
const saving = ref(false);
const uploading = ref(false);
const message = ref('');
const isError = ref(false);

const load = async () => {
  const user = AuthService.getCurrentUser();
  if (!user) return;

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return;

    const data = snap.data() as AlumniProfile;
    form.value.displayName = data.displayName || user.displayName || '';
    form.value.photoURL = data.photoURL || user.photoURL || '';
    form.value.avatarSlot = data.avatarSlot ?? null;
    form.value.headline = data.headline || '';
    form.value.bio = data.bio || '';
    form.value.location = data.location || '';
    form.value.skills = data.skills || [];
    form.value.links = {
      linkedin: data.links?.linkedin || '',
      twitter: data.links?.twitter || '',
      github: data.links?.github || '',
      website: data.links?.website || '',
    };
    form.value.visibility = data.visibility || 'public';
  } catch (e) {
    console.error('Failed to load profile', e);
  }
};

const addSkill = () => {
  const val = newSkill.value.trim();
  if (val && !form.value.skills.includes(val)) {
    form.value.skills.push(val);
  }
  newSkill.value = '';
};

const removeSkill = (index: number) => {
  form.value.skills.splice(index, 1);
};

const handleFileChange = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const user = AuthService.getCurrentUser();
  if (!user) return;

  uploading.value = true;
  message.value = '';

  try {
    const path = `avatars/${user.uid}/${Date.now()}_${file.name}`;
    const url = await StorageService.uploadFile(file, path);
    form.value.photoURL = url;
    // Auto-save photo URL to auth profile immediately for consistency
    await AuthService.updateProfile({ photoURL: url });
  } catch (e) {
    console.error(e);
    message.value = 'Failed to upload image';
    isError.value = true;
  } finally {
    uploading.value = false;
  }
};

const save = async () => {
  saving.value = true;
  message.value = '';
  isError.value = false;

  const user = AuthService.getCurrentUser();
  if (!user) return;

  try {
    const userRef = doc(db, 'users', user.uid);
    const currentData = (await getDoc(userRef)).data();

    const updates: Partial<AlumniProfile> = {
      displayName: form.value.displayName,
      photoURL: form.value.photoURL,
      headline: form.value.headline,
      bio: form.value.bio,
      location: form.value.location,
      skills: form.value.skills,
      links: form.value.links,
      visibility: form.value.visibility,
      updatedAt: new Date(),
    };

    await setDoc(userRef, { ...currentData, ...updates });

    // Sync basic info to auth profile
    if (form.value.displayName !== user.displayName) {
      await AuthService.updateProfile({ displayName: form.value.displayName });
    }

    message.value = 'Profile saved successfully';
  } catch (e) {
    console.error(e);
    message.value = 'Failed to save profile';
    isError.value = true;
  } finally {
    saving.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.profile {
  padding: 2rem;
  max-width: 800px;
  margin: 0 auto;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}
.header h1 {
  margin: 0;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}
.full {
  grid-column: 1 / -1;
}

/* Avatar */
.avatar-section {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 2rem;
}
.avatar-preview {
  display: flex;
}
.uploading {
  font-size: 0.8rem;
  color: #666;
  margin-left: 0.5rem;
}

/* Inputs */
label {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-weight: 500;
  color: #333;
}
input,
textarea {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.75rem;
  font-family: inherit;
  transition: border-color 0.2s;
}
input:focus,
textarea:focus {
  border-color: var(--color-primary);
  outline: none;
}

/* Links Grid */
.links-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

/* Chips */
.chip-input {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  background: white;
}
.chip-input input {
  border: none;
  padding: 0.25rem;
  flex: 1;
  min-width: 120px;
}
.chip-input input:focus {
  outline: none;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.chip {
  background: var(--color-primary-light);
  color: var(--color-primary);
  padding: 0.25rem 0.75rem;
  border-radius: 16px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}
.chip-remove {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0;
}

/* Actions */
.actions {
  margin-top: 2rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}
.btn {
  background: var(--color-primary);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 600;
}
.btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.btn-outline {
  border: 1px solid #ddd;
  background: white;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  display: inline-block;
  text-align: center;
}
.message {
  color: var(--color-success);
  font-weight: 500;
  margin: 0;
}
.message.error {
  color: var(--color-error);
}

/* Switch */
.switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.4s;
  border-radius: 24px;
}
.slider:before {
  position: absolute;
  content: '';
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.4s;
  border-radius: 50%;
}
input:checked + .slider {
  background-color: var(--color-primary);
}
input:checked + .slider:before {
  transform: translateX(24px);
}
.visibility-toggle {
  display: flex;
  align-items: center;
  gap: 1rem;
}

@media (max-width: 768px) {
  .grid,
  .links-grid {
    grid-template-columns: 1fr;
  }
  .header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
}
</style>
