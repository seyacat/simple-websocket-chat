<template>
  <NicknameModal />

  <div class="app-container">
    <ConnectionStatus />

    <div class="main-layout">
      <RoomList />
      <ChatRoom />
      <MemberList />
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useConnectionStore } from './stores/connectionStore'
import NicknameModal from './components/NicknameModal.vue'
import ConnectionStatus from './components/ConnectionStatus.vue'
import RoomList from './components/RoomList.vue'
import ChatRoom from './components/ChatRoom.vue'
import MemberList from './components/MemberList.vue'

const connectionStore = useConnectionStore()

onMounted(async () => {
  try {
    await connectionStore.connect()
  } catch (error) {
    console.error('Failed to connect:', error)
  }
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
}

.main-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
  background-color: var(--color-background);
}
</style>
