const EARTH_RADIUS_METERS = 6371000;
export const MIN_GRID_PRECISION = 1;
export const MAX_GRID_PRECISION = 5;

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;
const normalizeLongitude = (longitude) => ((longitude + 540) % 360) - 180;

const clampPrecision = (precision) => {
  const numeric = Number(precision);
  if (!Number.isFinite(numeric)) {
    throw new Error('Grid precision must be a number.');
  }
  if (numeric < MIN_GRID_PRECISION || numeric > MAX_GRID_PRECISION) {
    throw new Error(
      `Grid precision must be between ${MIN_GRID_PRECISION} and ${MAX_GRID_PRECISION} digits.`
    );
  }
  return Math.round(numeric);
};

const parseGridDigits = (value, precisionHint) => {
  if (value == null) {
    throw new Error('Grid reference digits are required.');
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    throw new Error('Grid reference digits are required.');
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new Error('Grid references must contain digits only.');
  }
  const resolvedPrecision = clampPrecision(precisionHint ?? trimmed.length);
  if (trimmed.length > resolvedPrecision) {
    throw new Error(`Expected ${resolvedPrecision} digits for this precision setting.`);
  }
  const padded = trimmed.length < resolvedPrecision
    ? trimmed.padStart(resolvedPrecision, '0')
    : trimmed;
  return {
    value: parseInt(padded, 10),
    precision: resolvedPrecision
  };
};

export const precisionToUnitMeters = (precision) => {
  const value = clampPrecision(precision);
  return 10 ** (5 - value);
};

export const normaliseGridDigits = (value, precision) => {
  const parsed = parseGridDigits(value, precision);
  return parsed.value;
};

const projectOffset = ({ lat, lng }, eastOffset, northOffset) => {
  const latRad = toRadians(lat);
  const newLat = lat + (northOffset / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const newLng =
    lng +
    ((eastOffset / (EARTH_RADIUS_METERS * Math.cos(latRad))) * 180) /
      Math.PI;
  return { lat: newLat, lng: newLng };
};

export const destinationFromBearing = ({ origin, bearingDegrees, distanceMeters }) => {
  if (!origin) {
    throw new Error('Provide a valid origin location first.');
  }
  if (bearingDegrees == null || Number.isNaN(bearingDegrees)) {
    throw new Error('Bearing must be a number.');
  }
  if (distanceMeters == null || Number.isNaN(distanceMeters) || distanceMeters < 0) {
    throw new Error('Distance must be a non-negative number.');
  }

  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const bearingRad = toRadians(bearingDegrees);
  const lat1 = toRadians(origin.lat);
  const lng1 = toRadians(origin.lng);

  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinAngular = Math.sin(angularDistance);
  const cosAngular = Math.cos(angularDistance);

  const lat2 = Math.asin(
    sinLat1 * cosAngular + cosLat1 * sinAngular * Math.cos(bearingRad)
  );

  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearingRad) * sinAngular * cosLat1,
      cosAngular - sinLat1 * Math.sin(lat2)
    );

  return {
    lat: toDegrees(lat2),
    lng: normalizeLongitude(toDegrees(lng2))
  };
};

export const milsToDegrees = (mils) => (mils * 360) / 6400;
export const degreesToMils = (degrees) => (degrees * 6400) / 360;

export const gridReferenceToLatLng = ({
  origin,
  originReference,
  targetReference,
  precision
}) => {
  if (!origin) {
    throw new Error('Set a grid origin location first.');
  }
  if (!originReference) {
    throw new Error('Set a grid origin reference first.');
  }

  if (!targetReference) {
    throw new Error('Provide a target grid reference to convert.');
  }

  const originPrecisionHint = originReference.precision ?? precision ?? 3;
  const originEast = parseGridDigits(originReference.easting, originPrecisionHint);
  const originNorth = parseGridDigits(originReference.northing, originPrecisionHint);
  if (originEast.precision !== originNorth.precision) {
    throw new Error('Origin easting and northing must use the same precision.');
  }

  const targetPrecisionHint = targetReference.precision ?? precision ?? null;
  const targetEast = parseGridDigits(targetReference.easting, targetPrecisionHint ?? undefined);
  const targetNorth = parseGridDigits(targetReference.northing, targetPrecisionHint ?? undefined);
  if (targetEast.precision !== targetNorth.precision) {
    throw new Error('Target easting and northing must use the same number of digits.');
  }

  const originUnit = precisionToUnitMeters(originEast.precision);
  const targetUnit = precisionToUnitMeters(targetEast.precision);
  const originEastMeters = originEast.value * originUnit;
  const originNorthMeters = originNorth.value * originUnit;
  const targetEastMeters = targetEast.value * targetUnit;
  const targetNorthMeters = targetNorth.value * targetUnit;

  const eastOffset = targetEastMeters - originEastMeters;
  const northOffset = targetNorthMeters - originNorthMeters;

  return projectOffset(origin, eastOffset, northOffset);
};

export const latLngToGridReference = ({
  origin,
  originReference,
  point,
  precision
}) => {
  if (!origin || !originReference) {
    throw new Error('Grid origin must be configured.');
  }
  const resolvedPrecision = clampPrecision(
    precision ?? originReference.precision ?? 3
  );
  const unitMeters = precisionToUnitMeters(resolvedPrecision);

  const latRad = (origin.lat * Math.PI) / 180;
  const deltaNorth = ((point.lat - origin.lat) * Math.PI * EARTH_RADIUS_METERS) / 180;
  const deltaEast =
    ((point.lng - origin.lng) * Math.PI * EARTH_RADIUS_METERS * Math.cos(latRad)) /
    180;

  const eastDigits = Math.round(originReference.easting + deltaEast / unitMeters);
  const northDigits = Math.round(originReference.northing + deltaNorth / unitMeters);

  const pad = (value) => value.toString().padStart(resolvedPrecision, '0');

  return {
    easting: pad(eastDigits),
    northing: pad(northDigits),
    precision: resolvedPrecision
  };
};
