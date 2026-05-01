<template>
  <div v-if="roomStore.isInRoom" class="member-list">
    <div class="member-header">
      <button class="small mobile-only back-btn" @click="$emit('back')" title="Back to chat">←</button>
      <h3>Members ({{ roomStore.members.length }})</h3>
    </div>

    <div class="member-items">
      <div
        v-for="member in sortedMembers"
        :key="member.token"
        :class="['member-item', { offline: isOffline(member) }]"
      >
        <div class="member-info">
          <span class="online-dot" :class="{ offline: isOffline(member) }"></span>
          <div class="member-name-block">
            <span class="member-name">{{ member.nickname }}</span>
            <span v-if="member.isMe" class="you-badge">(you)</span>
          </div>
        </div>
        <span class="member-token">{{ member.token }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoomStore } from '../stores/roomStore'

defineEmits(['back'])

const roomStore = useRoomStore()

const staleTime = 3 * 60 * 1000 // 3 minutes

const isOffline = (member) => {
  return !member.isMe && (Date.now() - member.lastSeen) > staleTime
}

const sortedMembers = computed(() => {
  return [...roomStore.members].sort((a, b) => {
    // Self first
    if (a.isMe) return -1
    if (b.isMe) return 1
    // Then by nickname alphabetically
    return a.nickname.localeCompare(b.nickname)
  })
})
</script>

<style scoped>
.member-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-left: 1px solid var(--color-border);
  padding: var(--spacing-md);
  background-color: var(--color-surface);
  min-width: 180px;
  max-width: 240px;
  overflow: hidden;
}

.member-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.member-header h3 {
  margin: 0;
  font-size: 1.05em;
}

.mobile-only { display: none; }

@media (max-width: 768px) {
  .member-list {
    max-width: 100%;
    min-width: 0;
    border-left: none;
  }
  .mobile-only { display: inline-flex; }
}

.member-items {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.member-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm);
  border-radius: var(--border-radius-md);
  background-color: var(--color-background);
  transition: background-color 0.2s;
  font-size: 0.9em;
}

.member-item:hover {
  background-color: var(--color-surface-variant);
}

.member-item.offline {
  opacity: 0.6;
}

.member-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1;
  min-width: 0;
}

.online-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-success);
  flex-shrink: 0;
}

.online-dot.offline {
  background-color: var(--color-text-tertiary);
}

.member-name-block {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  min-width: 0;
}

.member-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.you-badge {
  font-size: 0.8em;
  color: var(--color-primary);
  white-space: nowrap;
}

.member-token {
  font-family: monospace;
  font-size: 0.8em;
  color: var(--color-text-tertiary);
  white-space: nowrap;
  margin-left: auto;
  margin-left: 4px;
}
</style>
