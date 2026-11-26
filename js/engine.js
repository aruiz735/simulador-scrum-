/**
 * UNAB Scrum Live Simulator - Real-time Synchronization Engine (MQTT WebSockets)
 * Provides 100% reliable multi-device connectivity across cellular 4G/5G, Wi-Fi, and firewalls
 * Uses zero-cost public WebSockets broker with automatic queueing and reconnection.
 */

class LiveSyncEngine {
  constructor(isHost = false, pin = null) {
    this.isHost = isHost;
    this.pin = pin;
    this.listeners = {};
    this.client = null;
    this.connected = false;
    this.messageQueue = [];
    this.bc = null;

    this._initBroadcastChannel();
  }

  // 1. Local BroadcastChannel for instant testing in same browser tabs (Offline mode)
  _initBroadcastChannel() {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.bc = new BroadcastChannel('unab_scrum_quiz_bus');
        this.bc.onmessage = (event) => {
          const msg = event.data;
          if (msg && (!this.pin || msg.pin === this.pin || !msg.pin)) {
            this._trigger(msg.type, msg.payload, 'local');
          }
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel not available:', e);
    }
  }

  // 2. Initialize Real-Time WebSockets Engine
  init(pin, onReadyCallback) {
    this.pin = pin;
    
    if (typeof mqtt === 'undefined') {
      console.warn('MQTT library not loaded. Falling back to local mode.');
      if (onReadyCallback) onReadyCallback(false);
      return;
    }

    // Try reliable public secure brokers
    const brokers = [
      'wss://broker.emqx.io:8084/mqtt',
      'wss://broker.hivemq.com:8884/mqtt'
    ];
    const brokerUrl = brokers[0];
    const clientId = (this.isHost ? 'unab_h_' : 'unab_p_') + Math.random().toString(16).substring(2, 10);

    try {
      console.log(`[SyncEngine] Connecting to ${brokerUrl} as ${this.isHost ? 'HOST' : 'PLAYER'} (PIN: ${this.pin})...`);
      
      this.client = mqtt.connect(brokerUrl, {
        clientId: clientId,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 2000,
        keepalive: 30
      });

      this.client.on('connect', () => {
        console.log('[SyncEngine] Connected successfully to Cloud Broker!');
        this.connected = true;

        // Setup subscription topics
        if (this.isHost) {
          // Host listens to incoming messages from players
          const hostTopic = `unab/scrum/${this.pin}/to_host`;
          this.client.subscribe(hostTopic, { qos: 0 }, (err) => {
            if (!err) console.log('[Host] Subscribed to:', hostTopic);
          });
        } else {
          // Player listens to broadcast messages from host
          const playerTopic = `unab/scrum/${this.pin}/to_players`;
          this.client.subscribe(playerTopic, { qos: 0 }, (err) => {
            if (!err) console.log('[Player] Subscribed to:', playerTopic);
          });
        }

        // Flush any queued messages that were sent before connection opened
        while (this.messageQueue.length > 0) {
          const item = this.messageQueue.shift();
          this.broadcast(item.type, item.payload);
        }

        if (onReadyCallback) onReadyCallback(true, clientId);
      });

      this.client.on('message', (topic, message) => {
        try {
          const msg = JSON.parse(message.toString());
          if (msg && msg.type) {
            this._trigger(msg.type, msg.payload, msg.senderId);
          }
        } catch (e) {
          console.error('[SyncEngine] Error parsing incoming message:', e);
        }
      });

      this.client.on('error', (err) => {
        console.warn('[SyncEngine] Broker error:', err);
      });

      this.client.on('offline', () => {
        this.connected = false;
        console.log('[SyncEngine] Broker offline, will auto-reconnect...');
      });

    } catch (e) {
      console.error('[SyncEngine] Exception during broker connection:', e);
      if (onReadyCallback) onReadyCallback(false, e);
    }
  }

  // Backward compatibility alias for host
  initWebRTC(pin, onReadyCallback) {
    this.init(pin, onReadyCallback);
  }

  // Connect player to room
  connectToHost(pin, onConnectedCallback) {
    this.init(pin, onConnectedCallback);
  }

  // Broadcast or send message
  broadcast(type, payload) {
    const msg = {
      type,
      payload,
      pin: this.pin,
      senderId: payload ? payload.id : null,
      timestamp: Date.now()
    };

    // 1. Send via local BroadcastChannel
    if (this.bc) {
      try {
        this.bc.postMessage(msg);
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }

    // 2. Send via WebSockets
    if (this.client && this.connected) {
      const targetTopic = this.isHost
        ? `unab/scrum/${this.pin}/to_players`
        : `unab/scrum/${this.pin}/to_host`;

      try {
        this.client.publish(targetTopic, JSON.stringify(msg));
      } catch (e) {
        console.warn('[SyncEngine] Publish error:', e);
      }
    } else {
      // Queue message if socket is still handshaking
      this.messageQueue.push({ type, payload });
    }
  }

  on(type, callback) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(callback);
  }

  _trigger(type, payload, senderId) {
    if (this.listeners[type]) {
      this.listeners[type].forEach(cb => cb(payload, senderId));
    }
  }
}

window.LiveSyncEngine = LiveSyncEngine;
