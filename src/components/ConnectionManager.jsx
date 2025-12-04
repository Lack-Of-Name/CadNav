import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { useP2PStore } from '../hooks/useP2PStore';

const QRScanner = ({ onScan, onClose }) => {
  const [error, setError] = useState(null);
  const scannerRef = useRef(null);

  useEffect(() => {
    // Wait for the element to be available in the DOM
    const timer = setTimeout(() => {
        if (!document.getElementById("reader")) return;

        const html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;
        
        const startScanner = async () => {
            try {
                await html5QrCode.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 250, height: 250 } },
                    (decodedText) => {
                        onScan(decodedText);
                        // Stop scanning after successful scan
                        html5QrCode.stop().catch(console.error);
                    },
                    (errorMessage) => {
                        // parse error, ignore it.
                    }
                );
            } catch (err) {
                console.error("Failed to start scanner", err);
                setError("Camera access denied or unavailable. Please ensure you are using HTTPS and have granted camera permissions.");
            }
        };

        startScanner();
    }, 100);

    return () => {
        clearTimeout(timer);
        if (scannerRef.current && scannerRef.current.isScanning) {
            scannerRef.current.stop().catch(console.error).finally(() => {
                scannerRef.current.clear();
            });
        }
    };
  }, [onScan]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-[10000]">
            <h3 className="text-white font-bold text-lg">Scan Session Code</h3>
            <button 
                onClick={onClose} 
                className="bg-slate-800/80 text-white p-3 rounded-full hover:bg-slate-700 border border-slate-600 backdrop-blur-sm"
                aria-label="Close Camera"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>

        <div className="w-full max-w-lg px-4 relative">
            {error ? (
                <div className="bg-red-900/20 border border-red-500/50 text-red-400 p-6 rounded-lg text-center backdrop-blur-sm">
                    <p className="mb-2 font-bold text-lg">Camera Error</p>
                    <p className="text-sm">{error}</p>
                    <button onClick={onClose} className="mt-6 px-6 py-2 bg-slate-800 rounded border border-slate-700 text-white">Close</button>
                </div>
            ) : (
                <div className="relative rounded-xl overflow-hidden border-2 border-slate-700 shadow-2xl bg-black">
                    <div id="reader" className="w-full h-[400px] bg-black"></div>
                    <div className="absolute inset-0 pointer-events-none border-[30px] border-black/30"></div>
                </div>
            )}
        </div>

        <p className="text-slate-400 mt-8 text-sm font-medium text-center px-4">
            Point camera at the HQ Session QR Code
        </p>
    </div>,
    document.body
  );
};

export const ConnectionManager = () => {
  const { 
    connectionStatus, 
    roomId,
    initializeReceiver,
    connectToReceiver,
    logs, 
    sendMessage,
    cleanup,
    reconnect,
    peers,
    myColor,
    clearLogs
  } = useP2PStore();

  const [remoteInput, setRemoteInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [activeTab, setActiveTab] = useState('receiver'); // 'receiver' or 'sender'
  const [showScanner, setShowScanner] = useState(false);
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(roomId);
    alert('ID copied to clipboard!');
  };

  const handleStartReceiver = () => {
    initializeReceiver();
  };

  const handleConnect = () => {
    if (!remoteInput) return;
    connectToReceiver(remoteInput);
  };

  const handleScan = (decodedText) => {
      setRemoteInput(decodedText);
      setShowScanner(false);
      connectToReceiver(decodedText);
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (messageInput) {
      sendMessage(messageInput);
      setMessageInput('');
    }
  };

  const connectedPeersCount = Object.keys(peers).length;

  return (
    <div className="p-4 bg-slate-900 text-slate-100 rounded-lg shadow-md max-w-md mx-auto mt-4 border border-slate-800">
      <h2 className="text-xl font-bold mb-4 text-slate-100">P2P Connection Manager</h2>
      
      <div className="mb-4 flex flex-col gap-2">
        {!window.isSecureContext && (
            <div className="bg-rose-900/20 border border-rose-500/50 text-rose-400 p-2 rounded text-xs text-center">
                <strong>Warning:</strong> Insecure connection (HTTP). P2P features require HTTPS or localhost.
            </div>
        )}
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-sm font-semibold ${
                    connectionStatus === 'connected' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 
                    connectionStatus === 'connecting' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' : 
                    connectionStatus === 'reconnecting' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' :
                    'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                Status: {connectionStatus}
                </span>
                {connectionStatus === 'connected' && (
                    <span className="text-xs text-slate-400">({connectedPeersCount} peer{connectedPeersCount !== 1 ? 's' : ''})</span>
                )}
            </div>
            <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: myColor }} title="My Color"></div>
                {connectionStatus !== 'disconnected' && (
                    <div className="flex gap-2">
                        {connectionStatus === 'reconnecting' && (
                            <button onClick={reconnect} className="text-sm text-sky-400 hover:text-sky-300 underline">Retry</button>
                        )}
                        <button onClick={cleanup} className="text-sm text-rose-400 hover:text-rose-300 underline">Disconnect</button>
                    </div>
                )}
            </div>
        </div>
        
        {/* Peer List */}
        {connectedPeersCount > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
                {Object.values(peers).map(peer => (
                    <div key={peer.id} className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded border border-slate-700 text-xs">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: peer.color || '#ccc' }}></div>
                        <span className="text-slate-300" title={peer.id}>{peer.id.substring(0, 6)}</span>
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
        Receiver (HQ)
        </button>
        <button 
        className={`pb-2 transition-colors ${activeTab === 'sender' ? 'border-b-2 border-sky-500 font-bold text-sky-400' : 'text-slate-400 hover:text-slate-200'}`}
        onClick={() => setActiveTab('sender')}
        >
        Sender (Field)
        </button>
      </div>

      {/* RECEIVER FLOW */}
      {activeTab === 'receiver' && (
        <div>
          <button 
            onClick={handleStartReceiver}
            className="w-full bg-sky-600 text-white py-2 rounded hover:bg-sky-500 transition font-semibold mb-4"
            disabled={connectionStatus !== 'disconnected'}
          >
            {connectionStatus === 'disconnected' ? 'Start Session' : 'Session Active'}
          </button>

          {connectionStatus === 'connecting' && !roomId && (
             <div className="flex flex-col items-center justify-center py-8 space-y-4">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
               <p className="text-slate-400 text-sm">Initializing Session...</p>
             </div>
          )}

          {roomId && (
            <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="bg-amber-500/10 p-3 rounded border border-amber-500/30 text-sm text-amber-200">
                Share this <strong>Session Code</strong> with field agents
              </div>
              <div className="flex justify-center bg-white p-4 rounded-lg">
                <QRCodeSVG value={roomId} size={192} />
              </div>
              <div className="flex gap-2">
                <input 
                    readOnly 
                    value={roomId} 
                    className="flex-1 p-2 text-center text-lg font-bold tracking-widest border border-slate-700 rounded bg-slate-950 text-sky-400 font-mono focus:outline-none"
                />
                <button onClick={copyToClipboard} className="px-4 border border-slate-600 rounded hover:bg-slate-800 text-slate-300 transition">
                    Copy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SENDER FLOW */}
      {activeTab === 'sender' && (
        <div>
           {connectionStatus === 'disconnected' && (
             <div className="space-y-4">
                <div className="bg-amber-500/10 p-3 rounded border border-amber-500/30 text-sm text-amber-200">
                  Enter the <strong>Session Code</strong> from HQ
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
                  Connect to HQ
                </button>
             </div>
           )}

           {connectionStatus === 'connecting' && (
             <div className="flex flex-col items-center justify-center py-8 space-y-4">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
               <p className="text-slate-400 text-sm">Connecting to HQ...</p>
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
