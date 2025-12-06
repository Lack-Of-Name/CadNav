import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { useServerLinkStore } from '../hooks/useServerLinkStore';
import { useCheckpoints, useCheckpointsStore } from '../hooks/useCheckpoints';
import { ROUTE_SHARE_VERSION } from '../utils/routeUtils';

const QRScanner = ({ onScan, onClose }) => {
  const scannerRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState('');

  const stopScanner = useCallback(async () => {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.stop();
    } catch (err) {
      // ignore stop errors
    } finally {
      try {
        await scannerRef.current.clear();
      } catch (err) {
        // ignore clear errors
      }
      scannerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const startScanner = async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (!isMounted) return;
        const preferredDevice = devices.find((device) => /back|rear|environment/i.test(device.label || '')) ?? devices[0];
        const cameraConfig = preferredDevice
          ? { deviceId: { exact: preferredDevice.id } }
          : { facingMode: 'environment' };
        const qrbox = Math.min(window.innerWidth, 320);
        const scanner = new Html5Qrcode('qr-reader', { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          cameraConfig,
          { fps: 10, qrbox: { width: qrbox, height: qrbox } },
          async (decodedText) => {
            await stopScanner();
            onScan(decodedText);
          },
          () => {}
        );
      } catch (err) {
        if (!isMounted) return;
        setErrorMessage(err?.message ?? 'Camera unavailable');
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [onScan, stopScanner]);

  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[2000] bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900/70 p-3 text-center text-sm text-slate-300">
        <div id="qr-reader" className="aspect-square w-full overflow-hidden rounded-xl bg-slate-950"></div>
        {errorMessage && <p className="mt-3 text-xs text-rose-300">{errorMessage}</p>}
      </div>
      <button
        onClick={async () => {
          await stopScanner();
          onClose();
        }}
        className="mt-4 w-full max-w-sm rounded-full bg-slate-700 py-2 text-white hover:bg-slate-600"
      >
        Close Camera
      </button>
    </div>,
    portalTarget
  );
};

export const ConnectionManager = () => {
  const {
    connectionStatus,
    sessionId,
    startHostSession,
    joinSession,
    logs,
    sendMessage,
    disconnect,
    peers,
    clearLogs,
    role,
    locationIntervalMs,
    updateLocationInterval,
    hostOnline,
    participantId,
    socketHealthy,
    linkDownSince,
    lastServerContactAt,
    lastLocationPushAt,
    lastClientRoutePushAt,
    pendingLocationQueuedAt,
    routeOffers,
    offerRoutesToClient,
    acknowledgeRouteOffer
  } = useServerLinkStore();

  const [remoteInput, setRemoteInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [activeTab, setActiveTab] = useState('receiver'); // 'receiver' or 'sender'
  const [showScanner, setShowScanner] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(() => Math.round((locationIntervalMs ?? 10000) / 1000));
  const [nowTick, setNowTick] = useState(Date.now());
  const logsContainerRef = useRef(null);
  const [routeOfferTarget, setRouteOfferTarget] = useState(null);
  const [routeOfferSelection, setRouteOfferSelection] = useState([]);
  const [routeOfferNote, setRouteOfferNote] = useState('');
  const [routeOfferSending, setRouteOfferSending] = useState(false);

  const { routes: plannerRoutes, checkpointMap, connectVia } = useCheckpoints();
  const loadRouteSnapshot = useCheckpointsStore((state) => state.loadRouteSnapshot);

  useEffect(() => {
    const container = logsContainerRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 24;
    if (nearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (role === 'client') {
      setActiveTab('sender');
    } else if (role === 'host') {
      setActiveTab('receiver');
    }
  }, [role]);

  useEffect(() => {
    setIntervalSeconds(Math.round((locationIntervalMs ?? 10000) / 1000));
  }, [locationIntervalMs]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const copyToClipboard = () => {
    if (!sessionId) return;
    navigator.clipboard.writeText(sessionId);
    alert('ID copied to clipboard!');
  };

  const handleStartReceiver = () => {
    startHostSession();
  };

  const handleConnect = () => {
    if (!remoteInput) return;
    joinSession(remoteInput);
  };

  const handleScan = useCallback(
    (decodedText) => {
      setRemoteInput(decodedText);
      setShowScanner(false);
      joinSession(decodedText);
    },
    [joinSession]
  );

  const handleSend = (e) => {
    e.preventDefault();
    if (messageInput) {
      sendMessage(messageInput);
      setMessageInput('');
    }
  };
  const peerValues = Object.values(peers ?? {});
  const remotePeers = peerValues.filter((peer) => peer.id !== participantId);
  const remotePeersSorted = [...remotePeers].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const allPeersSorted = [...peerValues].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const connectedPeersCount = remotePeers.filter((peer) => peer.isOnline !== false).length;
  const formatDuration = (deltaSeconds) => {
    if (deltaSeconds < 60) {
      return `${deltaSeconds}s`;
    }
    const minutes = Math.floor(deltaSeconds / 60);
    const seconds = deltaSeconds % 60;
    if (minutes < 60) {
      return `${minutes}m${seconds ? ` ${seconds}s` : ''}`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h${remainingMinutes ? ` ${remainingMinutes}m` : ''}`;
  };

  const formatLastUpdated = (peer) => {
    if (!peer?.updatedAt) {
      return 'No updates yet';
    }
    const deltaSeconds = Math.max(0, Math.floor((nowTick - peer.updatedAt) / 1000));
    return `Last updated ${formatDuration(deltaSeconds)} ago`;
  };

  const formatSince = (timestamp, fallback = 'Never') => {
    if (!timestamp) return fallback;
    const deltaSeconds = Math.max(0, Math.floor((nowTick - timestamp) / 1000));
    return `${formatDuration(deltaSeconds)} ago`;
  };
  const statusBadgeClass =
    connectionStatus === 'connected'
      ? socketHealthy
        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
        : 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
      : connectionStatus === 'connecting'
        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
        : 'bg-slate-800 text-slate-400 border border-slate-700';
  const lastLocationLabel = formatSince(lastLocationPushAt, 'Never');
  const lastRouteLabel = formatSince(lastClientRoutePushAt, 'Never');
  const pendingQueueLabel = pendingLocationQueuedAt ? formatSince(pendingLocationQueuedAt, 'moments ago') : null;
  const shareableRoutes = useMemo(() => {
    if (!Array.isArray(plannerRoutes)) {
      return [];
    }
    return plannerRoutes
      .map((route) => {
        const points = Array.isArray(route.items)
          ? route.items.map((checkpointId) => checkpointMap[checkpointId]).filter((cp) => cp?.position)
          : [];
        return {
          id: route.id,
          name: route.name ?? 'Route',
          color: route.color ?? '#38bdf8',
          pointCount: points.length
        };
      })
      .filter((entry) => entry.pointCount > 0);
  }, [plannerRoutes, checkpointMap]);

  const buildRouteOfferPayload = useCallback(
    (routeIds) => {
      if (!Array.isArray(plannerRoutes) || !Array.isArray(routeIds) || routeIds.length === 0) {
        return [];
      }
      const targetSet = new Set(routeIds);
      return plannerRoutes
        .filter((route) => targetSet.has(route.id))
        .map((route) => {
          const items = Array.isArray(route.items)
            ? route.items
                .map((checkpointId, index) => {
                  const checkpoint = checkpointMap[checkpointId];
                  if (!checkpoint?.position) return null;
                  return {
                    id: checkpoint.id ?? `pt-${index}`,
                    name: checkpoint.name,
                    position: checkpoint.position
                  };
                })
                .filter(Boolean)
            : [];
          if (items.length === 0) return null;
          return {
            id: route.id,
            name: route.name,
            color: route.color,
            items
          };
        })
        .filter(Boolean);
    },
    [plannerRoutes, checkpointMap]
  );

  const resetRouteOfferPanel = useCallback(() => {
    setRouteOfferTarget(null);
    setRouteOfferSelection([]);
    setRouteOfferNote('');
    setRouteOfferSending(false);
  }, []);

  const handleRouteOfferPanel = useCallback(
    (peerId) => {
      if (routeOfferTarget === peerId) {
        resetRouteOfferPanel();
        return;
      }
      const defaults = shareableRoutes.map((route) => route.id);
      setRouteOfferTarget(peerId);
      setRouteOfferSelection(defaults);
      setRouteOfferNote(defaults.length === 0 ? 'Add checkpoints to a route before sharing.' : '');
      setRouteOfferSending(false);
    },
    [routeOfferTarget, shareableRoutes, resetRouteOfferPanel]
  );

  const handleToggleRouteSelection = useCallback((routeId) => {
    setRouteOfferSelection((previous) =>
      previous.includes(routeId) ? previous.filter((id) => id !== routeId) : [...previous, routeId]
    );
  }, []);

  const handleSendRouteOffer = useCallback(() => {
    if (!routeOfferTarget) return;
    const payload = buildRouteOfferPayload(routeOfferSelection);
    if (payload.length === 0) {
      setRouteOfferNote('Select at least one route with checkpoints to share.');
      return;
    }
    setRouteOfferSending(true);
    const result = offerRoutesToClient(routeOfferTarget, payload, { connectVia });
    setRouteOfferSending(false);
    if (result?.ok) {
      setRouteOfferNote('Routes dispatched. Waiting for confirmation…');
      setTimeout(() => {
        resetRouteOfferPanel();
      }, 1200);
    } else {
      setRouteOfferNote('Unable to reach the relay. Try again shortly.');
    }
  }, [routeOfferTarget, routeOfferSelection, buildRouteOfferPayload, offerRoutesToClient, connectVia, resetRouteOfferPanel]);

  const buildSnapshotFromOffer = useCallback((routes, connectMode) => {
    if (!Array.isArray(routes) || routes.length === 0) {
      return null;
    }
    const checkpoints = [];
    const keyToIndex = new Map();
    const normalizedRoutes = routes.map((route, routeIndex) => {
      const indices = [];
      (route.items ?? []).forEach((item) => {
        const lat = Number(item?.position?.lat);
        const lng = Number(item?.position?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return;
        }
        const key = `${lat.toFixed(6)}:${lng.toFixed(6)}`;
        if (!keyToIndex.has(key)) {
          keyToIndex.set(key, checkpoints.length);
          checkpoints.push({ lat, lng });
        }
        indices.push(keyToIndex.get(key));
      });
      return {
        name: route.name ?? `Route ${routeIndex + 1}`,
        color: route.color ?? null,
        isVisible: true,
        indices
      };
    });
    if (checkpoints.length === 0) {
      return null;
    }
    return {
      version: ROUTE_SHARE_VERSION,
      connectVia: connectMode === 'route' ? 'route' : 'direct',
      checkpoints,
      routes: normalizedRoutes
    };
  }, []);

  const handleAcceptOffer = useCallback(
    (offerId) => {
      const payload = acknowledgeRouteOffer(offerId, true);
      if (!payload?.routes?.length) {
        return;
      }
      const snapshot = buildSnapshotFromOffer(payload.routes, payload.connectVia);
      if (snapshot) {
        loadRouteSnapshot(snapshot);
      }
    },
    [acknowledgeRouteOffer, buildSnapshotFromOffer, loadRouteSnapshot]
  );

  const handleDeclineOffer = useCallback(
    (offerId) => {
      acknowledgeRouteOffer(offerId, false);
    },
    [acknowledgeRouteOffer]
  );

  return (
    <div className="p-4 bg-slate-900 text-slate-100 rounded-lg shadow-md max-w-md mx-auto mt-4 border border-slate-800">
      <h2 className="text-xl font-bold mb-4 text-slate-100">Server Connection Manager</h2>
      
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-sm font-semibold ${statusBadgeClass}`}>
                Status: {connectionStatus}
                {connectionStatus === 'connected' && !socketHealthy ? ' (retrying…)': ''}
                </span>
                {connectionStatus === 'connected' && (
                  <span className="text-xs text-slate-400">({connectedPeersCount} active)</span>
                )}
            </div>
            <div className="flex items-center gap-2">
                {connectionStatus !== 'disconnected' && (
                    <button onClick={disconnect} className="text-sm text-rose-400 hover:text-rose-300 underline">Disconnect</button>
                )}
            </div>
        </div>

        {!hostOnline && role === 'client' && connectionStatus === 'connected' && (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            HQ link is offline. Your updates stay queued until the host reconnects.
          </div>
        )}

        {connectionStatus === 'connected' && !socketHealthy && (
          <div className="rounded border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Attempting to reach the relay… last contact {formatSince(lastServerContactAt, 'never')}
            {linkDownSince && (
              <>
                {' (offline for '}
                {formatDuration(Math.max(0, Math.floor((nowTick - linkDownSince) / 1000)))}
                {')'}
              </>
            )}.
          </div>
        )}
        
        {/* Peer List */}
        {remotePeersSorted.length > 0 && (
          role === 'host' ? (
            <div className="mt-2 space-y-2">
              {remotePeersSorted.map((peer) => (
                <div key={peer.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: peer.color || '#ccc' }}></div>
                      <div>
                        <p className="text-sm font-semibold text-slate-100" title={peer.id}>{peer.label ?? peer.id}</p>
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">
                          {peer.isOnline === false ? 'Offline' : 'Online'}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">{formatLastUpdated(peer)}</p>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRouteOfferPanel(peer.id)}
                      className="text-[11px] font-semibold text-sky-300 underline-offset-2 hover:text-sky-200 disabled:opacity-40"
                      disabled={shareableRoutes.length === 0}
                    >
                      Push route(s)
                    </button>
                  </div>
                  {routeOfferTarget === peer.id && (
                    <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200">
                      {shareableRoutes.length === 0 ? (
                        <p className="text-slate-400">Create a route with checkpoints before sharing.</p>
                      ) : (
                        <div className="space-y-2">
                          {shareableRoutes.map((route) => (
                            <label key={route.id} className="flex items-center justify-between gap-2 text-slate-200">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="accent-sky-500"
                                  checked={routeOfferSelection.includes(route.id)}
                                  onChange={() => handleToggleRouteSelection(route.id)}
                                />
                                <span>{route.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-500">{route.pointCount} pts</span>
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={handleSendRouteOffer}
                          disabled={routeOfferSending || shareableRoutes.length === 0}
                          className="flex-1 rounded-lg bg-sky-600 px-3 py-1.5 text-white font-semibold hover:bg-sky-500 disabled:opacity-50"
                        >
                          {routeOfferSending ? 'Sending…' : 'Send routes'}
                        </button>
                        <button
                          type="button"
                          onClick={resetRouteOfferPanel}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:border-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                      {routeOfferNote && (
                        <p className="mt-2 text-[11px] text-slate-400">{routeOfferNote}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 mt-1">
              {allPeersSorted.map((peer) => (
                <div
                  key={peer.id}
                  className={`flex items-center gap-1 bg-slate-800 px-2 py-1 rounded border text-xs ${
                    peer.isOnline === false ? 'border-slate-800 text-slate-500 opacity-60' : 'border-slate-700 text-slate-300'
                  }`}
                  title={formatLastUpdated(peer)}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: peer.color || '#ccc' }}></div>
                  <span className="text-slate-300" title={peer.id}>
                    {peer.label ?? peer.id.substring(0, 6)}
                  </span>
                </div>
              ))}
            </div>
          )
        )}

        {role === 'client' && connectionStatus === 'connected' && (
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <span className="uppercase tracking-wide text-[10px] text-slate-500">Location uplink</span>
              <span className="font-semibold text-slate-100">{lastLocationLabel}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="uppercase tracking-wide text-[10px] text-slate-500">Route sync</span>
              <span className="font-semibold text-slate-100">{lastRouteLabel}</span>
            </div>
            {!socketHealthy && pendingQueueLabel && (
              <p className="mt-2 text-[11px] text-amber-200">
                Latest fix queued {pendingQueueLabel}. We will resend automatically when the link returns.
              </p>
            )}
          </div>
        )}

        {role === 'client' && Array.isArray(routeOffers) && routeOffers.length > 0 && (
          <div className="mt-3 space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
              <span>Incoming routes</span>
              <span className="text-slate-300">{routeOffers.length}</span>
            </div>
            {routeOffers.map((offer) => {
              const pointCount = (offer.routes ?? []).reduce(
                (sum, route) => sum + ((route.items ?? []).length || 0),
                0
              );
              return (
                <div
                  key={offer.offerId}
                  className="rounded-lg border border-slate-800/80 bg-slate-950/70 p-3 text-xs text-slate-100"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-100">HQ route drop</p>
                      <p className="text-[11px] text-slate-400">
                        {offer.routes?.length ?? 0} route{offer.routes?.length === 1 ? '' : 's'} • {pointCount}{' '}
                        point{pointCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-500">{formatSince(offer.createdAt, 'just now')}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(offer.routes ?? []).map((route) => (
                      <span
                        key={`${offer.offerId}-${route.id}`}
                        className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300"
                      >
                        {route.name ?? 'Route'}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleAcceptOffer(offer.offerId)}
                      className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-white font-semibold hover:bg-emerald-500"
                    >
                      Accept & import
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeclineOffer(offer.offerId)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:border-slate-500"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* TABS */}
      <div className="flex space-x-4 mb-6 border-b border-slate-700 pb-2">
        <button 
        className={`pb-2 transition-colors ${activeTab === 'receiver' ? 'border-b-2 border-sky-500 font-bold text-sky-400' : 'text-slate-400 hover:text-slate-200'}`}
        onClick={() => setActiveTab('receiver')}
        >
        Receiver (Host)
        </button>
        <button 
        className={`pb-2 transition-colors ${activeTab === 'sender' ? 'border-b-2 border-sky-500 font-bold text-sky-400' : 'text-slate-400 hover:text-slate-200'}`}
        onClick={() => setActiveTab('sender')}
        >
        Sender (Field)
        </button>
      </div>

      {/* HOST FLOW */}
      {activeTab === 'receiver' && (
        <div>
          <button 
            onClick={handleStartReceiver}
            className="w-full bg-sky-600 text-white py-2 rounded hover:bg-sky-500 transition font-semibold mb-4"
            disabled={connectionStatus !== 'disconnected'}
          >
            {connectionStatus === 'disconnected' ? 'Create Room' : 'Room Active'}
          </button>

          {connectionStatus === 'connecting' && !sessionId && (
             <div className="flex flex-col items-center justify-center py-8 space-y-4">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
               <p className="text-slate-400 text-sm">Initializing Session...</p>
             </div>
          )}

          {sessionId && (
            <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="bg-amber-500/10 p-3 rounded border border-amber-500/30 text-sm text-amber-200">
                Share this <strong>Room Code</strong> with field devices
              </div>
              <div className="flex justify-center bg-white p-4 rounded-lg">
                <QRCodeSVG value={sessionId} size={192} />
              </div>
              <div className="flex gap-2">
                <input 
                    readOnly 
                    value={sessionId} 
                    className="flex-1 p-2 text-center text-lg font-bold tracking-widest border border-slate-700 rounded bg-slate-950 text-sky-400 font-mono focus:outline-none"
                />
                <button onClick={copyToClipboard} className="px-4 border border-slate-600 rounded hover:bg-slate-800 text-slate-300 transition">
                    Copy
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
                  <span>Field update cadence</span>
                  <span className="font-semibold text-slate-200">{intervalSeconds}s</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="120"
                  step="5"
                  value={intervalSeconds}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setIntervalSeconds(next);
                    updateLocationInterval(next);
                  }}
                  className="mt-3 w-full accent-sky-500"
                  disabled={role !== 'host'}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Senders only transmit location/routes upstream. HQ receives every {intervalSeconds} seconds (5–120s).
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FIELD FLOW */}
      {activeTab === 'sender' && (
        <div>
           {connectionStatus === 'disconnected' && (
             <div className="space-y-4">
                <div className="bg-amber-500/10 p-3 rounded border border-amber-500/30 text-sm text-amber-200">
                  Enter the <strong>Room Code</strong> from HQ
                </div>
                
                <div className="flex gap-2">
                    <input 
                    placeholder="Enter Code" 
                    value={remoteInput}
                    onChange={(e) => setRemoteInput(e.target.value.toUpperCase())}
                    className="flex-1 p-2 text-lg font-mono border border-slate-700 rounded bg-slate-950 text-slate-100 focus:border-sky-500 focus:outline-none"
                    />
                    <button 
                        onClick={() => setShowScanner(true)}
                        className="px-3 bg-slate-700 text-white rounded hover:bg-slate-600 transition"
                        title="Scan QR Code"
                    >
                        📷
                    </button>
                </div>

                <button 
                  onClick={handleConnect}
                  className="w-full bg-emerald-600 text-white py-2 rounded hover:bg-emerald-500 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!remoteInput}
                >
                  Join Room
                </button>
             </div>
           )}

           {connectionStatus === 'connecting' && (
             <div className="flex flex-col items-center justify-center py-8 space-y-4">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
               <p className="text-slate-400 text-sm">Connecting to host...</p>
             </div>
           )}

        </div>
      )}

      {showScanner && <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      {/* CONNECTED STATE */}
      {connectionStatus === 'connected' && (
        <div className="mt-4">
          <form onSubmit={handleSend} className="flex gap-2">
            <input 
              type="text" 
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 border border-slate-700 bg-slate-950 text-slate-100 rounded px-2 py-1 focus:border-sky-500 focus:outline-none"
            />
            <button type="submit" className="bg-sky-600 text-white px-4 py-1 rounded hover:bg-sky-500 transition">Send</button>
          </form>
        </div>
      )}

      {/* LOGS */}
      <div className="mt-6 border-t border-slate-700 pt-2">
        <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-bold text-slate-500">Connection Logs</h3>
            <button onClick={clearLogs} className="text-[10px] text-slate-500 hover:text-slate-300 underline">Clear</button>
        </div>
        <div
          ref={logsContainerRef}
          className="h-32 overflow-y-auto bg-slate-950 p-2 text-xs font-mono rounded border border-slate-800"
        >
          {logs.length === 0 && <span className="text-slate-600">No logs yet...</span>}
          {logs.map((log, i) => {
            const isMessage = log.type === 'message-received' || log.type === 'message-sent';
            const colorClass = log.type === 'message-received' ? 'text-sky-400' : 
                               log.type === 'message-sent' ? 'text-emerald-400' : 
                               log.type === 'error' ? 'text-rose-400' :
                               'text-slate-400';
            
            return (
                <div key={i} className={`${colorClass} ${isMessage ? 'font-bold' : ''}`}>
                    <span className="opacity-50 mr-2">[{log.time}]</span>
                    {log.message}
                </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
