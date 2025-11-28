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

export const buildRouteShareSnapshot = ({ checkpointMap, routes, connectVia, includeNames = false }) => {
  // Collect all checkpoint IDs used in the provided routes
  const usedCheckpointIds = new Set();
  routes.forEach((route) => {
    if (Array.isArray(route.items)) {
      route.items.forEach((id) => usedCheckpointIds.add(id));
    }
  });

  const checkpoints = [];
  const idToIndex = {};
  
  // Create a list of only the used checkpoints and map their IDs to new indices
  Array.from(usedCheckpointIds).forEach((id) => {
    const checkpoint = checkpointMap[id];
    if (checkpoint && checkpoint.position) {
      idToIndex[id] = checkpoints.length;
      checkpoints.push(checkpoint.position);
    }
  });

  const snapshotRoutes = routes.map((route) => ({
    name: includeNames ? route.name : '',
    color: route.color,
    isVisible: route.isVisible,
    indices: (route.items || [])
      .map((id) => idToIndex[id])
      .filter((idx) => typeof idx === 'number')
  }));

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
        let name = textDecoder.decode(nameBytes);
        offset += nameLen;

        if (!name) {
          name = `Route ${i + 1}`;
        }

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

const encodeTextRouteShare = (normalised) => {
  // Text Encoding: (Name)geohash_geohash (Name)geohash_geohash
  // Routes separated by space, checkpoints by underscore
  // Uses sequential prefix compression: omits shared prefix with previous hash
  const checkpoints = normalised.checkpoints;
  const routes = normalised.routes;
  let previousHash = '';

  return routes
    .map((route) => {
      const suffixes = route.indices
        .map((idx) => {
          const pos = checkpoints[idx];
          if (!pos) return null;
          const currentHash = encodeLocationCode(pos, 9);
          
          let commonPrefixLength = 0;
          if (previousHash) {
            const maxLen = Math.min(previousHash.length, currentHash.length);
            while (commonPrefixLength < maxLen && previousHash[commonPrefixLength] === currentHash[commonPrefixLength]) {
              commonPrefixLength += 1;
            }
          }
          
          const suffix = currentHash.slice(commonPrefixLength);
          previousHash = currentHash;
          return suffix;
        })
        .filter((val) => val !== null);

      if (suffixes.length === 0) return null;

      const hashString = suffixes.join('_');

      if (route.name) {
        // URL encode to handle spaces and special characters safely within the text format
        const encodedName = encodeURIComponent(route.name);
        return `(${encodedName})${hashString}`;
      }
      return hashString;
    })
    .filter((str) => str && str.length > 0)
    .join(' ');
};

const decodeTextRouteShare = (code) => {
  // Try to parse as text format
  // Must contain only alphanumeric chars, underscores, spaces, brackets, and URL-safe chars
  // Relaxed regex to allow for encoded names
  if (!/^[a-z0-9_ \(\)\%\-\.\~\!\*\'\(\)]+$/i.test(code)) return null;

  const routeStrings = code.split(/\s+/).filter(Boolean);
  if (routeStrings.length === 0) return null;

  const checkpoints = [];
  const routes = [];
  let previousHash = '';

  routeStrings.forEach((routeStr, routeIndex) => {
    let name = `Route ${routeIndex + 1}`;
    let hashData = routeStr;

    // Check for name prefix (Name)
    const nameMatch = routeStr.match(/^\((.*?)\)(.*)/);
    if (nameMatch) {
      try {
        name = decodeURIComponent(nameMatch[1]);
        hashData = nameMatch[2];
      } catch (e) {
        // Fallback if decode fails
        name = nameMatch[1];
      }
    }

    // Handle empty hashData (single point identical to previous)
    // If hashData is empty string, split gives [''].
    const hashStrings = hashData.length === 0 ? [''] : hashData.split('_');
    const indices = [];

    hashStrings.forEach((hash) => {
      let fullHash = hash;
      const len = hash.length;
      const prefixLen = 9 - len;

      if (prefixLen > 0 && previousHash.length >= prefixLen) {
        fullHash = previousHash.slice(0, prefixLen) + hash;
      }

      const pos = decodeLocationCode(fullHash);
      if (pos) {
        previousHash = fullHash;
        indices.push(checkpoints.length);
        checkpoints.push(pos);
      }
    });

    if (indices.length > 0) {
      routes.push({
        name,
        color: FALLBACK_ROUTE_COLOR,
        isVisible: true,
        indices
      });
    }
  });

  if (routes.length === 0) return null;

  return {
    version: ROUTE_SHARE_VERSION,
    connectVia: 'direct', // Default for text format
    checkpoints,
    routes
  };
};

export const encodeRouteShare = (snapshot) => {
  const normalised = normaliseRouteShareSnapshot(snapshot);
  if (!normalised) return '';
  
  // Always use the text format (now supports names)
  return encodeTextRouteShare(normalised);
};

export const decodeRouteShare = (code) => {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  if (!trimmed) return null;

  // Try binary first (V4)
  const binaryResult = decodeBinaryRouteShare(trimmed);
  if (binaryResult) {
    return normaliseRouteShareSnapshot(binaryResult);
  }

  // Try text format (Geohash)
  const textResult = decodeTextRouteShare(trimmed);
  if (textResult) {
    return normaliseRouteShareSnapshot(textResult);
  }

  // Try legacy JSON
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
