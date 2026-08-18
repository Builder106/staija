<template>
  <button
    class="connection-btn"
    :class="status"
    @click="handleClick"
    :disabled="loading || status === 'pending_sent' || status === 'connected'"
  >
    <span v-if="loading">...</span>
    <span v-else-if="status === 'connected'">Connected</span>
    <span v-else-if="status === 'pending_sent'">Request Sent</span>
    <span v-else-if="status === 'pending_received'">Accept Request</span>
    <span v-else>Connect</span>
  </button>
</template>

<script setup lang="ts">
import { onMounted, ref, toRefs, watch } from 'vue';
import { ConnectionService } from '../../services/connectionService';
import { AuthService } from '../../services/firebase';

const props = defineProps<{
  targetUid: string;
}>();

const { targetUid } = toRefs(props);
const status = ref<'connected' | 'pending_sent' | 'pending_received' | 'none'>('none');
const loading = ref(false);
const currentUser = AuthService.getCurrentUser();

const checkStatus = async () => {
  if (!currentUser) return;
  try {
    status.value = await ConnectionService.getConnectionStatus(currentUser.uid, targetUid.value);
  } catch (e) {
    console.error(e);
  }
};

const handleClick = async () => {
  if (!currentUser) return;
  loading.value = true;
  try {
    if (status.value === 'none') {
      await ConnectionService.sendRequest(currentUser.uid, targetUid.value);
      status.value = 'pending_sent';
    } else if (status.value === 'pending_received') {
      // Find the request ID - this is inefficient, in real app we might pass requestId if known
      const requests = await ConnectionService.getPendingRequests(currentUser.uid);
      const req = requests.find((r) => r.fromUid === targetUid.value);
      if (req && req.id) {
        await ConnectionService.respondToRequest(req.id, 'accepted');
        status.value = 'connected';
      }
    }
  } catch (e) {
    alert('Action failed: ' + (e as Error).message);
  } finally {
    loading.value = false;
  }
};

watch(targetUid, checkStatus);
onMounted(checkStatus);
</script>

<style scoped>
.connection-btn {
  padding: 0.5rem 1rem;
  border-radius: 20px;
  border: 1px solid var(--color-primary);
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.connection-btn:hover:not(:disabled) {
  background: var(--color-primary-light);
}

.connection-btn.connected {
  background: var(--color-success);
  border-color: var(--color-success);
  color: white;
}

.connection-btn.pending_sent {
  border-color: var(--color-text-light);
  color: var(--color-text-light);
  cursor: default;
}

.connection-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
