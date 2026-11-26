/**
 * UNAB Scrum Live Simulator - Real-time Synchronization Engine
 * Supports:
 * 1. WebRTC PeerJS (Real multi-device over internet/LAN without paid servers)
 * 2. BroadcastChannel + localStorage (Local multi-tab/window testing 100% offline)
 */

class LiveSyncEngine {
  constructor(isHost = false, pin = null) {
    this.isHost = isHost;
    this.pin = pin;
    this.listeners = {};
    this.peer = null;
    this.connections = new Map(); // id -> connection (Host only)
    this.hostConnection = null;   // (Player only)
    this.bc = null;
    this.peerReady = false;

    this._initBroadcastChannel();
  }

  // 1. Local BroadcastChannel for instant testing across tabs/windows
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

  // 2. Initialize PeerJS WebRTC for multi-device cross-network play
  initWebRTC(pin, onReadyCallback) {
    this.pin = pin;
    const peerId = this.isHost ? `unab-scrum-${pin}` : `unab-scrum-player-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    if (typeof Peer === 'undefined') {
      console.warn('PeerJS library not loaded. Falling back to local mode.');
      if (onReadyCallback) onReadyCallback(false);
      return;
    }

    try {
      // Connect to free public PeerJS cloud server
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
        console.log(`[PeerJS] Connected as ${this.isHost ? 'HOST' : 'PLAYER'}:`, id);
        this.peerReady = true;
        if (onReadyCallback) onReadyCallback(true, id);
      });

      this.peer.on('error', (err) => {
        console.warn('[PeerJS] Error:', err);
        // Fallback or handle pin conflict
        if (onReadyCallback) onReadyCallback(false, err);
      });

      if (this.isHost) {
        // HOST: Listen for incoming connections from players
        this.peer.on('connection', (conn) => {
          console.log('[Host] Player incoming connection:', conn.peer);
          conn.on('open', () => {
            this.connections.set(conn.peer, conn);
          });
          conn.on('data', (data) => {
            if (data && data.type) {
              this._trigger(data.type, data.payload, conn.peer);
            }
          });
          conn.on('close', () => {
            this.connections.delete(conn.peer);
            this._trigger('PLAYER_DISCONNECT', { peerId: conn.peer });
          });
        });
      }
    } catch (e) {
      console.error('[PeerJS] Exception:', e);
      if (onReadyCallback) onReadyCallback(false, e);
    }
  }

  // Connect as player to host peer
  connectToHost(pin, onConnectedCallback) {
    this.pin = pin;
    if (!this.peer || !this.peerReady) {
      this.initWebRTC(pin, (ready) => {
        if (ready) this._doConnectToHost(pin, onConnectedCallback);
        else if (onConnectedCallback) onConnectedCallback(false);
      });
    } else {
      this._doConnectToHost(pin, onConnectedCallback);
    }
  }

  _doConnectToHost(pin, callback) {
    const hostPeerId = `unab-scrum-${pin}`;
    console.log('[Player] Connecting to host peer:', hostPeerId);
    
    try {
      this.hostConnection = this.peer.connect(hostPeerId, { reliable: true });
      
      this.hostConnection.on('open', () => {
        console.log('[Player] Successfully connected to host via WebRTC!');
        if (callback) callback(true);
      });

      this.hostConnection.on('data', (data) => {
        if (data && data.type) {
          this._trigger(data.type, data.payload, 'host');
        }
      });

      this.hostConnection.on('error', (err) => {
        console.warn('[Player] Connection error:', err);
        if (callback) callback(false, err);
      });

      this.hostConnection.on('close', () => {
        console.warn('[Player] Host connection closed');
        this._trigger('HOST_DISCONNECTED', {});
      });
    } catch (e) {
      console.error('[Player] Error initiating connection to host:', e);
      if (callback) callback(false, e);
    }
  }

  // Send message to everyone (from host) or to host (from player)
  broadcast(type, payload) {
    const msg = { type, payload, pin: this.pin, timestamp: Date.now() };

    // 1. Send via local BroadcastChannel (handles same-browser tabs)
    if (this.bc) {
      try {
        this.bc.postMessage(msg);
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }

    // 2. Send via WebRTC
    if (this.isHost) {
      // Host sends to all connected player peers
      this.connections.forEach((conn) => {
        if (conn.open) {
          try {
            conn.send(msg);
          } catch (e) {
            console.warn('Error sending to peer:', conn.peer, e);
          }
        }
      });
    } else {
      // Player sends to host peer
      if (this.hostConnection && this.hostConnection.open) {
        try {
          this.hostConnection.send(msg);
        } catch (e) {
          console.warn('Error sending to host:', e);
        }
      }
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
