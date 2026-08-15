<template>
  <section class="stories">
    <header>
      <h1>Alumni Stories</h1>
      <button class="btn" @click="startNew = !startNew">
        {{ startNew ? 'Cancel' : 'Share your story' }}
      </button>
    </header>
    <form v-if="startNew" @submit.prevent="submitStory" class="editor">
      <label>
        <span>Title</span>
        <input v-model="draft.title" required />
      </label>
      <label>
        <span>Story</span>
        <textarea v-model="draft.content" rows="6" required></textarea>
      </label>
      <div class="actions">
        <button class="btn" type="submit" :disabled="saving">
          {{ saving ? 'Submitting…' : 'Submit' }}
        </button>
        <p v-if="message" class="message">{{ message }}</p>
      </div>
    </form>
    <div class="list">
      <article v-for="s in stories" :key="s.id" class="story">
        <h3>{{ s.title }}</h3>
        <p class="muted">By {{ s.author }}</p>
        <p>{{ s.content }}</p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { onMounted, ref } from 'vue';
import { db } from '../../config/firebase';
import { AuthService } from '../../services/firebase';

type Story = {
  id?: string;
  title: string;
  content: string;
  author: string;
  createdAt?: Date | { toDate?: () => Date } | string | number | null;
};

const stories = ref<Story[]>([]);
const startNew = ref(false);
const draft = ref({ title: '', content: '' });
const saving = ref(false);
const message = ref('');

const load = async () => {
  const snap = await getDocs(collection(db, 'alumni_stories'));
  stories.value = snap.docs.map(d => ({ id: d.id, ...(d.data() as Story) }));
};

const submitStory = async () => {
  saving.value = true;
  message.value = '';
  const user = AuthService.getCurrentUser();
  if (!user) return;
  await addDoc(collection(db, 'alumni_stories'), {
    title: draft.value.title,
    content: draft.value.content,
    author: user.displayName || user.email || 'Alumni',
    createdAt: serverTimestamp(),
  });
  draft.value = { title: '', content: '' };
  startNew.value = false;
  message.value = 'Story submitted for review';
  await load();
  saving.value = false;
};

onMounted(load);
</script>

<style scoped>
.stories {
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.editor {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  background: white;
  margin-bottom: 1rem;
  display: grid;
  gap: 0.75rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
input,
textarea {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.5rem;
}
.actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.btn {
  background: var(--color-primary);
  color: white;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}
.message {
  color: var(--color-text-secondary);
}
.list {
  display: grid;
  gap: 1rem;
}
.story {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  background: white;
}
.muted {
  color: var(--color-text-secondary);
  margin: 0.25rem 0 0.5rem;
}
</style>
