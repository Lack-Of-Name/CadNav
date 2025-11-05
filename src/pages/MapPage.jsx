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
  const [baseLayer, setBaseLayer] = useState('topo');
  const [toolbarTheme, setToolbarTheme] = useState('light');
  const [overlayHeight, setOverlayHeight] = useState(0.58);
  const dragStateRef = useRef(null);
  const didMountRef = useRef(false);
  const latestGeolocationRef = useRef(null);

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
    const state = dragStateRef.current;
    if (!state) return;
    const { startY, startHeight } = state;
    if (window.innerHeight === 0) return;
    const deltaRatio = (startY - event.clientY) / window.innerHeight;
    const pixelDelta = Math.abs(startY - event.clientY);
    if (!state.moved && pixelDelta > 6) {
      state.moved = true;
    }
    setOverlayHeight(clampOverlay(startHeight + deltaRatio));
  }, [clampOverlay]);

  const handleOverlayResizeEnd = useCallback(() => {
      const state = dragStateRef.current;
      if (state?.target && state.pointerId != null) {
        state.target.releasePointerCapture?.(state.pointerId);
      }
      dragStateRef.current = null;
      window.removeEventListener('pointermove', handleOverlayResizeMove);
      window.removeEventListener('pointerup', handleOverlayResizeEnd);
      if (state && !state.moved && state.overlayId) {
        setActiveOverlay((current) => (current === state.overlayId ? null : current));
      }
    },
    [handleOverlayResizeMove, setActiveOverlay]
  );

  const handleOverlayResizeStart = useCallback(
    (event) => {
      if (window.innerHeight === 0) return;
      event.preventDefault();
      const pointerId = event.pointerId;
      const clientY = event.clientY;
      const overlayId = event.currentTarget.dataset.overlayId ?? null;
      dragStateRef.current = {
        startY: clientY,
        startHeight: overlayHeight,
        pointerId,
        target: event.currentTarget,
        overlayId,
        moved: false
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
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    if (media.matches) {
      setBaseLayer((current) => (current === 'street' ? 'dark' : current));
      setToolbarTheme('dark');
    }
  }, []);

  useEffect(() => {
    handleEnableLocation();
  }, [handleEnableLocation]);

  useEffect(() => {
    latestGeolocationRef.current = geolocation;
  }, [geolocation]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (locationEnabled) {
      handleEnableLocation();
    } else if (latestGeolocationRef.current) {
      setLocationRequestToken((token) => token + 1);
    }
  }, [baseLayer, locationEnabled, handleEnableLocation]);

  const handleToolbarThemeToggle = useCallback(() => {
    setToolbarTheme((current) => (current === 'light' ? 'dark' : 'light'));
  }, []);

  return (
    <div className="relative viewport-safe bg-slate-950 text-slate-100">
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
        toolbarTheme={toolbarTheme}
        onToolbarThemeToggle={handleToolbarThemeToggle}
        isMenuOpen={isMenuOpen}
      />

      {activeOverlay === 'compass' && (
        <div
          className="pointer-events-auto overlay-sheet fixed inset-x-0 bottom-0 z-[1300] mx-auto w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-800 bg-slate-900 p-3 shadow-2xl shadow-slate-950/80 md:bottom-6 md:left-auto md:right-6 md:max-w-sm md:rounded-2xl"
          style={overlaySheetStyle}
        >
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              data-overlay-id="compass"
              className="group flex h-12 w-full max-w-[220px] cursor-row-resize items-center justify-center rounded-full bg-slate-900 shadow-inner shadow-slate-950/40 ring-1 ring-slate-700/60 transition hover:ring-slate-500/80 active:bg-slate-800 touch-none"
              aria-label="Drag to resize or tap to close panel"
              onPointerDown={handleOverlayResizeStart}
            >
              <span className="block h-2 w-16 rounded-full bg-slate-500 transition group-active:bg-slate-300" />
            </button>
          </div>
          <div className="mb-2 text-left text-[11px]">
            <p className="font-semibold uppercase tracking-wide text-slate-500">Compass</p>
            <p className="text-xs text-slate-400">Heading & bearings</p>
          </div>
          <Compass
            heading={heading}
            bearing={bearing}
            distance={distance}
            error={error}
            enableCompass={requestPermission}
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
          className="pointer-events-auto overlay-sheet fixed inset-x-0 bottom-0 z-[1300] mx-auto w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-800 bg-slate-900 p-3 shadow-2xl shadow-slate-950/80 md:left-6 md:right-auto md:top-6 md:max-w-xs md:rounded-2xl md:rounded-bl-none md:rounded-br-xl"
          style={overlaySheetStyle}
        >
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              data-overlay-id="checkpoints"
              className="group flex h-12 w-full max-w-[220px] cursor-row-resize items-center justify-center rounded-full bg-slate-900 shadow-inner shadow-slate-950/40 ring-1 ring-slate-700/60 transition hover:ring-slate-500/80 active:bg-slate-800 touch-none"
              aria-label="Drag to resize or tap to close panel"
              onPointerDown={handleOverlayResizeStart}
            >
              <span className="block h-2 w-16 rounded-full bg-slate-500 transition group-active:bg-slate-300" />
            </button>
          </div>
          <div className="mb-2 text-left text-[11px]">
            <p className="font-semibold uppercase tracking-wide text-slate-500">Route tools</p>
            <p className="text-xs text-slate-400">Manage checkpoints</p>
          </div>
          <CheckpointList />
        </div>
      )}

      {activeOverlay === 'grid' && (
        <div
          className="pointer-events-auto overlay-sheet fixed inset-x-0 bottom-0 z-[1300] mx-auto w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-800 bg-slate-900 p-3 shadow-2xl shadow-slate-950/80 md:left-auto md:right-6 md:top-6 md:max-w-md md:rounded-2xl"
          style={overlaySheetStyle}
        >
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              data-overlay-id="grid"
              className="group flex h-12 w-full max-w-[220px] cursor-row-resize items-center justify-center rounded-full bg-slate-900 shadow-inner shadow-slate-950/40 ring-1 ring-slate-700/60 transition hover:ring-slate-500/80 active:bg-slate-800 touch-none"
              aria-label="Drag to resize or tap to close panel"
              onPointerDown={handleOverlayResizeStart}
            >
              <span className="block h-2 w-16 rounded-full bg-slate-500 transition group-active:bg-slate-300" />
            </button>
          </div>
          <div className="mb-2 text-left text-[11px]">
            <p className="font-semibold uppercase tracking-wide text-slate-500">Grid tools</p>
            <p className="text-xs text-slate-400">References & bearings</p>
          </div>
          <GridTools userLocation={geolocation} selectedPosition={selectedPosition} />
        </div>
      )}

      {isMenuOpen && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-28 z-[1300] flex justify-center px-4 md:bottom-32">
          <div className="w-full max-w-xs rounded-2xl border border-slate-800 bg-slate-950 p-3 text-[12px] text-slate-100 shadow-xl shadow-slate-950/80">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Navigate</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className={`flex items-center justify-between rounded-lg border px-3 py-2 font-semibold transition ${
                  activeOverlay === 'compass'
                    ? 'border-sky-500 bg-sky-500 text-slate-950'
                    : 'border-slate-700 bg-slate-900 hover:border-sky-500 hover:text-sky-100'
                }`}
                onClick={() => openOverlay('compass')}
              >
                Compass
                <span
                  className={`text-[10px] ${
                    activeOverlay === 'compass' ? 'text-slate-800' : 'text-slate-400'
                  }`}
                >
                  Heading
                </span>
              </button>
              <button
                type="button"
                className={`flex items-center justify-between rounded-lg border px-3 py-2 font-semibold transition ${
                  activeOverlay === 'checkpoints'
                    ? 'border-sky-500 bg-sky-500 text-slate-950'
                    : 'border-slate-700 bg-slate-900 hover:border-sky-500 hover:text-sky-100'
                }`}
                onClick={() => openOverlay('checkpoints')}
              >
                Route
                <span
                  className={`text-[10px] ${
                    activeOverlay === 'checkpoints' ? 'text-slate-800' : 'text-slate-400'
                  }`}
                >
                  Checkpoints
                </span>
              </button>
              <button
                type="button"
                className={`flex items-center justify-between rounded-lg border px-3 py-2 font-semibold transition ${
                  activeOverlay === 'grid'
                    ? 'border-sky-500 bg-sky-500 text-slate-950'
                    : 'border-slate-700 bg-slate-900 hover:border-sky-500 hover:text-sky-100'
                }`}
                onClick={() => openOverlay('grid')}
              >
                Grid
                <span
                  className={`text-[10px] ${
                    activeOverlay === 'grid' ? 'text-slate-800' : 'text-slate-400'
                  }`}
                >
                  Conversions
                </span>
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
