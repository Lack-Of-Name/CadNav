import { useMemo } from 'react';
import { calculateRelativeBearing } from '../hooks/useCompass.js';

const formatDistance = (distance) => {
  if (distance == null) return 'N/A';
  if (distance < 1000) return `${distance.toFixed(0)} m`;
  return `${(distance / 1000).toFixed(2)} km`;
};

const MILS_PER_RADIAN = 3200 / Math.PI;

const Compass = ({
  heading,
  bearing,
  distance,
  error,
  onCalibrate,
  onEnableLocation,
  needsPermission,
  isSupported,
  locationEnabled,
  hasLocationFix,
  isRequestingLocation,
  targets = [],
  selectedTarget = null,
  onSelectTarget,
  bearingUnit = 'degrees',
  onToggleBearingUnit
}) => {
  const relativeBearing = useMemo(
    () => calculateRelativeBearing(heading, bearing),
    [heading, bearing]
  );

  const calibrateLabel = needsPermission ? 'Enable Compass' : 'Calibrate';
  const handleCalibrate = () => {
    if (typeof onCalibrate === 'function') {
      onCalibrate();
    }
  };

  const handleEnableLocation = () => {
    if (typeof onEnableLocation === 'function') {
      onEnableLocation();
    }
  };

  const locationButtonLabel = (() => {
    if (hasLocationFix) return 'Location Active';
    if (isRequestingLocation) return 'Locating…';
    return locationEnabled ? 'Retry Location' : 'Enable Location';
  })();

  const locationButtonDisabled = isRequestingLocation || hasLocationFix;
  const calibrateDisabled = !isSupported && !needsPermission;
  const toggleDisabled = typeof onToggleBearingUnit !== 'function';
  const canSelectTargets = typeof onSelectTarget === 'function';

  const formatCoordinates = (position) => {
    if (!position) return null;
    const { lat, lng } = position;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  };

  const handleSelectTarget = (id) => {
    if (canSelectTargets) {
      onSelectTarget(id);
    }
  };

  const targetListTitle = selectedTarget ? 'Other checkpoints' : 'Select a checkpoint';
  const selectedCoordinates = formatCoordinates(selectedTarget?.position);

  const convertAngle = (value) => {
    if (value == null) return null;
    const normalized = ((value % 360) + 360) % 360;
    if (bearingUnit === 'mils') {
      const radians = (normalized * Math.PI) / 180;
      const milValue = (radians * MILS_PER_RADIAN + 6400) % 6400;
      return milValue;
    }
    return normalized;
  };

  const formatAngle = (value) => {
    if (value == null) return 'N/A';
    const converted = convertAngle(value);
    if (converted == null) return 'N/A';
    if (bearingUnit === 'mils') {
      return `${converted.toFixed(1)} mil`;
    }
    return `${converted.toFixed(0)}°`;
  };

  const handleToggleUnit = () => {
    if (!toggleDisabled) {
      onToggleBearingUnit();
    }
  };

  const hasTargetBearing = bearing != null && heading != null;
  const pointerRotation = hasTargetBearing ? relativeBearing ?? 0 : null;
  const northRotation = heading != null ? ((360 - heading) % 360) : null;
  const compassDisabled = needsPermission || !isSupported;
  const containerToneClass = compassDisabled
    ? 'border border-rose-500 text-rose-200'
    : 'border border-slate-800 text-slate-100';
  const compassCircleClass = compassDisabled
    ? 'border-rose-500 bg-slate-800'
    : 'border-sky-500 bg-slate-950';

  return (
    <div className={`flex flex-col items-center gap-4 rounded-2xl bg-slate-900 p-5 text-center shadow-lg shadow-slate-950 ${containerToneClass}`}>
      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        <h2 className="text-base font-semibold text-sky-200">Compass</h2>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="rounded-full border border-emerald-500 px-3 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-700 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleEnableLocation}
            disabled={locationButtonDisabled}
          >
            {locationButtonLabel}
          </button>
          <button
            type="button"
            className="rounded-full border border-sky-500 px-3 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-700 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleCalibrate}
            disabled={calibrateDisabled}
          >
            {calibrateLabel}
          </button>
          <button
            type="button"
            className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-sky-500 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleToggleUnit}
            disabled={toggleDisabled}
          >
            {bearingUnit === 'degrees' ? 'Show mils' : 'Show degrees'}
          </button>
        </div>
      </div>

      <div className={`relative flex h-44 w-44 items-center justify-center rounded-full shadow-inner shadow-slate-950/40 ${compassCircleClass}`}>
        <div className="absolute inset-3 rounded-full border border-slate-800" aria-hidden="true"></div>
        <div className="absolute inset-0" aria-hidden="true">
          <div className="absolute left-1/2 top-0 h-1/2 w-[3px] -translate-x-1/2 rounded-full bg-slate-200 opacity-40" />
        </div>
        {northRotation != null && (
          <div
            className="absolute inset-0"
            style={{ transform: `rotate(${northRotation}deg)` }}
            aria-hidden="true"
          >
            <div className="absolute left-1/2 top-0 h-1/2 w-[3px] -translate-x-1/2 rounded-full bg-white" />
            <span className="absolute left-1/2 top-3 -translate-x-1/2 text-[10px] font-semibold text-white">
              N
            </span>
          </div>
        )}
        {hasTargetBearing && pointerRotation != null && (
          <div
            className="absolute inset-0"
            style={{ transform: `rotate(${pointerRotation}deg)` }}
            aria-hidden="true"
          >
            <div className="absolute left-1/2 top-2 flex h-8 w-8 -translate-x-1/2 items-start justify-center">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-emerald-300">
                <path
                  d="M12 2.5 16.5 12h-3.1v7.5h-2.8V12H7.5z"
                  fill="currentColor"
                  stroke="#065f46"
                  strokeWidth="1.1"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        )}
        {compassDisabled && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-slate-950 text-center"
            style={{ backgroundColor: 'rgba(2, 6, 23, 0.85)' }}
          >
            <p className="text-lg font-bold uppercase tracking-wide text-rose-200">Compass not enabled</p>
            {needsPermission && (
              <p className="mt-1 text-xs text-rose-200/80">Tap Enable Compass to allow motion access.</p>
            )}
            {!needsPermission && !isSupported && (
              <p className="mt-1 text-xs text-rose-200/80">This device does not expose compass sensors.</p>
            )}
          </div>
        )}
        <span className="absolute bottom-4 text-xs text-slate-300">
          {heading != null ? formatAngle(heading) : '—'}
        </span>
      </div>

      <div className="space-y-1 text-xs text-slate-300">
        <p>Target bearing: {formatAngle(bearing)}</p>
        <p>Distance: {formatDistance(distance)}</p>
        {(isRequestingLocation || (locationEnabled && !hasLocationFix)) && (
          <p className="text-[11px] text-slate-400">Awaiting GPS fix… keep the device in the open.</p>
        )}
        {needsPermission && isSupported && (
          <p className="text-[11px] text-slate-400">
            Tap Enable Compass to grant motion and orientation access.
          </p>
        )}
        {!isSupported && (
          <p className="text-amber-400">Compass not supported on this device.</p>
        )}
        {error && <p className="text-rose-400">Error: {error}</p>}
      </div>

  <div className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Active checkpoint</p>
        {selectedTarget ? (
          <div className="mt-2">
            <p className="text-sm font-semibold text-slate-100">{selectedTarget.label}</p>
            {selectedCoordinates && (
              <p className="text-[11px] text-slate-400">{selectedCoordinates}</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-slate-400">
            {targets.length > 0
              ? 'Pick a checkpoint below to set the compass target.'
              : 'Add checkpoints from the Route tools to set the compass target.'}
          </p>
        )}
      </div>

      {targets.length > 0 && (
  <div className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-left">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-300">
            {targetListTitle}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {targets.map((target) => (
              <div
                key={target.id}
                role={canSelectTargets ? 'button' : undefined}
                tabIndex={canSelectTargets ? 0 : undefined}
                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs text-slate-200 transition ${
                  canSelectTargets
          ? 'cursor-pointer border-slate-700 bg-slate-900 hover:border-sky-500 hover:bg-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-500/60'
                    : 'border-slate-800 bg-slate-900'
                }`}
                onClick={canSelectTargets ? () => handleSelectTarget(target.id) : undefined}
                onKeyDown={
                  canSelectTargets
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSelectTarget(target.id);
                        }
                      }
                    : undefined
                }
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-950">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-sky-300"
                      style={{
                        transform: `rotate(${target.relativeBearing ?? 0}deg)`,
                        transformOrigin: '50% 50%'
                      }}
                    >
                      <path
                        d="M12 3l4.5 9H13l3 9-4-7-4 7 3-9H7.5z"
                        fill="currentColor"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-100">{target.label}</p>
                    <p className="text-[11px] text-slate-400">
                      {target.bearing != null ? formatAngle(target.bearing) : '—'}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] text-slate-400">{formatDistance(target.distance)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Compass;
