import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WebSocketProxyClient } from '../src/services/WebSocketProxyClient.js'

/**
 * Crea un cliente sin abrir un socket real. Inyecta un ws fake con readyState OPEN
 * para los métodos que validan conexión (channelCount, send, etc.).
 */
function makeClient() {
  const client = new WebSocketProxyClient({ url: 'ws://test', autoReconnect: false })
  // Fake ws abierto
  const sent = []
  client.ws = {
    readyState: 1, // OPEN
    send: vi.fn((raw) => sent.push(JSON.parse(raw))),
    close: vi.fn()
  }
  client._isConnected = true
  client.token = 'ME01'
  return { client, sent }
}

describe('WebSocketProxyClient — message routing', () => {
  let client, sent

  beforeEach(() => {
    ({ client, sent } = makeClient())
  })

  describe('peer_joined', () => {
    it('emite peer_joined(token, channel, timestamp) al recibir { type: "joined" }', () => {
      const handler = vi.fn()
      client.on('peer_joined', handler)
      client.processMessage({
        type: 'joined',
        token: 'XYZW',
        channel: 'chat_room_general',
        timestamp: 'T1'
      })
      expect(handler).toHaveBeenCalledWith('XYZW', 'chat_room_general', 'T1')
    })

    it('actualiza el cache local de channelSubscriptions', () => {
      client.channelSubscriptions.set('ch1', { tokens: ['AAA'], lastUpdate: '0', count: 1, maxEntries: 100 })
      client.processMessage({ type: 'joined', token: 'BBB', channel: 'ch1' })
      const sub = client.channelSubscriptions.get('ch1')
      expect(sub.tokens).toContain('BBB')
      expect(sub.count).toBe(2)
    })

    it('no duplica en el cache si el token ya estaba', () => {
      client.channelSubscriptions.set('ch1', { tokens: ['AAA'], lastUpdate: '0', count: 1, maxEntries: 100 })
      client.processMessage({ type: 'joined', token: 'AAA', channel: 'ch1' })
      const sub = client.channelSubscriptions.get('ch1')
      expect(sub.tokens).toEqual(['AAA'])
    })
  })

  describe('peer_left', () => {
    it('emite peer_left(token, channel, timestamp) al recibir { type: "left" }', () => {
      const handler = vi.fn()
      client.on('peer_left', handler)
      client.processMessage({ type: 'left', token: 'XYZW', channel: 'ch', timestamp: 'T2' })
      expect(handler).toHaveBeenCalledWith('XYZW', 'ch', 'T2')
    })

    it('quita el token del cache', () => {
      client.channelSubscriptions.set('ch1', { tokens: ['AAA', 'BBB'], lastUpdate: '0', count: 2, maxEntries: 100 })
      client.processMessage({ type: 'left', token: 'AAA', channel: 'ch1' })
      const sub = client.channelSubscriptions.get('ch1')
      expect(sub.tokens).toEqual(['BBB'])
      expect(sub.count).toBe(1)
    })
  })

  describe('peer_disconnected', () => {
    it('emite peer_disconnected(token, timestamp, channel) cuando viene con channel', () => {
      const handler = vi.fn()
      client.on('peer_disconnected', handler)
      client.processMessage({
        type: 'disconnected',
        token: 'XYZW',
        channel: 'ch',
        timestamp: 'T3'
      })
      expect(handler).toHaveBeenCalledWith('XYZW', 'T3', 'ch')
    })

    it('emite peer_disconnected con channel undefined en forma legacy', () => {
      const handler = vi.fn()
      client.on('peer_disconnected', handler)
      client.processMessage({ type: 'disconnected', token: 'XYZW', timestamp: 'T3' })
      expect(handler).toHaveBeenCalledWith('XYZW', 'T3', undefined)
    })

    it('quita el token del cache de canal cuando viene con channel', () => {
      client.channelSubscriptions.set('ch1', { tokens: ['AAA', 'BBB'], lastUpdate: '0', count: 2, maxEntries: 100 })
      client.processMessage({ type: 'disconnected', token: 'AAA', channel: 'ch1' })
      expect(client.channelSubscriptions.get('ch1').tokens).toEqual(['BBB'])
    })

    it('emite "unpaired" si el peer estaba en activeConnections', () => {
      client.activeConnections.set('XYZW', {})
      const unpaired = vi.fn()
      client.on('unpaired', unpaired)
      client.processMessage({ type: 'disconnected', token: 'XYZW', timestamp: 'T' })
      expect(unpaired).toHaveBeenCalledWith('XYZW', 'T')
      expect(client.activeConnections.has('XYZW')).toBe(false)
    })
  })
})

describe('WebSocketProxyClient — channelCount()', () => {
  it('envía mensaje channel_count y resuelve con el count cuando llega la respuesta', async () => {
    const { client, sent } = makeClient()

    const promise = client.channelCount('room-x')

    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual({ type: 'channel_count', channel: 'room-x' })

    // Simular respuesta del servidor
    client.processMessage({
      type: 'channel_count',
      channel: 'room-x',
      count: 5,
      maxEntries: 100,
      timestamp: 'T'
    })

    await expect(promise).resolves.toBe(5)
  })

  it('rechaza si el ws no está conectado', async () => {
    const client = new WebSocketProxyClient({ url: 'ws://test', autoReconnect: false })
    await expect(client.channelCount('x')).rejects.toThrow(/not connected/i)
  })

  it('rechaza con channel inválido', async () => {
    const { client } = makeClient()
    await expect(client.channelCount('')).rejects.toThrow(/invalid channel/i)
    await expect(client.channelCount(null)).rejects.toThrow(/invalid channel/i)
  })

  it('hace timeout si no llega respuesta', async () => {
    vi.useFakeTimers()
    const { client } = makeClient()

    const promise = client.channelCount('room-y')
    vi.advanceTimersByTime(5000)

    await expect(promise).rejects.toThrow(/timeout/i)
    vi.useRealTimers()
  })

  it('ignora respuestas para otros canales y resuelve con la correcta', async () => {
    const { client } = makeClient()
    const promise = client.channelCount('room-z')

    client.processMessage({ type: 'channel_count', channel: 'otra', count: 99 })
    client.processMessage({ type: 'channel_count', channel: 'room-z', count: 7 })

    await expect(promise).resolves.toBe(7)
  })
})
