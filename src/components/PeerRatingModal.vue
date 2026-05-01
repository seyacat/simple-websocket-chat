<template>
  <div v-if="member" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <button class="close-btn" @click="$emit('close')" aria-label="Close">×</button>

      <h3 class="modal-title">{{ displayName }}</h3>
      <div class="modal-token">Token: <code>{{ member.token }}</code></div>

      <div v-if="!member.pubkey" class="muted">
        Esperando verificación de identidad…
      </div>

      <template v-else>
        <div class="row">
          <label>Nickname personalizado</label>
          <input
            v-model="customNickname"
            type="text"
            maxlength="40"
            placeholder="Sobrescribe el nickname público"
          />
        </div>

        <div class="row">
          <label>Calificación</label>
          <div class="stars">
            <button
              v-for="n in 5"
              :key="n"
              type="button"
              class="star"
              :class="{ active: n <= rating }"
              @click="rating = n"
              :aria-label="`${n} ${n === 1 ? 'estrella' : 'estrellas'}`"
            >★</button>
            <button
              type="button"
              class="clear"
              @click="rating = 0"
              v-if="rating > 0"
            >limpiar</button>
          </div>
        </div>

        <div class="row">
          <label>Notas</label>
          <textarea
            v-model="notes"
            rows="3"
            maxlength="500"
            placeholder="Anotaciones privadas (no se comparten)"
          ></textarea>
        </div>

        <div class="actions">
          <button class="primary" @click="save" :disabled="saving">
            {{ saving ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>

        <details class="raw">
          <summary>Pubkey</summary>
          <pre>{{ shortPubkey }}</pre>
        </details>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoomStore } from '../stores/roomStore'

const props = defineProps({
  member: { type: Object, default: null }
})
const emit = defineEmits(['close'])

const roomStore = useRoomStore()

const rating = ref(0)
const notes = ref('')
const customNickname = ref('')
const saving = ref(false)

const displayName = computed(() => {
  return props.member?.peer?.nickname || props.member?.nickname || ''
})

const shortPubkey = computed(() => {
  if (!props.member?.pubkey) return ''
  const k = props.member.pubkey
  return k.length > 80 ? k.slice(0, 40) + '…' + k.slice(-20) : k
})

watch(() => props.member, (m) => {
  if (m?.peer) {
    rating.value = m.peer.rating || 0
    notes.value = m.peer.notes || ''
    customNickname.value = m.peer.nickname || ''
  } else {
    rating.value = 0
    notes.value = ''
    customNickname.value = ''
  }
}, { immediate: true })

const save = async () => {
  if (!props.member?.pubkey) return
  saving.value = true
  try {
    if (customNickname.value.trim()) {
      await roomStore.setPeerNickname(props.member.pubkey, customNickname.value.trim())
    }
    await roomStore.ratePeer(props.member.pubkey, rating.value, notes.value || undefined)
    emit('close')
  } catch (e) {
    console.error(e)
    alert('No se pudo guardar: ' + (e.message || e))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
  padding: var(--spacing-md);
}
.modal {
  background: var(--color-card-bg);
  color: var(--color-text);
  border-radius: var(--border-radius-lg);
  padding: var(--spacing-lg);
  width: 100%; max-width: 420px;
  box-shadow: var(--shadow-lg);
  position: relative;
}
.close-btn {
  position: absolute; top: 0.5rem; right: 0.5rem;
  background: transparent; border: none; font-size: 1.5rem;
  color: var(--color-text-secondary); cursor: pointer; padding: 0.25rem 0.5rem;
}
.close-btn:hover { color: var(--color-text); }
.modal-title { margin: 0 0 0.25rem; }
.modal-token { color: var(--color-text-secondary); font-size: 0.9em; margin-bottom: var(--spacing-md); }
.muted { color: var(--color-text-secondary); font-style: italic; }
.row { margin-bottom: var(--spacing-md); display: flex; flex-direction: column; gap: 0.35rem; }
.row label { font-size: 0.85em; color: var(--color-text-secondary); }
input, textarea { font-size: 16px; }
.stars { display: flex; align-items: center; gap: 0.25rem; }
.star {
  background: transparent; border: none; cursor: pointer;
  font-size: 1.6rem; color: var(--color-border-dark, #999); padding: 0;
}
.star.active { color: #f5b301; }
.clear {
  margin-left: auto; background: transparent; border: 1px solid var(--color-border);
  font-size: 0.75em; padding: 0.25rem 0.5rem; border-radius: var(--border-radius-sm);
  color: var(--color-text-secondary); cursor: pointer;
}
.actions { display: flex; justify-content: flex-end; gap: var(--spacing-sm); }
.actions button { padding: 0.5rem 1.2rem; }
.raw { margin-top: var(--spacing-md); color: var(--color-text-secondary); font-size: 0.8em; }
.raw pre { white-space: pre-wrap; word-break: break-all; background: var(--color-surface-variant); padding: 0.5rem; border-radius: var(--border-radius-sm); }
</style>
