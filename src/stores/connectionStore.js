import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getWebSocketProxyClient } from '../services/WebSocketProxyClient'
import { sanitizeNickname } from '../utils/sanitize'

export const useConnectionStore = defineStore('connection', () => {
  // Get singleton WebSocket client
  const wsProxyClient = getWebSocketProxyClient()

  // State
  const token = ref(null)
  const isConnected = ref(false)
  const connectionError = ref(null)
  const wsUrl = ref(import.meta.env.VITE_WS_URL || 'wss://closer.click:4000')
  const nickname = ref(sanitizeNickname(localStorage.getItem('chat_nickname') || ''))
  const nicknameSet = computed(() => nickname.value.trim().length > 0)

  let handlersSetup = false

  // Actions
  const connect = async () => {
    try {
      connectionError.value = null
      wsProxyClient.updateConfig({ url: wsUrl.value })
      await wsProxyClient.connect()

      if (!handlersSetup) {
        setupProxyEventHandlers()
        handlersSetup = true
      }

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
    wsProxyClient.on('token_assigned', (assignedToken) => {
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

    wsProxyClient.on('message', (fromToken, message, timestamp, parsedMessage) => {
      // Lazy import to avoid circular dependency
      import('./roomStore.js').then(mod => {
        const roomStore = mod.useRoomStore()
        roomStore.handleIncomingMessage(fromToken, message)
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
