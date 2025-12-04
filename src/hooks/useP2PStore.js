import { create } from 'zustand';
import { joinRoom } from 'trystero';

// Helper to generate random color
const getRandomColor = () => {
  const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Helper to generate a short ID for the Room
const generateRoomId = () => {
    return 'MAP-' + Math.random().toString(36).substr(2, 6).toUpperCase();
};

const APP_ID = 'IGSCadetOpenMap_v1';

const trackerUrls = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.webtorrent.io',
  'wss://tracker.files.fm:7073/announce'
];

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ]
};

export const useP2PStore = create((set, get) => ({
  connectionStatus: 'disconnected', // 'disconnected', 'connected'
  roomId: null,
  myPeerId: null, // Trystero selfId
  logs: [],
  
  peers: {}, // { [peerId]: { id, location, route, color } }
  
  myColor: getRandomColor(),
  room: null,
  
  // Actions
  actions: {}, 

  // State to sync
  myLocation: null,
  myRoutes: null,

  addLog: (msg, type = 'info') => {
    console.log(`[P2P] ${msg}`);
    set((state) => ({ 
      logs: [...state.logs, { time: new Date().toLocaleTimeString(), message: msg, type }] 
    }));
  },

  clearLogs: () => set({ logs: [] }),

  cleanup: () => {
    const { room } = get();
    if (room) {
        room.leave();
    }
    set({ 
      connectionStatus: 'disconnected', 
      roomId: null,
      myPeerId: null,
      peers: {},
      room: null,
      actions: {}
    });
    get().addLog('Left session and cleaned up');
  },

  reconnect: () => {
      // Trystero handles reconnection, but we can re-join if needed
      const { roomId } = get();
      if (roomId) {
          get().joinSession(roomId);
      }
  },

  // Initialize as Host (creates a new room)
  initializeReceiver: () => {
      get().cleanup();
      const roomId = generateRoomId();
      get().joinSession(roomId);
  },

  // Join as Client (joins existing room)
  connectToReceiver: (roomId) => {
      get().cleanup();
      get().joinSession(roomId);
  },

  joinSession: (roomId) => {
      if (!window.isSecureContext) {
          const msg = 'P2P requires a Secure Context (HTTPS or localhost). Connection aborted.';
          get().addLog(msg, 'error');
          alert(msg);
          set({ connectionStatus: 'disconnected' });
          return;
      }

      try {
          set({ connectionStatus: 'connecting', roomId });
          get().addLog(`Joining session: ${roomId}...`);

          const room = joinRoom({ appId: APP_ID, rtcConfig, trackerUrls }, roomId);
          const myPeerId = room.selfId;
          
          set({ 
              connectionStatus: 'connected', 
              roomId, 
              room, 
              myPeerId 
          });
          
          get().addLog(`Joined session as ${myPeerId}`);

          // Define Actions
          const [sendHandshake, getHandshake] = room.makeAction('handshake');
          const [sendLocation, getLocation] = room.makeAction('location');
          const [sendRoutes, getRoutes] = room.makeAction('routes');
          const [sendMessage, getMessage] = room.makeAction('chat');

          set({
              actions: {
                  sendHandshake,
                  sendLocation,
                  sendRoutes,
                  sendMessage
              }
          });

          // Event Listeners
          room.onPeerJoin(peerId => {
              get().addLog(`Peer joined: ${peerId}`);
              
              // Send handshake immediately
              const { myColor, myLocation, myRoutes } = get();
              sendHandshake({ color: myColor }, peerId);
              
              if (myLocation) sendLocation(myLocation, peerId);
              if (myRoutes) sendRoutes(myRoutes, peerId);

              set(state => ({
                  peers: {
                      ...state.peers,
                      [peerId]: { id: peerId, status: 'connected' }
                  }
              }));
          });

          room.onPeerLeave(peerId => {
              get().addLog(`Peer left: ${peerId}`);
              set(state => {
                  const newPeers = { ...state.peers };
                  delete newPeers[peerId];
                  return { peers: newPeers };
              });
          });

          // Action Handlers
          getHandshake((data, peerId) => {
              get().addLog(`[${peerId}] Handshake received`);
              set(state => ({
                  peers: {
                      ...state.peers,
                      [peerId]: { ...state.peers[peerId], color: data.color, id: peerId }
                  }
              }));
          });

          getLocation((data, peerId) => {
               set(state => ({
                  peers: {
                      ...state.peers,
                      [peerId]: { ...state.peers[peerId], location: data, id: peerId }
                  }
              }));
          });

          getRoutes((data, peerId) => {
              get().addLog(`[${peerId}] Routes updated`);
               set(state => ({
                  peers: {
                      ...state.peers,
                      [peerId]: { ...state.peers[peerId], routes: data, id: peerId }
                  }
              }));
          });

          getMessage((data, peerId) => {
              get().addLog(`[${peerId}] Says: ${data}`, 'message-received');
          });

      } catch (err) {
          get().addLog(`Error joining session: ${err.message}`, 'error');
          set({ connectionStatus: 'disconnected' });
      }
  },

  // Public Actions
  sendMessage: (msg) => {
      const { actions } = get();
      if (actions.sendMessage) {
          actions.sendMessage(msg);
          get().addLog(`Sent: ${msg}`, 'message-sent');
      }
  },

  sendLocation: (location) => {
      set({ myLocation: location });
      const { actions } = get();
      if (actions.sendLocation) {
          actions.sendLocation(location);
      }
  },

  sendRoutes: (routes) => {
      set({ myRoutes: routes });
      const { actions, peers } = get();
      const peerCount = Object.keys(peers).length;
      
      if (actions.sendRoutes) {
          actions.sendRoutes(routes);
          if (peerCount > 0) {
             get().addLog(`Sent routes update to ${peerCount} peers`);
          } else {
             get().addLog('Routes updated (No peers connected)', 'warning');
          }
      }
  }
}));
