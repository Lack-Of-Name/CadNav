import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttributionControl, MapContainer, Marker, Polyline, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCheckpoints } from '../hooks/useCheckpoints.js';

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
  const activeStyles = buttonTheme.active ?? 'border-sky-500 bg-sky-200/95 text-slate-900 focus-visible:ring-sky-400';
  const idleStyles = buttonTheme.idle ?? 'border-slate-300 bg-slate-100/95 text-slate-900 hover:border-slate-400 hover:bg-slate-200/90 focus-visible:ring-slate-500/50';
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
          className={`h-5 w-5 object-contain ${iconClassName}`}
          style={iconStyle ?? undefined}
          aria-hidden="true"
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
    container: 'pointer-events-auto flex flex-col gap-2 rounded-3xl border border-slate-200 bg-slate-100/95 p-2 text-slate-900 backdrop-blur-sm',
    badge: 'rounded-full border border-slate-300 bg-slate-100/95 px-3 py-1 text-[10px] font-semibold text-slate-700',
    button: {
      base: 'flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400/40 focus-visible:ring-offset-slate-100/60',
      active: 'border-sky-500 bg-sky-200/95 text-slate-900',
      idle: 'border-slate-300 bg-slate-100/95 text-slate-900 hover:border-slate-400 hover:bg-slate-200/90',
      disabled: 'opacity-60 pointer-events-none'
    },
    panel: 'pointer-events-auto w-60 rounded-3xl border border-slate-200 bg-slate-100/95 p-4 text-slate-900 backdrop-blur-md',
    panelTitle: 'text-[11px] font-semibold uppercase tracking-wide text-slate-500',
    panelButton: 'rounded-xl border border-slate-300 bg-white/80 px-3 py-1.5 text-[12px] font-semibold text-slate-900 transition hover:border-sky-400 hover:bg-sky-100/80',
    panelToggle: 'rounded-xl border border-slate-300 bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-slate-900 transition hover:border-sky-400 hover:bg-sky-100/80',
    layerScroll: 'flex max-h-60 flex-col gap-2 overflow-y-auto pr-1',
    layerOption: 'flex flex-col gap-1 rounded-2xl border border-slate-300 bg-white/90 px-3 py-2 text-left transition hover:border-sky-400 hover:bg-sky-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40',
    layerOptionActive: 'border-sky-500 bg-sky-100/90 text-slate-900 shadow-inner shadow-sky-200/60',
    layerOptionDescription: 'text-[11px] text-slate-500 leading-snug',
    layerOptionCategory: 'text-[10px] font-semibold uppercase tracking-wide text-slate-400',
    iconStyle: null,
    iconClass: ''
  },
  dark: {
    container: 'pointer-events-auto flex flex-col gap-2 rounded-3xl border border-slate-700 bg-[#0b1224]/92 p-2 text-slate-100 backdrop-blur-sm',
    badge: 'rounded-full border border-slate-600 bg-[#0f1b38]/90 px-3 py-1 text-[10px] font-semibold text-slate-200',
    button: {
      base: 'flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-200/30 focus-visible:ring-offset-[#0b1224]/40',
      active: 'border-sky-400 bg-sky-500/25 text-sky-100',
      idle: 'border-slate-600 bg-[#0d172e]/85 text-slate-100 hover:border-slate-400 hover:bg-[#15213f]/90',
      disabled: 'opacity-50 pointer-events-none'
    },
    panel: 'pointer-events-auto w-60 rounded-3xl border border-slate-700 bg-[#080f1e]/95 p-4 text-slate-100 backdrop-blur-md',
    panelTitle: 'text-[11px] font-semibold uppercase tracking-wide text-slate-400',
    panelButton: 'rounded-xl border border-slate-600 bg-[#111b33]/85 px-3 py-1.5 text-[12px] font-semibold text-slate-100 transition hover:border-sky-400 hover:bg-[#1d2b4e]',
    panelToggle: 'rounded-xl border border-slate-500 bg-[#0f1b38]/85 px-3 py-1.5 text-[12px] font-semibold text-slate-100 transition hover:border-sky-400 hover:bg-[#1a2a4d]',
    layerScroll: 'flex max-h-60 flex-col gap-2 overflow-y-auto pr-1',
    layerOption: 'flex flex-col gap-1 rounded-2xl border border-slate-600 bg-[#101d39]/85 px-3 py-2 text-left transition hover:border-sky-400 hover:bg-[#16254a]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200/30',
    layerOptionActive: 'border-sky-400 bg-[#1e335d]/90 text-sky-100 shadow-inner shadow-sky-900/40',
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
  isMenuOpen = false
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
    toggleConnectMode
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
  const cacheStatusTimeoutRef = useRef(null);
  const tileFailureRef = useRef(0);
  const latestUserLocationRef = useRef(null);

  const tileProvider = tileProviders[baseLayer] ?? tileProviders.street;
  const themeStyles = toolbarThemes[toolbarTheme] ?? toolbarThemes.light;
  const mapThemeClass = toolbarTheme === 'dark' ? 'map-theme-dark' : 'map-theme-light';
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
    setIsSettingsOpen((current) => {
      const next = !current;
      if (!current || !next) {
        setSettingsView('settings');
      }
      return next;
    });
  }, [setIsSettingsOpen, setSettingsView]);

  const handleOpenHelpView = useCallback(() => {
    setSettingsView('help');
    setIsSettingsOpen(true);
  }, [setIsSettingsOpen, setSettingsView]);

  const handleToolbarThemeChange = useCallback(() => {
    if (typeof onToolbarThemeToggle === 'function') {
      onToolbarThemeToggle();
    }
  }, [onToolbarThemeToggle]);

  const handleCenterOnUser = useCallback(() => {
    if (latestUserLocationRef.current || userLocation) {
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

  const settingsToggleClass = useMemo(
    () =>
      `${themeStyles.panelToggle} ${
        settingsView === 'settings'
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
        center={userLocation ? [userLocation.lat, userLocation.lng] : defaultPosition}
        zoom={13}
        className={`h-full w-full ${mapThemeClass}`}
        preferCanvas
        attributionControl={false}
        whenCreated={(mapInstance) => {
          mapRef.current = mapInstance;
          mapInstance.getContainer().classList.add('mapview-attribution-offset');
          setIsMapReady(true);
        }}
      >
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
            eventHandlers={{
              click: () => selectCheckpoint('start')
            }}
          />
        )}

        {end && (
          <Marker
            position={[end.position.lat, end.position.lng]}
            icon={endIcon}
            eventHandlers={{
              click: () => selectCheckpoint('end')
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
              ? 'border-emerald-300 bg-emerald-100/95 text-emerald-900'
              : cacheStatus.tone === 'warning'
                ? 'border-amber-300 bg-amber-100/95 text-amber-900'
                : cacheStatus.tone === 'error'
                  ? 'border-rose-300 bg-rose-100/95 text-rose-900'
                  : 'border-sky-300 bg-sky-100/95 text-slate-900'
          }`}
        >
          {cacheStatus.message}
        </div>
      )}

      <div
        className="pointer-events-none absolute z-[990] flex flex-col items-end gap-3"
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

      {isSettingsOpen && (
        <div className="pointer-events-auto fixed inset-0 z-[1180] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 rounded-none border-0 bg-slate-950/45 backdrop-blur-sm"
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
            aria-label={settingsView === 'help' ? 'Map help' : 'Map settings'}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={themeStyles.panelTitle}>
                {settingsView === 'help' ? 'Help' : 'Settings'}
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

      {selectedId && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 w-64 -translate-x-1/2 rounded-lg bg-slate-900/80 p-3 text-center text-sm font-semibold text-sky-200 shadow-lg shadow-slate-950">
          Selected: {selectedId === 'start' ? 'Start' : selectedId === 'end' ? 'End' : 'Checkpoint'}
        </div>
      )}
    </div>
  );
};

export default MapView;
