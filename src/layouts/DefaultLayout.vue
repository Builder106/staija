<script setup lang="ts">
import { ref } from 'vue';
import { RouterView } from 'vue-router';
import SiteFooter from '../components/SiteFooter.vue';
import SiteHeader from '../components/SiteHeader.vue';

// Click-feedback cursor (.cursor-click) while a mouse/pen button is held
// down anywhere on the site — layered on top of the cursor-dot default.
// Toggled via a class + pointer events rather than a plain :active CSS
// selector: :active on this root div only matches while the pointer is
// down *and* still over this exact element, which is unreliable the
// moment a descendant's own :active/cursor rule takes over. Touch is
// excluded — there's no visible cursor to swap on a touchscreen.
const isClicking = ref(false);
function onRootPointerDown(e: PointerEvent) {
  if (e.pointerType !== 'touch') isClicking.value = true;
}
function onRootPointerRelease(e: PointerEvent) {
  if (e.pointerType !== 'touch') isClicking.value = false;
}
</script>

<template>
  <!-- cursor-dot replaces the native arrow as the site-wide default.
       Links/buttons still show pointer (see .brand-surface a/button in
       style.css — a direct rule on the element always wins over an
       inherited value, regardless of the ancestor's specificity), and
       the other cursor-* utilities override this wherever they're
       applied more specifically. cursor-click, via is-clicking, wins
       while a button is held (see style.css for the specificity note). -->
  <div
    class="brand-surface min-h-screen flex flex-col bg-paper cursor-dot"
    :class="{ 'is-clicking': isClicking }"
    @pointerdown="onRootPointerDown"
    @pointerup="onRootPointerRelease"
    @pointercancel="onRootPointerRelease"
  >
    <SiteHeader />
    <main class="flex-1 flex flex-col">
      <!-- No <Transition> wrapper here. We previously had:
             <Transition name="page" mode="out-in">
               <component :is="Component" :key="route.path" />
             </Transition>
           Vue 3's <Transition mode="out-in"> + async/lazy-imported
           components has a well-known stale-state bug where the
           "enter" hook fires before the new component is actually
           ready, then the .page-enter-from class (opacity: 0) gets
           pinned to the view and never cleared. Symptom: nav and
           footer render, the middle is "blank", the Selected Element
           panel shows the route component fully mounted with content
           — but invisible. Every route component on the site is
           async (router uses `() => import(...)` for all of them) so
           this fired on any navigation.
           Removed the transition entirely. Individual views still
           have their own motion-v entrance animations, so pages
           still feel alive on mount; we just lose the cross-page
           fade. Acceptable trade for "the site actually loads". -->
      <RouterView />
    </main>
    <SiteFooter />
  </div>
</template>
