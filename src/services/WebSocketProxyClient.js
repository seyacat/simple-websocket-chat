/**
 * WebSocket Proxy Client
 *
 * Client library for connecting to the simplified WebSocket proxy server.
 * Features:
 * - Reconnection logic
 * - Channel support (publish/list)
 * - Active connections tracking
 * - Event-based API
 */

export class WebSocketProxyClient {
  /**
   * Create a new WebSocketProxyClient instance
   * @param {Object} options Configuration options
   * @param {string} options.url WebSocket server URL (default: 'ws://localhost:4001')
   * @param {boolean} options.autoReconnect Enable auto-reconnection (default: true)
   * @param {number} options.maxReconnectAttempts Maximum reconnection attempts (default: 5)
   * @param {number} options.reconnectDelay Delay between reconnection attempts in ms (default: 3000)
   */
  constructor(options = {}) {
    // Configuration
    this.config = {
      url: options.url || 'ws://localhost:4001',
      autoReconnect: options.autoReconnect !== false,
      maxReconnectAttempts: options.maxReconnectAttempts || 5,
      reconnectDelay: options.reconnectDelay || 3000
    };

    // Connection state
    this.ws = null;
    this.token = null;
    this._isConnected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;

    // Data stores
    this.activeConnections = new Map(); // token -> {metadata}
    this.channelSubscriptions = new Map(); // channel -> {tokens, lastUpdate}

    // Event system
    this.eventHandlers = new Map();

    // Bind methods
    this.handleOpen = this.handleOpen.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleError = this.handleError.bind(this);

    // Channel data generation - initialize or load keys
    this.keysInitialized = false;
    this.keysInitializationPromise = this.initializeKeys();
  }

  /**
   * Ensure cryptographic keys are initialized
   * @returns {Promise<void>}
   */
  async ensureKeysInitialized() {
    if (!this.keysInitialized) {
      await this.keysInitializationPromise;
      this.keysInitialized = true;
    }
  }

  /**
   * Initialize cryptographic keys
   * Generates or loads ECDSA key pair from localStorage
   */
  async initializeKeys() {
    const storageKey = 'websocket_proxy_crypto_keys';

    try {
      // Try to load existing keys from localStorage
      const savedKeys = localStorage.getItem(storageKey);

      if (savedKeys) {
        const keys = JSON.parse(savedKeys);
        this.privateKey = await this.importPrivateKey(keys.privateKey);
        this.publicKey = keys.publicKey;
      } else {
        // Generate new key pair
        await this.generateKeyPair();
      }
    } catch (error) {
      // Fallback to mock keys if crypto API fails
      this.publicKey = this.generateFallbackPublicKey();
      this.privateKey = null;
    }
  }

  /**
   * Generate ECDSA key pair using Web Crypto API
   */
  async generateKeyPair() {
    try {
      // Generate ECDSA key pair with P-256 curve
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        true, // extractable
        ['sign', 'verify']
      );

      // Export both keys as JWK
      const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

      // Store keys
      this.privateKey = keyPair.privateKey;
      this.publicKey = publicKeyJwk;

      // Save to localStorage
      const storageKey = 'websocket_proxy_crypto_keys';
      const keysToSave = {
        privateKey: privateKeyJwk,
        publicKey: publicKeyJwk
      };
      localStorage.setItem(storageKey, JSON.stringify(keysToSave));

    } catch (error) {
      console.error('Error generando par de claves:', error);
      throw error;
    }
  }

  /**
   * Import private key from JWK format
   * @param {Object} jwk Private key in JWK format
   * @returns {CryptoKey} Imported private key
   */
  async importPrivateKey(jwk) {
    return await crypto.subtle.importKey(
      'jwk',
      jwk,
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true,
      ['sign']
    );
  }

  /**
   * Generate fallback public key (for environments without Web Crypto API)
   * @returns {string} Fallback public key
   */
  generateFallbackPublicKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = 'FALLBACK-';
    for (let i = 0; i < 40; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    result += '==';
    return result;
  }

  /**
   * Convert ArrayBuffer to base64 string
   * @param {ArrayBuffer} buffer
   * @returns {string} Base64 encoded string
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Sign channel data using ECDSA
   * @param {Object} data Channel data object
   * @returns {Promise<string>} Base64 encoded signature
   */
  async signData(data) {
    // If no private key (fallback mode), return mock signature
    if (!this.privateKey) {
      return this.generateFallbackSignature(data);
    }

    try {
      // Use canonical JSON stringify (sorted keys) for consistent signing
      const dataStr = this.canonicalStringify(data);

      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(dataStr);

      // Sign the data
      const signatureBuffer = await crypto.subtle.sign(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' }
        },
        this.privateKey,
        dataBuffer
      );

      // Convert to base64
      const signature = this.arrayBufferToBase64(signatureBuffer);
      return signature;
    } catch (error) {
      return this.generateFallbackSignature(data);
    }
  }

  /**
   * Stringify object with sorted keys for canonical representation
   * @param {Object} obj Object to stringify
   * @returns {string} Canonical JSON string
   */
  canonicalStringify(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
      return '[' + obj.map(item => this.canonicalStringify(item)).join(',') + ']';
    }

    // Object: sort keys
    const sortedKeys = Object.keys(obj).sort();
    const keyValuePairs = sortedKeys.map(key => {
      return JSON.stringify(key) + ':' + this.canonicalStringify(obj[key]);
    });

    return '{' + keyValuePairs.join(',') + '}';
  }

  /**
   * Generate fallback signature (for environments without Web Crypto API)
   * @param {Object} data Channel data object
   * @returns {string} Fallback signature
   */
  generateFallbackSignature(data) {
    const dataStr = JSON.stringify(data);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = 'FALLBACK-SIG-';
    for (let i = 0; i < 40; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    result += '==';
    return result;
  }

  /**
   * Create channel object in the new format
   * @param {string} channelName Channel name
   * @param {Object} extraData Additional data to include
   * @returns {Promise<Object>} Channel object in new format
   */
  async createChannelObject(channelName, extraData = {}) {
    // Convert JWK to string for transmission
    const publicKeyStr = typeof this.publicKey === 'object'
      ? JSON.stringify(this.publicKey)
      : this.publicKey;

    const data = {
      name: channelName,
      publickey: publicKeyStr,
      ...extraData
    };

    const signature = await this.signData(data);

    return {
      data,
      signature
    };
  }

  /**
   * Update client configuration
   * @param {Object} options Configuration options to update
   */
  updateConfig(options = {}) {
    this.config = {
      ...this.config,
      ...options
    };
  }

  /**
   * Connect to the WebSocket server
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.onopen = (event) => {
          this.handleOpen(event);
          resolve();
        };

        this.ws.onerror = (error) => {
          this.handleError(error);
          reject(new Error(`WebSocket connection error: ${error.message || 'Unknown error'}`));
        };

        // Set other handlers
        this.ws.onmessage = this.handleMessage;
        this.ws.onclose = this.handleClose;

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle WebSocket open event
   * @param {Event} event
   */
  handleOpen(event) {
    this._isConnected = true;
    this.reconnectAttempts = 0;

    this.emit('connect');
  }

  /**
   * Handle WebSocket message event
   * @param {MessageEvent} event
   */
  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      this.processMessage(data);
    } catch (error) {
      this.emit('error', { type: 'parse_error', error: error.message, data: event.data });
    }
  }

  /**
   * Process incoming message from server
   * @param {Object} data Parsed message data
   */
  processMessage(data) {
    const { type, ...rest } = data;

    switch (type) {
      case 'connected':
        this.handleConnected(rest);
        break;
      case 'message':
        this.handleIncomingMessage(rest);
        break;
      case 'message_sent':
        this.handleMessageSent(rest);
        break;
      case 'disconnected':
        this.handleDisconnected(rest);
        break;
      case 'disconnect_confirmation':
        this.handleDisconnectConfirmation(rest);
        break;
      case 'published':
        this.handlePublished(rest);
        break;
      case 'channel_list':
        this.handleChannelList(rest);
        break;
      case 'channel_count':
        this.handleChannelCount(rest);
        break;
      case 'joined':
        this.handleJoined(rest);
        break;
      case 'left':
        this.handleLeft(rest);
        break;
      case 'error':
        this.handleErrorResponse(rest);
        break;
      default:
        this.emit('unknown_message', { type, ...rest });
    }
  }

  /**
   * Handle connected message from server
   * @param {Object} data
   */
  handleConnected(data) {
    this.token = data.token;

    this.emit('token_assigned', this.token);
  }

  /**
   * Handle incoming message from another client
   * @param {Object} data
   */
  handleIncomingMessage(data) {
    const { from, message, timestamp } = data;

    // Track the sender as an active connection
    if (!this.activeConnections.has(from)) {
      this.activeConnections.set(from, {
        connectedAt: Date.now(),
        lastMessage: timestamp,
        messageCount: 0
      });
    }

    const conn = this.activeConnections.get(from);
    conn.lastMessage = timestamp;
    conn.messageCount = (conn.messageCount || 0) + 1;

    // Try to parse as JSON
    let parsedMessage = null;
    try {
      parsedMessage = JSON.parse(message);
    } catch (e) {
      // Not JSON, treat as plain text
    }

    this.emit('message', from, message, timestamp, parsedMessage);
  }

  /**
   * Handle message sent confirmation
   * @param {Object} data
   */
  handleMessageSent(data) {
    const { sent, total, failed, timestamp } = data;

    if (failed && failed.length > 0) {
      console.warn(`Message partial: ${sent}/${total}. Failed: ${failed.join(', ')}`);
      this.emit('message_partial', { sent, total, failed, timestamp });
    }
  }

  /**
   * Handle disconnected notification
   * @param {Object} data
   */
  handleDisconnected(data) {
    const { token, timestamp, channel } = data;

    // Remove from active connections
    if (this.activeConnections.has(token)) {
      this.activeConnections.delete(token);
      this.emit('unpaired', token, timestamp);
    }

    // Si vino con canal, también actualizar el cache local de suscripciones
    if (channel && this.channelSubscriptions.has(channel)) {
      const sub = this.channelSubscriptions.get(channel);
      if (Array.isArray(sub.tokens)) {
        sub.tokens = sub.tokens.filter(t => t !== token);
        sub.count = sub.tokens.length;
      }
    }

    this.emit('peer_disconnected', token, timestamp, channel);
  }

  /**
   * Handle channel_count response
   * @param {Object} data
   */
  handleChannelCount(data) {
    const { channel, count, maxEntries, timestamp } = data;
    this.emit('channel_count', channel, count, maxEntries, timestamp);
  }

  /**
   * Handle joined notification (someone published to a channel we're subscribed to)
   * @param {Object} data
   */
  handleJoined(data) {
    const { token, channel, timestamp } = data;

    // Mantener consistente el cache local de suscripciones
    if (channel && this.channelSubscriptions.has(channel)) {
      const sub = this.channelSubscriptions.get(channel);
      if (Array.isArray(sub.tokens) && !sub.tokens.includes(token)) {
        sub.tokens.push(token);
        sub.count = sub.tokens.length;
      }
    }

    this.emit('peer_joined', token, channel, timestamp);
  }

  /**
   * Handle left notification (someone unpublished from a channel)
   * @param {Object} data
   */
  handleLeft(data) {
    const { token, channel, timestamp } = data;

    if (channel && this.channelSubscriptions.has(channel)) {
      const sub = this.channelSubscriptions.get(channel);
      if (Array.isArray(sub.tokens)) {
        sub.tokens = sub.tokens.filter(t => t !== token);
        sub.count = sub.tokens.length;
      }
    }

    this.emit('peer_left', token, channel, timestamp);
  }

  /**
   * Handle disconnect confirmation
   * @param {Object} data
   */
  handleDisconnectConfirmation(data) {
    const { target, timestamp } = data;

    if (this.activeConnections.has(target)) {
      this.activeConnections.delete(target);
    }

    this.emit('disconnect_confirmed', target, timestamp);
  }

  /**
   * Handle published confirmation
   * @param {Object} data
   */
  handlePublished(data) {
    const { channel, timestamp } = data;
    console.log(`Published to channel ${channel} at ${timestamp}`);
    this.emit('published', channel, timestamp);
  }

  /**
   * Handle channel list response
   * @param {Object} data
   */
  handleChannelList(data) {
    const { channel, tokens, count, maxEntries, timestamp } = data;

    // Update channel subscriptions
    this.channelSubscriptions.set(channel, {
      tokens,
      lastUpdate: timestamp,
      count,
      maxEntries
    });

    console.log(`Channel ${channel}: ${count} tokens (max: ${maxEntries})`);
    this.emit('channel_updated', channel, tokens, count, timestamp);
  }

  /**
   * Handle error response from server
   * @param {Object} data
   */
  handleErrorResponse(data) {
    const { error } = data;
    console.error(`Server error: ${error}`);
    this.emit('error', { type: 'server_error', error });
  }

  /**
   * Handle WebSocket close event
   * @param {CloseEvent} event
   */
  handleClose(event) {
    console.log(`WebSocket disconnected: ${event.code} ${event.reason || 'No reason'}`);
    this._isConnected = false;
    this.token = null;

    // Clear active connections on disconnect
    const disconnectedTokens = Array.from(this.activeConnections.keys());
    this.activeConnections.clear();

    this.emit('disconnect', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
      disconnectedTokens
    });

    // Attempt reconnection if enabled and not a normal closure
    if (this.config.autoReconnect && event.code !== 1000) {
      this.attemptReconnection();
    }
  }

  /**
   * Handle WebSocket error event
   * @param {Event} error
   */
  handleError(error) {
    console.error('WebSocket error:', error);
    this.emit('error', { type: 'connection_error', error });
  }

  /**
   * Attempt to reconnect to the server
   */
  attemptReconnection() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      this.emit('reconnect_failed', this.reconnectAttempts);
      return;
    }

    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        this.attemptReconnection();
      });
    }, this.config.reconnectDelay);

    this.emit('reconnecting', this.reconnectAttempts, this.config.maxReconnectAttempts);
  }

  /**
   * Send a message to one or more targets
   * @param {string|string[]} to Target token(s)
   * @param {string} message Message content
   * @returns {Promise<void>}
   */
  send(to, message) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      if (!this.token) {
        reject(new Error('No token assigned yet'));
        return;
      }

      const targetTokens = Array.isArray(to) ? to : [to];

      if (targetTokens.length === 0) {
        reject(new Error('No target tokens specified'));
        return;
      }

      if (targetTokens.includes(this.token)) {
        reject(new Error('Cannot send message to yourself'));
        return;
      }

      const payload = {
        to: targetTokens,
        message: message
      };

      try {
        this.ws.send(JSON.stringify(payload));
        resolve();
      } catch (error) {
        console.error('Error sending message:', error);
        reject(error);
      }
    });
  }

  /**
   * Manually disconnect from a specific client
   * @param {string} target Target token
   * @returns {Promise<void>}
   */
  disconnectFrom(target) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      if (!this.token) {
        reject(new Error('No token assigned yet'));
        return;
      }

      if (target === this.token) {
        reject(new Error('Cannot disconnect from yourself'));
        return;
      }

      const payload = {
        type: 'disconnect',
        target: target
      };

      try {
        this.ws.send(JSON.stringify(payload));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Publish to a public channel
   * @param {string|Object} channel Channel name or channel object in new format
   * @param {Object} extraData Additional data to include in channel data
   * @returns {Promise<void>}
   */
  async publish(channel, extraData = {}) {
    return new Promise(async (resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      if (!this.token) {
        reject(new Error('No token assigned yet'));
        return;
      }

      try {
        // Ensure keys are initialized
        await this.ensureKeysInitialized();

        // Determine channel format
        let channelObject;
        if (typeof channel === 'string') {
          // Backward compatibility: convert string to new format
          channelObject = await this.createChannelObject(channel, extraData);
        } else if (channel && typeof channel === 'object') {
          // Already in new format
          channelObject = channel;
        } else {
          reject(new Error('Invalid channel parameter'));
          return;
        }

        const payload = {
          type: 'publish',
          channel: channelObject
        };

        this.ws.send(JSON.stringify(payload));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Unpublish from a public channel
   * @param {string|Object} channel Channel name or channel object in new format
   * @returns {Promise<void>}
   */
  async unpublish(channel) {
    return new Promise(async (resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      if (!this.token) {
        reject(new Error('No token assigned yet'));
        return;
      }

      try {
        // Ensure keys are initialized
        await this.ensureKeysInitialized();

        // Determine channel format
        let channelObject;
        if (typeof channel === 'string') {
          // Backward compatibility: convert string to new format
          channelObject = await this.createChannelObject(channel);
        } else if (channel && typeof channel === 'object') {
          // Already in new format
          channelObject = channel;
        } else {
          reject(new Error('Invalid channel parameter'));
          return;
        }

        const payload = {
          type: 'unpublish',
          channel: channelObject
        };

        this.ws.send(JSON.stringify(payload));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * List tokens in a public channel
   * @param {string|Object} channel Channel name or channel object in new format
   * @returns {Promise<string[]>} Array of tokens in the channel
   */
  async listChannel(channel) {
    return new Promise(async (resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      try {
        // Ensure keys are initialized
        await this.ensureKeysInitialized();

        // Determine channel format
        let channelObject;
        let channelName;
        if (typeof channel === 'string') {
          // Backward compatibility: convert string to new format
          channelObject = await this.createChannelObject(channel);
          channelName = channel;
        } else if (channel && typeof channel === 'object') {
          // Already in new format
          channelObject = channel;
          channelName = channel.data.name;
        } else {
          reject(new Error('Invalid channel parameter'));
          return;
        }

        const payload = {
          type: 'list',
          channel: channelObject
        };

        // Set up one-time handler for the response
        // emit('channel_updated', channel, tokens, count, timestamp) → args are separated
        const handler = (updatedChannel, tokens) => {
          if (updatedChannel === channelName) {
            this.off('channel_updated', handler);
            resolve(tokens || []);
          }
        };

        this.on('channel_updated', handler);

        // Set timeout for response
        setTimeout(() => {
          this.off('channel_updated', handler);
          reject(new Error(`Timeout waiting for channel list: ${channelName}`));
        }, 5000);

        this.ws.send(JSON.stringify(payload));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get only the member count of a public channel (no signature required)
   * @param {string} channelName Channel name
   * @returns {Promise<number>} Number of active tokens in the channel
   */
  channelCount(channelName) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      if (typeof channelName !== 'string' || channelName.length === 0) {
        reject(new Error('Invalid channel name'));
        return;
      }

      const handler = (responseChannel, count) => {
        if (responseChannel === channelName) {
          this.off('channel_count', handler);
          clearTimeout(timeoutId);
          resolve(count);
        }
      };
      this.on('channel_count', handler);

      const timeoutId = setTimeout(() => {
        this.off('channel_count', handler);
        reject(new Error(`Timeout waiting for channel_count: ${channelName}`));
      }, 5000);

      try {
        this.ws.send(JSON.stringify({
          type: 'channel_count',
          channel: channelName
        }));
      } catch (error) {
        this.off('channel_count', handler);
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    // Clear reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close WebSocket connection
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    // Reset state
    this._isConnected = false;
    this.token = null;
    this.reconnectAttempts = 0;
    this.activeConnections.clear();
    this.channelSubscriptions.clear();
  }

  /**
   * Get current token
   * @returns {string|null} Current token or null if not connected
   */
  getToken() {
    return this.token;
  }

  /**
   * Check if connected to the WebSocket server
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this._isConnected;
  }

  /**
   * Get active connections
   * @returns {Map<string, Object>} Map of active connections
   */
  getActiveConnections() {
    return new Map(this.activeConnections);
  }

  /**
   * Check if a specific token has sent us a message (is a known peer)
   * @param {string} token Token to check
   * @returns {boolean} True if known
   */
  hasConnection(token) {
    return this.activeConnections.has(token);
  }

  /**
   * Get channel information
   * @param {string} channel Channel name
   * @returns {Object|null} Channel information or null if not subscribed
   */
  getChannelInfo(channel) {
    return this.channelSubscriptions.get(channel) || null;
  }

  // Event system methods

  /**
   * Register an event handler
   * @param {string} event Event name
   * @param {Function} handler Event handler function
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * Remove an event handler
   * @param {string} event Event name
   * @param {Function} handler Event handler function to remove
   */
  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   * @param {string} event Event name
   * @param {...any} args Event arguments
   * @private
   */
  emit(event, ...args) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      handlers.forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in event handler for "${event}":`, error);
        }
      });
    }
  }
}

/**
 * Create and return a singleton instance of WebSocketProxyClient
 * @param {Object} options Configuration options
 * @returns {WebSocketProxyClient} Singleton instance
 */
export function createWebSocketProxyClient(options = {}) {
  let instance = null;

  return () => {
    if (!instance) {
      instance = new WebSocketProxyClient(options);
    }
    return instance;
  };
}

/**
 * Default singleton instance getter
 */
export const getWebSocketProxyClient = createWebSocketProxyClient();
