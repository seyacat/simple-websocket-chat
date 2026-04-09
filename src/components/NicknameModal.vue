<template>
  <div v-if="show" class="nickname-modal-overlay">
    <div class="nickname-modal">
      <h2>Welcome to IRC Chat</h2>
      <p>Enter your nickname to get started</p>

      <input
        v-model="inputName"
        type="text"
        placeholder="Nickname (3-20 chars)"
        maxlength="20"
        @keyup.enter="submit"
        class="nickname-input"
      />

      <p v-if="error" class="error">{{ error }}</p>

      <button @click="submit" class="primary">Join Chat</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useConnectionStore } from '../stores/connectionStore'

const connectionStore = useConnectionStore()

const inputName = ref('')
const error = ref('')

const show = computed(() => !connectionStore.nicknameSet)

const submit = () => {
  const name = inputName.value.trim()

  if (name.length < 3) {
    error.value = 'Nickname must be at least 3 characters'
    return
  }

  if (name.length > 20) {
    error.value = 'Nickname must be max 20 characters'
    return
  }

  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    error.value = 'Nickname can only contain letters, numbers, and underscore'
    return
  }

  connectionStore.setNickname(name)
  error.value = ''
}
</script>

<style scoped>
.nickname-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.nickname-modal {
  background-color: var(--color-card-bg);
  border-radius: var(--border-radius-lg);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-lg);
  max-width: 400px;
  width: 90%;
  text-align: center;
}

.nickname-modal h2 {
  margin: 0 0 var(--spacing-sm) 0;
  color: var(--color-text);
}

.nickname-modal p {
  margin: 0 0 var(--spacing-md) 0;
  color: var(--color-text-secondary);
}

.nickname-input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-md);
  font-size: 1em;
  box-sizing: border-box;
}

.error {
  color: var(--color-error);
  font-size: 0.9em;
  margin: var(--spacing-sm) 0;
}

button {
  width: 100%;
}
</style>
