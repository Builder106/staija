<template>
  <div class="notification-bell" ref="container">
    <button class="bell-btn" @click="toggleDropdown">
      <span class="icon"><Icon icon="lucide:bell" /></span>
      <span v-if="unreadCount > 0" class="badge">{{ unreadCount }}</span>
    </button>

    <div v-if="isOpen" class="dropdown">
      <div class="header">
        <h3>Notifications</h3>
        <button v-if="unreadCount > 0" @click="markAllRead" class="text-btn">Mark all read</button>
      </div>

      <div v-if="loading" class="loading">Loading...</div>

      <div v-else-if="notifications.length === 0" class="empty">No notifications</div>

      <div v-else class="list">
        <div
          v-for="n in notifications"
          :key="n.id"
          class="item"
          :class="{ unread: !n.read }"
          @click="handleNotificationClick(n)"
        >
          <div class="item-content">
            <strong>{{ n.title }}</strong>
            <p>{{ n.message }}</p>
            <span class="time">{{ formatDate(n.createdAt) }}</span>
          </div>
          <div v-if="!n.read" class="dot"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { AuthService } from '../../services/firebase';
import { NotificationService, type AppNotification } from '../../services/notificationService';

const router = useRouter();
const notifications = ref<AppNotification[]>([]);
const unreadCount = ref(0);
const isOpen = ref(false);
const loading = ref(false);
const container = ref<HTMLElement | null>(null);
let pollInterval: ReturnType<typeof setInterval> | number | undefined;

const loadNotifications = async () => {
  const user = AuthService.getCurrentUser();
  if (!user) return;

  try {
    const [unread, all] = await Promise.all([
      NotificationService.getUnreadNotifications(user.uid),
      NotificationService.getAllNotifications(user.uid),
    ]);
    unreadCount.value = unread.length;
    notifications.value = all;
  } catch (e) {
    console.error('Failed to load notifications', e);
  }
};

const toggleDropdown = () => {
  isOpen.value = !isOpen.value;
  if (isOpen.value) loadNotifications();
};

const markAllRead = async () => {
  const user = AuthService.getCurrentUser();
  if (!user) return;
  await NotificationService.markAllAsRead(user.uid);
  unreadCount.value = 0;
  notifications.value.forEach(n => (n.read = true));
};

const handleNotificationClick = async (n: AppNotification) => {
  if (!n.read && n.id) {
    await NotificationService.markAsRead(n.id);
    n.read = true;
    unreadCount.value = Math.max(0, unreadCount.value - 1);
  }

  // Handle navigation based on type
  if (n.type === 'connection_request') {
    // Maybe navigate to profile or connections page
    // For now, reload to refresh state if on related page
  }

  if (typeof n.data?.url === 'string') {
    router.push(n.data.url);
  }

  isOpen.value = false;
};

const formatDate = (date: Date | { toDate?: () => Date } | string | number | null | undefined) => {
  if (!date) return '';
  const d =
    typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function'
      ? date.toDate()
      : new Date(date as string | number | Date);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(d);
};

const closeOnClickOutside = (e: MouseEvent) => {
  if (container.value && !container.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  loadNotifications();
  pollInterval = setInterval(loadNotifications, 30000); // Poll every 30s
  document.addEventListener('click', closeOnClickOutside);
});

onUnmounted(() => {
  clearInterval(pollInterval);
  document.removeEventListener('click', closeOnClickOutside);
});
</script>

<style scoped>
.notification-bell {
  position: relative;
}
.bell-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  position: relative;
  padding: 0.5rem;
}
.badge {
  position: absolute;
  top: 0;
  right: 0;
  background: var(--color-error);
  color: white;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: bold;
}
.dropdown {
  position: absolute;
  right: 0;
  top: 100%;
  width: 320px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
  border: 1px solid #eee;
}
.header {
  padding: 1rem;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header h3 {
  margin: 0;
  font-size: 1rem;
}
.text-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 0.8rem;
}

.list {
  max-height: 400px;
  overflow-y: auto;
}
.item {
  padding: 1rem;
  border-bottom: 1px solid #f5f5f5;
  cursor: pointer;
  display: flex;
  gap: 0.5rem;
  transition: background 0.2s;
}
.item:hover {
  background: #f9f9f9;
}
.item.unread {
  background: #f0f7ff;
}
.item-content {
  flex: 1;
}
.item-content p {
  margin: 0.2rem 0;
  font-size: 0.9rem;
  color: #555;
}
.time {
  font-size: 0.75rem;
  color: #999;
}
.dot {
  width: 8px;
  height: 8px;
  background: var(--color-primary);
  border-radius: 50%;
  margin-top: 6px;
}
.empty {
  padding: 2rem;
  text-align: center;
  color: #999;
}
.loading {
  padding: 1rem;
  text-align: center;
  color: #666;
}
</style>
