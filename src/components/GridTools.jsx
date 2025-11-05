import { useEffect, useMemo, useState } from 'react';
import { useGrid } from '../hooks/useGrid.js';
import { useCheckpoints } from '../hooks/useCheckpoints.js';
import {
  destinationFromBearing,
  gridReferenceToLatLng,
  latLngToGridReference,
  normaliseGridDigits,
  precisionToUnitMeters
} from '../utils/grid.js';

const formatLatLng = (value) => (value != null ? value.toFixed(6) : '—');
const formatMeters = (value) => {
  if (value == null || Number.isNaN(value)) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  if (value >= 10) return `${value.toFixed(0)} m`;
  return `${value.toFixed(1)} m`;
};

const GridTools = ({ userLocation, selectedPosition }) => {
  const {
    origin,
    originReference,
    precision,
    setOrigin,
    setOriginReference,
    setPrecision,
    resetGrid
  } = useGrid();
  const { setStart, setEnd, addCheckpoint } = useCheckpoints();

  const [originLat, setOriginLat] = useState('');
  const [originLng, setOriginLng] = useState('');
  const [originEast, setOriginEast] = useState('');
  const [originNorth, setOriginNorth] = useState('');
  const [targetEast, setTargetEast] = useState('');
  const [targetNorth, setTargetNorth] = useState('');
  const [statusMessage, setStatusMessage] = useState(null);
  const [resolvedLocation, setResolvedLocation] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [bearingSource, setBearingSource] = useState('user');
  const [bearingManualLat, setBearingManualLat] = useState('');
  const [bearingManualLng, setBearingManualLng] = useState('');
  const [bearingValue, setBearingValue] = useState('');
  const [bearingUnitInput, setBearingUnitInput] = useState('degrees');
  const [distanceInput, setDistanceInput] = useState('');
  const [bearingLocation, setBearingLocation] = useState(null);
  const [bearingMetadata, setBearingMetadata] = useState(null);

  useEffect(() => {
    if (origin) {
      setOriginLat(origin.lat.toFixed(6));
      setOriginLng(origin.lng.toFixed(6));
    }
  }, [origin]);

  useEffect(() => {
    if (originReference) {
      setOriginEast(originReference.easting?.toString().padStart(precision, '0') ?? '');
      setOriginNorth(originReference.northing?.toString().padStart(precision, '0') ?? '');
    }
  }, [originReference, precision]);

  const originSummary = useMemo(() => {
    if (!origin || !originReference) {
      return null;
    }
    try {
      const current = latLngToGridReference({
        origin,
        originReference,
        point: origin,
        precision
      });
      return `${current.easting} / ${current.northing}`;
    } catch (error) {
      console.warn(error);
      return null;
    }
  }, [origin, originReference, precision]);

  const bearingPreviewDegrees = useMemo(() => {
    if (!bearingValue) return null;
    const numeric = Number(bearingValue);
    if (Number.isNaN(numeric)) return null;
    return bearingUnitInput === 'mils' ? (numeric * 360) / 6400 : numeric;
  }, [bearingValue, bearingUnitInput]);

  const bearingPreviewMils = useMemo(() => {
    if (bearingPreviewDegrees == null) return null;
    return (bearingPreviewDegrees * 6400) / 360;
  }, [bearingPreviewDegrees]);

  const bearingDegreesUsed = bearingMetadata?.bearingDegrees ?? null;
  const bearingMilsUsed = bearingDegreesUsed != null ? (bearingDegreesUsed * 6400) / 360 : null;

  const applyOriginLocation = () => {
    if (!originLat || !originLng) {
      setErrorMessage('Provide both latitude and longitude for the origin.');
      return;
    }
    const lat = Number(originLat);
    const lng = Number(originLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setErrorMessage('Latitude and longitude must be valid numbers.');
      return;
    }
    setOrigin({ lat, lng });
    setErrorMessage(null);
    setStatusMessage('Grid origin location updated.');
  };

  const applyOriginReference = () => {
    try {
      const easting = normaliseGridDigits(originEast, precision);
      const northing = normaliseGridDigits(originNorth, precision);
      setOriginReference({ easting, northing, precision });
      setErrorMessage(null);
      setStatusMessage('Grid origin reference locked in.');
    } catch (error) {
      setErrorMessage(error.message);
    }
  };

  const fillFromUserLocation = () => {
    if (!userLocation) {
      setErrorMessage('No user location fix yet.');
      return;
    }
    setOriginLat(userLocation.lat.toFixed(6));
    setOriginLng(userLocation.lng.toFixed(6));
    setErrorMessage(null);
    setStatusMessage('Loaded user location into origin fields.');
  };

  const fillFromSelected = () => {
    if (!selectedPosition) {
      setErrorMessage('Select a marker on the map first.');
      return;
    }
    setOriginLat(selectedPosition.lat.toFixed(6));
    setOriginLng(selectedPosition.lng.toFixed(6));
    setErrorMessage(null);
    setStatusMessage('Loaded selected marker into origin fields.');
  };

  const resolveBearingOrigin = () => {
    if (bearingSource === 'user') {
      if (!userLocation) {
        throw new Error('No user location fix yet.');
      }
      return userLocation;
    }
    if (bearingSource === 'selected') {
      if (!selectedPosition) {
        throw new Error('Select a marker on the map to use as the origin.');
      }
      return selectedPosition;
    }
    if (bearingSource === 'grid') {
      if (!origin) {
        throw new Error('Set a grid origin location first.');
      }
      return origin;
    }
    const lat = Number(bearingManualLat);
    const lng = Number(bearingManualLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      throw new Error('Enter valid latitude and longitude for the custom origin.');
    }
    return { lat, lng };
  };

  const projectBearingLocation = () => {
    try {
      if (!bearingValue) {
        throw new Error('Enter a bearing value.');
      }
      if (!distanceInput) {
        throw new Error('Enter a distance in meters.');
      }
      const originPoint = resolveBearingOrigin();
      const bearingNumber = Number(bearingValue);
      const distanceNumber = Number(distanceInput);
      if (Number.isNaN(bearingNumber)) {
        throw new Error('Bearing must be a number.');
      }
      if (Number.isNaN(distanceNumber) || distanceNumber < 0) {
        throw new Error('Distance must be zero or greater.');
      }
      const bearingDegrees = bearingUnitInput === 'mils'
        ? (bearingNumber * 360) / 6400
        : bearingNumber;
      const normalizedBearing = ((bearingDegrees % 360) + 360) % 360;
      const location = destinationFromBearing({
        origin: originPoint,
        bearingDegrees: normalizedBearing,
        distanceMeters: distanceNumber
      });
      setBearingLocation(location);
      setBearingMetadata({
        bearingDegrees: normalizedBearing,
        bearingInput: bearingNumber,
        bearingUnit: bearingUnitInput,
        distanceMeters: distanceNumber
      });
      setStatusMessage('Projected point from bearing and distance.');
      setErrorMessage(null);
    } catch (projectionError) {
      setBearingLocation(null);
      setBearingMetadata(null);
      setErrorMessage(projectionError.message ?? 'Unable to project bearing.');
    }
  };

  const resolveGridReference = () => {
    if (!targetEast || !targetNorth) {
      setErrorMessage('Enter both easting and northing for the grid reference.');
      return;
    }
    try {
      const candidate = gridReferenceToLatLng({
        origin,
        originReference,
        targetReference: {
          easting: targetEast,
          northing: targetNorth,
          precision
        },
        precision
      });
      setResolvedLocation(candidate);
      setStatusMessage('Grid reference resolved.');
      setErrorMessage(null);
    } catch (error) {
      setResolvedLocation(null);
      setErrorMessage(error.message);
    }
  };

  const handleCreate = (mode, location = resolvedLocation, context = 'grid reference') => {
    if (!location) {
      setErrorMessage(`Resolve a ${context} first.`);
      return;
    }
    if (mode === 'start') {
      setStart(location);
      setStatusMessage(`Start updated from ${context}.`);
    } else if (mode === 'end') {
      setEnd(location);
      setStatusMessage(`End updated from ${context}.`);
    } else {
      addCheckpoint(location);
      setStatusMessage(`Checkpoint added from ${context}.`);
    }
    setErrorMessage(null);
  };

  const handleReset = () => {
    resetGrid();
    setOriginLat('');
    setOriginLng('');
    setOriginEast('');
    setOriginNorth('');
    setTargetEast('');
    setTargetNorth('');
    setResolvedLocation(null);
    setBearingSource('user');
    setBearingManualLat('');
    setBearingManualLng('');
    setBearingValue('');
    setBearingUnitInput('degrees');
    setDistanceInput('');
    setBearingLocation(null);
    setBearingMetadata(null);
    setStatusMessage('Grid settings cleared.');
    setErrorMessage(null);
  };

  const unitMeters = precisionToUnitMeters(precision);

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-slate-900 p-4 text-xs text-slate-200 shadow-lg shadow-slate-950">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-sky-200">Grid Tools</h2>
        <div className="flex gap-1">
          <button
            type="button"
            className={`rounded-full px-2 py-1 font-semibold ${
              precision === 3
                ? 'border border-sky-500 text-sky-200'
                : 'border border-slate-700 text-slate-300 hover:border-sky-500 hover:text-sky-200'
            }`}
            onClick={() => setPrecision(3)}
          >
            3-fig (100&nbsp;m)
          </button>
          <button
            type="button"
            className={`rounded-full px-2 py-1 font-semibold ${
              precision === 4
                ? 'border border-sky-500 text-sky-200'
                : 'border border-slate-700 text-slate-300 hover:border-sky-500 hover:text-sky-200'
            }`}
            onClick={() => setPrecision(4)}
          >
            4-fig (10&nbsp;m)
          </button>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        Anchor your map to a known grid origin, then convert additional grid references into precise map points.
      </p>

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-300">Origin</h3>
        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">Latitude</span>
              <input
                value={originLat}
                onChange={(event) => setOriginLat(event.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                placeholder="e.g. 45.123456"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">Longitude</span>
              <input
                value={originLng}
                onChange={(event) => setOriginLng(event.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                placeholder="e.g. -75.987654"
              />
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="rounded-md border border-emerald-500 px-3 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-900"
              onClick={fillFromUserLocation}
            >
              Use my location
            </button>
            <button
              type="button"
              className="rounded-md border border-sky-500 px-3 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-900"
              onClick={fillFromSelected}
            >
              Use selected marker
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-sky-500 hover:text-sky-200"
              onClick={applyOriginLocation}
            >
              Apply origin
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Origin Easting</span>
            <input
              value={originEast}
              onChange={(event) => setOriginEast(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              placeholder={'e.g. '.concat('1'.repeat(precision))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Origin Northing</span>
            <input
              value={originNorth}
              onChange={(event) => setOriginNorth(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              placeholder={'e.g. '.concat('1'.repeat(precision))}
            />
          </label>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
          <button
            type="button"
            className="rounded-md border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-sky-500 hover:text-sky-200"
            onClick={applyOriginReference}
          >
            Lock origin reference
          </button>
          <span>
            {originSummary ? `Origin ref: ${originSummary}` : 'No origin reference set yet.'}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-300">Convert</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Easting</span>
            <input
              value={targetEast}
              onChange={(event) => setTargetEast(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              placeholder={'e.g. '.concat('2'.repeat(precision))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Northing</span>
            <input
              value={targetNorth}
              onChange={(event) => setTargetNorth(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              placeholder={'e.g. '.concat('3'.repeat(precision))}
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            className="rounded-md border border-sky-500 px-3 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-900"
            onClick={resolveGridReference}
          >
            Preview location
          </button>
          <span className="text-[11px] text-slate-400">
            1 digit = {unitMeters} m offset
          </span>
        </div>
        {resolvedLocation && (
          <div className="mt-3 rounded-md border border-slate-800 bg-slate-900 p-3 text-[11px] text-slate-200">
            <p className="font-semibold text-sky-200">Resolved coordinates</p>
            <p className="mt-1 text-slate-300">
              Lat {formatLatLng(resolvedLocation.lat)} | Lng {formatLatLng(resolvedLocation.lng)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-emerald-500 px-3 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-900"
                onClick={() => handleCreate('start', resolvedLocation, 'grid reference')}
              >
                Set start
              </button>
              <button
                type="button"
                className="rounded-md border border-orange-500 px-3 py-1 text-[11px] font-semibold text-orange-200 hover:bg-orange-900"
                onClick={() => handleCreate('end', resolvedLocation, 'grid reference')}
              >
                Set end
              </button>
              <button
                type="button"
                className="rounded-md border border-sky-500 px-3 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-900"
                onClick={() => handleCreate('checkpoint', resolvedLocation, 'grid reference')}
              >
                Add checkpoint
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-300">
          Project by bearing
        </h3>
        <p className="mb-2 text-[11px] text-slate-400">
          Choose a reference point, then enter a bearing and distance to plot the offset location.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">Reference origin</span>
          <select
            value={bearingSource}
            onChange={(event) => {
              setBearingSource(event.target.value);
              setStatusMessage(null);
            }}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="user" disabled={!userLocation}>
              My location {userLocation ? '' : '(fix pending)'}
            </option>
            <option value="selected" disabled={!selectedPosition}>
              Selected marker {selectedPosition ? '' : '(none selected)'}
            </option>
            <option value="grid" disabled={!origin}>
              Grid origin {origin ? '' : '(not set)'}
            </option>
            <option value="manual">Custom coordinates</option>
          </select>
        </label>

        {bearingSource === 'manual' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">Latitude</span>
              <input
                value={bearingManualLat}
                onChange={(event) => setBearingManualLat(event.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                placeholder="e.g. 45.123456"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">Longitude</span>
              <input
                value={bearingManualLng}
                onChange={(event) => setBearingManualLng(event.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                placeholder="e.g. -75.987654"
              />
            </label>
          </div>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Bearing</span>
            <input
              value={bearingValue}
              onChange={(event) => setBearingValue(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              placeholder={bearingUnitInput === 'degrees' ? '0 — 360°' : '0 — 6400 mil'}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Units</span>
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
                  bearingUnitInput === 'degrees'
                    ? 'border border-sky-500 text-sky-200'
                    : 'border border-slate-700 text-slate-200 hover:border-sky-500 hover:text-sky-200'
                }`}
                onClick={() => setBearingUnitInput('degrees')}
              >
                Degrees
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
                  bearingUnitInput === 'mils'
                    ? 'border border-sky-500 text-sky-200'
                    : 'border border-slate-700 text-slate-200 hover:border-sky-500 hover:text-sky-200'
                }`}
                onClick={() => setBearingUnitInput('mils')}
              >
                Mils
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Distance (m)</span>
            <input
              value={distanceInput}
              onChange={(event) => setDistanceInput(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              placeholder="e.g. 250"
            />
          </label>
          <div className="flex flex-col justify-end text-[11px] text-slate-400">
            <span>
              {bearingPreviewDegrees != null
                ? `≈ ${bearingPreviewDegrees.toFixed(1)}° / ${bearingPreviewMils?.toFixed(0) ?? '—'} mil`
                : 'Enter a bearing to preview conversions.'}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            className="rounded-md border border-sky-500 px-3 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-900"
            onClick={projectBearingLocation}
          >
            Project location
          </button>
          <span className="text-[11px] text-slate-400">
            Distance measured in straight line
          </span>
        </div>

        {bearingLocation && (
          <div className="mt-3 rounded-md border border-slate-800 bg-slate-900 p-3 text-[11px] text-slate-200">
            <p className="font-semibold text-sky-200">Projected coordinates</p>
            <p className="mt-1 text-slate-300">
              Lat {formatLatLng(bearingLocation.lat)} | Lng {formatLatLng(bearingLocation.lng)}
            </p>
            <p className="text-slate-400">
              Bearing used:{' '}
              {bearingDegreesUsed != null
                ? `${bearingDegreesUsed.toFixed(1)}°${
                    bearingMilsUsed != null ? ` (${bearingMilsUsed.toFixed(0)} mil)` : ''
                  }`
                : '—'}
            </p>
            {bearingMetadata?.distanceMeters != null && (
              <p className="text-slate-400">
                Distance: {formatMeters(bearingMetadata.distanceMeters)}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-emerald-500 px-3 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-900"
                onClick={() => handleCreate('start', bearingLocation, 'bearing projection')}
              >
                Set start
              </button>
              <button
                type="button"
                className="rounded-md border border-orange-500 px-3 py-1 text-[11px] font-semibold text-orange-200 hover:bg-orange-900"
                onClick={() => handleCreate('end', bearingLocation, 'bearing projection')}
              >
                Set end
              </button>
              <button
                type="button"
                className="rounded-md border border-sky-500 px-3 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-900"
                onClick={() => handleCreate('checkpoint', bearingLocation, 'bearing projection')}
              >
                Add checkpoint
              </button>
            </div>
          </div>
        )}
      </div>

      {(errorMessage || statusMessage) && (
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3 text-[11px]">
          {errorMessage && <p className="text-rose-400">{errorMessage}</p>}
          {statusMessage && <p className="text-emerald-300">{statusMessage}</p>}
        </div>
      )}

      <button
        type="button"
        className="rounded-md border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-300 hover:border-rose-500 hover:text-rose-200"
        onClick={handleReset}
      >
        Clear grid settings
      </button>
    </div>
  );
};

export default GridTools;
