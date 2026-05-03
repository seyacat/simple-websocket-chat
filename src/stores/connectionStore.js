import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getWebSocketProxyClient } from '@gatoseya/closer-click-proxy-client'
import { sanitizeNickname } from '../utils/sanitize'

export const useConnectionStore = defineStore('connection', () => {
  // Get singleton WebSocket client
  const wsProxyClient = getWebSocketProxyClient()

  // State
  const token = ref(null)
  const isConnected = ref(false)
  const connectionError = ref(null)
  const wsUrl = ref(import.meta.env.VITE_WS_URL || 'wss://proxy.closer.click')
  const nickname = ref(sanitizeNickname(localStorage.getItem('chat_nickname') || ''))
  const nicknameSet = computed(() => nickname.value.trim().length > 0)

  let handlersSetup = false

  // Actions
  const connect = async () => {
    try {
      connectionError.value = null
      wsProxyClient.updateConfig({ url: wsUrl.value })

      // Registrar handlers ANTES de connect para no perder el primer
      // evento 'token' que el lib emite al recibir el frame `connected`.
      if (!handlersSetup) {
        setupProxyEventHandlers()
        handlersSetup = true
      }

      const assignedToken = await wsProxyClient.connect()

      // Defensa extra por si alguna implementación futura emite token antes
      // del registro (no debería pasar con el orden de arriba).
      if (assignedToken && !token.value) token.value = assignedToken

      isConnected.value = true
    } catch (error) {
      connectionError.value = error.message
      isConnected.value = false
      console.error('Connection error:', error)
    }
  }

  const disconnect = () => {
    wsProxyClient.disconnect()
    isConnected.value = false
    token.value = null
  }

  const setNickname = (name) => {
    nickname.value = sanitizeNickname(name.trim())
    localStorage.setItem('chat_nickname', nickname.value)
  }

  const sendMessage = async (toTokens, rawMessage) => {
    try {
      await wsProxyClient.send(toTokens, rawMessage)
    } catch (error) {
      console.error('Send error:', error)
      throw error
    }
  }

  const setupProxyEventHandlers = () => {
    wsProxyClient.on('token', (assignedToken) => {
      token.value = assignedToken
    })

    wsProxyClient.on('connect', () => {
      isConnected.value = true
      connectionError.value = null
    })

    wsProxyClient.on('disconnect', () => {
      isConnected.value = false
      token.value = null
    })

    wsProxyClient.on('error', (error) => {
      connectionError.value = error.error || error.message || 'Unknown error'
      console.error('WebSocket error:', error)
    })

    wsProxyClient.on('message', (fromToken, payload) => {
      // payload may be a parsed object or string. roomStore expects the raw string.
      const raw = typeof payload === 'string' ? payload : JSON.stringify(payload)
      // Lazy import to avoid circular dependency
      import('./roomStore.js').then(mod => {
        const roomStore = mod.useRoomStore()
        roomStore.handleIncomingMessage(fromToken, raw)
      }).catch(() => {})
    })

    wsProxyClient.on('peer_disconnected', (peerToken, channel) => {
      import('./roomStore.js').then(mod => {
        const roomStore = mod.useRoomStore()
        roomStore.handlePeerDisconnected(peerToken, channel)
      }).catch(() => {})
    })

    wsProxyClient.on('channel_joined', (channel, peerToken) => {
      import('./roomStore.js').then(mod => {
        const roomStore = mod.useRoomStore()
        roomStore.handlePeerJoined(peerToken, channel)
      }).catch(() => {})
    })

    wsProxyClient.on('channel_left', (channel, peerToken) => {
      import('./roomStore.js').then(mod => {
        const roomStore = mod.useRoomStore()
        roomStore.handlePeerLeft(peerToken, channel)
      }).catch(() => {})
    })

    wsProxyClient.on('reconnecting', (attempt, maxAttempts) => {
      console.log(`Reconnecting... (${attempt}/${maxAttempts})`)
    })

    wsProxyClient.on('reconnect_failed', (attempts) => {
      connectionError.value = `Failed to reconnect after ${attempts} attempts`
    })
  }

  // Export public API
  return {
    token,
    isConnected,
    connectionError,
    wsUrl,
    nickname,
    nicknameSet,
    connect,
    disconnect,
    setNickname,
    sendMessage,
    wsProxyClient
  }
})
