<template>
  <div class="connection-status">
    <div class="status-left">
      <h1>💬 Closer Click Chat</h1>
    </div>

    <div class="status-center">
      <div class="status-indicator" :class="statusClass">
        <span class="dot"></span>
        {{ statusText }}
      </div>
    </div>

    <div class="status-right">
      <div v-if="connectionStore.token" class="token-display">
        <span class="label">Token:</span>
        <span class="token">{{ connectionStore.token }}</span>
      </div>

      <button
        v-if="connectionStore.nickname"
        class="nickname-button"
        @click="settingsOpen = true"
        title="Editar identidad"
      >
        @{{ connectionStore.nickname }}
      </button>

      <button
        v-if="!connectionStore.isConnected"
        @click="reconnect"
        class="small"
      >
        Reconnect
      </button>
    </div>

    <UserSettingsModal
      :open="settingsOpen"
      @close="settingsOpen = false"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useConnectionStore } from '../stores/connectionStore'
import UserSettingsModal from './UserSettingsModal.vue'

const connectionStore = useConnectionStore()
const settingsOpen = ref(false)

const statusText = computed(() => {
  if (connectionStore.isConnected) return 'Connected'
  if (connectionStore.connectionError) return 'Disconnected'
  return 'Connecting...'
})

const statusClass = computed(() => {
  if (connectionStore.isConnected) return 'connected'
  if (connectionStore.connectionError) return 'error'
  return 'connecting'
})

const reconnect = () => {
  connectionStore.connect()
}
</script>

<style scoped>
.connection-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-header-bg);
  color: var(--color-text-on-primary);
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.status-left h1 {
  margin: 0;
  font-size: 1.5em;
  color: white;
}

.status-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 0.95em;
  font-weight: 500;
}

.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #fff;
}

.status-indicator.connected .dot {
  background-color: #34ce57;
}

.status-indicator.error .dot {
  background-color: #dc3545;
  animation: pulse 1s infinite;
}

.status-indicator.connecting .dot {
  background-color: #ffc107;
  animation: pulse 0.6s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.token-display,
.nickname-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 0.9em;
}

.nickname-button {
  background: rgba(255, 255, 255, 0.12);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--border-radius-sm);
  padding: 0.3em 0.7em;
  font-size: 0.9em;
  cursor: pointer;
  transition: background 0.2s;
}
.nickname-button:hover {
  background: rgba(255, 255, 255, 0.25);
}

.label {
  opacity: 0.9;
}

.token {
  font-family: monospace;
  font-weight: bold;
  background-color: rgba(255, 255, 255, 0.2);
  padding: 2px 8px;
  border-radius: 4px;
}

button.small {
  padding: 0.4em 0.8em;
  font-size: 0.85em;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

button.small:hover {
  background-color: rgba(255, 255, 255, 0.3);
}

@media (max-width: 768px) {
  .connection-status {
    padding: var(--spacing-sm) var(--spacing-md);
    gap: var(--spacing-sm);
  }
  .status-left h1 {
    font-size: 1.05em;
    white-space: nowrap;
  }
  .status-center {
    flex: 0;
  }
  .status-indicator {
    font-size: 0.75em;
  }
  .status-right {
    gap: var(--spacing-sm);
    font-size: 0.8em;
  }
  .token-display {
    display: none;
  }
  .nickname-display .label {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
  }
}
</style>
