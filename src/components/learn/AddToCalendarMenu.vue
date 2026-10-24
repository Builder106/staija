<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  downloadIcsFile,
  generateIcsCalendar,
  getGoogleCalendarUrl,
  getOffice365Url,
  getOutlookLiveUrl,
  getYahooCalendarUrl,
  sessionToCalendarEvent,
  type CalendarEventInput,
} from '../../services/calendarExport';
import type { LiveSession } from '../../services/types';

interface Props {
  session?: LiveSession | null;
  event?: CalendarEventInput | null;
  label?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md';
  align?: 'left' | 'right';
}

const props = withDefaults(defineProps<Props>(), {
  session: null,
  event: null,
  label: 'Add to calendar',
  variant: 'outline',
  size: 'md',
  align: 'right',
});

const isOpen = ref(false);
const copied = ref(false);
const menuRef = ref<HTMLElement | null>(null);

const resolvedEvent = computed<CalendarEventInput | null>(() => {
  if (props.event) return props.event;
  if (props.session) return sessionToCalendarEvent(props.session);
  return null;
});

function toggleMenu() {
  isOpen.value = !isOpen.value;
}

function closeMenu() {
  isOpen.value = false;
}

function handleIcsDownload() {
  if (!resolvedEvent.value) return;
  const icsContent = generateIcsCalendar(resolvedEvent.value);
  const filename = `${resolvedEvent.value.title || 'session'}.ics`;
  downloadIcsFile(filename, icsContent);
  closeMenu();
}

function openWebCalendar(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
  closeMenu();
}

async function copyMeetingLink() {
  const url = resolvedEvent.value?.meetingUrl || resolvedEvent.value?.location;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
      closeMenu();
    }, 1200);
  } catch (err) {
    console.warn('Failed to copy meeting link:', err);
  }
}

function handleClickOutside(event: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    closeMenu();
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) {
    closeMenu();
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleKeydown);
});

const buttonClasses = computed(() => {
  const base =
    'inline-flex items-center justify-center font-medium transition-colors rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-violet/50';
  const sizeClasses =
    props.size === 'sm' ? 'px-2.5 py-1 text-xs gap-1.5' : 'px-3.5 py-2 text-sm gap-2';

  let variantStyle: string;
  switch (props.variant) {
    case 'primary':
      variantStyle = 'bg-brand-violet text-white hover:opacity-90';
      break;
    case 'secondary':
      variantStyle = 'bg-ink/10 text-ink hover:bg-ink/15';
      break;
    case 'ghost':
      variantStyle = 'bg-transparent text-ink/70 hover:bg-ink/5 hover:text-ink';
      break;
    case 'outline':
    default:
      variantStyle = 'border hairline-ink bg-surface text-ink/80 hover:bg-ink/5 hover:text-ink';
      break;
  }

  return `${base} ${sizeClasses} ${variantStyle}`;
});
</script>

<template>
  <div v-if="resolvedEvent" ref="menuRef" class="relative inline-block text-left">
    <button
      type="button"
      :class="buttonClasses"
      :aria-expanded="isOpen"
      aria-haspopup="menu"
      @click.stop="toggleMenu"
    >
      <Icon icon="lucide:calendar-plus" :width="size === 'sm' ? 14 : 16" />
      <span>{{ label }}</span>
      <Icon
        icon="lucide:chevron-down"
        :width="size === 'sm' ? 12 : 14"
        class="transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
      />
    </button>

    <div
      v-if="isOpen"
      role="menu"
      aria-orientation="vertical"
      class="absolute z-30 mt-2 w-56 rounded-md bg-surface border hairline-ink shadow-lg py-1 focus:outline-none"
      :class="align === 'right' ? 'right-0' : 'left-0'"
    >
      <button
        type="button"
        role="menuitem"
        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-ink/80 hover:bg-ink/5 hover:text-ink text-left transition-colors"
        @click="openWebCalendar(getGoogleCalendarUrl(resolvedEvent))"
      >
        <Icon icon="simple-icons:googlecalendar" width="14" class="text-brand-violet" />
        <span>Google Calendar</span>
      </button>

      <button
        type="button"
        role="menuitem"
        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-ink/80 hover:bg-ink/5 hover:text-ink text-left transition-colors"
        @click="handleIcsDownload"
      >
        <Icon icon="lucide:calendar-arrow-down" width="14" class="text-ink/60" />
        <span>Apple Calendar (.ics)</span>
      </button>

      <button
        type="button"
        role="menuitem"
        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-ink/80 hover:bg-ink/5 hover:text-ink text-left transition-colors"
        @click="openWebCalendar(getOutlookLiveUrl(resolvedEvent))"
      >
        <Icon icon="lucide:mail" width="14" class="text-ink/60" />
        <span>Outlook Web</span>
      </button>

      <button
        type="button"
        role="menuitem"
        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-ink/80 hover:bg-ink/5 hover:text-ink text-left transition-colors"
        @click="openWebCalendar(getOffice365Url(resolvedEvent))"
      >
        <Icon icon="lucide:briefcase" width="14" class="text-ink/60" />
        <span>Office 365</span>
      </button>

      <button
        type="button"
        role="menuitem"
        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-ink/80 hover:bg-ink/5 hover:text-ink text-left transition-colors"
        @click="openWebCalendar(getYahooCalendarUrl(resolvedEvent))"
      >
        <Icon icon="lucide:calendar" width="14" class="text-ink/60" />
        <span>Yahoo Calendar</span>
      </button>

      <div v-if="resolvedEvent.meetingUrl" class="my-1 border-t hairline-ink"></div>

      <button
        v-if="resolvedEvent.meetingUrl"
        type="button"
        role="menuitem"
        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-left transition-colors"
        :class="
          copied
            ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30'
            : 'text-ink/80 hover:bg-ink/5 hover:text-ink'
        "
        @click="copyMeetingLink"
      >
        <Icon
          :icon="copied ? 'lucide:check' : 'lucide:copy'"
          width="14"
          :class="copied ? 'text-emerald-600' : 'text-ink/60'"
        />
        <span>{{ copied ? 'Link copied!' : 'Copy meeting link' }}</span>
      </button>
    </div>
  </div>
</template>
