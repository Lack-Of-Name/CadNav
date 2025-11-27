export const parseLineString = (geoJson) => {
  if (!geoJson) return [];
  if (geoJson.type === 'FeatureCollection') {
    const feature = geoJson.features.find((item) => item.geometry?.type === 'LineString');
    return feature?.geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) ?? [];
  }
  if (geoJson.type === 'Feature' && geoJson.geometry?.type === 'LineString') {
    return geoJson.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  }
  if (geoJson.type === 'LineString') {
    return geoJson.coordinates.map(([lng, lat]) => [lat, lng]);
  }
  return [];
};

export const buildRoutingPayload = (points) => {
  if (!Array.isArray(points) || points.length < 2) return null;
  return {
    coordinates: points.map(([lat, lng]) => [lng, lat])
  };
};

const base64Encode = (value) => {
  if (typeof globalThis !== 'undefined' && typeof globalThis.btoa === 'function') {
    return globalThis.btoa(value);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf-8').toString('base64');
  }
  throw new Error('Base64 encoding is not supported in this environment.');
};

const base64Decode = (value) => {
  if (typeof globalThis !== 'undefined' && typeof globalThis.atob === 'function') {
    return globalThis.atob(value);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf-8');
  }
  throw new Error('Base64 decoding is not supported in this environment.');
};

const bytesToBinaryString = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return binary;
};

const binaryStringToBytes = (binary) => {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const toBase64Url = (bytes) => {
  const base64 = base64Encode(bytesToBinaryString(bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const fromBase64Url = (code) => {
  const normalised = code.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalised.length % 4 === 0 ? '' : '='.repeat(4 - (normalised.length % 4));
  const decoded = base64Decode(`${normalised}${padding}`);
  return binaryStringToBytes(decoded);
};

const clampPrecision = (number) => Math.round(number * 1e6) / 1e6;
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const normalisePosition = (candidate) => {
  if (!candidate || typeof candidate !== 'object') return null;
  const lat = Number(candidate.lat);
  const lng = Number(candidate.lng);
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat: clampPrecision(lat),
    lng: clampPrecision(lng)
  };
};

export const ROUTE_SHARE_VERSION = 4;
const ROUTE_SHARE_SCALE = 1e5;
const FALLBACK_ROUTE_COLOR = '#38bdf8';

export const normaliseRouteShareSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const version = typeof snapshot.version === 'number' ? snapshot.version : ROUTE_SHARE_VERSION;
  
  // Handle version 1 & 2 (Single Route)
  if (version < 3) {
    let checkpoints = [];
    let connectVia = 'direct';

    if (version === 1) {
      connectVia = snapshot.connectVia === 'route' ? 'route' : 'direct';
      const start = normalisePosition(snapshot.start);
      const end = normalisePosition(snapshot.end);
      const middles = Array.isArray(snapshot.checkpoints)
        ? snapshot.checkpoints.map(normalisePosition).filter(Boolean)
        : [];
      
      if (start) checkpoints.push(start);
      checkpoints.push(...middles);
      if (end) checkpoints.push(end);
    } else {
      // Version 2
      connectVia = snapshot.connectVia === 'route' ? 'route' : 'direct';
      checkpoints = Array.isArray(snapshot.checkpoints)
        ? snapshot.checkpoints.map(normalisePosition).filter(Boolean)
        : [];
    }

    // Convert to Version 3 structure
    // We create one default route containing all these checkpoints
    // We need to deduplicate points if we want to be fancy, but for upgrade, simple is fine.
    // Actually, let's just create a list of unique points and a route that references them.
    
    return {
      version: 3,
      connectVia,
      checkpoints, // List of { lat, lng }
      routes: [
        {
          name: 'Route 1',
          color: '#38bdf8',
          indices: checkpoints.map((_, i) => i),
          isVisible: true
        }
      ]
    };
  }

  if (version > ROUTE_SHARE_VERSION) return null;

  const connectVia = snapshot.connectVia === 'route' ? 'route' : 'direct';
  const checkpoints = Array.isArray(snapshot.checkpoints)
    ? snapshot.checkpoints.map(normalisePosition).filter(Boolean)
    : [];
  
  const routes = Array.isArray(snapshot.routes)
    ? snapshot.routes.map(r => ({
        name: typeof r.name === 'string' ? r.name.slice(0, 20) : 'Route',
        color: typeof r.color === 'string' ? r.color : FALLBACK_ROUTE_COLOR,
        indices: Array.isArray(r.indices)
          ? r.indices.filter((i) => typeof i === 'number' && i >= 0 && i < checkpoints.length)
          : [],
        isVisible: typeof r.isVisible === 'boolean' ? r.isVisible : true
      }))
    : [];

  return {
    version,
    connectVia,
    checkpoints,
    routes
  };
};

export const buildRouteShareSnapshot = ({ checkpointMap, routes, connectVia }) => {
  // Convert map to list
  const checkpointIds = Object.keys(checkpointMap);
  const checkpoints = checkpointIds.map(id => checkpointMap[id].position);
  
  // Map internal IDs to indices
  const idToIndex = {};
  checkpointIds.forEach((id, index) => {
    idToIndex[id] = index;
  });

  const snapshotRoutes = routes.map(route => ({
    name: route.name,
    color: route.color,
    isVisible: route.isVisible,
    indices: route.items.map(id => idToIndex[id]).filter(idx => idx !== undefined)
  }));

  // Filter out unused checkpoints? 
  // For now, let's keep it simple. If we wanted to optimize, we'd only include used ones.
  // But the user might have placed points they haven't routed yet? 
  // Actually, "orphaned" points are probably not worth saving in a share unless we want to preserve them.
  // Let's just save everything in the map.

  return {
    version: ROUTE_SHARE_VERSION,
    connectVia,
    checkpoints,
    routes: snapshotRoutes
  };
};

const encodeBinaryRouteShare = (normalised) => {
  // V4 Binary Encoding
  // [Version: 1] [ConnectVia: 1] [CheckpointCount: 2] [RouteCount: 1]
  // [Checkpoints: Count * 8 bytes]
  // [Routes...]
  // Route: [NameLen: 1] [Name: N] [ItemCount: 2] [Indices: ItemCount * 2]

  const checkpoints = normalised.checkpoints;
  const routes = normalised.routes;

  let size = 1 + 1 + 2 + 1; // Header
  size += checkpoints.length * 8;

  const textEncoder = new TextEncoder();
  const routeBuffers = routes.map((route) => {
    const safeName = typeof route.name === 'string' && route.name.trim().length
      ? route.name.slice(0, 20)
      : 'Route';
    const nameBytes = textEncoder.encode(safeName);
    return {
      nameBytes,
      indices: route.indices,
      length: 1 + nameBytes.length + 2 + route.indices.length * 2
    };
  });

  size += routeBuffers.reduce((acc, r) => acc + r.length, 0);

  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  let offset = 0;

  view.setUint8(offset, ROUTE_SHARE_VERSION); offset += 1;
  view.setUint8(offset, normalised.connectVia === 'route' ? 1 : 0); offset += 1;
  view.setUint16(offset, checkpoints.length, false); offset += 2;
  view.setUint8(offset, routes.length); offset += 1;

  checkpoints.forEach((pos) => {
    view.setInt32(offset, Math.round(pos.lat * ROUTE_SHARE_SCALE), false); offset += 4;
    view.setInt32(offset, Math.round(pos.lng * ROUTE_SHARE_SCALE), false); offset += 4;
  });

  const byteView = new Uint8Array(buffer);
  routeBuffers.forEach((route, routeIndex) => {
    view.setUint8(offset, route.nameBytes.length); offset += 1;
    byteView.set(route.nameBytes, offset); offset += route.nameBytes.length;

    view.setUint16(offset, route.indices.length, false); offset += 2;
    route.indices.forEach((idx) => {
      view.setUint16(offset, idx, false); offset += 2;
    });
  });

  return toBase64Url(new Uint8Array(buffer));
};

const decodeBinaryRouteShare = (code) => {
  try {
    const bytes = fromBase64Url(code);
    if (bytes.length < 4) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    const version = view.getUint8(offset); offset += 1;
    if (version < 1 || version > ROUTE_SHARE_VERSION) return null;

    if (version < 3) {
      let connectVia = 'direct';
      const checkpoints = [];

      if (version === 1) {
        const flags = view.getUint8(offset); offset += 1;
        connectVia = view.getUint8(offset) === 1 ? 'route' : 'direct'; offset += 1;
        const checkpointCount = view.getUint16(offset, false); offset += 2;

        const readCoordinate = () => {
          const lat = view.getInt32(offset, false) / ROUTE_SHARE_SCALE; offset += 4;
          const lng = view.getInt32(offset, false) / ROUTE_SHARE_SCALE; offset += 4;
          return { lat, lng };
        };

        if (flags & 1) checkpoints.push(readCoordinate());
        for (let i = 0; i < checkpointCount; i += 1) checkpoints.push(readCoordinate());
        if (flags & 2) checkpoints.push(readCoordinate());
      } else {
        connectVia = view.getUint8(offset) === 1 ? 'route' : 'direct'; offset += 1;
        const checkpointCount = view.getUint16(offset, false); offset += 2;
        for (let i = 0; i < checkpointCount; i += 1) {
          const lat = view.getInt32(offset, false) / ROUTE_SHARE_SCALE; offset += 4;
          const lng = view.getInt32(offset, false) / ROUTE_SHARE_SCALE; offset += 4;
          checkpoints.push({ lat, lng });
        }
      }

      return {
        version: 3,
        connectVia,
        checkpoints,
        routes: [
          {
            name: 'Route 1',
            color: FALLBACK_ROUTE_COLOR,
            isVisible: true,
            indices: checkpoints.map((_, idx) => idx)
          }
        ]
      };
    }

    const connectVia = view.getUint8(offset) === 1 ? 'route' : 'direct'; offset += 1;
    const checkpointCount = view.getUint16(offset, false); offset += 2;
    const routeCount = view.getUint8(offset); offset += 1;

    const checkpoints = [];
    for (let i = 0; i < checkpointCount; i += 1) {
      const lat = view.getInt32(offset, false) / ROUTE_SHARE_SCALE; offset += 4;
      const lng = view.getInt32(offset, false) / ROUTE_SHARE_SCALE; offset += 4;
      checkpoints.push({ lat, lng });
    }

    const textDecoder = new TextDecoder();
    const routes = [];

    for (let i = 0; i < routeCount; i += 1) {
      if (version === 3) {
        const colorLen = view.getUint8(offset); offset += 1;
        const colorBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + offset, colorLen);
        const color = textDecoder.decode(colorBytes);
        offset += colorLen;

        const nameLen = view.getUint8(offset); offset += 1;
        const nameBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + offset, nameLen);
        const name = textDecoder.decode(nameBytes);
        offset += nameLen;

        const isVisible = view.getUint8(offset) === 1; offset += 1;

        const itemCount = view.getUint16(offset, false); offset += 2;
        const indices = [];
        for (let j = 0; j < itemCount; j += 1) {
          indices.push(view.getUint16(offset, false)); offset += 2;
        }

        routes.push({ name, color, isVisible, indices });
      } else {
        const nameLen = view.getUint8(offset); offset += 1;
        const nameBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + offset, nameLen);
        const name = textDecoder.decode(nameBytes);
        offset += nameLen;

        const itemCount = view.getUint16(offset, false); offset += 2;
        const indices = [];
        for (let j = 0; j < itemCount; j += 1) {
          indices.push(view.getUint16(offset, false)); offset += 2;
        }

        routes.push({ name, color: FALLBACK_ROUTE_COLOR, isVisible: true, indices });
      }
    }

    return {
      version,
      connectVia,
      checkpoints,
      routes
    };
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const encodeRouteShare = (snapshot) => {
  const normalised = normaliseRouteShareSnapshot(snapshot);
  if (!normalised) return '';
  return encodeBinaryRouteShare(normalised);
};

export const decodeRouteShare = (code) => {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  if (!trimmed) return null;
  const binaryResult = decodeBinaryRouteShare(trimmed);
  if (binaryResult) {
    return normaliseRouteShareSnapshot(binaryResult);
  }
  try {
    const parsed = JSON.parse(base64Decode(trimmed));
    return normaliseRouteShareSnapshot(parsed);
  } catch (error) {
    return null;
  }
};

const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const GEOHASH_BITS = [16, 8, 4, 2, 1];

export const encodeLocationCode = (position, precision = 9) => {
  if (typeof precision !== 'number' || precision < 1 || precision > 12) {
    throw new Error('encodeLocationCode precision must be between 1 and 12.');
  }
  const normalised = normalisePosition(position);
  if (!normalised) return null;

  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let evenBit = true;
  let bit = 0;
  let character = 0;
  let hash = '';

  while (hash.length < precision) {
    if (evenBit) {
      const mid = (minLng + maxLng) / 2;
      if (normalised.lng >= mid) {
        character |= GEOHASH_BITS[bit];
        minLng = mid;
      } else {
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (normalised.lat >= mid) {
        character |= GEOHASH_BITS[bit];
        minLat = mid;
      } else {
        maxLat = mid;
      }
    }

    evenBit = !evenBit;

    if (bit < GEOHASH_BITS.length - 1) {
      bit += 1;
    } else {
      hash += GEOHASH_BASE32[character];
      bit = 0;
      character = 0;
    }
  }

  return hash;
};

export const decodeLocationCode = (hash) => {
  if (typeof hash !== 'string' || hash.length === 0) {
    return null;
  }

  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let evenBit = true;

  for (let index = 0; index < hash.length; index += 1) {
    const character = hash[index].toLowerCase();
    const charIndex = GEOHASH_BASE32.indexOf(character);
    if (charIndex === -1) {
      return null;
    }

    for (let bit = 0; bit < GEOHASH_BITS.length; bit += 1) {
      const mask = GEOHASH_BITS[bit];
      if (evenBit) {
        const mid = (minLng + maxLng) / 2;
        if (charIndex & mask) {
          minLng = mid;
        } else {
          maxLng = mid;
        }
      } else {
        const mid = (minLat + maxLat) / 2;
        if (charIndex & mask) {
          minLat = mid;
        } else {
          maxLat = mid;
        }
      }
      evenBit = !evenBit;
    }
  }

  return {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2
  };
};
