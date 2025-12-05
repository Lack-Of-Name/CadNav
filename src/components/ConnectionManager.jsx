import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { useServerLinkStore } from '../hooks/useServerLinkStore';

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
    hostOnline
  } = useServerLinkStore();

  const [remoteInput, setRemoteInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [activeTab, setActiveTab] = useState('receiver'); // 'receiver' or 'sender'
  const [showScanner, setShowScanner] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(() => Math.round((locationIntervalMs ?? 10000) / 1000));
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  const connectedPeersCount = Object.keys(peers).length;
  const statusBadgeClass =
    connectionStatus === 'connected'
      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
      : connectionStatus === 'connecting'
        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
        : connectionStatus === 'reconnecting'
          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50'
          : 'bg-slate-800 text-slate-400 border border-slate-700';

  return (
    <div className="p-4 bg-slate-900 text-slate-100 rounded-lg shadow-md max-w-md mx-auto mt-4 border border-slate-800">
      <h2 className="text-xl font-bold mb-4 text-slate-100">Server Connection Manager</h2>
      
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-sm font-semibold ${statusBadgeClass}`}>
                Status: {connectionStatus}
                </span>
                {connectionStatus === 'connected' && (
                  <span className="text-xs text-slate-400">({connectedPeersCount} peer{connectedPeersCount !== 1 ? 's' : ''})</span>
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
        
        {/* Peer List */}
        {connectedPeersCount > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
                {Object.values(peers).map(peer => (
                    <div key={peer.id} className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded border border-slate-700 text-xs">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: peer.color || '#ccc' }}></div>
                        <span className="text-slate-300" title={peer.id}>{peer.label ?? peer.id.substring(0, 6)}</span>
                    </div>
                ))}
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

           {connectionStatus === 'reconnecting' && (
             <div className="flex flex-col items-center justify-center py-8 space-y-4">
               <div className="animate-pulse rounded-full h-8 w-8 border-b-2 border-orange-400"></div>
               <p className="text-slate-400 text-sm">Trying to relink...</p>
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
        <div className="h-32 overflow-y-auto bg-slate-950 p-2 text-xs font-mono rounded border border-slate-800">
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
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};
