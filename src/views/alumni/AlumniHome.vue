<template>
  <section class="alumni">
    <header class="alumni-header">
      <h1>Alumni</h1>
      <p class="subtitle">Welcome to the STAIJA alumni community.</p>
    </header>
    <nav class="alumni-nav">
      <RouterLink class="link" :to="{ name: 'alumni-profile' }"
        ><Icon icon="lucide:user" class="icon" /> My Profile</RouterLink
      >
      <RouterLink class="link" :to="{ name: 'alumni-directory' }"
        ><Icon icon="lucide:users" class="icon" /> Directory</RouterLink
      >
      <RouterLink class="link" :to="{ name: 'alumni-stories' }"
        ><Icon icon="lucide:book-open" class="icon" /> Stories</RouterLink
      >
    </nav>
    <div class="cards">
      <div class="card">
        <h3><Icon icon="lucide:user-circle" class="card-icon" /> Update your profile</h3>
        <p>Keep your information current to help others connect with you.</p>
        <RouterLink class="btn" :to="{ name: 'alumni-profile' }">Edit profile</RouterLink>
      </div>
      <div class="card">
        <h3><Icon icon="lucide:search" class="card-icon" /> Find fellow alumni</h3>
        <p>Discover peers by cohort, skills, or location.</p>
        <RouterLink class="btn" :to="{ name: 'alumni-directory' }">Browse directory</RouterLink>
      </div>
      <div class="card">
        <h3><Icon icon="lucide:pen-tool" class="card-icon" /> Share your story</h3>
        <p>Inspire students by sharing your journey after STAIJA.</p>
        <RouterLink class="btn" :to="{ name: 'alumni-stories' }">Share a story</RouterLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { RouterLink } from 'vue-router';
</script>

<style scoped>
.alumni {
  padding: 2rem;
  max-width: 1000px;
  margin: 0 auto;
}
.alumni-header {
  margin-bottom: 1.5rem;
}
.subtitle {
  color: var(--color-text-secondary);
}
.alumni-nav {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 2rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 1rem;
}
.link {
  text-decoration: none;
  color: var(--color-text-secondary);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: color 0.2s;
}
.link:hover,
.link.router-link-active {
  color: var(--color-primary);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.5rem;
}
.card {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.5rem;
  background: white;
  transition: transform 0.2s;
}
.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
.card h3 {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0;
  margin-bottom: 0.5rem;
  color: var(--color-heading);
}
.card-icon {
  color: var(--color-primary);
  font-size: 1.25rem;
}
.btn {
  display: inline-block;
  margin-top: 1rem;
  background: var(--color-primary);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 500;
}
.icon {
  font-size: 1.1rem;
}
</style>
