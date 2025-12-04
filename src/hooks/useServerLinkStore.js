import { create } from 'zustand';
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent
} from 'lz-string';

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? //your server URL here
  import.meta.env.VITE_MISSION_SERVER_URL ??
  'ws://localhost:4000';
const RECONNECT_DELAY_MS = 3500;
const MAX_RECONNECT_ATTEMPTS = 5;
const CLIENT_ROUTE_PUSH_INTERVAL_MS = 9000;
const MIN_INTERVAL_SECONDS = 5;
const MAX_INTERVAL_SECONDS = 120;
const DEFAULT_INTERVAL_MS = 10000;

const colorPalette = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#d946ef',
  '#f43f5e'
];

const initialState = {
  connectionStatus: 'disconnected',
  sessionId: '',
  participantId: '',
  role: null,
  peers: {},
  logs: [],
  socket: null,
  hostPeerId: null,
  shouldReconnect: false,
  reconnectAttempts: 0,
  pendingCode: '',
  lastStateVersion: 0,
  locationIntervalMs: DEFAULT_INTERVAL_MS,
  lastClientRouteHash: '',
  lastClientRoutePushAt: 0
};

const makePeerMap = (list = []) => {
  const output = {};
  list.forEach((peer) => {
    if (!peer?.id) return;
    output[peer.id] = {
      id: peer.id,
      color: peer.color ?? colorPalette[Math.floor(Math.random() * colorPalette.length)],
      label: peer.label ?? peer.id,
      role: peer.role ?? 'client',
      location: peer.location ?? null,
      routes: peer.routes ?? null
    };
  });
  return output;
};

const timestampLabel = () =>
  new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
    new Date()
  );

const normalizePeerRouteItem = (item, index) => {
  if (!item || typeof item !== 'object') return null;
  const base = item.position ?? item;
  const lat = Number(base?.lat);
  const lng = Number(base?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return {
    id: typeof item.id === 'string' ? item.id : `PT-${index}`,
    name: typeof item.name === 'string' ? item.name : undefined,
    position: { lat, lng }
  };
};

const normalizePeerRoutes = (routes = []) => {
  if (!Array.isArray(routes)) return [];
  return routes
    .map((route, routeIndex) => {
      if (!route || typeof route !== 'object') return null;
      const items = Array.isArray(route.items)
        ? route.items.map((item, itemIndex) => normalizePeerRouteItem(item, itemIndex)).filter(Boolean)
        : [];
      if (items.length < 2) return null;
      return {
        id: typeof route.id === 'string' ? route.id : `R-${routeIndex}`,
        name: typeof route.name === 'string' ? route.name : undefined,
        color: typeof route.color === 'string' ? route.color : null,
        items
      };
    })
    .filter(Boolean);
};

export const useServerLinkStore = create((set, get) => {
  let reconnectTimer = null;

  const addLog = (message, type = 'info') => {
    set((state) => ({
      logs: [...state.logs, { time: timestampLabel(), message, type }]
    }));
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const cleanupSocket = () => {
    const current = get().socket;
    if (current) {
      current.onopen = null;
      current.onmessage = null;
      current.onclose = null;
      current.onerror = null;
      try {
        current.close();
      } catch (err) {
        // ignore
      }
    }
    set({ socket: null });
  };

  const resetState = () => {
    clearReconnectTimer();
    set({ ...initialState });
  };

  const updatePeers = (peers = []) => {
    const existing = get().peers;
    const incoming = makePeerMap(peers);
    set({ peers: { ...existing, ...incoming } });
  };

  const removePeer = (id) => {
    set((state) => {
      if (!state.peers[id]) return state;
      const next = { ...state.peers };
      delete next[id];
      return { peers: next };
    });
  };

  const ingestStatePacket = (packet) => {
    if (!packet?.data) return;
    if (get().role === 'host') {
      return;
    }
    let decoded;
    try {
      decoded = decompressFromEncodedURIComponent(packet.data);
      if (!decoded) throw new Error('decode-failed');
    } catch (err) {
      addLog('Failed to decode host snapshot', 'error');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(decoded);
    } catch (err) {
      addLog('Malformed snapshot payload', 'error');
      return;
    }

    const hostPeerId = get().hostPeerId ?? parsed.hostPeerId ?? 'HOST-LINK';
    const baseColor = get().peers[hostPeerId]?.color ?? '#38bdf8';
    const label = get().peers[hostPeerId]?.label ?? 'HQ';

    set((state) => ({
      peers: {
        ...state.peers,
        [hostPeerId]: {
          id: hostPeerId,
          color: baseColor,
          label,
          role: 'host',
          location: state.peers[hostPeerId]?.location ?? null,
          routes: parsed.routes ?? null,
          snapshot: parsed,
          updatedAt: Date.now()
        }
      },
      hostPeerId,
      lastStateVersion: packet.version ?? state.lastStateVersion
    }));
  };

  const buildHandshakePayload = (role, sessionCode) => {
    if (role === 'host') {
      return { type: 'host:init' };
    }
    return { type: 'client:join', payload: { sessionId: sessionCode } };
  };

  const scheduleReconnect = () => {
    clearReconnectTimer();
    const { shouldReconnect, reconnectAttempts, pendingCode } = get();
    if (!shouldReconnect || !pendingCode) {
      resetState();
      return;
    }
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      addLog('Gave up trying to reconnect.', 'error');
      set({ connectionStatus: 'disconnected', shouldReconnect: false });
      return;
    }
    reconnectTimer = setTimeout(() => {
      openSocket({ role: 'client', sessionCode: pendingCode, isReconnect: true });
    }, RECONNECT_DELAY_MS);
    set({ connectionStatus: 'reconnecting', reconnectAttempts: reconnectAttempts + 1 });
    addLog('Attempting to relink…', 'info');
  };

  const handleSocketMessage = (data) => {
    const { type, payload } = data;
    switch (type) {
      case 'session:ready': {
        const peers = payload?.peers ?? [];
        const peerMap = makePeerMap(peers);
        const hostEntry = peers.find((peer) => peer.role === 'host');
        const nextInterval = Number(payload?.intervalMs);
        clearReconnectTimer();
        set({
          connectionStatus: 'connected',
          sessionId: payload.sessionId,
          participantId: payload.participantId,
          role: payload.role,
          peers: peerMap,
          hostPeerId: hostEntry?.id ?? get().hostPeerId,
          reconnectAttempts: 0,
          shouldReconnect: payload.role === 'client',
          logs: [],
          lastStateVersion: payload.state?.version ?? 0,
          locationIntervalMs: Number.isFinite(nextInterval) ? nextInterval : DEFAULT_INTERVAL_MS
        });
        addLog(
          payload.role === 'host'
            ? `Session ${payload.sessionId} online`
            : `Linked to ${payload.sessionId}`,
          'success'
        );
        if (payload.state) {
          ingestStatePacket(payload.state);
        }
        break;
      }
      case 'session:peer-joined': {
        const peer = payload?.participant;
        if (peer?.id) {
          updatePeers([peer]);
          addLog(`${peer.label ?? peer.id} linked`, 'info');
        }
        break;
      }
      case 'session:peer-left': {
        if (payload?.participantId) {
          removePeer(payload.participantId);
          addLog(`${payload.participantId} dropped`, 'warn');
        }
        break;
      }
      case 'session:location': {
        const { participantId, location } = payload ?? {};
        if (!participantId || !location) return;
        set((state) => ({
          peers: {
            ...state.peers,
            [participantId]: {
              ...(state.peers[participantId] ?? {
                id: participantId,
                color: colorPalette[Math.floor(Math.random() * colorPalette.length)],
                label: participantId
              }),
              location
            }
          }
        }));
        break;
      }
      case 'session:peer-routes': {
        const { participantId, routes } = payload ?? {};
        if (!participantId) break;
        const normalizedRoutes = normalizePeerRoutes(routes);
        set((state) => ({
          peers: {
            ...state.peers,
            [participantId]: {
              ...(state.peers[participantId] ?? {
                id: participantId,
                color: colorPalette[Math.floor(Math.random() * colorPalette.length)],
                label: participantId
              }),
              routes: normalizedRoutes
            }
          }
        }));
        if (get().role === 'host') {
          addLog(`${participantId} shared ${normalizedRoutes.length} route(s)`, 'info');
        }
        break;
      }
      case 'session:interval': {
        const intervalMs = Number(payload?.intervalMs);
        if (Number.isFinite(intervalMs)) {
          set({ locationIntervalMs: intervalMs });
          if (get().role === 'client') {
            addLog(`Host set updates to ${Math.round(intervalMs / 1000)}s`, 'info');
          }
        }
        break;
      }
      case 'session:message': {
        const { participantId, text } = payload ?? {};
        if (text) {
          addLog(`${participantId ?? 'peer'}: ${text}`, 'message-received');
        }
        break;
      }
      case 'session:state':
        ingestStatePacket(payload);
        break;
      case 'session:ended':
        resetState();
        addLog('Host ended the session.', 'error');
        break;
      case 'session:error':
        addLog(payload?.message ?? 'Unknown server error', 'error');
        break;
      default:
        break;
    }
  };

  const openSocket = ({ role, sessionCode, isReconnect = false }) => {
    cleanupSocket();
    clearReconnectTimer();
    if (role === 'client' && !sessionCode) {
      addLog('Session code required.', 'error');
      return;
    }
    const socket = new WebSocket(SERVER_URL);
    set({
      socket,
      connectionStatus: isReconnect ? 'reconnecting' : 'connecting',
      role,
      pendingCode: role === 'client' ? sessionCode : '',
      shouldReconnect: role === 'client'
    });

    socket.onopen = () => {
      const handshake = buildHandshakePayload(role, sessionCode);
      socket.send(JSON.stringify(handshake));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleSocketMessage(data);
      } catch (err) {
        addLog('Malformed message from server', 'error');
      }
    };

    socket.onerror = () => {
      addLog('Socket error', 'error');
    };

    socket.onclose = () => {
      if (role === 'client' && get().shouldReconnect) {
        scheduleReconnect();
      } else {
        resetState();
      }
    };
  };

  const sendPacket = (packet) => {
    const socket = get().socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify(packet));
    return true;
  };

  return {
    ...initialState,
    logs: [],
    startHostSession: () => openSocket({ role: 'host' }),
    joinSession: (code) => {
      const trimmed = (code || '').trim().toUpperCase();
      if (!trimmed) {
        addLog('Enter a code to connect.', 'warn');
        return;
      }
      openSocket({ role: 'client', sessionCode: trimmed });
    },
    disconnect: () => {
      set({ shouldReconnect: false });
      cleanupSocket();
      resetState();
      addLog('Link closed locally.', 'info');
    },
    sendMessage: (text) => {
      const payload = (text || '').trim();
      if (!payload) return;
      const sent = sendPacket({ type: 'participant:message', payload: { text: payload } });
      if (sent) {
        addLog(`me: ${payload}`, 'message-sent');
      }
    },
    sendLocation: (location) => {
      if (!location || get().role !== 'client') return;
      sendPacket({ type: 'participant:location', payload: { location } });
    },
    shareRoutes: (routes) => {
      if (get().role !== 'host' || !routes) return;
      try {
        const snapshot = {
          routes,
          generatedAt: Date.now(),
          hostPeerId: get().participantId || 'HOST-LINK'
        };
        const compressed = compressToEncodedURIComponent(JSON.stringify(snapshot));
        sendPacket({ type: 'host:state', payload: { data: compressed } });
      } catch (err) {
        addLog('Failed to upload route snapshot', 'error');
      }
    },
    sendClientRoutes: (routes) => {
      if (get().role !== 'client' || !routes) return;
      const serialised = JSON.stringify(routes);
      const now = Date.now();
      const { lastClientRouteHash, lastClientRoutePushAt } = get();
      if (serialised === lastClientRouteHash) {
        return;
      }
      if (now - lastClientRoutePushAt < CLIENT_ROUTE_PUSH_INTERVAL_MS) {
        return;
      }
      const sent = sendPacket({ type: 'client:routes', payload: { routes } });
      if (sent) {
        set({ lastClientRouteHash: serialised, lastClientRoutePushAt: now });
        addLog('Shared route snapshot with HQ', 'info');
      }
    },
    clearLogs: () => set({ logs: [] }),
    updateLocationInterval: (seconds) => {
      if (get().role !== 'host') return;
      const numeric = Number(seconds);
      if (!Number.isFinite(numeric)) return;
      const clampedSeconds = Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, Math.round(numeric)));
      const intervalMs = clampedSeconds * 1000;
      set({ locationIntervalMs: intervalMs });
      sendPacket({ type: 'host:interval', payload: { intervalMs } });
    }
  };
});
