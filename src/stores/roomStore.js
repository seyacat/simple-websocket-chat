import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useConnectionStore } from './connectionStore'

export const useRoomStore = defineStore('room', () => {
  const connectionStore = useConnectionStore()

  // State
  const currentRoom = ref(null)
  const rooms = ref([
    { name: 'general', memberCount: 0 },
    { name: 'random', memberCount: 0 }
  ])
  const messages = ref([])
  const members = ref([])
  const isInRoom = computed(() => !!currentRoom.value)
  const channelName = computed(() => currentRoom.value ? `chat_room_${currentRoom.value}` : null)

  let refreshInterval = null
  let heartbeatInterval = null

  // Message protocol helpers
  const formatMessage = (type, payload) => {
    return `${type}|${JSON.stringify(payload)}`
  }

  const parseMessage = (raw) => {
    const pipeIdx = raw.indexOf('|')
    if (pipeIdx === -1) return { type: null, payload: null }
    const type = raw.slice(0, pipeIdx)
    try {
      const payload = JSON.parse(raw.slice(pipeIdx + 1))
      return { type, payload }
    } catch {
      return { type: null, payload: null }
    }
  }

  // Actions
  const joinRoom = async (roomName) => {
    try {
      if (currentRoom.value) {
        await leaveRoom()
      }

      currentRoom.value = roomName
      messages.value = []
      members.value = [
        {
          token: connectionStore.token,
          nickname: connectionStore.nickname,
          lastSeen: Date.now(),
          isMe: true
        }
      ]

      // Publish to room channel
      await connectionStore.wsProxyClient.publish(
        channelName.value,
        { nickname: connectionStore.nickname, roomName }
      )

      // Get existing members
      await refreshMembers()

      // Broadcast join announcement
      const others = members.value
        .filter(m => !m.isMe)
        .map(m => m.token)

      if (others.length > 0) {
        const joinMsg = formatMessage('JOIN_ANNOUNCE', {
          nickname: connectionStore.nickname,
          roomName,
          timestamp: Date.now()
        })
        try {
          await connectionStore.sendMessage(others, joinMsg)
        } catch (e) {
          console.error('Failed to send JOIN_ANNOUNCE:', e)
        }
      }

      // Add system message
      messages.value.push({
        id: crypto.randomUUID(),
        from: 'system',
        type: 'system',
        text: `You joined #${roomName}`,
        timestamp: Date.now()
      })

      // Start intervals
      startHeartbeat()
      startMemberRefresh()

    } catch (error) {
      console.error('Join room error:', error)
      currentRoom.value = null
      throw error
    }
  }

  const leaveRoom = async () => {
    if (!currentRoom.value) return

    try {
      // Broadcast leave announcement
      const others = members.value
        .filter(m => !m.isMe)
        .map(m => m.token)

      if (others.length > 0) {
        const leaveMsg = formatMessage('LEAVE_ANNOUNCE', {
          nickname: connectionStore.nickname,
          roomName: currentRoom.value,
          timestamp: Date.now()
        })
        try {
          await connectionStore.sendMessage(others, leaveMsg)
        } catch (e) {
          console.error('Failed to send LEAVE_ANNOUNCE:', e)
        }
      }

      // Unpublish
      await connectionStore.wsProxyClient.unpublish(channelName.value)

      // Clean up
      stopHeartbeat()
      stopMemberRefresh()

      const roomName = currentRoom.value
      currentRoom.value = null
      messages.value = []
      members.value = []

      messages.value.push({
        id: crypto.randomUUID(),
        from: 'system',
        type: 'system',
        text: `You left #${roomName}`,
        timestamp: Date.now()
      })

    } catch (error) {
      console.error('Leave room error:', error)
    }
  }

  const createRoom = async (roomName) => {
    const trimmed = roomName.trim()
    if (!trimmed || trimmed.length > 32 || !/^[a-z0-9-]+$/.test(trimmed)) {
      throw new Error('Room name must be 1-32 alphanumeric chars + hyphens')
    }

    if (!rooms.value.find(r => r.name === trimmed)) {
      rooms.value.push({ name: trimmed, memberCount: 0 })
    }

    return joinRoom(trimmed)
  }

  const sendChatMessage = async (text) => {
    if (!currentRoom.value || !connectionStore.isConnected || !text.trim()) {
      return
    }

    try {
      // Get current tokens
      const tokens = await connectionStore.wsProxyClient.listChannel(channelName.value)
      const others = tokens.filter(t => t !== connectionStore.token)

      if (others.length === 0) {
        messages.value.push({
          id: crypto.randomUUID(),
          from: 'system',
          type: 'system',
          text: '(No other members in room)',
          timestamp: Date.now()
        })
        return
      }

      // Serialize and send
      const msg = formatMessage('CHAT_MSG', {
        text: text.trim(),
        nickname: connectionStore.nickname,
        roomName: currentRoom.value,
        timestamp: Date.now()
      })

      await connectionStore.sendMessage(others, msg)

      // Optimistic local echo
      messages.value.push({
        id: crypto.randomUUID(),
        from: connectionStore.token,
        nickname: connectionStore.nickname,
        type: 'chat',
        text: text.trim(),
        timestamp: Date.now(),
        isMe: true
      })

    } catch (error) {
      console.error('Send message error:', error)
      messages.value.push({
        id: crypto.randomUUID(),
        from: 'system',
        type: 'system',
        text: `Error sending message: ${error.message}`,
        timestamp: Date.now()
      })
    }
  }

  const handleIncomingMessage = (fromToken, rawMessage) => {
    if (!currentRoom.value) return

    const { type, payload } = parseMessage(rawMessage)
    if (!payload) return

    switch (type) {
      case 'CHAT_MSG':
        handleChatMessage(fromToken, payload)
        break
      case 'JOIN_ANNOUNCE':
        handleJoinAnnounce(fromToken, payload)
        break
      case 'LEAVE_ANNOUNCE':
        handleLeaveAnnounce(fromToken, payload)
        break
      case 'HEARTBEAT':
        handleHeartbeat(fromToken, payload)
        break
      case 'HEARTBEAT_ACK':
        handleHeartbeatAck(fromToken, payload)
        break
    }
  }

  const handleChatMessage = (fromToken, payload) => {
    if (payload.roomName !== currentRoom.value) return

    // Update member nickname if known
    const member = members.value.find(m => m.token === fromToken)
    if (member) {
      member.nickname = payload.nickname
      member.lastSeen = Date.now()
    } else {
      members.value.push({
        token: fromToken,
        nickname: payload.nickname,
        lastSeen: Date.now(),
        isMe: false
      })
    }

    // Add message
    messages.value.push({
      id: crypto.randomUUID(),
      from: fromToken,
      nickname: payload.nickname,
      type: 'chat',
      text: payload.text,
      timestamp: payload.timestamp || Date.now(),
      isMe: false
    })
  }

  const handleJoinAnnounce = (fromToken, payload) => {
    if (payload.roomName !== currentRoom.value) return

    // Upsert member
    let member = members.value.find(m => m.token === fromToken)
    if (member) {
      member.nickname = payload.nickname
      member.lastSeen = Date.now()
    } else {
      members.value.push({
        token: fromToken,
        nickname: payload.nickname,
        lastSeen: Date.now(),
        isMe: false
      })
    }

    // System message
    messages.value.push({
      id: crypto.randomUUID(),
      from: 'system',
      type: 'system',
      text: `${payload.nickname} joined`,
      timestamp: Date.now()
    })

    // Reply with heartbeat
    const heartbeatMsg = formatMessage('HEARTBEAT_ACK', {
      nickname: connectionStore.nickname,
      roomName: currentRoom.value,
      timestamp: Date.now()
    })
    connectionStore.sendMessage([fromToken], heartbeatMsg).catch(() => {})
  }

  const handleLeaveAnnounce = (fromToken, payload) => {
    if (payload.roomName !== currentRoom.value) return

    // Remove member
    members.value = members.value.filter(m => m.token !== fromToken)

    // System message
    messages.value.push({
      id: crypto.randomUUID(),
      from: 'system',
      type: 'system',
      text: `${payload.nickname} left`,
      timestamp: Date.now()
    })
  }

  const handleHeartbeat = (fromToken, payload) => {
    if (payload.roomName !== currentRoom.value) return

    // Update or add member
    let member = members.value.find(m => m.token === fromToken)
    if (member) {
      member.nickname = payload.nickname
      member.lastSeen = Date.now()
    } else {
      members.value.push({
        token: fromToken,
        nickname: payload.nickname,
        lastSeen: Date.now(),
        isMe: false
      })
    }
  }

  const handleHeartbeatAck = (fromToken, payload) => {
    if (payload.roomName !== currentRoom.value) return

    // Update member
    let member = members.value.find(m => m.token === fromToken)
    if (member) {
      member.nickname = payload.nickname
      member.lastSeen = Date.now()
    } else {
      members.value.push({
        token: fromToken,
        nickname: payload.nickname,
        lastSeen: Date.now(),
        isMe: false
      })
    }
  }

  const refreshMembers = async () => {
    if (!channelName.value) return

    try {
      const tokens = await connectionStore.wsProxyClient.listChannel(channelName.value)
      const staleTime = Date.now() - 3 * 60 * 1000 // 3 minutes

      // Update or add members
      for (const token of tokens) {
        if (token === connectionStore.token) continue

        let member = members.value.find(m => m.token === token)
        if (!member) {
          members.value.push({
            token,
            nickname: token,
            lastSeen: Date.now(),
            isMe: false
          })
        } else {
          member.lastSeen = Date.now()
        }
      }

      // Prune stale members (not in channel AND not seen for 3+ min)
      members.value = members.value.filter(m => {
        if (m.isMe) return true
        if (tokens.includes(m.token)) return true
        if (m.lastSeen > staleTime) return true
        return false
      })

    } catch (error) {
      console.error('Refresh members error:', error)
    }
  }

  const sendHeartbeat = async () => {
    if (!currentRoom.value || !connectionStore.isConnected) return

    try {
      const tokens = await connectionStore.wsProxyClient.listChannel(channelName.value)
      const others = tokens.filter(t => t !== connectionStore.token)

      if (others.length === 0) return

      const msg = formatMessage('HEARTBEAT', {
        nickname: connectionStore.nickname,
        roomName: currentRoom.value,
        timestamp: Date.now()
      })

      await connectionStore.sendMessage(others, msg)
    } catch (error) {
      // Silently ignore heartbeat failures
    }
  }

  const startHeartbeat = () => {
    if (heartbeatInterval) return
    heartbeatInterval = setInterval(() => {
      sendHeartbeat()
    }, 30000) // 30 seconds
  }

  const stopHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval)
      heartbeatInterval = null
    }
  }

  const startMemberRefresh = () => {
    if (refreshInterval) return
    refreshInterval = setInterval(() => {
      refreshMembers()
    }, 60000) // 60 seconds
  }

  const stopMemberRefresh = () => {
    if (refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
    }
  }

  const listPublicRooms = async () => {
    try {
      for (const room of rooms.value) {
        try {
          const tokens = await connectionStore.wsProxyClient.listChannel(`chat_room_${room.name}`)
          room.memberCount = tokens.length
        } catch (e) {
          room.memberCount = 0
        }
      }
    } catch (error) {
      console.error('List rooms error:', error)
    }
  }

  return {
    currentRoom,
    rooms,
    messages,
    members,
    isInRoom,
    channelName,
    joinRoom,
    leaveRoom,
    createRoom,
    sendChatMessage,
    handleIncomingMessage,
    refreshMembers,
    listPublicRooms
  }
})
