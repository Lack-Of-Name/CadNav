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

const HelpToggle = ({ show, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold transition ${
      show
        ? 'border-sky-500 bg-sky-500 text-slate-900'
        : 'border-slate-600 text-slate-400 hover:border-sky-500 hover:text-sky-200'
    }`}
    aria-label="Toggle help"
  >
    ?
  </button>
);

const GridTools = ({ userLocation, selectedPosition, onPreviewLocationChange }) => {
  const {
    origin,
    originReference,
    precision,
    setOrigin,
    setOriginReference,
    setPrecision,
    resetGrid
  } = useGrid();
  const { addCheckpoint } = useCheckpoints();

  const [originEast, setOriginEast] = useState('');
  const [originNorth, setOriginNorth] = useState('');
  const [targetEast, setTargetEast] = useState('');
  const [targetNorth, setTargetNorth] = useState('');
  const [statusMessage, setStatusMessage] = useState(null);
  const [resolvedLocation, setResolvedLocation] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [bearingSource, setBearingSource] = useState('user');
  const [bearingValue, setBearingValue] = useState('');
  const [bearingUnitInput, setBearingUnitInput] = useState('degrees');
  const [distanceInput, setDistanceInput] = useState('');
  const [bearingLocation, setBearingLocation] = useState(null);
  const [bearingMetadata, setBearingMetadata] = useState(null);
  const [activeTab, setActiveTab] = useState('origin');
  const [showHelp, setShowHelp] = useState(false);

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

  const handleSetOrigin = () => {
    // 1. Determine Location (GPS preferred, then Selected)
    let locationToUse = userLocation;
    if (!locationToUse) {
      if (selectedPosition) {
        locationToUse = selectedPosition;
      } else {
        setErrorMessage('Waiting for GPS location (or select a point on the map).');
        return;
      }
    }

    // 2. Validate Grid Reference Input
    const e = originEast.trim();
    const n = originNorth.trim();

    if (!e || !n) {
      setErrorMessage('Enter grid reference digits.');
      return;
    }

    if (e.length !== n.length) {
      setErrorMessage('Easting and Northing must have same number of digits.');
      return;
    }

    // 3. Auto-detect Precision
    let newPrecision = 3;
    if (e.length === 3) newPrecision = 3;
    else if (e.length === 4) newPrecision = 4;
    else {
      setErrorMessage('Grid ref must be 3 or 4 digits (e.g. 123 456).');
      return;
    }

    // 4. Commit
    try {
      const easting = Number(e);
      const northing = Number(n);
      
      if (Number.isNaN(easting) || Number.isNaN(northing)) {
        throw new Error('Grid reference must be numbers.');
      }

      setOrigin(locationToUse);
      setOriginReference({ easting, northing, precision: newPrecision });
      setPrecision(newPrecision);
      
      setErrorMessage(null);
      setStatusMessage(`Grid calibrated to ${newPrecision}-figure reference.`);
    } catch (error) {
      setErrorMessage(error.message);
    }
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
    throw new Error('Select a valid start point.');
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
        distanceMeters: distanceNumber,
        origin: originPoint
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

  const handleCreate = (location = resolvedLocation, context = 'grid reference') => {
    if (!location) {
      setErrorMessage(`Resolve a ${context} first.`);
      return;
    }
    addCheckpoint(location);
    setStatusMessage(`Checkpoint added from ${context}.`);
    setErrorMessage(null);
  };

  const handleReset = () => {
    resetGrid();
    setOriginEast('');
    setOriginNorth('');
    setTargetEast('');
    setTargetNorth('');
    setResolvedLocation(null);
    setBearingSource('user');
    setBearingValue('');
    setBearingUnitInput('degrees');
    setDistanceInput('');
    setBearingLocation(null);
    setBearingMetadata(null);
    setStatusMessage('Grid settings cleared.');
    setErrorMessage(null);
  };

  const unitMeters = precisionToUnitMeters(precision);

  useEffect(() => {
    if (onPreviewLocationChange) {
      if (activeTab === 'convert' && resolvedLocation) {
        onPreviewLocationChange({ position: resolvedLocation, source: origin });
      } else if (activeTab === 'project' && bearingLocation) {
        onPreviewLocationChange({
          position: bearingLocation,
          source: bearingMetadata?.origin ?? null
        });
      } else {
        onPreviewLocationChange(null);
      }
    }
  }, [activeTab, resolvedLocation, bearingLocation, bearingMetadata, origin, onPreviewLocationChange]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-slate-900 p-4 text-xs text-slate-200 shadow-lg shadow-slate-950">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-sky-200">Grid Tools</h2>
        <div className="flex gap-1">
          <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-400">
            {precision}-fig mode
          </span>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('origin')}
          className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
            activeTab === 'origin'
              ? 'bg-slate-800 text-sky-200 shadow-sm'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          Origin
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('convert')}
          className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
            activeTab === 'convert'
              ? 'bg-slate-800 text-sky-200 shadow-sm'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          Convert
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('project')}
          className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
            activeTab === 'project'
              ? 'bg-slate-800 text-sky-200 shadow-sm'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          Project
        </button>
      </div>

      {activeTab === 'origin' && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-300">
                Calibrate Grid Origin
              </h3>
              <p className="mt-1 text-[11px] text-slate-400">
                Sync your current location to a grid reference.
              </p>
            </div>
            <HelpToggle show={showHelp} onToggle={() => setShowHelp(!showHelp)} />
          </div>

          {showHelp && (
            <div className="mb-4 rounded-lg bg-slate-900 p-2 text-[11px] text-slate-300">
              <p className="mb-1 font-semibold text-sky-200">How to calibrate:</p>
              <p className="text-slate-400">
                Enter the Grid Reference for your current location (e.g. from a paper map) and tap
                'Set Origin'. The app will link your GPS position to that grid reference.
              </p>
              <p className="mt-2 text-slate-500 italic">
                Note: If GPS is unavailable, select a point on the map first.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">
                  Easting
                </span>
                <input
                  value={originEast}
                  onChange={(event) => setOriginEast(event.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                  placeholder="e.g. 123"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">
                  Northing
                </span>
                <input
                  value={originNorth}
                  onChange={(event) => setOriginNorth(event.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                  placeholder="e.g. 456"
                />
              </label>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-md border border-sky-500 bg-sky-500/10 px-3 py-2 font-semibold text-sky-200 hover:bg-sky-500/20"
                onClick={handleSetOrigin}
              >
                Set Origin
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-700 px-3 py-2 font-semibold text-slate-300 hover:border-rose-500 hover:text-rose-200"
                onClick={handleReset}
              >
                Clear
              </button>
            </div>

            <div className="mt-1 text-center text-[11px]">
              {originSummary ? (
                <span className="text-emerald-400">
                  Active: {originSummary} ({precision}-fig)
                </span>
              ) : (
                <span className="text-slate-500">Origin not set</span>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'convert' && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-300">
                Convert Grid Ref
              </h3>
              <p className="mt-1 text-[11px] text-slate-400">
                Enter a grid reference to find its location on the map relative to your origin.
              </p>
            </div>
            <HelpToggle show={showHelp} onToggle={() => setShowHelp(!showHelp)} />
          </div>

          {showHelp && (
            <div className="mb-4 rounded-lg bg-slate-900 p-2 text-[11px] text-slate-300">
              <p className="mb-1 font-semibold text-sky-200">How to convert:</p>
              <p className="text-slate-400">
                Once you have calibrated the origin, you can enter any other grid reference here. The
                app will calculate the offset from the origin, show you where that point lands, and
                the "Add checkpoint" button will drop it into your active route.
              </p>
            </div>
          )}

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
                  className="rounded-md border border-sky-500 px-3 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-900"
                  onClick={() => handleCreate(resolvedLocation, 'grid reference')}
                >
                  Add checkpoint
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'project' && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-300">
                Project by bearing
              </h3>
              <p className="mt-1 text-[11px] text-slate-400">
                Calculate a new point by moving a specific distance and bearing from a starting
                point.
              </p>
            </div>
            <HelpToggle show={showHelp} onToggle={() => setShowHelp(!showHelp)} />
          </div>

          {showHelp && (
            <div className="mb-4 rounded-lg bg-slate-900 p-2 text-[11px] text-slate-300">
              <p className="mb-1 font-semibold text-sky-200">How to project:</p>
              <ol className="list-decimal space-y-1 pl-4 text-slate-400">
                <li>Choose a start point (your current GPS fix or a checkpoint you selected on the map).</li>
                <li>Enter the bearing (direction) and distance to travel.</li>
                <li>Click 'Project location' to see the destination on the map, then use 'Add checkpoint' to store it in the active route.</li>
              </ol>
            </div>
          )}

          <div className="mb-3">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Start Point</span>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setBearingSource('user')}
                className={`flex-1 rounded-md border py-2 text-[11px] font-semibold transition ${
                  bearingSource === 'user'
                    ? 'border-sky-500 bg-sky-500/10 text-sky-200'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                My Location
              </button>
              <button
                type="button"
                onClick={() => setBearingSource('selected')}
                className={`flex-1 rounded-md border py-2 text-[11px] font-semibold transition ${
                  bearingSource === 'selected'
                    ? 'border-sky-500 bg-sky-500/10 text-sky-200'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                Selected Marker
              </button>
            </div>
            {!userLocation && bearingSource === 'user' && (
              <p className="mt-1 text-[10px] text-rose-400">Waiting for GPS fix...</p>
            )}
            {!selectedPosition && bearingSource === 'selected' && (
              <p className="mt-1 text-[10px] text-rose-400">No marker selected on map.</p>
            )}
          </div>

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
                  className="rounded-md border border-sky-500 px-3 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-900"
                  onClick={() => handleCreate(bearingLocation, 'bearing projection')}
                >
                  Add checkpoint
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
