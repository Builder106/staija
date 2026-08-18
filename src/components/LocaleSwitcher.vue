<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { SUPPORTED_LOCALES, setLocale, type LocaleCode } from '../i18n';

const { locale } = useI18n();
const open = ref(false);
const root = ref<HTMLElement | null>(null);

const current = computed(
  () => SUPPORTED_LOCALES.find((l) => l.code === locale.value) ?? SUPPORTED_LOCALES[0],
);

function pick(code: LocaleCode) {
  setLocale(code);
  open.value = false;
}

function onClickOutside(e: MouseEvent) {
  if (!root.value) return;
  if (e.target instanceof Node && !root.value.contains(e.target)) {
    open.value = false;
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('click', onClickOutside);
  }
});
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('click', onClickOutside);
  }
});
</script>

<template>
  <!-- Auto-hide when only one locale is exposed. Avoids a single-item
       dropdown when SUPPORTED_LOCALES has been pared back (see PRD
       Decision §16.13) — also means the switcher self-restores the
       moment another locale gets added back to the array. -->
  <div v-if="SUPPORTED_LOCALES.length > 1" ref="root" class="relative inline-block">
    <!-- Switcher mounts inside the always-dark SiteFooter, so all
         color references use `*-static` tokens to stay coherent with
         that surface across themes (the popover would invert-and-look-
         broken if it used the flipping ink/paper tokens). -->
    <button
      type="button"
      class="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-paper-static/10 text-sm font-semibold text-paper-static/80 hover:text-paper-static hover:border-paper-static/20 transition-colors focus-ring-brand"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="open = !open"
    >
      <Icon icon="lucide:globe" width="16" />
      {{ current.nativeLabel }}
      <Icon
        icon="lucide:chevron-down"
        width="14"
        class="transition-transform"
        :class="open && 'rotate-180'"
      />
    </button>
    <ul
      v-if="open"
      role="listbox"
      class="absolute right-0 bottom-full mb-2 min-w-[160px] bg-ink-static border border-paper-static/10 rounded-xl shadow-xl py-1 z-50"
    >
      <li v-for="loc in SUPPORTED_LOCALES" :key="loc.code">
        <button
          type="button"
          role="option"
          :aria-selected="loc.code === current.code"
          class="w-full text-left px-4 py-2 text-sm font-medium text-paper-static/80 hover:bg-paper-static/5 hover:text-paper-static transition-colors flex items-center justify-between"
          @click="pick(loc.code)"
        >
          <span>{{ loc.nativeLabel }}</span>
          <Icon
            v-if="loc.code === current.code"
            icon="lucide:check"
            width="14"
            class="text-brand-violet"
          />
        </button>
      </li>
    </ul>
  </div>
</template>
