import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView from '../components/MapView.jsx';
import Compass from '../components/Compass.jsx';
import CheckpointList from '../components/CheckpointList.jsx';
import GridTools from '../components/GridTools.jsx';
import { useCheckpoints } from '../hooks/useCheckpoints.js';
import {
  useCompass,
  calculateBearing,
  calculateDistance,
  calculateRelativeBearing
} from '../hooks/useCompass.js';

const MapPage = () => {
  const { start, end, checkpoints, selectedId, selectCheckpoint } = useCheckpoints();

  const targetEntries = useMemo(() => {
    const items = [];
    if (start) items.push({ id: 'start', label: 'Start', position: start.position });
    checkpoints.forEach((checkpoint, index) => {
      items.push({
        id: checkpoint.id,
        label: `Checkpoint ${index + 1}`,
        position: checkpoint.position
      });
    });
    if (end) items.push({ id: 'end', label: 'End', position: end.position });
    return items;
  }, [start, checkpoints, end]);

  const selectedTarget = useMemo(
    () => targetEntries.find((item) => item.id === selectedId) ?? null,
    [targetEntries, selectedId]
  );

  const selectedPosition = selectedTarget?.position ?? null;

  const {
    heading,
    bearing,
    distance,
    geolocation,
    error,
    needsPermission,
    isSupported,
    locationEnabled,
    hasLocationFix,
    isRequestingLocation,
    requestPermission,
    startGeolocation
  } = useCompass(selectedPosition);

  const supplementaryTargets = useMemo(
    () =>
      targetEntries
        .filter((candidate) => candidate.id !== selectedId)
        .map((candidate) => {
          if (!geolocation) {
            return {
              ...candidate,
              bearing: null,
              distance: null,
              relativeBearing: null
            };
          }
          const targetBearing = calculateBearing(geolocation, candidate.position);
          const relativeBearing = calculateRelativeBearing(heading, targetBearing);
          return {
            ...candidate,
            bearing: targetBearing,
            distance: calculateDistance(geolocation, candidate.position),
            relativeBearing: relativeBearing ?? targetBearing
          };
        }),
    [geolocation, targetEntries, selectedId, heading]
  );

  const [activeOverlay, setActiveOverlay] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [locationRequestToken, setLocationRequestToken] = useState(0);
  const [bearingUnit, setBearingUnit] = useState('degrees');
  const [baseLayer, setBaseLayer] = useState('street');
  const [overlayHeight, setOverlayHeight] = useState(0.58);
  const dragStateRef = useRef(null);

  const OVERLAY_MIN_HEIGHT = 0.32;
  const OVERLAY_MAX_HEIGHT = 0.85;

  const clampOverlay = useCallback(
    (value) => Math.min(Math.max(value, OVERLAY_MIN_HEIGHT), OVERLAY_MAX_HEIGHT),
    [OVERLAY_MAX_HEIGHT, OVERLAY_MIN_HEIGHT]
  );

  const handleEnableLocation = useCallback(() => {
    const started = startGeolocation();
    if (started) {
      setLocationRequestToken((token) => token + 1);
    }
    return started;
  }, [startGeolocation]);

  const toggleBearingUnit = useCallback(() => {
    setBearingUnit((current) => (current === 'degrees' ? 'mils' : 'degrees'));
  }, []);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => !prev);
  }, []);

  const openOverlay = useCallback(
    (overlayId) => {
      setActiveOverlay((prev) => (prev === overlayId ? null : overlayId));
      setIsMenuOpen(false);
      setOverlayHeight((current) => clampOverlay(current));
    },
    [clampOverlay]
  );

  const openCompassOverlay = useCallback(() => {
    openOverlay('compass');
  }, [openOverlay]);

  const openRouteOverlay = useCallback(() => {
    openOverlay('checkpoints');
  }, [openOverlay]);

  const handleOverlayResizeMove = useCallback((event) => {
    if (!dragStateRef.current) return;
    const { startY, startHeight } = dragStateRef.current;
    if (window.innerHeight === 0) return;
    const deltaRatio = (startY - event.clientY) / window.innerHeight;
    setOverlayHeight(clampOverlay(startHeight + deltaRatio));
  }, [clampOverlay]);

  const handleOverlayResizeEnd = useCallback(() => {
    if (dragStateRef.current?.target && dragStateRef.current.pointerId != null) {
      dragStateRef.current.target.releasePointerCapture?.(dragStateRef.current.pointerId);
    }
    dragStateRef.current = null;
    window.removeEventListener('pointermove', handleOverlayResizeMove);
    window.removeEventListener('pointerup', handleOverlayResizeEnd);
  }, [handleOverlayResizeMove]);

  const handleOverlayResizeStart = useCallback(
    (event) => {
      if (window.innerHeight === 0) return;
      event.preventDefault();
      const pointerId = event.pointerId;
      const clientY = event.clientY;
      dragStateRef.current = {
        startY: clientY,
        startHeight: overlayHeight,
        pointerId,
        target: event.currentTarget
      };
      event.currentTarget.setPointerCapture?.(pointerId);
      window.addEventListener('pointermove', handleOverlayResizeMove, { passive: true });
      window.addEventListener('pointerup', handleOverlayResizeEnd, { passive: true });
    },
    [overlayHeight, handleOverlayResizeMove, handleOverlayResizeEnd]
  );

  useEffect(() => () => {
    window.removeEventListener('pointermove', handleOverlayResizeMove);
    window.removeEventListener('pointerup', handleOverlayResizeEnd);
  }, [handleOverlayResizeMove, handleOverlayResizeEnd]);

  const overlaySheetStyle = useMemo(
    () => ({
      '--overlay-height': `${(clampOverlay(overlayHeight) * 100).toFixed(2)}vh`,
      '--overlay-max-height': `${(OVERLAY_MAX_HEIGHT * 100).toFixed(2)}vh`
    }),
    [OVERLAY_MAX_HEIGHT, clampOverlay, overlayHeight]
  );

  useEffect(() => {
    handleEnableLocation();
  }, [handleEnableLocation]);

  return (
    <div className="relative h-screen w-screen bg-slate-950 text-slate-100">
      <MapView
        userLocation={geolocation}
        userHeading={heading}
        targets={supplementaryTargets}
        onEnableLocation={handleEnableLocation}
        locationEnabled={locationEnabled}
        hasLocationFix={hasLocationFix}
        isRequestingLocation={isRequestingLocation}
        locationRequestToken={locationRequestToken}
        baseLayer={baseLayer}
        onBaseLayerChange={setBaseLayer}
        onToggleMenu={toggleMenu}
        onOpenCompass={openCompassOverlay}
        onOpenRoute={openRouteOverlay}
        isMenuOpen={isMenuOpen}
      />

      {activeOverlay === 'compass' && (
        <div
          className="pointer-events-auto overlay-sheet fixed inset-x-0 bottom-0 z-[1300] mx-auto w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-800 bg-slate-900/95 p-3 shadow-2xl shadow-slate-950/80 md:bottom-6 md:left-auto md:right-6 md:max-w-sm md:rounded-2xl"
          style={overlaySheetStyle}
        >
          <div className="mb-3 flex justify-center md:hidden">
            <button
              type="button"
              className="group flex h-12 w-full max-w-[220px] cursor-row-resize items-center justify-center rounded-full bg-slate-900/70 shadow-inner shadow-slate-950/40 ring-1 ring-slate-700/60 transition hover:ring-slate-500/80 active:bg-slate-800/80 touch-none"
              aria-label="Resize panel"
              onPointerDown={handleOverlayResizeStart}
            >
              <span className="block h-2 w-16 rounded-full bg-slate-500/90 transition group-active:bg-slate-300/90" />
            </button>
          </div>
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <div className="text-left">
              <p className="font-semibold uppercase tracking-wide text-slate-500">Compass</p>
              <p className="text-xs text-slate-400">Heading & bearings</p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-sky-500 hover:text-sky-200"
              onClick={() => setActiveOverlay(null)}
            >
              Close
            </button>
          </div>
          <Compass
            heading={heading}
            bearing={bearing}
            distance={distance}
            error={error}
            onCalibrate={requestPermission}
            onEnableLocation={handleEnableLocation}
            needsPermission={needsPermission}
            isSupported={isSupported}
            locationEnabled={locationEnabled}
            hasLocationFix={hasLocationFix}
            isRequestingLocation={isRequestingLocation}
            targets={supplementaryTargets}
            selectedTarget={selectedTarget}
            onSelectTarget={selectCheckpoint}
            bearingUnit={bearingUnit}
            onToggleBearingUnit={toggleBearingUnit}
          />
        </div>
      )}

      {activeOverlay === 'checkpoints' && (
        <div
          className="pointer-events-auto overlay-sheet fixed inset-x-0 bottom-0 z-[1300] mx-auto w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-800 bg-slate-900/95 p-3 shadow-2xl shadow-slate-950/80 md:left-6 md:right-auto md:top-6 md:max-w-xs md:rounded-2xl md:rounded-bl-none md:rounded-br-xl"
          style={overlaySheetStyle}
        >
          <div className="mb-3 flex justify-center md:hidden">
            <button
              type="button"
              className="group flex h-12 w-full max-w-[220px] cursor-row-resize items-center justify-center rounded-full bg-slate-900/70 shadow-inner shadow-slate-950/40 ring-1 ring-slate-700/60 transition hover:ring-slate-500/80 active:bg-slate-800/80 touch-none"
              aria-label="Resize panel"
              onPointerDown={handleOverlayResizeStart}
            >
              <span className="block h-2 w-16 rounded-full bg-slate-500/90 transition group-active:bg-slate-300/90" />
            </button>
          </div>
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <div className="text-left">
              <p className="font-semibold uppercase tracking-wide text-slate-500">Route tools</p>
              <p className="text-xs text-slate-400">Manage checkpoints</p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-sky-500 hover:text-sky-200"
              onClick={() => setActiveOverlay(null)}
            >
              Close
            </button>
          </div>
          <CheckpointList />
        </div>
      )}

      {activeOverlay === 'grid' && (
        <div
          className="pointer-events-auto overlay-sheet fixed inset-x-0 bottom-0 z-[1300] mx-auto w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-800 bg-slate-900/95 p-3 shadow-2xl shadow-slate-950/80 md:left-auto md:right-6 md:top-6 md:max-w-md md:rounded-2xl"
          style={overlaySheetStyle}
        >
          <div className="mb-3 flex justify-center md:hidden">
            <button
              type="button"
              className="group flex h-12 w-full max-w-[220px] cursor-row-resize items-center justify-center rounded-full bg-slate-900/70 shadow-inner shadow-slate-950/40 ring-1 ring-slate-700/60 transition hover:ring-slate-500/80 active:bg-slate-800/80 touch-none"
              aria-label="Resize panel"
              onPointerDown={handleOverlayResizeStart}
            >
              <span className="block h-2 w-16 rounded-full bg-slate-500/90 transition group-active:bg-slate-300/90" />
            </button>
          </div>
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <div className="text-left">
              <p className="font-semibold uppercase tracking-wide text-slate-500">Grid tools</p>
              <p className="text-xs text-slate-400">References & bearings</p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-sky-500 hover:text-sky-200"
              onClick={() => setActiveOverlay(null)}
            >
              Close
            </button>
          </div>
          <GridTools userLocation={geolocation} selectedPosition={selectedPosition} />
        </div>
      )}

      {isMenuOpen && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-28 z-[1300] flex justify-center px-4 md:bottom-32">
          <div className="w-full max-w-xs rounded-2xl border border-slate-800 bg-slate-950/92 p-3 text-[12px] text-slate-100 shadow-xl shadow-slate-950/80">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Navigate</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className={`flex items-center justify-between rounded-lg border px-3 py-2 font-semibold transition ${
                  activeOverlay === 'compass'
                    ? 'border-sky-500 bg-sky-500/20 text-sky-100'
                    : 'border-slate-700 bg-slate-900/80 hover:border-sky-500 hover:text-sky-100'
                }`}
                onClick={() => openOverlay('compass')}
              >
                Compass
                <span className="text-[10px] text-slate-400">Heading</span>
              </button>
              <button
                type="button"
                className={`flex items-center justify-between rounded-lg border px-3 py-2 font-semibold transition ${
                  activeOverlay === 'checkpoints'
                    ? 'border-sky-500 bg-sky-500/20 text-sky-100'
                    : 'border-slate-700 bg-slate-900/80 hover:border-sky-500 hover:text-sky-100'
                }`}
                onClick={() => openOverlay('checkpoints')}
              >
                Route
                <span className="text-[10px] text-slate-400">Checkpoints</span>
              </button>
              <button
                type="button"
                className={`flex items-center justify-between rounded-lg border px-3 py-2 font-semibold transition ${
                  activeOverlay === 'grid'
                    ? 'border-sky-500 bg-sky-500/20 text-sky-100'
                    : 'border-slate-700 bg-slate-900/80 hover:border-sky-500 hover:text-sky-100'
                }`}
                onClick={() => openOverlay('grid')}
              >
                Grid
                <span className="text-[10px] text-slate-400">Conversions</span>
              </button>
              <button
                type="button"
                className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 font-semibold transition hover:border-sky-500 hover:text-sky-100"
                onClick={() => {
                  handleEnableLocation();
                  setIsMenuOpen(false);
                }}
              >
                GPS
                <span className="text-[10px] text-slate-400">{locationEnabled ? 'Active' : 'Request fix'}</span>
              </button>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Choose a tool to open its overlay. Tap Menu again to close this panel.
            </p>
          </div>
        </div>
      )}

    </div>
  );
};

export default MapPage;
