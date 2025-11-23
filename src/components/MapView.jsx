import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttributionControl, MapContainer, Marker, Polyline, TileLayer, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCheckpoints } from '../hooks/useCheckpoints.js';
import {
  buildRouteShareSnapshot,
  decodeRouteShare,
  encodeRouteShare,
  encodeLocationCode,
  decodeLocationCode
} from '../utils/routeUtils.js';

const MapDropHandler = ({ onDropItem }) => {
  const map = useMap();

  useEffect(() => {
    if (!onDropItem) return;

    const container = map.getContainer();

    // Essential for mobile-drag-drop: handle dragenter
    const handleDragEnter = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const { clientX, clientY } = e;
      const containerRect = container.getBoundingClientRect();
      const x = clientX - containerRect.left;
      const y = clientY - containerRect.top;

      const latLng = map.containerPointToLatLng([x, y]);
      const type = e.dataTransfer.getData('application/x-cadet-map-item');

      if (type) {
        onDropItem(type, latLng);
      }
    };

    container.addEventListener('dragenter', handleDragEnter);
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);

    return () => {
      container.removeEventListener('dragenter', handleDragEnter);
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('drop', handleDrop);
    };
  }, [map, onDropItem]);

  return null;
};

const toolbarIconSources = import.meta.glob('../../assets/*.png', {
  eager: true,
  import: 'default'
});

const resolveToolbarIcon = (name) => toolbarIconSources[`../../assets/${name}.png`] ?? null;

const ToolbarButton = ({
  iconName,
  label,
  onClick,
  title,
  isActive = false,
  disabled = false,
  themeStyles
}) => {
  const iconSrc = resolveToolbarIcon(iconName);
  const buttonTheme = themeStyles?.button ?? {};
  const baseStyles = buttonTheme.base ?? 'flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
  const activeStyles = buttonTheme.active ?? 'border-sky-500 bg-sky-200 text-slate-900 focus-visible:ring-sky-400';
  const idleStyles = buttonTheme.idle ?? 'border-slate-300 bg-slate-100 text-slate-900 hover:border-slate-400 hover:bg-slate-200 focus-visible:ring-slate-500/50';
  const disabledStyles = disabled ? buttonTheme.disabled ?? 'opacity-60 pointer-events-none' : '';
  const iconStyle = themeStyles?.iconStyle ?? null;
  const iconClassName = themeStyles?.iconClass ?? '';

  return (
    <button
      type="button"
      className={`${baseStyles} ${isActive ? activeStyles : idleStyles} ${disabledStyles}`}
      onClick={onClick}
      title={title ?? label}
      aria-label={label}
      disabled={disabled}
    >
      {iconSrc ? (
        <img
          src={iconSrc}
          alt=""
          className={`h-5 w-5 object-contain select-none ${iconClassName}`}
          style={iconStyle ?? undefined}
          aria-hidden="true"
          draggable="false"
        />
      ) : (
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      )}
    </button>
  );
};

const defaultPosition = [51.505, 10];

const tileProviders = {
  street: {
    id: 'street',
    label: 'OpenStreetMap Standard',
    description: 'Balanced street map with global coverage sourced from the OpenStreetMap community.',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19,
    minZoom: 3,
    category: 'Streets'
  },
  light: {
    id: 'light',
    label: 'Carto Light',
    description: 'Soft grayscale basemap designed for daylight navigation with minimal visual noise.',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://carto.com/attributions">CARTO</a> | Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: ['a', 'b', 'c', 'd'],
    maxZoom: 19,
    minZoom: 3,
    category: 'Streets'
  },
  dark: {
    id: 'dark',
    label: 'Carto Dark Matter',
    description: 'Night-friendly basemap with high contrast roads and landmarks on a deep navy canvas.',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://carto.com/attributions">CARTO</a> | Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: ['a', 'b', 'c', 'd'],
    maxZoom: 19,
    minZoom: 3,
    category: 'Streets'
  },
  voyager: {
    id: 'voyager',
    label: 'Carto Voyager',
    description: 'Colorful, detail-rich cartography ideal for orientation and wayfinding at multiple zoom levels.',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://carto.com/attributions">CARTO</a> | Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: ['a', 'b', 'c', 'd'],
    maxZoom: 19,
    minZoom: 3,
    category: 'Streets'
  },
  hot: {
    id: 'hot',
    label: 'OSM Humanitarian',
    description: 'Humanitarian OpenStreetMap Team basemap with emphasis on populated areas and infrastructure.',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://www.hotosm.org/">Humanitarian OpenStreetMap Team</a>',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19,
    minZoom: 3,
    category: 'Streets'
  },
  topo: {
    id: 'topo',
    label: 'OpenTopoMap',
    description: 'Topographic map derived from OSM data with contour lines and terrain shading.',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | SRTM | <a href="https://opentopomap.org">OpenTopoMap</a>',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 17,
    minZoom: 3,
    category: 'Outdoor'
  },
  satellite: {
    id: 'satellite',
    label: 'Esri World Imagery',
    description: 'High-resolution satellite and aerial imagery from Esri and the GIS user community.',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Imagery &copy; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    subdomains: [],
    maxZoom: 19,
    minZoom: 3,
    category: 'Imagery'
  }
};

const orderedProviderIds = ['street', 'light', 'dark', 'voyager', 'hot', 'topo', 'satellite'];

const toolbarThemes = {
  light: {
    container: 'pointer-events-auto flex flex-col gap-2 rounded-3xl border border-slate-200 bg-slate-100 p-2 text-slate-900 backdrop-blur-sm',
    badge: 'rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-[10px] font-semibold text-slate-700',
    button: {
      base: 'flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400/40 focus-visible:ring-offset-slate-100/60',
      active: 'border-sky-500 bg-sky-200 text-slate-900',
      idle: 'border-slate-300 bg-slate-100 text-slate-900 hover:border-slate-400 hover:bg-slate-200',
      disabled: 'opacity-60 pointer-events-none'
    },
    panel: 'pointer-events-auto w-60 rounded-3xl border border-slate-200 bg-slate-100 p-4 text-slate-900 backdrop-blur-md',
    panelTitle: 'text-[11px] font-semibold uppercase tracking-wide text-slate-500',
    panelButton: 'rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-900 transition hover:border-sky-400 hover:bg-sky-100',
    panelToggle: 'rounded-xl border border-slate-300 bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-slate-900 transition hover:border-sky-400 hover:bg-sky-100',
    layerScroll: 'flex max-h-60 flex-col gap-2 overflow-y-auto pr-1',
    layerOption: 'flex flex-col gap-1 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-left transition hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40',
    layerOptionActive: 'border-sky-500 bg-sky-100 text-slate-900 shadow-inner shadow-sky-200/60',
    layerOptionDescription: 'text-[11px] text-slate-500 leading-snug',
    layerOptionCategory: 'text-[10px] font-semibold uppercase tracking-wide text-slate-400',
    iconStyle: null,
    iconClass: ''
  },
  dark: {
    container: 'pointer-events-auto flex flex-col gap-2 rounded-3xl border border-slate-700 bg-[#0b1224] p-2 text-slate-100 backdrop-blur-sm',
    badge: 'rounded-full border border-slate-600 bg-[#0f1b38] px-3 py-1 text-[10px] font-semibold text-slate-200',
    button: {
      base: 'flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-200/30 focus-visible:ring-offset-[#0b1224]/40',
  active: 'border-sky-400 bg-[#1e335d] text-sky-100',
      idle: 'border-slate-600 bg-[#0d172e] text-slate-100 hover:border-slate-400 hover:bg-[#15213f]',
      disabled: 'opacity-50 pointer-events-none'
    },
    panel: 'pointer-events-auto w-60 rounded-3xl border border-slate-700 bg-[#080f1e] p-4 text-slate-100 backdrop-blur-md',
    panelTitle: 'text-[11px] font-semibold uppercase tracking-wide text-slate-400',
    panelButton: 'rounded-xl border border-slate-600 bg-[#111b33] px-3 py-1.5 text-[12px] font-semibold text-slate-100 transition hover:border-sky-400 hover:bg-[#1d2b4e]',
    panelToggle: 'rounded-xl border border-slate-500 bg-[#0f1b38] px-3 py-1.5 text-[12px] font-semibold text-slate-100 transition hover:border-sky-400 hover:bg-[#1a2a4d]',
    layerScroll: 'flex max-h-60 flex-col gap-2 overflow-y-auto pr-1',
    layerOption: 'flex flex-col gap-1 rounded-2xl border border-slate-600 bg-[#101d39] px-3 py-2 text-left transition hover:border-sky-400 hover:bg-[#16254a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200/30',
    layerOptionActive: 'border-sky-400 bg-[#1e335d] text-sky-100 shadow-inner shadow-sky-900/40',
    layerOptionDescription: 'text-[11px] text-slate-300 leading-snug',
    layerOptionCategory: 'text-[10px] font-semibold uppercase tracking-wide text-slate-400/90',
    iconStyle: { filter: 'invert(0.9)' },
    iconClass: ''
  }
};

const MAX_TILE_FETCH_CONCURRENCY = 6;

const helpSections = [
  {
    id: 'getting-started',
    title: 'Getting started',
    description:
      'Allow location access, choose a base map that fits the terrain, and tap on the map to place the start and finish markers.',
    points: [
      'Tap the placement tools under the Route tab to add Start, End, or intermediate checkpoints onto the map.',
      'Switch between the light and night toolbar themes for readability in different lighting conditions.'
    ]
  },
  {
    id: 'toolbar',
    title: 'Toolbar buttons',
    description:
      'Each button in the floating toolbar opens a tool. All tools can also be accessed from the Menu button.',
    points: [
      'Menu toggles the quick actions panel where you can jump to Compass, Route, or Grid tools.',
      'Compass opens the heading overlay showing bearings to your selected checkpoint.',
      'Route leads to the checkpoint manager where you can add or remove checkpoints.'
    ]
  },
  {
    id: 'maps',
    title: 'Choosing maps',
    description:
      'Different base layers emphasise different features. Pick the layer that best supports the task at hand.',
    points: [
      'OpenStreetMap Street is the fallback layer and works reliably online or with low mobile reception.',
      'Carto Light or Dark provide high-contrast styling that is easier to read in bright sun or at night.',
      'OpenTopoMap is ideal for land navigation where contours and terrain shading matter.',
      'Esri Satellite is ideal when you need to see real details, but is heavy on mobile data.'
    ]
  }
];

const latLngToTile = (lat, lng, zoom) => {
  const latRad = (lat * Math.PI) / 180;
  const scale = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * scale);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale
  );
  const maxIndex = scale - 1;
  return {
    x: Math.min(Math.max(x, 0), maxIndex),
    y: Math.min(Math.max(y, 0), maxIndex),
    z: zoom
  };
};

const buildTileUrl = (template, subdomains, { x, y, z }) => {
  const domainPool = Array.isArray(subdomains) && subdomains.length > 0 ? subdomains : [''];
  const index = Math.abs((x + y) % domainPool.length);
  const subdomain = domainPool[index];
  return template
    .replace('{s}', subdomain)
    .replace('{x}', x)
    .replace('{y}', y)
    .replace('{z}', z);
};

const createIcon = (color, label) =>
  L.divIcon({
    className: 'flex items-center justify-center rounded-full text-xs font-semibold text-white shadow-lg shadow-slate-900/50',
    html: `<div style="background:${color};width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:9999px;">${label}</div>`
  });

const startIcon = createIcon('#22c55e', 'S');
const endIcon = createIcon('#ef4444', 'F');
const checkpointIcon = createIcon('#3b82f6', '•');
const previewIcon = createIcon('#d946ef', '•');

const createUserIcon = (heading) =>
  L.divIcon({
    className: 'user-heading-icon',
    html: `
      <div style="position:relative;width:44px;height:44px;">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(14,165,233,0.12);border:2px solid rgba(56,189,248,0.9);box-shadow:0 0 8px rgba(56,189,248,0.4);"></div>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(${heading}deg);transform-origin:center;">
          <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:18px solid #fbbf24;"></div>
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });

const PlacementHandler = () => {
  const {
    placementMode,
    setStart,
    setEnd,
    addCheckpoint,
    setPlacementMode
  } = useCheckpoints();

  useMapEvents({
    click: (event) => {
      if (!placementMode) return;

      const mode =
        typeof placementMode === 'string' ? { type: placementMode } : placementMode;
      if (!mode?.type) return;

      const { latlng } = event;
      if (mode.type === 'start') {
        setStart({ lat: latlng.lat, lng: latlng.lng });
      } else if (mode.type === 'end') {
        setEnd({ lat: latlng.lat, lng: latlng.lng });
      } else if (mode.type === 'checkpoint') {
        const insertIndex =
          typeof mode.insertIndex === 'number' ? mode.insertIndex : undefined;
        addCheckpoint({ lat: latlng.lat, lng: latlng.lng }, insertIndex);
      }
      setPlacementMode(null);
    }
  });

  return null;
};

const MapView = ({
  userLocation,
  userHeading,
  targets = [],
  onEnableLocation,
  locationEnabled,
  hasLocationFix,
  isRequestingLocation,
  locationRequestToken = 0,
  baseLayer = 'street',
  onBaseLayerChange,
  onToggleMenu,
  onOpenCompass,
  onOpenRoute,
  toolbarTheme = 'light',
  onToolbarThemeToggle,
  isMenuOpen = false,
  previewLocation,
  onDropItem,
  hideToolbar = false
}) => {
  const {
    start,
    end,
    checkpoints,
    connectVia,
    selectedId,
    selectCheckpoint,
    updateCheckpoint,
    setPlacementMode,
    toggleConnectMode,
    loadRouteSnapshot,
    placementMode,
    setStart,
    setEnd,
    addCheckpoint
  } = useCheckpoints();
  const mapRef = useRef(null);
  const hasCenteredRef = useRef(false);
  const lastRequestTokenRef = useRef(0);
  const [cacheStatus, setCacheStatus] = useState(null);
  const [isCaching, setIsCaching] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsView, setSettingsView] = useState('settings');
  const [tileLayerReloadKey, setTileLayerReloadKey] = useState(0);
  const [shareCopyState, setShareCopyState] = useState(null);
  const [shareImportValue, setShareImportValue] = useState('');
  const [shareImportStatus, setShareImportStatus] = useState(null);
  const [shareCalloutValue, setShareCalloutValue] = useState('');
  const [shareCalloutTarget, setShareCalloutTarget] = useState('checkpoint');
  const [shareCalloutStatus, setShareCalloutStatus] = useState(null);
  const cacheStatusTimeoutRef = useRef(null);
  const tileFailureRef = useRef(0);
  const latestUserLocationRef = useRef(null);
  const shareCodeRef = useRef(null);
  const shareCopyTimeoutRef = useRef(null);
  const shareImportTimeoutRef = useRef(null);
  const shareCalloutTimeoutRef = useRef(null);

  const tileProvider = tileProviders[baseLayer] ?? tileProviders.street;
  const themeStyles = toolbarThemes[toolbarTheme] ?? toolbarThemes.light;
  const mapThemeClass = toolbarTheme === 'dark' ? 'map-theme-dark' : 'map-theme-light';
  const mapCenter = userLocation ? [userLocation.lat, userLocation.lng] : defaultPosition;
  const mapKey = userLocation ? 'user-centered' : 'default-centered';
  const scheduleInvalidate = useCallback(() => {
    if (mapRef.current) {
      mapRef.current.invalidateSize({ animate: false });
    }
  }, []);
  const layerOptions = useMemo(
    () => orderedProviderIds.map((id) => tileProviders[id]).filter(Boolean),
    []
  );

  const toolbarPositionStyle = useMemo(
    () => ({
      top: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
      right: 'calc(env(safe-area-inset-right, 0px) + 1rem)'
    }),
    []
  );

  const shareSnapshot = useMemo(
    () => buildRouteShareSnapshot({ start, end, checkpoints, connectVia }),
    [start, end, checkpoints, connectVia]
  );

  const shareCode = useMemo(
    () => (shareSnapshot ? encodeRouteShare(shareSnapshot) : ''),
    [shareSnapshot]
  );

  const shareSummaryText = useMemo(() => {
    if (!shareSnapshot) return null;
    const segments = [];
    if (shareSnapshot.start) segments.push('start');
    if (shareSnapshot.checkpoints.length > 0) {
      segments.push(
        `${shareSnapshot.checkpoints.length} checkpoint${
          shareSnapshot.checkpoints.length === 1 ? '' : 's'
        }`
      );
    }
    if (shareSnapshot.end) segments.push('end');
    const includes = segments.length ? `Includes ${segments.join(', ')}. ` : '';
    const connectionText =
      shareSnapshot.connectVia === 'route'
        ? 'Route mode connections maintained.'
        : 'Direct line connections maintained.';
    return `${includes}${connectionText}`;
  }, [shareSnapshot]);

  const hasShareCode = Boolean(shareCode);

  const shareLocationCodes = useMemo(() => {
    if (!shareSnapshot) return [];
    const codes = [];
    if (shareSnapshot.start) {
      codes.push({
        key: 'start',
        label: 'Start',
        code: encodeLocationCode(shareSnapshot.start),
        position: shareSnapshot.start
      });
    }
    shareSnapshot.checkpoints.forEach((checkpoint, index) => {
      codes.push({
        key: `checkpoint-${index}`,
        label: `Checkpoint ${index + 1}`,
        code: encodeLocationCode(checkpoint),
        position: checkpoint
      });
    });
    if (shareSnapshot.end) {
      codes.push({
        key: 'end',
        label: 'Finish',
        code: encodeLocationCode(shareSnapshot.end),
        position: shareSnapshot.end
      });
    }
    return codes.filter((entry) => Boolean(entry.code));
  }, [shareSnapshot]);

  const formatLocation = useCallback((position) => {
    if (!position) return '';
    return `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;
  }, []);

  const getFeedbackToneClass = useCallback((tone) => {
    if (tone === 'success') return 'text-emerald-500';
    if (tone === 'error') return 'text-rose-500';
    if (tone === 'warning') return 'text-amber-500';
    return 'text-slate-500';
  }, []);

  const showShareCopyFeedback = useCallback(
    (tone, message, duration = 2500) => {
      if (shareCopyTimeoutRef.current && typeof window !== 'undefined') {
        window.clearTimeout(shareCopyTimeoutRef.current);
        shareCopyTimeoutRef.current = null;
      }
      setShareCopyState(message ? { tone, message } : null);
      if (message && duration !== null && typeof window !== 'undefined') {
        shareCopyTimeoutRef.current = window.setTimeout(() => {
          setShareCopyState(null);
          shareCopyTimeoutRef.current = null;
        }, duration);
      }
    },
    [setShareCopyState, shareCopyTimeoutRef]
  );

  const showShareImportFeedback = useCallback(
    (tone, message, duration = 4000) => {
      if (shareImportTimeoutRef.current && typeof window !== 'undefined') {
        window.clearTimeout(shareImportTimeoutRef.current);
        shareImportTimeoutRef.current = null;
      }
      setShareImportStatus(message ? { tone, message } : null);
      if (message && duration !== null && typeof window !== 'undefined') {
        shareImportTimeoutRef.current = window.setTimeout(() => {
          setShareImportStatus(null);
  setShareCalloutStatus(null);
          shareImportTimeoutRef.current = null;
        }, duration);
      }
    },
    [setShareImportStatus, shareImportTimeoutRef]
  );

  const handleCopyShareCode = useCallback(async () => {
    if (!hasShareCode) {
      showShareCopyFeedback('warning', 'Define a route to generate a share code.', 3200);
      return;
    }

    try {
      let copied = false;
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareCode);
        copied = true;
      } else if (typeof document !== 'undefined' && shareCodeRef.current) {
        const element = shareCodeRef.current;
        element.focus();
        element.select();
        if (typeof element.setSelectionRange === 'function') {
          element.setSelectionRange(0, shareCode.length);
        }
        const succeeded = typeof document.execCommand === 'function' && document.execCommand('copy');
        copied = Boolean(succeeded);
      }

      if (!copied) {
        throw new Error('Copy not supported');
      }

      showShareCopyFeedback('success', 'Share code copied to clipboard.', 2500);
    } catch (error) {
      showShareCopyFeedback(
        'error',
        error?.message && error.message !== 'Copy not supported'
          ? error.message
          : 'Copy failed. Try selecting and copying the code manually.',
        4000
      );
    }
  }, [hasShareCode, shareCode, showShareCopyFeedback]);

  const handleShareImport = useCallback(() => {
    const trimmed = shareImportValue.trim();
    if (!trimmed) {
      showShareImportFeedback('warning', 'Paste a share code to import.', 3500);
      return;
    }

    const snapshot = decodeRouteShare(trimmed);
    if (!snapshot) {
      showShareImportFeedback(
        'error',
        'That share code could not be read. Check the full code and try again.',
        4000
      );
      return;
    }

    loadRouteSnapshot(snapshot);
    setShareImportValue('');
    showShareImportFeedback(
      'success',
      'Route imported. Close this panel to review it on the map.',
      4000
    );
  }, [loadRouteSnapshot, shareImportValue, showShareImportFeedback]);

  const handleShareImportChange = useCallback(
    (event) => {
      if (shareImportTimeoutRef.current && typeof window !== 'undefined') {
        window.clearTimeout(shareImportTimeoutRef.current);
        shareImportTimeoutRef.current = null;
      }
      setShareImportValue(event.target.value);
      setShareImportStatus(null);
    },
    [setShareImportStatus, setShareImportValue, shareImportTimeoutRef]
  );

  const handleShareImportKeyDown = useCallback(
    (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        handleShareImport();
      }
    },
    [handleShareImport]
  );

  useEffect(() => {
    if (settingsView !== 'share') {
      setShareCopyState(null);
      setShareImportStatus(null);
      if (shareCopyTimeoutRef.current && typeof window !== 'undefined') {
        window.clearTimeout(shareCopyTimeoutRef.current);
        shareCopyTimeoutRef.current = null;
      }
      if (shareImportTimeoutRef.current && typeof window !== 'undefined') {
        window.clearTimeout(shareImportTimeoutRef.current);
        shareImportTimeoutRef.current = null;
      }
    }
  }, [settingsView]);

  const shareInputClass = useMemo(
    () =>
      toolbarTheme === 'light'
        ? 'border border-slate-300 bg-white text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-400'
        : 'border border-slate-700 bg-slate-950 text-slate-100 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-500',
    [toolbarTheme]
  );

  const placementLabel = useMemo(() => {
    if (!placementMode) return null;
    const mode =
      typeof placementMode === 'string'
        ? { type: placementMode }
        : placementMode;
    if (!mode?.type) return null;
    if (mode.type === 'start') return 'Start point';
    if (mode.type === 'end') return 'End point';
    if (mode.type === 'checkpoint') {
      if (typeof mode.insertIndex === 'number') {
        return `Checkpoint (position ${mode.insertIndex + 1})`;
      }
      return 'Checkpoint';
    }
    return null;
  }, [placementMode]);

  const statusMessages = useMemo(() => {
    if (!placementLabel) return [];
    return [
      {
        key: 'placement',
        text: `Currently placing: ${placementLabel}`,
        tone: 'emerald'
      }
    ];
  }, [placementLabel]);

  const showCacheStatus = useCallback(
    (message, tone = 'info', duration = 4000) => {
      if (cacheStatusTimeoutRef.current && typeof window !== 'undefined') {
        window.clearTimeout(cacheStatusTimeoutRef.current);
        cacheStatusTimeoutRef.current = null;
      }
      setCacheStatus(message ? { message, tone } : null);
      if (message && duration !== null && typeof window !== 'undefined') {
        cacheStatusTimeoutRef.current = window.setTimeout(() => {
          setCacheStatus(null);
          cacheStatusTimeoutRef.current = null;
        }, duration);
      }
    },
    []
  );

  useEffect(() => {
    L.Icon.Default.mergeOptions({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
    });
  }, []);

  useEffect(() => {
    showCacheStatus(null);
    setIsCaching(false);
    tileFailureRef.current = 0;
    setTileLayerReloadKey((key) => key + 1);
  }, [baseLayer, showCacheStatus]);

  useEffect(() => {
    if (isMenuOpen) {
      setIsSettingsOpen(false);
      setSettingsView('settings');
    }
  }, [isMenuOpen, setIsSettingsOpen, setSettingsView]);

  useEffect(() => {
    if (!isMapReady || typeof window === 'undefined') return;
    const handleResize = () => {
      window.requestAnimationFrame(scheduleInvalidate);
    };
    window.requestAnimationFrame(scheduleInvalidate);
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [isMapReady, scheduleInvalidate]);

  useEffect(() => {
    if (!isMapReady || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const container = mapRef.current?.getContainer();
    if (!container) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(scheduleInvalidate);
      } else {
        scheduleInvalidate();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [isMapReady, scheduleInvalidate]);

  useEffect(() => {
    if (isMapReady) {
      scheduleInvalidate();
    }
  }, [isMapReady, scheduleInvalidate, toolbarTheme, isSettingsOpen, isMenuOpen, baseLayer]);

  useEffect(() => {
    if (!mapRef.current || !userLocation) return;
    if (hasCenteredRef.current) return;
    mapRef.current.setView([userLocation.lat, userLocation.lng], 16);
    hasCenteredRef.current = true;
  }, [userLocation]);

  useEffect(() => {
    latestUserLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    if (!mapRef.current) return;
    hasCenteredRef.current = false;
    scheduleInvalidate();
    const latestLocation = latestUserLocationRef.current;
    if (latestLocation) {
      mapRef.current.flyTo(
        [latestLocation.lat, latestLocation.lng],
        Math.max(mapRef.current.getZoom(), 16),
        { animate: false }
      );
      hasCenteredRef.current = true;
    }
  }, [baseLayer, scheduleInvalidate]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (locationRequestToken === undefined || locationRequestToken === lastRequestTokenRef.current) {
      return;
    }
    lastRequestTokenRef.current = locationRequestToken;
    hasCenteredRef.current = false;
    if (userLocation) {
      mapRef.current.flyTo([userLocation.lat, userLocation.lng], Math.max(mapRef.current.getZoom(), 16), {
        animate: true
      });
      hasCenteredRef.current = true;
    }
  }, [locationRequestToken, userLocation]);

  const userIcon = useMemo(() => createUserIcon(userHeading ?? 0), [userHeading]);

  const recenterMap = useCallback(() => {
    if (!mapRef.current) return;
    const latestLocation = latestUserLocationRef.current ?? userLocation;
    if (!latestLocation) return;

    const map = mapRef.current;
    scheduleInvalidate();
    const targetZoom = Math.max(map.getZoom(), 16);
    map.flyTo([latestLocation.lat, latestLocation.lng], targetZoom, { animate: true });
    hasCenteredRef.current = true;
  }, [scheduleInvalidate, userLocation]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.getContainer().classList.remove('mapview-attribution-offset');
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => () => {
    if (cacheStatusTimeoutRef.current && typeof window !== 'undefined') {
      window.clearTimeout(cacheStatusTimeoutRef.current);
    }
    if (shareCopyTimeoutRef.current && typeof window !== 'undefined') {
      window.clearTimeout(shareCopyTimeoutRef.current);
    }
    if (shareImportTimeoutRef.current && typeof window !== 'undefined') {
      window.clearTimeout(shareImportTimeoutRef.current);
    }
    if (shareCalloutTimeoutRef.current && typeof window !== 'undefined') {
      window.clearTimeout(shareCalloutTimeoutRef.current);
    }
  }, []);

  const handleEnableLocation = useCallback(() => {
    if (typeof onEnableLocation === 'function') {
      return onEnableLocation();
    }
    return false;
  }, [onEnableLocation]);

  const handleToggleMenu = useCallback(() => {
    setIsSettingsOpen(false);
    if (typeof onToggleMenu === 'function') {
      onToggleMenu();
    }
  }, [onToggleMenu]);

  const handleOpenCompass = useCallback(() => {
    if (typeof onOpenCompass === 'function') {
      onOpenCompass();
    }
  }, [onOpenCompass]);

  const handleOpenRoute = useCallback(() => {
    if (typeof onOpenRoute === 'function') {
      onOpenRoute();
    }
  }, [onOpenRoute]);

  const handleBaseLayerToggle = useCallback(
    (nextLayer) => {
      if (nextLayer === baseLayer) return;
      if (typeof onBaseLayerChange === 'function') {
        onBaseLayerChange(nextLayer);
      }
    },
    [baseLayer, onBaseLayerChange]
  );

  const showShareCalloutFeedback = useCallback(
    (tone, message, duration = 3500) => {
      if (shareCalloutTimeoutRef.current && typeof window !== 'undefined') {
        window.clearTimeout(shareCalloutTimeoutRef.current);
        shareCalloutTimeoutRef.current = null;
      }
      setShareCalloutStatus(message ? { tone, message } : null);
      if (message && duration !== null && typeof window !== 'undefined') {
        shareCalloutTimeoutRef.current = window.setTimeout(() => {
          setShareCalloutStatus(null);
          shareCalloutTimeoutRef.current = null;
        }, duration);
      }
    },
    [setShareCalloutStatus, shareCalloutTimeoutRef]
  );

  const handlePrefetchTiles = useCallback(async () => {
    if (!isMapReady || !mapRef.current) {
      showCacheStatus('Map not ready yet.', 'warning');
      return;
    }
    if (baseLayer !== 'satellite') {
      showCacheStatus('Switch to satellite view to cache imagery.', 'warning');
      return;
    }
    if (typeof window === 'undefined' || !('caches' in window)) {
      showCacheStatus('Tile caching not supported in this browser.', 'error');
      return;
    }

    const map = mapRef.current;
    const zoom = Math.round(map.getZoom());
    const scale = 2 ** zoom;
    const anchors = [];

    if (userLocation) anchors.push(userLocation);
    if (start?.position) anchors.push(start.position);
    if (end?.position) anchors.push(end.position);
    checkpoints.forEach((checkpoint) => {
      if (checkpoint?.position) anchors.push(checkpoint.position);
    });

    if (anchors.length === 0) {
      showCacheStatus('Add a checkpoint or enable location before caching.', 'warning');
      return;
    }

    const EARTH_CIRCUMFERENCE = 40075016.686;
    const tileSizeMeters = EARTH_CIRCUMFERENCE / scale;
    const tileKeys = new Set();

    anchors.forEach((anchor) => {
      const tile = latLngToTile(anchor.lat, anchor.lng, zoom);
      const latRad = (anchor.lat * Math.PI) / 180;
      const cosLat = Math.cos(latRad) || 0.0001;
      const metersPerTileX = tileSizeMeters * cosLat;
      const metersPerTileY = tileSizeMeters;
      const radiusX = Math.max(1, Math.ceil(2000 / metersPerTileX));
      const radiusY = Math.max(1, Math.ceil(2000 / metersPerTileY));

      for (let dx = -radiusX; dx <= radiusX; dx += 1) {
        for (let dy = -radiusY; dy <= radiusY; dy += 1) {
          const x = Math.min(Math.max(tile.x + dx, 0), scale - 1);
          const y = Math.min(Math.max(tile.y + dy, 0), scale - 1);
          tileKeys.add(`${x}:${y}:${zoom}`);
        }
      }
    });

    if (tileKeys.size === 0) {
      showCacheStatus('No tiles identified for caching.', 'warning');
      return;
    }

    const tiles = Array.from(tileKeys).map((key) => {
      const [x, y, z] = key.split(':').map((value) => Number(value));
      return { x, y, z };
    });

    try {
      setIsCaching(true);
      showCacheStatus('Caching satellite tiles nearby…', 'info', null);
      const cache = await caches.open('cadet-map-tile-cache');
      let successCount = 0;
      const errors = [];

      const tileQueue = [...tiles];
      const workerCount = Math.min(MAX_TILE_FETCH_CONCURRENCY, tileQueue.length);

      const runWorker = async () => {
        while (tileQueue.length > 0) {
          const nextTile = tileQueue.shift();
          if (!nextTile) continue;
          const url = buildTileUrl(tileProvider.url, tileProvider.subdomains, nextTile);
          try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok && response.type !== 'opaque') {
              throw new Error(`HTTP ${response.status}`);
            }
            await cache.put(url, response.clone());
            successCount += 1;
          } catch (error) {
            errors.push(error?.message ?? 'Unknown error');
          }
          await new Promise((resolve) => {
            if (typeof window === 'undefined') {
              resolve();
              return;
            }
            window.requestAnimationFrame(resolve);
          });
        }
      };

      await Promise.all(Array.from({ length: workerCount }, runWorker));

      if (errors.length === tiles.length) {
        showCacheStatus('Unable to cache tiles. Please try again later.', 'error');
      } else {
        const issueNote = errors.length
          ? ` (skipped ${errors.length} tile${errors.length === 1 ? '' : 's'})`
          : '';
        showCacheStatus(
          `Cached ${successCount} satellite tile${successCount === 1 ? '' : 's'}${issueNote}.`,
          errors.length ? 'warning' : 'success'
        );
      }
    } catch (cacheError) {
      showCacheStatus(cacheError.message ?? 'Tile caching failed.', 'error');
    } finally {
      setIsCaching(false);
    }
  }, [baseLayer, checkpoints, end, isMapReady, showCacheStatus, start, tileProvider.subdomains, tileProvider.url, userLocation]);

  const handleToggleSettings = useCallback(() => {
    const willOpen = !isSettingsOpen;
    if (willOpen && isMenuOpen && typeof onToggleMenu === 'function') {
      onToggleMenu();
    }
    setIsSettingsOpen((current) => {
      const next = !current;
      if (!current || !next) {
        setSettingsView('settings');
      }
      return next;
    });
  }, [isMenuOpen, isSettingsOpen, onToggleMenu, setSettingsView]);

  const handleOpenHelpView = useCallback(() => {
    setSettingsView('help');
    setIsSettingsOpen(true);
  }, [setIsSettingsOpen, setSettingsView]);

  const handleOpenShareView = useCallback(() => {
    if (!isSettingsOpen) {
      if (isMenuOpen && typeof onToggleMenu === 'function') {
        onToggleMenu();
      }
      setIsSettingsOpen(true);
    }
    setSettingsView('share');
  }, [isMenuOpen, isSettingsOpen, onToggleMenu, setIsSettingsOpen, setSettingsView]);

  const handleToolbarThemeChange = useCallback(() => {
    if (typeof onToolbarThemeToggle === 'function') {
      onToolbarThemeToggle();
    }
  }, [onToolbarThemeToggle]);

  const handleCenterOnUser = useCallback(() => {
    if (userLocation) {
      recenterMap();
      setIsSettingsOpen(false);
      setSettingsView('settings');
      return;
    }
    const started = handleEnableLocation();
    if (!started) {
      showCacheStatus('Enable location permissions to center the map.', 'warning');
    } else {
      showCacheStatus('Requesting location fix…', 'info', 2500);
    }
  }, [handleEnableLocation, recenterMap, setIsSettingsOpen, setSettingsView, showCacheStatus, userLocation]);

  const cacheDisabled = baseLayer !== 'satellite' || isCaching;
  const cacheButtonLabel = isCaching ? 'Caching…' : baseLayer !== 'satellite' ? 'Satellite required' : 'Cache tiles';

  const tileEventHandlers = useMemo(
    () => ({
      loading: () => {
        tileFailureRef.current = 0;
      },
      load: () => {
        scheduleInvalidate();
      },
      tileerror: () => {
        tileFailureRef.current += 1;
        if (tileFailureRef.current >= 3) {
          tileFailureRef.current = 0;
          showCacheStatus('Tile issues detected. Reverting to standard map.', 'warning', 3000);
          if (baseLayer !== 'street' && typeof onBaseLayerChange === 'function') {
            onBaseLayerChange('street');
          } else {
            setTileLayerReloadKey((key) => key + 1);
          }
        }
      }
    }),
    [baseLayer, onBaseLayerChange, scheduleInvalidate, setTileLayerReloadKey, showCacheStatus]
  );

  const handleShareCalloutChange = useCallback((event) => {
    const nextValue = event.target.value.replace(/\s+/g, '').toLowerCase();
    setShareCalloutValue(nextValue);
    setShareCalloutStatus(null);
    if (shareCalloutTimeoutRef.current && typeof window !== 'undefined') {
      window.clearTimeout(shareCalloutTimeoutRef.current);
      shareCalloutTimeoutRef.current = null;
    }
  }, []);

  const handleShareCalloutTargetChange = useCallback((event) => {
    setShareCalloutTarget(event.target.value);
  }, []);

  const handleApplyCallout = useCallback(() => {
    const trimmed = shareCalloutValue.trim().toLowerCase();
    if (!trimmed) {
      showShareCalloutFeedback('warning', 'Enter a callout code to place it.');
      return;
    }
    if (trimmed.length < 4 || trimmed.length > 12) {
      showShareCalloutFeedback('error', 'Callouts should be between 4 and 12 characters.');
      return;
    }

    const position = decodeLocationCode(trimmed);
    if (!position) {
      showShareCalloutFeedback('error', 'That code could not be decoded. Double-check the letters.');
      return;
    }

    if (shareCalloutTarget === 'start') {
      setStart(position);
      showShareCalloutFeedback('success', 'Start marker updated from callout.', 3000);
    } else if (shareCalloutTarget === 'end') {
      setEnd(position);
      showShareCalloutFeedback('success', 'End marker updated from callout.', 3000);
    } else {
      addCheckpoint(position);
      showShareCalloutFeedback('success', 'Checkpoint added from callout.', 3000);
    }

    setShareCalloutValue('');
  }, [addCheckpoint, decodeLocationCode, setEnd, setStart, shareCalloutTarget, shareCalloutValue, showShareCalloutFeedback]);

  const settingsToggleClass = useMemo(
    () =>
      `${themeStyles.panelToggle} ${
        settingsView === 'settings'
          ? 'ring-1 ring-sky-400 text-sky-500 border-sky-400'
          : 'opacity-80 hover:opacity-100'
      }`,
    [settingsView, themeStyles.panelToggle]
  );

  const shareToggleClass = useMemo(
    () =>
      `${themeStyles.panelToggle} ${
        settingsView === 'share'
          ? 'ring-1 ring-sky-400 text-sky-500 border-sky-400'
          : 'opacity-80 hover:opacity-100'
      }`,
    [settingsView, themeStyles.panelToggle]
  );

  const helpToggleClass = useMemo(
    () =>
      `${themeStyles.panelToggle} ${
        settingsView === 'help'
          ? 'ring-1 ring-sky-400 text-sky-500 border-sky-400'
          : 'opacity-80 hover:opacity-100'
      }`,
    [settingsView, themeStyles.panelToggle]
  );

  const directPath = useMemo(() => {
    const path = [];
    if (start) path.push([start.position.lat, start.position.lng]);
    checkpoints.forEach((checkpoint) => {
      path.push([checkpoint.position.lat, checkpoint.position.lng]);
    });
    if (end) path.push([end.position.lat, end.position.lng]);
    return path;
  }, [start, checkpoints, end]);

  return (
    <div className="relative h-full w-full flex-1">
      <MapContainer
        key={mapKey}
        center={mapCenter}
        zoom={13}
        className={`h-full w-full ${mapThemeClass}`}
        preferCanvas
        ref={mapRef}
        attributionControl={false}
        whenCreated={(mapInstance) => {
          mapInstance.getContainer().classList.add('mapview-attribution-offset');
        }}
      >
        <MapDropHandler onDropItem={onDropItem} />
        <AttributionControl position="bottomleft" prefix={false} />
        <TileLayer
          key={`${tileProvider.id}-${tileLayerReloadKey}`}
          url={tileProvider.url}
          attribution={tileProvider.attribution}
          subdomains={tileProvider.subdomains}
          minZoom={tileProvider.minZoom}
          maxZoom={tileProvider.maxZoom}
          eventHandlers={tileEventHandlers}
        />
        <PlacementHandler />

        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={userIcon}
            interactive={false}
          />
        )}

        {start && (
          <Marker
            position={[start.position.lat, start.position.lng]}
            icon={startIcon}
            draggable
            eventHandlers={{
              click: () => selectCheckpoint('start'),
              dragend: (event) => {
                const { lat, lng } = event.target.getLatLng();
                setStart({ lat, lng });
              }
            }}
          />
        )}

        {end && (
          <Marker
            position={[end.position.lat, end.position.lng]}
            icon={endIcon}
            draggable
            eventHandlers={{
              click: () => selectCheckpoint('end'),
              dragend: (event) => {
                const { lat, lng } = event.target.getLatLng();
                setEnd({ lat, lng });
              }
            }}
          />
        )}

        {checkpoints.map((checkpoint) => (
          <Marker
            key={checkpoint.id}
            position={[checkpoint.position.lat, checkpoint.position.lng]}
            icon={checkpointIcon}
            draggable
            eventHandlers={{
              click: () => selectCheckpoint(checkpoint.id),
              dragend: (event) => {
                const { lat, lng } = event.target.getLatLng();
                updateCheckpoint(checkpoint.id, { lat, lng });
              }
            }}
          />
        ))}

        {previewLocation?.position && (
          <>
            <Marker
              position={[previewLocation.position.lat, previewLocation.position.lng]}
              icon={previewIcon}
              opacity={0.8}
            />
            {previewLocation.source && (
              <Polyline
                positions={[
                  [previewLocation.source.lat, previewLocation.source.lng],
                  [previewLocation.position.lat, previewLocation.position.lng]
                ]}
                pathOptions={{ color: '#d946ef', weight: 3, dashArray: '5 5', opacity: 0.6 }}
              />
            )}
          </>
        )}

        {connectVia === 'direct' && directPath.length >= 2 && (
          <Polyline
            positions={directPath}
            pathOptions={{ color: '#38bdf8', weight: 4, opacity: 0.7 }}
          />
        )}

        {connectVia === 'route' && directPath.length >= 2 && (
          <Polyline
            positions={directPath}
            pathOptions={{ color: '#f97316', weight: 4, dashArray: '10 6', opacity: 0.8 }}
          />
        )}

        {userLocation &&
          targets
            .filter((target) => target.position)
            .map((target) => (
            <Polyline
              key={`user-target-${target.id}`}
              positions={[
                [userLocation.lat, userLocation.lng],
                [target.position.lat, target.position.lng]
              ]}
              pathOptions={{ color: '#818cf8', weight: 2, dashArray: '4 6', opacity: 0.4 }}
            />
            ))}
      </MapContainer>

      {cacheStatus && (
        <div
          className={`pointer-events-none absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-full border px-4 py-1.5 text-[11px] font-semibold tracking-wide ${
            cacheStatus.tone === 'success'
              ? 'border-emerald-300 bg-emerald-200 text-emerald-900'
              : cacheStatus.tone === 'warning'
                ? 'border-amber-300 bg-amber-200 text-amber-900'
                : cacheStatus.tone === 'error'
                  ? 'border-rose-300 bg-rose-200 text-rose-900'
                  : 'border-sky-300 bg-sky-200 text-slate-900'
          }`}
        >
          {cacheStatus.message}
        </div>
      )}

      <div
        className={`pointer-events-none absolute z-[990] flex flex-col items-end gap-3 transition-opacity duration-300 ${hideToolbar ? 'opacity-0' : 'opacity-100'}`}
        style={toolbarPositionStyle}
      >
        <div className={themeStyles.container}>
          <ToolbarButton
            iconName="menu"
            label="Menu"
            onClick={handleToggleMenu}
            title="Toggle navigation menu"
            isActive={isMenuOpen}
            themeStyles={themeStyles}
          />
          <ToolbarButton
            iconName="compass"
            label="Compass"
            onClick={handleOpenCompass}
            title="Open compass overlay"
            themeStyles={themeStyles}
          />
          <ToolbarButton
            iconName="route"
            label="Route"
            onClick={handleOpenRoute}
            title="Open route tools"
            themeStyles={themeStyles}
          />
          <ToolbarButton
            iconName="settings"
            label="Settings"
            onClick={handleToggleSettings}
            title="Open settings"
            isActive={isSettingsOpen}
            themeStyles={themeStyles}
          />
        </div>
        {(isRequestingLocation || (locationEnabled && !hasLocationFix)) && (
          <div className={`pointer-events-none ${themeStyles.badge}`}>
            {isRequestingLocation ? 'Getting location…' : 'GPS active, awaiting fix'}
          </div>
        )}
      </div>

      {/* Bottom-left floating button (viewport anchored) */}
      <div
        className="pointer-events-none absolute z-[990] flex flex-col items-start gap-3"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
          left: 'calc(env(safe-area-inset-left, 0px) + 1rem)'
        }}
      >
        <div className="pointer-events-auto">
          <ToolbarButton
            iconName="zoom"
            label="Zoom"
            onClick={handleCenterOnUser}
            title="Zoom to location"
            isActive={false}
            themeStyles={themeStyles}
          />
        </div>
      </div>

      {isSettingsOpen && (
        <div className="pointer-events-auto fixed inset-0 z-[1180] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 rounded-none border-0 bg-slate-950 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(2, 6, 23, 0.45)' }}
            aria-label="Close settings"
            onClick={() => {
              setIsSettingsOpen(false);
              setSettingsView('settings');
            }}
          />
          <div
            className={`${themeStyles.panel} w-full max-w-md max-h-[80vh] overflow-hidden shadow-2xl shadow-slate-950/50`}
            role="dialog"
            aria-modal="true"
            aria-label={
              settingsView === 'help'
                ? 'Map help'
                : settingsView === 'share'
                  ? 'Share current route'
                  : 'Map settings'
            }
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={themeStyles.panelTitle}>
                {settingsView === 'help'
                  ? 'Help'
                  : settingsView === 'share'
                    ? 'Share route'
                    : 'Settings'}
              </span>
              <button
                type="button"
                className={themeStyles.panelButton}
                onClick={() => {
                  setIsSettingsOpen(false);
                  setSettingsView('settings');
                }}
              >
                Close
              </button>
            </div>
            <div className="mb-3 flex items-center gap-2 text-[11px]">
              <button
                type="button"
                className={settingsToggleClass}
                onClick={() => setSettingsView('settings')}
                aria-pressed={settingsView === 'settings'}
              >
                Settings
              </button>
              <button
                type="button"
                className={shareToggleClass}
                onClick={handleOpenShareView}
                aria-pressed={settingsView === 'share'}
              >
                Share
              </button>
              <button
                type="button"
                className={helpToggleClass}
                onClick={handleOpenHelpView}
                aria-pressed={settingsView === 'help'}
              >
                Help
              </button>
            </div>
            <div className="flex h-full max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1 text-[12px]">
              {settingsView === 'help' ? (
                <div className="flex flex-col gap-2">
                  {helpSections.map((section) => (
                    <section
                      key={section.id}
                      className={`${themeStyles.layerOption} cursor-default`}
                      aria-labelledby={`${section.id}-title`}
                    >
                      <h3 id={`${section.id}-title`} className="text-[12px] font-semibold leading-tight">
                        {section.title}
                      </h3>
                      <p className={themeStyles.layerOptionDescription}>{section.description}</p>
                      <ul className="ml-3 list-disc space-y-1 text-[11px] leading-snug">
                        {section.points.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : settingsView === 'share' ? (
                <div className="flex flex-col gap-3">
                  <section className={`${themeStyles.layerOption} flex flex-col gap-2`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-semibold leading-tight">Share code</p>
                        <p className={themeStyles.layerOptionDescription}>
                          Copy and send this code to share the current route.
                        </p>
                      </div>
                      <button
                        type="button"
                        className={`${themeStyles.panelButton} ${hasShareCode ? '' : 'pointer-events-none opacity-50'}`}
                        onClick={handleCopyShareCode}
                        disabled={!hasShareCode}
                      >
                        Copy code
                      </button>
                    </div>
                    <p className={themeStyles.layerOptionDescription}>
                      {shareSummaryText ?? 'Add at least one waypoint to generate a share code.'}
                    </p>
                    <textarea
                      ref={shareCodeRef}
                      className={`${shareInputClass} min-h-[90px] w-full rounded-xl px-3 py-2 text-[11px] leading-snug`}
                      value={shareCode}
                      readOnly
                      spellCheck={false}
                      aria-label="Current route share code"
                      onFocus={(event) => event.target.select()}
                    />
                    {shareCopyState && (
                      <span
                        role="status"
                        aria-live="polite"
                        className={`text-[11px] font-semibold ${getFeedbackToneClass(shareCopyState.tone)}`}
                      >
                        {shareCopyState.message}
                      </span>
                    )}
                  </section>
                  <section className={`${themeStyles.layerOption} flex flex-col gap-2`}>
                    <div>
                      <p className="text-[12px] font-semibold leading-tight">Import route</p>
                      <p className={themeStyles.layerOptionDescription}>
                        Paste a code received from another teammate to replace your current route.
                      </p>
                    </div>
                    <textarea
                      className={`${shareInputClass} min-h-[110px] w-full rounded-xl px-3 py-2 text-[11px] leading-snug`}
                      value={shareImportValue}
                      onChange={handleShareImportChange}
                      onKeyDown={handleShareImportKeyDown}
                      placeholder="Paste a share code here…"
                      spellCheck={false}
                      aria-label="Paste a share code to import"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className={`${themeStyles.panelButton} ${shareImportValue.trim() ? '' : 'pointer-events-none opacity-50'}`}
                        onClick={handleShareImport}
                        disabled={!shareImportValue.trim()}
                      >
                        Load route
                      </button>
                      {shareImportStatus ? (
                        <span
                          role="status"
                          aria-live="polite"
                          className={`text-[11px] font-semibold ${getFeedbackToneClass(shareImportStatus.tone)}`}
                        >
                          {shareImportStatus.message}
                        </span>
                      ) : (
                        <span className="text-[10px] opacity-60">Press Ctrl/⌘ + Enter to load</span>
                      )}
                    </div>
                  </section>
                  <section className={`${themeStyles.layerOption} flex flex-col gap-2`}>
                    <div>
                      <p className="text-[12px] font-semibold leading-tight">Plot callout</p>
                      <p className={themeStyles.layerOptionDescription}>
                        Drop a shared geohash onto the map as a start, checkpoint, or finish marker.
                      </p>
                    </div>
                    <input
                      type="text"
                      className={`${shareInputClass} w-full rounded-xl px-3 py-2 text-[11px] uppercase tracking-wide`}
                      value={shareCalloutValue}
                      onChange={handleShareCalloutChange}
                      placeholder="e.g. u4pruydqq"
                      spellCheck={false}
                      aria-label="Enter a location callout code"
                    />
                    <div className="flex items-center gap-2">
                      <label htmlFor="callout-target" className="text-[11px] font-semibold opacity-70">
                        Place as
                      </label>
                      <select
                        id="callout-target"
                        className={`${shareInputClass} w-full rounded-xl px-3 py-2 text-[11px]`}
                        value={shareCalloutTarget}
                        onChange={handleShareCalloutTargetChange}
                      >
                        <option value="checkpoint">Checkpoint</option>
                        <option value="start">Start</option>
                        <option value="end">Finish</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className={`${themeStyles.panelButton} ${shareCalloutValue.trim() ? '' : 'pointer-events-none opacity-50'}`}
                        onClick={handleApplyCallout}
                        disabled={!shareCalloutValue.trim()}
                      >
                        Place callout
                      </button>
                      {shareCalloutStatus && (
                        <span
                          role="status"
                          aria-live="polite"
                          className={`text-[11px] font-semibold ${getFeedbackToneClass(shareCalloutStatus.tone)}`}
                        >
                          {shareCalloutStatus.message}
                        </span>
                      )}
                    </div>
                  </section>
                  {shareLocationCodes.length > 0 && (
                    <section className={`${themeStyles.layerOption} flex flex-col gap-2`}>
                      <div>
                        <p className="text-[12px] font-semibold leading-tight">Location codes</p>
                        <p className={themeStyles.layerOptionDescription}>
                          Geohash references &asymp;5&nbsp;m accuracy for quick callouts.
                        </p>
                      </div>
                      <ul className="flex flex-col gap-1 text-[11px] font-mono">
                        {shareLocationCodes.map((entry) => (
                          <li key={entry.key} className="flex flex-col">
                            <span className="font-semibold uppercase tracking-wide text-[10px] opacity-70">
                              {entry.label}
                            </span>
                            <span>{entry.code}</span>
                            <span className="opacity-60">{formatLocation(entry.position)}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">Toolbar theme</span>
                    <button
                      type="button"
                      className={themeStyles.panelToggle}
                      onClick={handleToolbarThemeChange}
                    >
                      {toolbarTheme === 'light' ? 'Light' : 'Night'}
                    </button>
                  </div>
                  <div>
                    <span className="font-medium">Map layers</span>
                    <p className="text-[11px] opacity-70">Choose the basemap that suits your mission.</p>
                    <div className={`${themeStyles.layerScroll} mt-2`}>
                      {layerOptions.map((provider) => {
                        const isSelected = provider.id === baseLayer;
                        return (
                          <button
                            key={provider.id}
                            type="button"
                            className={`${themeStyles.layerOption} ${isSelected ? themeStyles.layerOptionActive : ''}`}
                            onClick={() => handleBaseLayerToggle(provider.id)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-[12px] font-semibold leading-tight">{provider.label}</p>
                                {provider.category && (
                                  <p className={themeStyles.layerOptionCategory}>{provider.category}</p>
                                )}
                              </div>
                              {isSelected && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-500">Current</span>
                              )}
                            </div>
                            <p className={themeStyles.layerOptionDescription}>{provider.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-medium">Cache imagery</span>
                      <p className="text-[11px] opacity-70">Download tiles within 2&nbsp;km</p>
                    </div>
                    <button
                      type="button"
                      className={`${themeStyles.panelButton} ${cacheDisabled ? 'opacity-60 pointer-events-none' : ''}`}
                      onClick={handlePrefetchTiles}
                      disabled={cacheDisabled}
                    >
                      {cacheButtonLabel}
                    </button>
                  </div>
                  <section className={`${themeStyles.layerOption} flex flex-col gap-2`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-semibold leading-tight">Share this route</p>
                        <p className={themeStyles.layerOptionDescription}>
                          switch to the share view to copy or import a route.
                        </p>
                      </div>
                      <button
                        type="button"
                        className={themeStyles.panelButton}
                        onClick={handleOpenShareView}
                      >
                        Open
                      </button>
                    </div>
                    <p className={themeStyles.layerOptionDescription}>
                      {shareSummaryText ?? 'Add at least one waypoint to enable route sharing.'}
                    </p>
                  </section>
                  <button
                    type="button"
                    className={themeStyles.panelButton}
                    onClick={handleCenterOnUser}
                  >
                    Center map on my location
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {statusMessages.length > 0 && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 flex w-[min(90vw,18rem)] -translate-x-1/2 flex-col gap-2">
          {statusMessages.map((message) => {
            const toneClass =
              message.tone === 'emerald'
                ? 'border-emerald-500 text-emerald-100'
                : 'border-sky-500 text-sky-200';
            return (
              <div
                key={message.key}
                className={`rounded-lg border bg-slate-950 p-3 text-center text-sm font-semibold shadow-lg shadow-slate-950 ${toneClass}`}
              >
                {message.text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MapView;
