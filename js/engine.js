/**
 * UNAB Scrum Live Simulator - Unified Hybrid Sync Engine
 * Combines:
 * 1. WebSockets (Cloud MQTT Broker) - Reliable over cellular 4G/5G & proxies
 * 2. WebRTC (PeerJS) - Direct P2P with automatic queueing until connection opens
 * 3. BroadcastChannel - 100% offline local multi-tab sync
 */

class LiveSyncEngine {
  constructor(isHost = false, pin = null) {
    this.isHost = isHost;
    this.pin = pin;
    this.listeners = {};
    
    // WebSockets (MQTT)
    this.mqttClient = null;
    this.mqttConnected = false;

    // WebRTC (PeerJS)
    this.peer = null;
    this.peerReady = false;
    this.peerConnections = new Map(); // id -> connection (Host)
    this.hostPeerConn = null;          // (Player)

    // Message queues
    this.outQueue = [];
    this.receivedMsgIds = new Set();

    // BroadcastChannel (local tabs)
    this.bc = null;
    this._initBroadcastChannel();
  }

  _initBroadcastChannel() {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.bc = new BroadcastChannel('unab_scrum_quiz_bus');
        this.bc.onmessage = (event) => {
          const msg = event.data;
          if (msg && (!this.pin || msg.pin === this.pin || !msg.pin)) {
            this._handleIncoming(msg, 'local');
          }
        };
      }
    } catch (e) {}
  }

  // Initialize both WebSockets and PeerJS
  init(pin, onReadyCallback) {
    this.pin = pin;
    let readyNotified = false;
    const notifyReady = (success) => {
      if (!readyNotified && onReadyCallback) {
        readyNotified = true;
        onReadyCallback(success);
      }
    };

    // 1. Initialize WebSockets (MQTT)
    this._initMQTT(pin, (success) => {
      if (success) notifyReady(true);
    });

    // 2. Initialize WebRTC (PeerJS) as dual fallback
    this._initPeerJS(pin, (success) => {
      if (success) notifyReady(true);
    });

    // Fallback timer if both take longer
    setTimeout(() => notifyReady(true), 1500);
  }

  _initMQTT(pin, callback) {
    if (typeof mqtt === 'undefined') {
      if (callback) callback(false);
      return;
    }

    try {
      const brokerUrl = 'wss://broker.emqx.io:8084/mqtt';
      const clientId = (this.isHost ? 'unab_h_' : 'unab_p_') + Math.random().toString(16).substring(2, 10);

      this.mqttClient = mqtt.connect(brokerUrl, {
        clientId: clientId,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 2000
      });

      this.mqttClient.on('connect', () => {
        console.log('[MQTT] Connected to Cloud WebSocket Broker!');
        this.mqttConnected = true;

        const topic = this.isHost
          ? `unab/scrum/${this.pin}/to_host`
          : `unab/scrum/${this.pin}/to_players`;

        this.mqttClient.subscribe(topic, { qos: 0 }, (err) => {
          if (!err) console.log('[MQTT] Subscribed to:', topic);
        });

        this._flushQueue();
        if (callback) callback(true);
      });

      this.mqttClient.on('message', (topic, message) => {
        try {
          const msg = JSON.parse(message.toString());
          this._handleIncoming(msg, 'mqtt');
        } catch (e) {}
      });

      this.mqttClient.on('error', (err) => {
        console.warn('[MQTT] Broker notice:', err);
      });
    } catch (e) {
      if (callback) callback(false);
    }
  }

  _initPeerJS(pin, callback) {
    if (typeof Peer === 'undefined') {
      if (callback) callback(false);
      return;
    }

    const peerId = this.isHost ? `unab-scrum-${pin}` : `unab-scrum-player-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    try {
      this.peer = new Peer(peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        console.log('[PeerJS] Ready with ID:', id);
        this.peerReady = true;

        if (!this.isHost) {
          this._connectPeerToHost();
        }
        if (callback) callback(true);
      });

      if (this.isHost) {
        this.peer.on('connection', (conn) => {
          console.log('[Host PeerJS] Incoming connection from:', conn.peer);
          
          const setupConn = () => {
            this.peerConnections.set(conn.peer, conn);
          };

          if (conn.open) setupConn();
          else conn.on('open', setupConn);

          conn.on('data', (data) => {
            this._handleIncoming(data, conn.peer);
          });

          conn.on('close', () => {
            this.peerConnections.delete(conn.peer);
            this._trigger('PLAYER_DISCONNECT', { peerId: conn.peer });
          });
        });
      }
    } catch (e) {
      if (callback) callback(false);
    }
  }

  _connectPeerToHost() {
    if (!this.peer || !this.peerReady || this.isHost) return;
    const hostPeerId = `unab-scrum-${this.pin}`;

    try {
      this.hostPeerConn = this.peer.connect(hostPeerId, { reliable: true });

      this.hostPeerConn.on('open', () => {
        console.log('[Player PeerJS] Connected directly to host!');
        this._flushQueue();
      });

      this.hostPeerConn.on('data', (data) => {
        this._handleIncoming(data, 'host_peer');
      });
    } catch (e) {
      console.warn('[Player PeerJS] Error connecting to host peer:', e);
    }
  }

  initWebRTC(pin, callback) {
    this.init(pin, callback);
  }

  connectToHost(pin, callback) {
    this.init(pin, callback);
  }

  broadcast(type, payload) {
    const msgId = `${type}_${payload ? (payload.id || payload.playerId || payload.questionIndex) : ''}_${Date.now()}_${Math.random()}`;
    const msg = {
      id: msgId,
      type,
      payload,
      pin: this.pin,
      timestamp: Date.now()
    };

    // 1. Send via local BroadcastChannel
    if (this.bc) {
      try { this.bc.postMessage(msg); } catch (e) {}
    }

    // 2. Queue for network delivery and attempt immediate send
    this.outQueue.push(msg);
    this._flushQueue();
  }

  _flushQueue() {
    if (this.outQueue.length === 0) return;

    const remaining = [];
    while (this.outQueue.length > 0) {
      const msg = this.outQueue.shift();
      let sentAny = false;

      // Send via MQTT WebSockets
      if (this.mqttClient && this.mqttConnected) {
        const topic = this.isHost
          ? `unab/scrum/${this.pin}/to_players`
          : `unab/scrum/${this.pin}/to_host`;
        try {
          this.mqttClient.publish(topic, JSON.stringify(msg));
          sentAny = true;
        } catch (e) {}
      }

      // Send via PeerJS WebRTC
      if (this.isHost) {
        this.peerConnections.forEach((conn) => {
          if (conn.open) {
            try { conn.send(msg); sentAny = true; } catch (e) {}
          }
        });
      } else {
        if (this.hostPeerConn && this.hostPeerConn.open) {
          try {
            this.hostPeerConn.send(msg);
            sentAny = true;
          } catch (e) {}
        }
      }

      // Keep in queue if no network transport was ready yet
      if (!sentAny && !this.mqttConnected && (!this.hostPeerConn || !this.hostPeerConn.open)) {
        remaining.push(msg);
      }
    }
    this.outQueue = remaining;
  }

  _handleIncoming(msg, source) {
    if (!msg || !msg.type) return;

    // Message deduplication
    const dedupeKey = msg.id || `${msg.type}_${JSON.stringify(msg.payload)}`;
    if (this.receivedMsgIds.has(dedupeKey)) return;
    this.receivedMsgIds.add(dedupeKey);

    // Limit set size
    if (this.receivedMsgIds.size > 200) {
      const first = this.receivedMsgIds.values().next().value;
      this.receivedMsgIds.delete(first);
    }

    this._trigger(msg.type, msg.payload, source);
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
