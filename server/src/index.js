import http from 'http';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { customAlphabet } from 'nanoid';
import lzString from 'lz-string';
const { decompressFromEncodedURIComponent } = lzString;
import crypto from 'crypto';

const PORT = Number(process.env.SERVER_PORT ?? process.env.MISSION_SERVER_PORT ?? 4000);
const SESSION_CODE_LENGTH = Number(process.env.SESSION_CODE_LENGTH ?? 6);
const MIN_UPDATE_INTERVAL_MS = 5000;
const MAX_UPDATE_INTERVAL_MS = 120000;
const DEFAULT_UPDATE_INTERVAL_MS = Math.min(
  Math.max(Number(process.env.LOCATION_INTERVAL_MS ?? 10000), MIN_UPDATE_INTERVAL_MS),
  MAX_UPDATE_INTERVAL_MS
);
const MAX_ROUTES_PER_CLIENT = Number(process.env.MAX_CLIENT_ROUTES ?? 8);
const MAX_ROUTE_POINTS = Number(process.env.MAX_ROUTE_POINTS ?? 80);
const MAX_TRAFFIC_WINDOW_SECONDS = Math.max(60, Number(process.env.TRAFFIC_WINDOW_S ?? 900));
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS ?? 1000 * 60 * 60 * 6);
const HOST_RESUME_GRACE_MS = Number(process.env.HOST_RESUME_GRACE_MS ?? 1000 * 60 * 15);

const clampIntervalMs = (value) =>
  Math.min(MAX_UPDATE_INTERVAL_MS, Math.max(MIN_UPDATE_INTERVAL_MS, Math.round(value)));

const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const generateSessionCode = customAlphabet(CODE_CHARS, SESSION_CODE_LENGTH);
const generateLabel = customAlphabet(CODE_CHARS, 3);
const generateSuffix = customAlphabet(CODE_CHARS, 2);
const generateResumeToken = () => crypto.randomBytes(24).toString('hex');

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

const sessions = new Map();

const trafficStats = {
  startedAt: Date.now(),
  bytesIn: 0,
  bytesOut: 0,
  buckets: new Map()
};

const recordTraffic = (direction, bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  if (direction === 'in') {
    trafficStats.bytesIn += bytes;
  } else if (direction === 'out') {
    trafficStats.bytesOut += bytes;
  }
  const bucketKey = Math.floor(Date.now() / 1000);
  let bucket = trafficStats.buckets.get(bucketKey);
  if (!bucket) {
    bucket = { in: 0, out: 0 };
    trafficStats.buckets.set(bucketKey, bucket);
  }
  if (direction === 'in') {
    bucket.in += bytes;
  } else if (direction === 'out') {
    bucket.out += bytes;
  }
  const cutoff = bucketKey - MAX_TRAFFIC_WINDOW_SECONDS;
  for (const key of trafficStats.buckets.keys()) {
    if (key < cutoff) {
      trafficStats.buckets.delete(key);
    }
  }
};

const summarizeTraffic = (windowSeconds = null) => {
  const totalBytes = trafficStats.bytesIn + trafficStats.bytesOut;
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    return { totalBytes, windowBytes: null, window: null };
  }
  const window = Math.min(MAX_TRAFFIC_WINDOW_SECONDS, Math.round(windowSeconds));
  const nowSeconds = Math.floor(Date.now() / 1000);
  let windowBytes = 0;
  for (const [key, bucket] of trafficStats.buckets.entries()) {
    if (key >= nowSeconds - window) {
      windowBytes += bucket.in + bucket.out;
    }
  }
  return { totalBytes, windowBytes, window };
};

const app = express();
app.get('/health', (req, res) => {
  res.json({ ok: true, sessions: sessions.size, timestamp: Date.now() });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const send = (socket, type, payload = {}) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  const serialized = JSON.stringify({ type, payload });
  recordTraffic('out', Buffer.byteLength(serialized, 'utf8'));
  socket.send(serialized);
};

const buildPeerSnapshot = (peer, role) => {
  if (!peer) return null;
  return {
    id: peer.participantId,
    color: peer.color,
    label: peer.label,
    role,
    location: peer.location ?? null,
    routes: peer.routes ?? null
  };
};

const normalizeLocation = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const { lat, lng, accuracy, timestamp } = raw;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }
  return {
    lat: Number(lat),
    lng: Number(lng),
    accuracy: typeof accuracy === 'number' ? Number(accuracy) : undefined,
    timestamp: typeof timestamp === 'number' ? Number(timestamp) : Date.now()
  };
};

const sanitizeRouteItem = (item, index) => {
  if (!item || typeof item !== 'object') return null;
  const base = item.position ?? item;
  const normalized = normalizeLocation(base);
  if (!normalized) return null;
  const id = typeof item.id === 'string' ? item.id.slice(0, 40) : `PT-${index}`;
  const nameSource = typeof item.label === 'string' ? item.label : item.name;
  const name = typeof nameSource === 'string' && nameSource.trim().length > 0 ? nameSource.slice(0, 48) : undefined;
  return {
    id,
    name,
    position: { lat: normalized.lat, lng: normalized.lng }
  };
};

const sanitizeClientRoutes = (rawRoutes) => {
  if (!Array.isArray(rawRoutes)) return [];
  const safe = [];
  for (let idx = 0; idx < rawRoutes.length; idx += 1) {
    if (safe.length >= MAX_ROUTES_PER_CLIENT) break;
    const route = rawRoutes[idx];
    if (!route || typeof route !== 'object') continue;
    const items = Array.isArray(route.items)
      ? route.items.slice(0, MAX_ROUTE_POINTS).map((item, itemIdx) => sanitizeRouteItem(item, itemIdx)).filter(Boolean)
      : [];
    if (items.length === 0) continue;
    const id = typeof route.id === 'string' ? route.id.slice(0, 40) : `R-${safe.length + 1}`;
    const color = typeof route.color === 'string' ? route.color.slice(0, 32) : null;
    const name = typeof route.name === 'string' ? route.name.slice(0, 64) : undefined;
    safe.push({ id, color, name, items });
  }
  return safe;
};

const hashRoutes = (routes) => {
  try {
    return crypto.createHash('sha1').update(JSON.stringify(routes)).digest('base64');
  } catch (err) {
    return null;
  }
};

const broadcast = (session, type, payload, { excludeId = null } = {}) => {
  if (session.host?.socket && session.host.participantId !== excludeId) {
    send(session.host.socket, type, payload);
  }
  session.clients.forEach((client) => {
    if (client.participantId === excludeId) return;
    send(client.socket, type, payload);
  });
};

const sendToHost = (session, type, payload, { excludeId = null } = {}) => {
  if (session.host?.socket && session.host.participantId !== excludeId) {
    send(session.host.socket, type, payload);
  }
};

const sendToClients = (session, type, payload, { excludeId = null } = {}) => {
  session.clients.forEach((client) => {
    if (client.participantId === excludeId) return;
    send(client.socket, type, payload);
  });
};

const notifyIntervalChange = (session) => {
  const packet = { intervalMs: session.locationIntervalMs };
  sendToHost(session, 'session:interval', packet);
  sendToClients(session, 'session:interval', packet);
};

const attachSessionMeta = (socket, session, peer, role) => {
  socket.meta = {
    role,
    sessionId: session.id,
    participantId: peer.participantId,
    peer
  };
};

const notifyClientsHostStatus = (session, online, reason = null) => {
  sendToClients(session, 'session:host-status', {
    online,
    reason,
    timestamp: Date.now()
  });
};

const detachHost = (session, reason = 'host-disconnected') => {
  if (!session.host) return;
  session.host.socket = null;
  session.hostDetachedAt = Date.now();
  session.lastActivity = session.hostDetachedAt;
  notifyClientsHostStatus(session, false, reason);
};

const terminateSession = (session, reason = 'host-ended') => {
  sessions.delete(session.id);
  broadcast(session, 'session:ended', { reason });
  session.clients.forEach((client) => {
    try {
      client.socket.close(1012, reason);
    } catch (err) {
      // ignore
    }
  });
  if (session.host?.socket) {
    try {
      session.host.socket.close(1001, reason);
    } catch (err) {
      // ignore
    }
  }
  session.clients.clear();
};

const dropParticipant = (session, participantId) => {
  if (session.host && session.host.participantId === participantId) {
    detachHost(session);
    return;
  }

  if (session.clients.has(participantId)) {
    session.clients.delete(participantId);
    sendToHost(session, 'session:peer-left', { participantId });
  }
};

const pruneSessions = () => {
  const now = Date.now();
  const cutoff = now - SESSION_TTL_MS;
  sessions.forEach((session) => {
    if (!session.host?.socket && session.hostDetachedAt && now - session.hostDetachedAt > HOST_RESUME_GRACE_MS) {
      terminateSession(session, 'host-timeout');
      return;
    }
    if (session.lastActivity < cutoff) {
      terminateSession(session, 'session-expired');
    }
  });
};

const heartbeat = () => {
  wss.clients.forEach((socket) => {
    if (socket.isAlive === false) {
      socket.terminate();
      return;
    }
    socket.isAlive = false;
    socket.ping();
  });
};

const handleHostInit = (socket) => {
  if (socket.meta?.sessionId) {
    send(socket, 'session:error', { message: 'Socket already bound to a session. Disconnect first.' });
    return;
  }

  let sessionId = generateSessionCode();
  while (sessions.has(sessionId)) {
    sessionId = generateSessionCode();
  }

  const hostPeer = {
    participantId: `HQ-${generateLabel()}`,
    color: '#38bdf8',
    label: 'HQ',
    socket,
    location: null,
    lastLocationAt: 0,
    resumeToken: generateResumeToken()
  };

  const session = {
    id: sessionId,
    host: hostPeer,
    clients: new Map(),
    stateVersion: 0,
    stateBlob: null,
    stateHash: null,
    lastActivity: Date.now(),
    colorCursor: 0,
    locationIntervalMs: DEFAULT_UPDATE_INTERVAL_MS,
    hostResumeToken: hostPeer.resumeToken,
    hostDetachedAt: null
  };

  sessions.set(sessionId, session);
  attachSessionMeta(socket, session, hostPeer, 'host');
  send(socket, 'session:ready', {
    sessionId,
    role: 'host',
    participantId: hostPeer.participantId,
    peers: [],
    state: null,
    intervalMs: session.locationIntervalMs,
    resumeToken: hostPeer.resumeToken
  });
};

const handleHostResume = (socket, payload) => {
  const rawSessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim().toUpperCase() : '';
  const resumeToken = typeof payload?.resumeToken === 'string' ? payload.resumeToken.trim() : '';
  if (!rawSessionId || !resumeToken) {
    send(socket, 'session:error', { message: 'Missing resume credentials.' });
    return;
  }

  const session = sessions.get(rawSessionId);
  if (!session) {
    send(socket, 'session:error', { message: 'Session not found or expired.' });
    return;
  }
  if (!session.host || session.hostResumeToken !== resumeToken) {
    send(socket, 'session:error', { message: 'Resume token invalid.' });
    return;
  }
  if (session.host.socket) {
    send(socket, 'session:error', { message: 'Host already connected.' });
    return;
  }

  const nextToken = generateResumeToken();
  session.host.socket = socket;
  session.host.resumeToken = nextToken;
  session.hostResumeToken = nextToken;
  session.hostDetachedAt = null;
  session.lastActivity = Date.now();
  attachSessionMeta(socket, session, session.host, 'host');
  notifyClientsHostStatus(session, true, 'host-resumed');

  const statePacket =
    session.stateBlob && session.stateVersion
      ? {
          version: session.stateVersion,
          data: session.stateBlob,
          compressed: true,
          hash: session.stateHash
        }
      : null;

  const peers = Array.from(session.clients.values()).map((client) => buildPeerSnapshot(client, 'client')).filter(Boolean);

  send(socket, 'session:ready', {
    sessionId: session.id,
    role: 'host',
    participantId: session.host.participantId,
    peers,
    state: statePacket,
    intervalMs: session.locationIntervalMs,
    resumeToken: nextToken
  });
};

const handleClientJoin = (socket, payload) => {
  const { sessionId: requestedId } = payload ?? {};
  if (!requestedId) {
    send(socket, 'session:error', { message: 'Missing session code.' });
    return;
  }
  const normalizedId = requestedId.trim().toUpperCase();
  const session = sessions.get(normalizedId);
  if (!session) {
    send(socket, 'session:error', { message: 'Session not found or expired.' });
    return;
  }

  if (socket.meta?.sessionId) {
    send(socket, 'session:error', { message: 'Socket already in a session. Disconnect first.' });
    return;
  }

  const color = colorPalette[session.colorCursor % colorPalette.length];
  session.colorCursor += 1;

  const clientPeer = {
    participantId: `CL-${generateLabel()}-${generateSuffix()}`,
    color,
    label: generateLabel(),
    socket,
    location: null,
    lastLocationAt: 0,
    routes: null,
    lastRoutesAt: 0,
    routesHash: null
  };

  session.clients.set(clientPeer.participantId, clientPeer);
  session.lastActivity = Date.now();
  attachSessionMeta(socket, session, clientPeer, 'client');

  send(socket, 'session:ready', {
    sessionId: session.id,
    role: 'client',
    participantId: clientPeer.participantId,
    peers: [],
    state: null,
    intervalMs: session.locationIntervalMs
  });

  sendToHost(session, 'session:peer-joined', { participant: buildPeerSnapshot(clientPeer, 'client') });
};

const ensureSession = (socket) => {
  const sessionId = socket.meta?.sessionId;
  if (!sessionId) return null;
  return sessions.get(sessionId) ?? null;
};

const handleLocation = (socket, payload) => {
  const session = ensureSession(socket);
  if (!session) {
    send(socket, 'session:error', { message: 'Not joined to a session.' });
    return;
  }

  const peer = socket.meta?.peer;
  if (!peer) return;

  const now = Date.now();
  if (now - peer.lastLocationAt < session.locationIntervalMs) {
    return; // throttle
  }

  const location = normalizeLocation(payload?.location ?? payload);
  if (!location) return;

  peer.location = location;
  peer.lastLocationAt = now;
  session.lastActivity = now;

  if (socket.meta.role === 'client') {
    sendToHost(session, 'session:location', {
      participantId: peer.participantId,
      location,
      role: socket.meta.role
    });
  }
};

const handleHostState = (socket, payload) => {
  const session = ensureSession(socket);
  if (!session) {
    send(socket, 'session:error', { message: 'Not joined to a session.' });
    return;
  }
  if (socket.meta?.role !== 'host') {
    send(socket, 'session:error', { message: 'Only the host can publish state.' });
    return;
  }

  const blob = payload?.data;
  if (typeof blob !== 'string' || blob.length === 0) {
    send(socket, 'session:error', { message: 'Missing compressed payload.' });
    return;
  }

  let decoded;
  try {
    decoded = decompressFromEncodedURIComponent(blob);
    if (!decoded) throw new Error('decode-failed');
    JSON.parse(decoded);
  } catch (err) {
    send(socket, 'session:error', { message: 'State payload could not be decompressed.' });
    return;
  }

  const hash = crypto.createHash('sha1').update(blob).digest('base64');
  if (hash === session.stateHash) {
    return; // nothing new
  }

  session.stateBlob = blob;
  session.stateHash = hash;
  session.stateVersion += 1;
  session.lastActivity = Date.now();

  const packet = {
    version: session.stateVersion,
    data: blob,
    compressed: true,
    hash,
    size: Buffer.byteLength(blob, 'utf8')
  };

  sendToHost(session, 'session:state', packet);
};

const handleHostInterval = (socket, payload) => {
  const session = ensureSession(socket);
  if (!session) {
    send(socket, 'session:error', { message: 'Not joined to a session.' });
    return;
  }
  if (socket.meta?.role !== 'host') {
    send(socket, 'session:error', { message: 'Only the host can update cadence.' });
    return;
  }

  let requested = Number(payload?.intervalMs);
  if (!Number.isFinite(requested) && Number.isFinite(Number(payload?.seconds))) {
    requested = Number(payload.seconds) * 1000;
  }
  if (!Number.isFinite(requested) || requested <= 0) {
    send(socket, 'session:error', { message: 'Invalid interval value.' });
    return;
  }

  const nextInterval = clampIntervalMs(requested);
  if (session.locationIntervalMs === nextInterval) {
    return;
  }

  session.locationIntervalMs = nextInterval;
  notifyIntervalChange(session);
};

const handleClientRoutes = (socket, payload) => {
  const session = ensureSession(socket);
  if (!session) {
    send(socket, 'session:error', { message: 'Not joined to a session.' });
    return;
  }
  if (socket.meta?.role !== 'client') {
    send(socket, 'session:error', { message: 'Only field devices can upload routes.' });
    return;
  }

  const peer = socket.meta?.peer;
  if (!peer) return;

  const sanitized = sanitizeClientRoutes(payload?.routes ?? payload);
  const hash = sanitized.length > 0 ? hashRoutes(sanitized) : null;

  const now = Date.now();
  if (hash && peer.routesHash === hash) {
    return;
  }

  peer.routes = sanitized.length > 0 ? sanitized : null;
  peer.routesHash = hash;
  peer.lastRoutesAt = now;
  session.lastActivity = now;

  sendToHost(session, 'session:peer-routes', {
    participantId: peer.participantId,
    routes: peer.routes ?? []
  });
};

const handleHostShutdown = (socket) => {
  const session = ensureSession(socket);
  if (!session) return;
  if (socket.meta?.role !== 'host') {
    send(socket, 'session:error', { message: 'Only the host can end a session.' });
    return;
  }
  terminateSession(session, 'host-ended');
};

const handleMessage = (socket, payload) => {
  const session = ensureSession(socket);
  if (!session) {
    send(socket, 'session:error', { message: 'Not joined to a session.' });
    return;
  }
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (!text) return;

  const peer = socket.meta?.peer;
  if (!peer) return;

  if (text.startsWith('/data')) {
    const segments = text.split(/\s+/);
    const windowArg = segments[1] ? Number(segments[1]) : null;
    const { totalBytes, windowBytes, window } = summarizeTraffic(windowArg);
    const totalKb = (totalBytes / 1024).toFixed(2);
    let response = `Server traffic total: ${totalKb} KB since ${new Date(
      trafficStats.startedAt
    ).toLocaleString()}`;
    if (windowBytes != null && window) {
      const windowKb = (windowBytes / 1024).toFixed(2);
      const perSecond = window > 0 ? (windowBytes / window / 1024).toFixed(2) : '0.00';
      response += ` | Last ${window}s: ${windowKb} KB (${perSecond} KB/s)`;
    } else {
      response += ' | Tip: /data <seconds> for a recent window';
    }
    send(socket, 'session:message', {
      participantId: 'server',
      text: response,
      role: 'system',
      timestamp: Date.now()
    });
    return;
  }

  const entry = {
    participantId: peer.participantId,
    text,
    role: socket.meta.role,
    timestamp: Date.now()
  };

  broadcast(session, 'session:message', entry);
};

const handleHeartbeat = (socket) => {
  const session = ensureSession(socket);
  if (!session) {
    send(socket, 'session:error', { message: 'Not joined to a session.' });
    return;
  }
  session.lastActivity = Date.now();
  if (socket.meta?.peer) {
    socket.meta.peer.lastHeartbeatAt = session.lastActivity;
  }
  send(socket, 'session:heartbeat', { timestamp: session.lastActivity });
};

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.meta = null;

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (raw) => {
    const incomingBytes =
      typeof raw === 'string'
        ? Buffer.byteLength(raw, 'utf8')
        : raw?.byteLength ?? raw?.length ?? 0;
    if (incomingBytes > 0) {
      recordTraffic('in', incomingBytes);
    }
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (err) {
      send(socket, 'session:error', { message: 'Invalid JSON payload.' });
      return;
    }

    switch (data.type) {
      case 'host:init':
        handleHostInit(socket);
        break;
      case 'host:resume':
        handleHostResume(socket, data.payload);
        break;
      case 'client:join':
        handleClientJoin(socket, data.payload);
        break;
      case 'participant:location':
        handleLocation(socket, data.payload);
        break;
      case 'participant:message':
        handleMessage(socket, data.payload);
        break;
      case 'participant:heartbeat':
        handleHeartbeat(socket);
        break;
      case 'host:state':
        handleHostState(socket, data.payload);
        break;
      case 'host:interval':
        handleHostInterval(socket, data.payload);
        break;
      case 'host:shutdown':
        handleHostShutdown(socket);
        break;
      case 'client:routes':
        handleClientRoutes(socket, data.payload);
        break;
      default:
        send(socket, 'session:error', { message: `Unknown message type: ${data.type}` });
    }
  });

  socket.on('close', () => {
    const session = ensureSession(socket);
    if (!session) return;
    const participantId = socket.meta?.participantId;
    if (!participantId) return;
    dropParticipant(session, participantId);
  });

  socket.on('error', (err) => {
    console.error('WebSocket error', err);
  });
});

setInterval(heartbeat, 30000);
setInterval(pruneSessions, Math.max(SESSION_TTL_MS / 2, 60000));

server.listen(PORT, () => {
  console.log(`Server relay listening on http://0.0.0.0:${PORT}`);
});
