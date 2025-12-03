import { create } from 'zustand';
import Peer from 'peerjs';

// Helper to generate random color
const getRandomColor = () => {
  const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Helper to generate a short ID
const generateShortId = () => {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
};

export const useP2PStore = create((set, get) => ({
  connectionStatus: 'disconnected', // 'disconnected', 'connecting', 'connected'
  myPeerId: null,
  logs: [],
  
  // Multiple peers support
  peers: {}, // { [peerId]: { id, conn, location, route, color } }
  
  myColor: getRandomColor(),
  peerInstance: null,

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
      peerInstance: null
    });
    get().addLog('All connections closed and cleaned up');
  },

  // Initialize as Receiver (Host)
  initializeReceiver: () => {
      get().cleanup();
      const shortId = generateShortId();
      const peer = new Peer(shortId);

      set({ connectionStatus: 'connecting', peerInstance: peer });
      get().addLog(`Initializing Receiver with ID: ${shortId}...`);

      peer.on('open', (id) => {
          set({ myPeerId: id, connectionStatus: 'connected' });
          get().addLog(`Receiver ready. Share ID: ${id}`);
      });

      peer.on('connection', (conn) => {
          get().handleConnection(conn);
      });

      peer.on('error', (err) => {
          get().addLog(`PeerJS Error: ${err.type} - ${err.message}`, 'error');
      });
  },

  // Initialize as Sender (Client) and connect to Receiver
  connectToReceiver: (receiverId) => {
      get().cleanup();
      const peer = new Peer(); // Auto-generated ID for sender

      set({ connectionStatus: 'connecting', peerInstance: peer });
      get().addLog(`Initializing Sender...`);

      peer.on('open', (id) => {
          set({ myPeerId: id });
          get().addLog(`Sender ready. Connecting to ${receiverId}...`);
          
          const conn = peer.connect(receiverId);
          get().handleConnection(conn);
      });

      peer.on('error', (err) => {
          get().addLog(`PeerJS Error: ${err.type} - ${err.message}`, 'error');
      });
  },

  handleConnection: (conn) => {
      conn.on('open', () => {
          get().addLog(`Connected to ${conn.peer}`);
          
          // Send handshake immediately
          const myColor = get().myColor;
          conn.send({ type: 'handshake', payload: { color: myColor } });

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
    Object.values(peers).forEach(peer => {
        if (peer.conn && peer.conn.open) {
            peer.conn.send({ type: 'message', payload: msg });
        }
    });
    get().addLog(`Sent to all: ${msg}`, 'message-sent');
  },

  sendLocation: (location) => {
    const { peers } = get();
    Object.values(peers).forEach(peer => {
        if (peer.conn && peer.conn.open) {
            peer.conn.send({ type: 'location', payload: location });
        }
    });
  },

  sendRoutes: (routes) => {
    const { peers } = get();
    Object.values(peers).forEach(peer => {
        if (peer.conn && peer.conn.open) {
            peer.conn.send({ type: 'routes', payload: routes });
        }
    });
    get().addLog('Sent routes update to all peers');
  }
}));