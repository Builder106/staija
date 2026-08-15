<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Use Ojuju (African-designed accent, wght=500) instead of the default
     * Plex Mono "lab notebook" tell. Scoped to Dynamerge/StepUp program
     * pages only — see docs/TYPOGRAPHY-SYSTEM.md. Generic pages (Home,
     * About, Blog) should never pass this. */
    accent?: boolean;
  }>(),
  {
    accent: false,
  }
);
</script>

<template>
  <!--
    Eyebrows render in IBM Plex Mono by default — a deliberate "lab
    notebook" tell. Mono on small uppercase labels ("OUR MISSION",
    "PROGRAMS") gives the page a research/data posture without dragging
    the rest of the typography toward technical austerity.
  -->
  <span
    class="uppercase tracking-[0.14em]"
    :class="
      accent
        ? 'font-accent-african-secondary text-lg font-extrabold'
        : 'font-mono text-[11px] font-medium'
    "
  >
    <slot />
  </span>
</template>
