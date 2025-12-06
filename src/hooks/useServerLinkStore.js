import { create } from 'zustand';
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent
} from 'lz-string';

const normalizeWsUrl = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hasScheme = /^[a-z]+:\/\//i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate, typeof window !== 'undefined' ? window.location.origin : undefined);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    }
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      return null;
    }
    url.pathname = url.pathname || '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch (err) {
    return null;
  }
};

const defaultWsUrl = () => {
  if (typeof window !== 'undefined') {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${window.location.host}`;
  }
  return 'ws://localhost:4000';
};

const SERVER_URL =
  normalizeWsUrl(import.meta.env.VITE_SERVER_URL) ??
  normalizeWsUrl(import.meta.env.VITE_MISSION_SERVER_URL) ??
  normalizeWsUrl(import.meta.env.VITE_BACKEND_URL) ??
  defaultWsUrl();
const RECONNECT_DELAY_MS = 3500;
const MAX_RECONNECT_ATTEMPTS = 12;
const MAX_RECONNECT_DELAY_MS = 30000;
const RECONNECT_JITTER_MS = 800;
const MIN_INTERVAL_SECONDS = 5;
const MAX_INTERVAL_SECONDS = 120;
const DEFAULT_INTERVAL_MS = 10000;
const HOST_DEFAULT_LABEL = 'HQ';
const HOST_DEFAULT_COLOR = '#38bdf8';
const HOST_SESSION_CACHE_KEY = 'p2p-host-session';
const CLIENT_ROUTE_PUSH_INTERVAL_MS = Number(import.meta.env.VITE_ROUTE_UPDATE_INTERVAL_MS ?? 8000);
const LOCATION_RESEND_GRACE_MS = Number(import.meta.env.VITE_LOCATION_RESEND_MS ?? 20000);
const LOCATION_EPSILON = 1e-5;

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
  selfLabel: '',
  resumeToken: '',
  hostOnline: true,
  socketHealthy: false,
  linkDownSince: null,
  lastServerContactAt: 0,
  latestLocation: null,
  pendingLocation: null,
  lastLocationPushAt: 0,
  pendingLocationQueuedAt: 0,
  lastClientRouteHash: '',
  lastClientRoutePushAt: 0,
  pendingRouteSnapshot: null,
  pendingRouteHash: '',
  routeOffers: []
};

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;

const getCachedHostSession = () => {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(HOST_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.sessionId === 'string' && typeof parsed?.resumeToken === 'string') {
      return parsed;
    }
  } catch (err) {
    // ignore cache errors
  }
  return null;
};

const persistHostSession = (sessionId, resumeToken) => {
  if (!canUseStorage()) return;
  if (!sessionId || !resumeToken) return;
  try {
    window.localStorage.setItem(
      HOST_SESSION_CACHE_KEY,
      JSON.stringify({ sessionId, resumeToken, updatedAt: Date.now() })
    );
  } catch (err) {
    // ignore cache errors
  }
};

const clearHostSessionCache = () => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(HOST_SESSION_CACHE_KEY);
  } catch (err) {
    // ignore cache errors
  }
};

const makePeerMap = (list = []) => {
  const output = {};
  list.forEach((peer) => {
    if (!peer?.id) return;
    const updatedAt = typeof peer.updatedAt === 'number' ? peer.updatedAt : null;
    const lastSeenAt = typeof peer.lastSeenAt === 'number' ? peer.lastSeenAt : updatedAt;
    output[peer.id] = {
      id: peer.id,
      color: peer.color ?? colorPalette[Math.floor(Math.random() * colorPalette.length)],
      label: peer.label ?? peer.id,
      role: peer.role ?? 'client',
      location: peer.location ?? null,
      routes: peer.routes ?? null,
      updatedAt,
      lastSeenAt: lastSeenAt ?? null,
      isOnline: typeof peer.isOnline === 'boolean' ? peer.isOnline : true
    };
  });
  return output;
};

const timestampLabel = () =>
  new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
    new Date()
  );

const computeReconnectDelay = (attempt = 0) => {
  const exponential = Math.min(RECONNECT_DELAY_MS * Math.pow(1.5, attempt), MAX_RECONNECT_DELAY_MS);
  const jitter = Math.random() * RECONNECT_JITTER_MS;
  return Math.round(exponential + jitter);
};

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

const locationsEqual = (a, b) => {
  if (!a || !b) return false;
  const latA = Number(a.lat);
  const latB = Number(b.lat);
  const lngA = Number(a.lng);
  const lngB = Number(b.lng);
  if (!Number.isFinite(latA) || !Number.isFinite(latB) || !Number.isFinite(lngA) || !Number.isFinite(lngB)) {
    return false;
  }
  return Math.abs(latA - latB) < LOCATION_EPSILON && Math.abs(lngA - lngB) < LOCATION_EPSILON;
};

export const useServerLinkStore = create((set, get) => {
  let reconnectTimer = null;
  let pendingRouteTimer = null;
  let pendingHostResume = false;
  let flushPendingTransmissions = () => {};

  const markServerContact = () => {
    const now = Date.now();
    set({ lastServerContactAt: now, socketHealthy: true, linkDownSince: null });
  };

  const markLinkDown = () => {
    set((state) => ({
      socketHealthy: false,
      linkDownSince: state.linkDownSince ?? Date.now()
    }));
  };

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
    pendingHostResume = false;
    if (pendingRouteTimer) {
      clearTimeout(pendingRouteTimer);
      pendingRouteTimer = null;
    }
    set({ ...initialState });
  };

  const formatParticipantName = (participantId, fallbackLabel) => {
    const state = get();
    const normalizedId =
      typeof participantId === 'string' && participantId.trim().length > 0
        ? participantId.trim()
        : null;
    const peerEntry = normalizedId ? state.peers[normalizedId] : null;
    const normalizedLabel =
      peerEntry?.label ??
      (typeof fallbackLabel === 'string' && fallbackLabel.trim().length > 0
        ? fallbackLabel.trim()
        : null);
    const primary = normalizedId ?? normalizedLabel ?? 'peer';
    const decorated =
      normalizedLabel && normalizedLabel !== primary ? `${primary} (${normalizedLabel})` : primary;
    if (normalizedId && normalizedId === state.participantId) {
      return `${decorated} (me)`;
    }
    return decorated;
  };

  const updatePeers = (peers = []) => {
    const existing = get().peers;
    const incoming = makePeerMap(peers);
    const updates = { peers: { ...existing, ...incoming } };
    const selfId = get().participantId;
    if (selfId && incoming[selfId]?.label) {
      updates.selfLabel = incoming[selfId].label;
    }
    set(updates);
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
          updatedAt: Date.now(),
          lastSeenAt: Date.now(),
          isOnline: state.hostOnline
        }
      },
      hostPeerId,
      lastStateVersion: packet.version ?? state.lastStateVersion
    }));
  };

  const buildHandshakePayload = (role, sessionCode, options = {}) => {
    if (role === 'host') {
      if (options.resumeSessionId && options.resumeToken) {
        return {
          type: 'host:resume',
          payload: { sessionId: options.resumeSessionId, resumeToken: options.resumeToken }
        };
      }
      return { type: 'host:init' };
    }
    const payload = { sessionId: sessionCode };
    if (typeof options.participantId === 'string' && options.participantId.trim().length > 0) {
      payload.participantId = options.participantId.trim();
    }
    if (
      typeof options.participantResumeToken === 'string' &&
      options.participantResumeToken.trim().length > 0
    ) {
      payload.resumeToken = options.participantResumeToken.trim();
    }
    return { type: 'client:join', payload };
  };

  const scheduleReconnect = () => {
    clearReconnectTimer();
    const state = get();
    if (!state.shouldReconnect) {
      resetState();
      return;
    }
    if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      addLog('Gave up trying to reconnect.', 'error');
      set({ connectionStatus: 'disconnected', shouldReconnect: false });
      return;
    }

    if (state.role !== 'host' && !state.pendingCode) {
      resetState();
      return;
    }

    const delay = computeReconnectDelay(state.reconnectAttempts);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      const latest = get();
      if (!latest.shouldReconnect) {
        resetState();
        return;
      }
      if (latest.role === 'host') {
        if (latest.sessionId && latest.resumeToken) {
          pendingHostResume = true;
          openSocket({
            role: 'host',
            isReconnect: true,
            resumeSessionId: latest.sessionId,
            resumeToken: latest.resumeToken
          });
        } else {
          openSocket({ role: 'host', isReconnect: true });
        }
      } else if (latest.pendingCode) {
        openSocket({
          role: 'client',
          sessionCode: latest.pendingCode,
          isReconnect: true,
          participantId: latest.participantId,
          participantResumeToken: latest.resumeToken
        });
      } else {
        resetState();
      }
    }, delay);

    markLinkDown();
    set({ reconnectAttempts: state.reconnectAttempts + 1 });
    if (state.role === 'host') {
      addLog('Rebinding HQ relay…', 'info');
    }
  };

  const handleSocketMessage = (data) => {
    markServerContact();
    const { type, payload } = data;
    switch (type) {
      case 'session:ready': {
        const peers = payload?.peers ?? [];
        const peerMap = makePeerMap(peers);
        const hostEntry = peers.find((peer) => peer.role === 'host');
        const nextInterval = Number(payload?.intervalMs);
        const participantId = payload.participantId;
        const role = payload.role;

        const existingSelf = peerMap[participantId];
        const derivedSelfLabel =
          existingSelf?.label ?? (role === 'host' ? HOST_DEFAULT_LABEL : participantId);

        const selfEntry = {
          id: participantId,
          color:
            existingSelf?.color ??
            (role === 'host' ? HOST_DEFAULT_COLOR : colorPalette[Math.floor(Math.random() * colorPalette.length)]),
          label: derivedSelfLabel,
          role,
          location: existingSelf?.location ?? null,
          routes: existingSelf?.routes ?? null,
          updatedAt: existingSelf?.updatedAt ?? null,
          lastSeenAt: existingSelf?.lastSeenAt ?? Date.now(),
          isOnline: true
        };

        const mergedPeers = { ...peerMap, [participantId]: selfEntry };
        clearReconnectTimer();
        set({
          connectionStatus: 'connected',
          sessionId: payload.sessionId,
          participantId: payload.participantId,
          role: payload.role,
          peers: mergedPeers,
          hostPeerId: role === 'host' ? participantId : hostEntry?.id ?? get().hostPeerId,
          reconnectAttempts: 0,
          shouldReconnect: payload.role === 'client' || payload.role === 'host',
          logs: [],
          lastStateVersion: payload.state?.version ?? 0,
          locationIntervalMs: Number.isFinite(nextInterval) ? nextInterval : DEFAULT_INTERVAL_MS,
          selfLabel: derivedSelfLabel,
          resumeToken: typeof payload.resumeToken === 'string' ? payload.resumeToken : get().resumeToken,
          hostOnline: true,
          socketHealthy: true,
          linkDownSince: null,
          lastServerContactAt: Date.now()
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
        if (payload.role === 'host' && payload.sessionId && payload.resumeToken) {
          persistHostSession(payload.sessionId, payload.resumeToken);
        }
        pendingHostResume = false;
        queueMicrotask(() => {
          flushPendingTransmissions();
        });
        break;
      }
      case 'session:peer-joined': {
        const peer = payload?.participant;
        if (peer?.id) {
          updatePeers([peer]);
          addLog(`${formatParticipantName(peer.id, peer.label)} linked`, 'info');
        }
        break;
      }
      case 'session:peer-left': {
        if (payload?.participantId) {
          const displayName = formatParticipantName(payload.participantId);
          removePeer(payload.participantId);
          const reason = payload?.reason ?? 'client-left';
          const summary = reason === 'client-left' ? 'left the room' : `removed (${reason})`;
          addLog(`${displayName} ${summary}`, reason === 'client-left' ? 'info' : 'warn');
        }
        break;
      }
      case 'session:peer-status': {
        const { participantId, isOnline, updatedAt, lastSeenAt } = payload ?? {};
        if (!participantId) break;
        set((state) => {
          const existing = state.peers[participantId] ?? {
            id: participantId,
            color: colorPalette[Math.floor(Math.random() * colorPalette.length)],
            label: participantId,
            role: 'client'
          };
          return {
            peers: {
              ...state.peers,
              [participantId]: {
                ...existing,
                isOnline: typeof isOnline === 'boolean' ? isOnline : existing.isOnline ?? true,
                updatedAt: typeof updatedAt === 'number' ? updatedAt : existing.updatedAt ?? null,
                lastSeenAt: typeof lastSeenAt === 'number' ? lastSeenAt : existing.lastSeenAt ?? Date.now()
              }
            }
          };
        });
        break;
      }
      case 'session:location': {
        const { participantId, location } = payload ?? {};
        if (!participantId || !location) return;
        const updatedAt = typeof payload?.updatedAt === 'number' ? payload.updatedAt : Date.now();
        set((state) => ({
          peers: {
            ...state.peers,
            [participantId]: {
              ...(state.peers[participantId] ?? {
                id: participantId,
                color: colorPalette[Math.floor(Math.random() * colorPalette.length)],
                label: participantId
              }),
              location,
              updatedAt,
              lastSeenAt: updatedAt,
              isOnline: true
            }
          }
        }));
        break;
      }
      case 'session:peer-routes': {
        const { participantId, routes } = payload ?? {};
        if (!participantId) break;
        const previousRoutes = get().peers[participantId]?.routes;
        const previousRouteCount = Array.isArray(previousRoutes) ? previousRoutes.length : 0;
        const normalizedRoutes = normalizePeerRoutes(routes);
        const updatedAt = typeof payload?.updatedAt === 'number' ? payload.updatedAt : Date.now();
        set((state) => ({
          peers: {
            ...state.peers,
            [participantId]: {
              ...(state.peers[participantId] ?? {
                id: participantId,
                color: colorPalette[Math.floor(Math.random() * colorPalette.length)],
                label: participantId
              }),
              routes: normalizedRoutes,
              updatedAt,
              lastSeenAt: updatedAt,
              isOnline: true
            }
          }
        }));
        if (get().role === 'host') {
          if (normalizedRoutes.length === 0 && previousRouteCount === 0) {
            break;
          }
          if (normalizedRoutes.length === 0) {
            addLog(`${formatParticipantName(participantId)} cleared their routes`, 'info');
          } else {
            addLog(`${formatParticipantName(participantId)} shared ${normalizedRoutes.length} route(s)`, 'info');
          }
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
      case 'session:route-offer': {
        const offerId = typeof payload?.offerId === 'string' ? payload.offerId : null;
        const routes = Array.isArray(payload?.routes) ? payload.routes : [];
        if (!offerId || routes.length === 0) {
          break;
        }
        const connectVia = payload?.connectVia === 'route' ? 'route' : 'direct';
        const createdAt = typeof payload?.createdAt === 'number' ? payload.createdAt : Date.now();
        set((state) => ({
          routeOffers: [...state.routeOffers.filter((offer) => offer.offerId !== offerId), {
            offerId,
            routes,
            connectVia,
            fromId: payload?.fromId ?? 'host',
            createdAt
          }]
        }));
        addLog(`HQ shared ${routes.length} route${routes.length === 1 ? '' : 's'}. Review and accept to import.`, 'info');
        break;
      }
      case 'session:host-status': {
        const nextOnline = Boolean(payload?.online);
        const previous = get().hostOnline;
        if (previous === nextOnline) break;
        set((state) => {
          const hostPeerId = state.hostPeerId;
          if (hostPeerId && state.peers[hostPeerId]) {
            return {
              hostOnline: nextOnline,
              peers: {
                ...state.peers,
                [hostPeerId]: {
                  ...state.peers[hostPeerId],
                  isOnline: nextOnline
                }
              }
            };
          }
          return { hostOnline: nextOnline };
        });
        const reason = payload?.reason ? ` (${payload.reason})` : '';
        if (get().role === 'client') {
          addLog(nextOnline ? `HQ relay restored${reason}` : `HQ relay unreachable${reason}`, nextOnline ? 'success' : 'warn');
        }
        break;
      }
      case 'session:message': {
        const { participantId, text } = payload ?? {};
        if (text) {
          const senderId = participantId ?? null;
          addLog(`${formatParticipantName(senderId)}: ${text}`, 'message-received');
        }
        break;
      }
      case 'session:route-offer-status': {
        const participantId = payload?.participantId;
        const status = payload?.status;
        const accepted = Boolean(payload?.accepted);
        const label = participantId ? formatParticipantName(participantId) : 'participant';
        if (status === 'sent') {
          addLog(`Queued route push for ${label}`, 'info');
        } else if (accepted) {
          addLog(`${label} accepted your route transfer`, 'success');
        } else {
          addLog(`${label} declined the shared routes`, 'warn');
        }
        break;
      }
      case 'session:route-offer-result': {
        const accepted = Boolean(payload?.accepted);
        addLog(
          accepted ? 'Routes imported successfully.' : 'Route transfer canceled.',
          accepted ? 'success' : 'info'
        );
        break;
      }
      case 'session:state':
        ingestStatePacket(payload);
        break;
      case 'session:ended':
        clearHostSessionCache();
        resetState();
        addLog('Host ended the session.', 'error');
        break;
      case 'session:error':
        addLog(payload?.message ?? 'Unknown server error', 'error');
        if (pendingHostResume) {
          pendingHostResume = false;
          clearHostSessionCache();
          addLog('Previous room unavailable. Starting a new session…', 'warn');
          openSocket({ role: 'host' });
        }
        break;
      default:
        break;
    }
  };

  const openSocket = ({
    role,
    sessionCode,
    isReconnect = false,
    resumeSessionId,
    resumeToken,
    participantId,
    participantResumeToken
  }) => {
    cleanupSocket();
    clearReconnectTimer();
    if (role === 'client' && !sessionCode) {
      addLog('Session code required.', 'error');
      return;
    }
    if (role === 'host') {
      if (resumeSessionId && resumeToken) {
        pendingHostResume = true;
      } else {
        pendingHostResume = false;
      }
    }
    const stateBefore = get();
    const resolvedParticipantId =
      typeof participantId === 'string' && participantId.trim().length > 0
        ? participantId.trim()
        : role === 'client' && stateBefore.participantId
          ? stateBefore.participantId
          : '';
    const resolvedParticipantToken =
      typeof participantResumeToken === 'string' && participantResumeToken.trim().length > 0
        ? participantResumeToken.trim()
        : role === 'client' && stateBefore.resumeToken
          ? stateBefore.resumeToken
          : '';
    const socket = new WebSocket(SERVER_URL);
    set((prev) => {
      const preserveConnected =
        isReconnect && role === 'client' && prev.connectionStatus === 'connected';
      return {
        socket,
        connectionStatus: preserveConnected ? 'connected' : 'connecting',
        role,
        pendingCode: role === 'client' ? sessionCode : prev.pendingCode,
        shouldReconnect: role === 'client' || role === 'host'
      };
    });

    socket.onopen = () => {
      const handshake = buildHandshakePayload(role, sessionCode, {
        resumeSessionId,
        resumeToken,
        participantId: resolvedParticipantId,
        participantResumeToken: resolvedParticipantToken
      });
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
      if (get().role === 'host') {
        addLog('Relay socket hiccup (retrying)…', 'warn');
      }
    };

    socket.onclose = () => {
      if (get().shouldReconnect) {
        markLinkDown();
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

  const pushRouteSnapshot = (snapshot, hash) => {
    const sent = sendPacket({ type: 'client:routes', payload: { routes: snapshot } });
    if (!sent) {
      return false;
    }
    const routeCount = Array.isArray(snapshot) ? snapshot.length : 0;
    set({
      lastClientRouteHash: hash,
      lastClientRoutePushAt: Date.now(),
      pendingRouteSnapshot: null,
      pendingRouteHash: ''
    });
    if (pendingRouteTimer) {
      clearTimeout(pendingRouteTimer);
      pendingRouteTimer = null;
    }
    addLog(`Shared ${routeCount} route${routeCount === 1 ? '' : 's'} with HQ`, 'info');
    return true;
  };

  const schedulePendingRouteFlush = () => {
    if (pendingRouteTimer) {
      clearTimeout(pendingRouteTimer);
    }
    const elapsed = Date.now() - get().lastClientRoutePushAt;
    const delay = Math.max(CLIENT_ROUTE_PUSH_INTERVAL_MS - elapsed, 50);
    pendingRouteTimer = setTimeout(() => {
      pendingRouteTimer = null;
      const { pendingRouteSnapshot, pendingRouteHash } = get();
      if (pendingRouteSnapshot && pendingRouteHash) {
        pushRouteSnapshot(pendingRouteSnapshot, pendingRouteHash);
      }
    }, delay);
  };

  const transmitLocation = (location, { force = false } = {}) => {
    if (!location || get().role !== 'client') return;
    const state = get();
    const now = Date.now();
    const lastLocation = state.latestLocation;
    const intervalMs = Math.max(state.locationIntervalMs ?? DEFAULT_INTERVAL_MS, MIN_INTERVAL_SECONDS * 1000);
    const resendBudgetMs = Math.max(intervalMs, LOCATION_RESEND_GRACE_MS);
    const locationChanged = !lastLocation || !locationsEqual(lastLocation, location);
    const stale = now - state.lastLocationPushAt >= resendBudgetMs;

    if (!force && !locationChanged && !stale) {
      set({ latestLocation: location });
      return;
    }

    const sent = sendPacket({ type: 'participant:location', payload: { location } });
    if (sent) {
      set({
        latestLocation: location,
        lastLocationPushAt: now,
        pendingLocation: null,
        pendingLocationQueuedAt: 0
      });
    } else {
      set({
        latestLocation: location,
        pendingLocation: location,
        pendingLocationQueuedAt: now
      });
    }
  };

  const transmitClientRoutes = (routes, { force = false } = {}) => {
    if (get().role !== 'client' || !routes) return;
    const digest = JSON.stringify(routes);
    const state = get();
    if (!force && digest === state.lastClientRouteHash) {
      return;
    }
    const sent = pushRouteSnapshot(routes, digest);
    if (!sent) {
      set({
        pendingRouteSnapshot: routes,
        pendingRouteHash: digest
      });
      schedulePendingRouteFlush();
    }
  };

  flushPendingTransmissions = () => {
    const state = get();
    if (state.role !== 'client') return;
    if (state.pendingLocation) {
      transmitLocation(state.pendingLocation, { force: true });
    } else if (state.latestLocation) {
      const budget = Math.max(state.locationIntervalMs ?? DEFAULT_INTERVAL_MS, LOCATION_RESEND_GRACE_MS);
      if (Date.now() - state.lastLocationPushAt >= budget) {
        transmitLocation(state.latestLocation, { force: true });
      }
    }
    if (state.pendingRouteSnapshot && state.pendingRouteHash) {
      pushRouteSnapshot(state.pendingRouteSnapshot, state.pendingRouteHash);
    }
  };

  return {
    ...initialState,
    logs: [],
    startHostSession: () => {
      const state = get();
      if (state.connectionStatus === 'connecting') {
        return;
      }
      const cached = getCachedHostSession();
      if (cached?.sessionId && cached?.resumeToken) {
        pendingHostResume = true;
        openSocket({
          role: 'host',
          resumeSessionId: cached.sessionId,
          resumeToken: cached.resumeToken
        });
      } else {
        openSocket({ role: 'host' });
      }
    },
    joinSession: (code) => {
      const trimmed = (code || '').trim().toUpperCase();
      if (!trimmed) {
        addLog('Enter a code to connect.', 'warn');
        return;
      }
      openSocket({ role: 'client', sessionCode: trimmed });
    },
    disconnect: () => {
      if (get().role === 'host') {
        sendPacket({ type: 'host:shutdown' });
        clearHostSessionCache();
      } else if (get().role === 'client') {
        sendPacket({ type: 'participant:leave' });
      }
      set({ shouldReconnect: false });
      cleanupSocket();
      resetState();
      addLog('Link closed locally.', 'info');
    },
    sendMessage: (text) => {
      const payload = (text || '').trim();
      if (!payload) return;
      const sent = sendPacket({ type: 'participant:message', payload: { text: payload } });
    },
    sendLocation: (location, options) => {
      transmitLocation(location, options);
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
    sendClientRoutes: (routes, options) => {
      transmitClientRoutes(routes, options);
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
    },
    offerRoutesToClient: (participantId, routes, { connectVia } = {}) => {
      if (get().role !== 'host') {
        addLog('Only hosts can push routes to teammates.', 'warn');
        return { ok: false, error: 'not-host' };
      }
      const targetId = typeof participantId === 'string' ? participantId.trim() : '';
      if (!targetId) {
        addLog('Select a participant before sending routes.', 'warn');
        return { ok: false, error: 'missing-target' };
      }
      if (!Array.isArray(routes) || routes.length === 0) {
        addLog('Pick at least one route to share.', 'warn');
        return { ok: false, error: 'missing-routes' };
      }
      const payload = {
        participantId: targetId,
        routes,
        connectVia: connectVia === 'route' ? 'route' : 'direct'
      };
      const sent = sendPacket({ type: 'host:route-offer', payload });
      if (!sent) {
        addLog('Unable to contact relay to share routes. Try again shortly.', 'error');
        return { ok: false, error: 'socket-offline' };
      }
      addLog(
        `Dispatching ${routes.length} route${routes.length === 1 ? '' : 's'} to ${formatParticipantName(targetId)}`,
        'info'
      );
      return { ok: true };
    },
    acknowledgeRouteOffer: (offerId, accepted) => {
      if (get().role !== 'client') {
        return null;
      }
      const normalizedId = typeof offerId === 'string' ? offerId : '';
      if (!normalizedId) {
        return null;
      }
      const state = get();
      const offer = state.routeOffers.find((entry) => entry.offerId === normalizedId);
      if (!offer) {
        return null;
      }
      const sent = sendPacket({
        type: 'client:route-offer-response',
        payload: { offerId: normalizedId, accepted: Boolean(accepted) }
      });
      if (!sent) {
        addLog('Unable to reach relay. Route response deferred.', 'error');
        return null;
      }
      set((current) => ({
        routeOffers: current.routeOffers.filter((entry) => entry.offerId !== normalizedId)
      }));
      if (accepted) {
        addLog(
          `Accepted ${offer.routes.length} route${offer.routes.length === 1 ? '' : 's'} from HQ`,
          'success'
        );
        return { routes: offer.routes, connectVia: offer.connectVia };
      }
      addLog('Declined the incoming route set.', 'info');
      return null;
    }
  };
});
