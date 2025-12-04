import { create } from 'zustand';
import Peer from 'peerjs';

// Helper to generate random color
const getRandomColor = () => {
  const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Helper to generate a short ID
const generateShortId = () => {
    // Prefix to avoid collisions and ensure string type
    return 'CN-' + Math.random().toString(36).substr(2, 6).toUpperCase();
};

const peerConfig = {
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    debug: 2,
    pingInterval: 5000,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
        ]
    }
};

export const useP2PStore = create((set, get) => ({
  connectionStatus: 'disconnected', // 'disconnected', 'connecting', 'connected', 'reconnecting'
  myPeerId: null,
  logs: [],
  
  // Multiple peers support
  peers: {}, // { [peerId]: { id, conn, location, route, color } }
  
  myColor: getRandomColor(),
  peerInstance: null,
  
  // Robustness State
  targetReceiverId: null,
  myLocation: null,
  myRoutes: null,
  messageQueue: {}, // { [peerId]: [msg1, msg2] }

  addLog: (msg, type = 'info') => {
    console.log(`[P2P] ${msg}`);
    set((state) => ({ 
      logs: [...state.logs, { time: new Date().toLocaleTimeString(), message: msg, type }] 
    }));
  },

  clearLogs: () => set({ logs: [] }),

  cleanup: () => {
    const { peerInstance, peers } = get();
    
    // Close all connections
    Object.values(peers).forEach(p => {
      if (p.conn) p.conn.close();
    });

    if (peerInstance) {
        peerInstance.destroy();
    }

    set({ 
      connectionStatus: 'disconnected', 
      myPeerId: null,
      peers: {},
      peerInstance: null,
      targetReceiverId: null,
      messageQueue: {}
    });
    get().addLog('All connections closed and cleaned up');
  },

  reconnect: () => {
      const { peerInstance } = get();
      if (peerInstance && !peerInstance.destroyed) {
          get().addLog('Manual reconnection attempt...');
          set({ connectionStatus: 'reconnecting' });
          peerInstance.reconnect();
      } else {
          get().addLog('Cannot reconnect: Peer instance destroyed or missing', 'error');
          set({ connectionStatus: 'disconnected' });
      }
  },

  // Initialize as Receiver (Host)
  initializeReceiver: () => {
      get().cleanup();
      const shortId = generateShortId();
      const peer = new Peer(shortId, peerConfig);

      set({ connectionStatus: 'connecting', peerInstance: peer });
      get().addLog(`Initializing Receiver with ID: ${shortId}...`);
      get().addLog(`Using PeerJS config: ${JSON.stringify(peerConfig)}`);

      peer.on('open', (id) => {
          set({ myPeerId: id, connectionStatus: 'connected' });
          get().addLog(`Receiver ready. Share ID: ${id}`);
      });

      peer.on('connection', (conn) => {
          get().handleConnection(conn);
      });

      peer.on('disconnected', () => {
          get().addLog('Peer disconnected from server.', 'warning');
          set({ connectionStatus: 'reconnecting' });
          
          if (!peer.destroyed) {
              get().addLog('Attempting to reconnect to server in 2s...', 'info');
              setTimeout(() => {
                  if (!peer.destroyed && peer.disconnected) {
                      peer.reconnect();
                  }
              }, 2000);
          }
      });

      peer.on('close', () => {
          get().addLog('Peer closed (destroyed).', 'error');
          set({ connectionStatus: 'disconnected', myPeerId: null });
      });

      peer.on('error', (err) => {
          get().addLog(`PeerJS Error: ${err.type} - ${err.message}`, 'error');
          
          // Handle specific errors that might require reconnection
          if (['network', 'disconnected', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
              set({ connectionStatus: 'reconnecting' });
              if (!peer.destroyed) {
                  get().addLog('Attempting to reconnect due to error...', 'info');
                  setTimeout(() => peer.reconnect(), 2000);
              }
          }
      });
  },

  // Initialize as Sender (Client) and connect to Receiver
  connectToReceiver: (receiverId) => {
      set({ targetReceiverId: receiverId });
      let { peerInstance } = get();

      // Reuse existing peer instance if available and valid
      if (peerInstance && !peerInstance.destroyed) {
          get().addLog(`Reusing existing Peer connection to connect to ${receiverId}...`);
          if (peerInstance.disconnected) {
              peerInstance.reconnect();
          }
          const conn = peerInstance.connect(receiverId, { reliable: true });
          get().handleConnection(conn);
          return;
      }

      get().cleanup();
      // Restore targetReceiverId after cleanup
      set({ targetReceiverId: receiverId });
      
      const peer = new Peer(peerConfig); // Auto-generated ID for sender

      set({ connectionStatus: 'connecting', peerInstance: peer });
      get().addLog(`Initializing Sender...`);
      get().addLog(`Using PeerJS config: ${JSON.stringify(peerConfig)}`);

      peer.on('open', (id) => {
          set({ myPeerId: id });
          get().addLog(`Sender ready. Connecting to ${receiverId}...`);
          
          const conn = peer.connect(receiverId, { reliable: true });
          get().handleConnection(conn);
      });

      peer.on('disconnected', () => {
          get().addLog('Peer disconnected from server.', 'warning');
          set({ connectionStatus: 'reconnecting' });
          
          if (!peer.destroyed) {
              get().addLog('Attempting to reconnect to server in 2s...', 'info');
              setTimeout(() => {
                  if (!peer.destroyed && peer.disconnected) {
                      peer.reconnect();
                  }
              }, 2000);
          }
      });

      peer.on('close', () => {
          get().addLog('Peer closed (destroyed).', 'error');
          set({ connectionStatus: 'disconnected', myPeerId: null });
      });

      peer.on('error', (err) => {
          get().addLog(`PeerJS Error: ${err.type} - ${err.message}`, 'error');
          if (['network', 'disconnected', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
              set({ connectionStatus: 'reconnecting' });
              if (!peer.destroyed) {
                  get().addLog('Attempting to reconnect due to error...', 'info');
                  setTimeout(() => peer.reconnect(), 2000);
              }
          }
      });
  },

  queueMessage: (peerId, msgObj) => {
      set(state => ({
          messageQueue: {
              ...state.messageQueue,
              [peerId]: [...(state.messageQueue[peerId] || []), msgObj]
          }
      }));
  },

  flushMessageQueue: (peerId, conn) => {
      const { messageQueue } = get();
      const queue = messageQueue[peerId];
      if (queue && queue.length > 0) {
          get().addLog(`Flushing ${queue.length} queued messages to ${peerId}`);
          queue.forEach(msg => conn.send(msg));
          set(state => {
              const newQueue = { ...state.messageQueue };
              delete newQueue[peerId];
              return { messageQueue: newQueue };
          });
      }
  },

  handleConnection: (conn) => {
      conn.on('open', () => {
          get().addLog(`Connected to ${conn.peer}`);
          
          // Send handshake immediately
          const { myColor, myLocation, myRoutes } = get();
          conn.send({ type: 'handshake', payload: { color: myColor } });

          // Sync State
          if (myLocation) conn.send({ type: 'location', payload: myLocation });
          if (myRoutes) conn.send({ type: 'routes', payload: myRoutes });

          // Flush Queue
          get().flushMessageQueue(conn.peer, conn);

          set((state) => ({
              peers: {
                  ...state.peers,
                  [conn.peer]: { id: conn.peer, conn, status: 'connected' }
              },
              connectionStatus: 'connected'
          }));
      });

      conn.on('data', (data) => {
          const peerId = conn.peer;
          set((state) => {
            const newPeers = { ...state.peers };
            if (!newPeers[peerId]) return {}; 

            let updatedPeer = { ...newPeers[peerId] };

            if (data.type === 'location') {
                updatedPeer.location = data.payload;
            } else if (data.type === 'routes') {
                updatedPeer.routes = data.payload;
                get().addLog(`[${peerId}] Received routes update`);
            } else if (data.type === 'message') {
                get().addLog(`[${peerId}] Says: ${data.payload}`, 'message-received');
            } else if (data.type === 'handshake') {
                updatedPeer.color = data.payload.color;
                get().addLog(`[${peerId}] Color set to ${data.payload.color}`);
            }
            
            newPeers[peerId] = updatedPeer;
            return { peers: newPeers };
          });
      });

      conn.on('close', () => {
          // If we are a sender and this was our target, try to reconnect?
          const { targetReceiverId } = get();
          if (targetReceiverId && conn.peer === targetReceiverId) {
              get().addLog(`Connection to HQ (${targetReceiverId}) lost. Retrying in 3s...`, 'warning');
              setTimeout(() => {
                  // Check if we are still disconnected before retrying
                  const { peers } = get();
                  if (!peers[targetReceiverId] || !peers[targetReceiverId].conn.open) {
                       get().connectToReceiver(targetReceiverId);
                  }
              }, 3000);
          }
          get().removePeer(conn.peer);
      });
      
      conn.on('error', (err) => {
          get().addLog(`Connection Error: ${err}`, 'error');
      });
  },

  removePeer: (peerId) => {
      set((state) => {
          const newPeers = { ...state.peers };
          if (newPeers[peerId]) {
              delete newPeers[peerId];
          }
          
          // If we are a sender and lost connection to receiver, we are disconnected
          // If we are receiver, we just lost one peer
          // Simplified: if no peers, we are still "connected" to the signaling server, but maybe "idle"?
          // Actually, let's keep 'connected' if we have a Peer instance open.
          
          return { peers: newPeers };
      });
      get().addLog(`Peer ${peerId} disconnected`);
  },

  sendMessage: (msg) => {
    const { peers } = get();
    const timestamp = Date.now();
    const messageObj = { type: 'message', payload: msg, id: timestamp };
    
    Object.values(peers).forEach(peer => {
        if (peer.conn && peer.conn.open) {
            peer.conn.send(messageObj);
        } else {
            // Queue it
            get().queueMessage(peer.id, messageObj);
        }
    });
    get().addLog(`Sent to all: ${msg}`, 'message-sent');
  },

  sendLocation: (location) => {
    set({ myLocation: location });
    const { peers } = get();
    Object.values(peers).forEach(peer => {
        if (peer.conn && peer.conn.open) {
            peer.conn.send({ type: 'location', payload: location });
        }
    });
  },

  sendRoutes: (routes) => {
    set({ myRoutes: routes });
    const { peers } = get();
    Object.values(peers).forEach(peer => {
        if (peer.conn && peer.conn.open) {
            peer.conn.send({ type: 'routes', payload: routes });
        }
    });
    get().addLog('Sent routes update to all peers');
  }
}));