import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal as TerminalIcon, 
  Settings, 
  Users, 
  ShieldCheck, 
  Zap, 
  Cpu, 
  Network, 
  Bot, 
  Info, 
  Activity,
  ChevronRight,
  Code2,
  Lock,
  Wand2,
  RefreshCw,
  LogOut,
  Plus,
  X,
  Copy,
  Check,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io, Socket } from 'socket.io-client';

const COMMANDS_CATEGORIES = [
  { id: 'general', name: 'General', icon: Wand2, commands: ['menu', 'ping', 'alive', 'owner', 'runtime', 'speed', 'id', 'link', 'deploy', 'deploybot', 'afk', 'reminder'] },
  { id: 'ai', name: 'AI System', icon: Bot, commands: ['ai', 'ask', 'chatgpt', 'chatbot', 'autoreply', 'resetai'] },
  { id: 'admin', name: 'Group Admin', icon: Users, commands: ['add', 'kick', 'promote', 'demote', 'tagall', 'hidetag', 'linkgc', 'mute', 'unmute', 'welcome', 'goodbye'] },
  { id: 'protection', name: 'Protection', icon: ShieldCheck, commands: ['antilink', 'antidelete', 'antibadword', 'banword', 'unbanword', 'antispam', 'antimention', 'antitag', 'warn', 'block', 'unblock'] },
  { id: 'utilities', name: 'Utilities', icon: Zap, commands: ['sticker', 'toimg', 'play', 'translate', 'calc', 'tts', 'shorturl', 'qr', 'readqr', 'vv', 'viewonce', 'answers'] },
  { id: 'owner', name: 'Owner Only', icon: Lock, commands: ['admin', 'addadmin', 'removeadmin', 'broadcast', 'setprefix', 'setmenuimage', 'shutdown', 'userjoin'] },
];

export default function App() {
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState({ uptime: 0, status: 'Active', latency: 0 });
  const [activeTab, setActiveTab] = useState('terminal');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const urlNum = searchParams.get('number') || searchParams.get('num') || searchParams.get('phone');
      if (urlNum) return urlNum.replace(/[^0-9]/g, '');
      const hashNum = window.location.hash.replace(/[^0-9]/g, '');
      if (hashNum && hashNum.length >= 7) return hashNum;
    }
    return localStorage.getItem('techwizard_phoneNumber') || '';
  });
  const [isPairing, setIsPairing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [sessions, setSessions] = useState<{ phoneNumber: string; connected: boolean; connecting?: boolean }[]>([]);
  const [pairingModalNumber, setPairingModalNumber] = useState<string | null>(null);
  const [retryReadyNum, setRetryReadyNum] = useState<string | null>(null);
  const [confirmDisconnectNum, setConfirmDisconnectNum] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{
    type: 'info' | 'warning' | 'success' | 'error';
    text: string;
    actionNumber?: string;
  } | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const fetchStatus = () => {
    fetch('/api/status')
      .then(r => r.json())
      .then(data => {
        if (data && data.sessions) {
          setSessions(data.sessions);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    localStorage.setItem('techwizard_phoneNumber', phoneNumber);
  }, [phoneNumber]);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      fetch('/api/logs')
        .then(r => r.json())
        .then(setLogs)
        .catch(() => {}); // Silent catch for transient errors
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('log', (msg: string) => {
      setLogs(prev => [...prev.slice(-100), msg]);
    });

    newSocket.on('stats', (newStats) => {
      setStats(newStats);
    });

    newSocket.on('pairing-code', (data: any) => {
      const code = typeof data === 'string' ? data : data?.code;
      const pNum = typeof data === 'object' && data?.phoneNumber ? String(data.phoneNumber).replace(/[^0-9]/g, '') : null;
      if (pNum) setPairingModalNumber(pNum);
      if (code) {
        setPairingCode(code);
        setCopiedCode(false);
      }
      setIsPairing(false);
    });

    fetch('/api/logs')
      .then(r => r.json())
      .then(data => {
        setLogs(data);
        setIsConnected(newSocket.connected);
      })
      .catch(() => {});

    fetchStatus();
    const intervalId = setInterval(fetchStatus, 4000);

    return () => {
      newSocket.disconnect();
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handlePair = async (targetNumber?: string, force = false) => {
    const raw = typeof targetNumber === 'string' ? targetNumber : phoneNumber;
    const numToPair = raw.replace(/[^0-9]/g, '');
    if (!numToPair || numToPair.length < 5) {
      setStatusNotice({
        type: 'error',
        text: 'Enter a valid phone number including country code (e.g. 254104634371).'
      });
      return;
    }

    if (typeof targetNumber === 'string') {
      setPhoneNumber(numToPair);
    }

    const shouldForce = force || retryReadyNum === numToPair;
    setIsPairing(true);
    setPairingCode(null);
    setCopiedCode(false);
    setConfirmDisconnectNum(null);

    if (shouldForce) {
      setStatusNotice({
        type: 'info',
        text: `Breaking previous session for +${numToPair} and generating a fresh pairing code...`
      });
    } else {
      setStatusNotice(null);
    }

    try {
      const resp = await fetch(`/api/pair?number=${numToPair}${shouldForce ? '&force=true' : ''}`);
      const text = (await resp.text()).trim();
      if (resp.ok) {
        if (text === 'ALREADY_PAIRED') {
          setRetryReadyNum(numToPair);
          setStatusNotice({
            type: 'warning',
            text: `+${numToPair} is already deployed. Click "Break Session & Re-Pair" (or click LINK again) to reset the old session and get a new pairing code.`,
            actionNumber: numToPair
          });
        } else if (text && text.length >= 6 && !text.includes(' ')) {
          setRetryReadyNum(null);
          setStatusNotice(null);
          setPairingModalNumber(numToPair);
          setPairingCode(text);
        } else {
          setRetryReadyNum(numToPair);
          setStatusNotice({
            type: 'error',
            text: `Unexpected response (${text || 'empty'}). Try Break Session & Re-Pair.`,
            actionNumber: numToPair
          });
        }
      } else {
        setRetryReadyNum(numToPair);
        setStatusNotice({
          type: 'error',
          text: text || 'Failed to generate pairing code. Retry to break session and re-pair.',
          actionNumber: numToPair
        });
      }
    } catch (e) {
      console.error(e);
      setStatusNotice({
        type: 'error',
        text: 'Network error while requesting pairing code. Check your connection and try again.',
        actionNumber: numToPair
      });
    } finally {
      setIsPairing(false);
      fetchStatus();
    }
  };

  const handleDisconnect = async (targetPhone: string) => {
    const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
    if (!cleanPhone) return;
    setConfirmDisconnectNum(null);
    try {
      const resp = await fetch('/api/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: cleanPhone })
      });
      if (resp.ok) {
        if (retryReadyNum === cleanPhone) setRetryReadyNum(null);
        setStatusNotice({
          type: 'success',
          text: `Session for +${cleanPhone} broken and disconnected cleanly. You can pair it anytime.`
        });
        fetchStatus();
      } else {
        const data = await resp.json().catch(() => ({}));
        setStatusNotice({
          type: 'error',
          text: `Error disconnecting +${cleanPhone}: ${data.error || 'Unknown error'}`
        });
      }
    } catch (e) {
      console.error(e);
      setStatusNotice({
        type: 'error',
        text: 'Network error while requesting disconnection.'
      });
    }
  };

  const handleCopyPairingCode = () => {
    if (!pairingCode) return;
    const clean = String(pairingCode).replace(/[^A-Z0-9]/gi, '').toUpperCase();
    navigator.clipboard?.writeText(clean).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }).catch(() => {});
  };

  const modalSession = pairingModalNumber
    ? sessions.find(s => s.phoneNumber === pairingModalNumber)
    : undefined;

  const formatPairingCode = (code: any) => {
    if (!code) return '';
    const codeStr = String(code);
    const clean = codeStr.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (clean.length === 8) {
      return `${clean.slice(0, 4)}-${clean.slice(4)}`;
    }
    return clean;
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Pairing Code Overlay - Centered on Page */}
      <AnimatePresence>
        {pairingCode && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-white/10 rounded-[3rem] p-8 lg:p-12 max-w-md w-full text-center shadow-2xl relative overflow-hidden"
            >
              {/* Background Glow */}
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-violet-600/20 rounded-full blur-3xl opacity-50" />
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-fuchsia-600/20 rounded-full blur-3xl opacity-50" />

              <button 
                onClick={() => setPairingCode(null)}
                className="absolute top-6 right-6 p-2.5 bg-white/5 rounded-2xl hover:bg-white/10 text-slate-400 hover:text-white transition-all active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl ring-4 ring-white/5 ${
                modalSession?.connected
                  ? 'bg-gradient-to-br from-emerald-500 to-green-700 shadow-emerald-600/40'
                  : 'bg-gradient-to-br from-violet-500 to-violet-700 shadow-violet-600/40'
              }`}>
                {modalSession?.connected ? <Check className="text-white w-10 h-10" /> : <Zap className="text-white w-10 h-10" />}
              </div>
              
              <h2 className="text-2xl font-black text-white italic tracking-tighter mb-1 uppercase">
                {modalSession?.connected ? 'Bot Connected!' : 'Connect Wizard'}
              </h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2">
                {pairingModalNumber ? `+${pairingModalNumber}` : 'Verification Code Required'}
              </p>
              <div className="mb-8">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                  modalSession?.connected
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${modalSession?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-violet-400 animate-pulse'}`} />
                  {modalSession?.connected ? 'Active & Online 24/7' : 'Waiting for WhatsApp Link'}
                </span>
              </div>
              
              <div className="relative group">
                <div className="absolute inset-0 bg-violet-600 blur-3xl opacity-30 group-hover:opacity-50 transition-opacity" />
                <button
                  type="button"
                  onClick={handleCopyPairingCode}
                  className="w-full relative px-6 py-6 bg-black/60 border border-violet-500/30 hover:border-violet-400 rounded-[2rem] shadow-inner flex justify-center items-center transition-all cursor-pointer"
                >
                  <span className="text-3xl sm:text-4xl md:text-5xl font-mono font-black text-white tracking-[0.15em] break-all uppercase whitespace-nowrap">
                    {formatPairingCode(pairingCode)}
                  </span>
                </button>
              </div>
              
              <div className="mt-6 space-y-4">
                <button
                  type="button"
                  onClick={handleCopyPairingCode}
                  className={`w-full py-3.5 rounded-2xl text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all active:scale-95 ${
                    copiedCode
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                      : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30'
                  }`}
                >
                  {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedCode ? 'Copied Code!' : 'Copy Pairing Code'}
                </button>

                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed px-2">
                  Open WhatsApp &gt; <span className="text-violet-400">Linked Devices</span> &gt; <span className="text-violet-400">Link with phone number</span> and enter this code.
                </p>

                <div className="pt-2 flex items-center justify-center gap-3">
                  {pairingModalNumber && !modalSession?.connected && (
                    <button
                      type="button"
                      onClick={() => handlePair(pairingModalNumber, true)}
                      disabled={isPairing}
                      className="px-5 py-3 bg-violet-500/10 border border-violet-500/20 text-[10px] font-black text-violet-300 uppercase tracking-[0.15em] rounded-2xl hover:bg-violet-500/20 transition-all"
                    >
                      New Code
                    </button>
                  )}
                  <button 
                    onClick={() => setPairingCode(null)}
                    className="px-6 py-3 bg-white/5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] rounded-2xl hover:bg-white/10 hover:text-white transition-all"
                  >
                    Close Window
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar navigation - Hidden on mobile */}
      <aside className="hidden lg:flex w-64 border-r border-slate-800 bg-slate-900/50 flex-col items-stretch group transition-all duration-300">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Wand2 className="text-white w-6 h-6" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white uppercase italic">wizard</span>
        </div>

        <nav className="flex-1 mt-6 px-4 space-y-2">
          <NavButton active={activeTab === 'terminal'} onClick={() => setActiveTab('terminal')} icon={TerminalIcon} label="Console" />
          <NavButton active={activeTab === 'commands'} onClick={() => setActiveTab('commands')} icon={Code2} label="Commands" />
          <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={Settings} label="Settings" />
          <NavButton active={activeTab === 'info'} onClick={() => setActiveTab('info')} icon={Info} label="System Info" />
        </nav>

        <div className="px-6 py-4 mx-4 mb-4 bg-violet-600/10 border border-violet-500/20 rounded-2xl text-center">
          <p className="text-[9px] font-black tracking-[0.25em] text-violet-400 uppercase">Made by techwolf</p>
        </div>

        <div className="p-4 border-t border-slate-800">
          <div className="hidden lg:block bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">Server Latency</span>
              <span className="text-green-400 font-mono">{stats.latency}ms</span>
            </div>
            <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
              <motion.div 
                className="bg-violet-500 h-full" 
                initial={{ width: '10%' }} 
                animate={{ width: '45%' }} 
                transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse' }}
              />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden pb-16 lg:pb-0">
        <header className="h-14 lg:h-20 border-b border-slate-800 px-4 lg:px-8 flex items-center justify-between bg-slate-950/80 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-3 lg:gap-4">
            <div className="lg:hidden w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shadow-lg">
              <Wand2 className="text-white w-5 h-5 shadow-inner" />
            </div>
            <div className={`flex items-center gap-2 px-2.5 py-1 ${isConnected ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'} border rounded-full`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider">{isConnected ? 'LIVE' : 'OFFLINE'}</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
              <Activity className="w-3.5 h-3.5" />
              <span>{formatUptime(stats.uptime)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="p-2 text-slate-400 hover:text-white transition-colors">
              <RefreshCw className="w-4 h-4 lg:w-5 h-5" />
            </button>
            <div className="w-px h-4 bg-slate-800 mx-1" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center">
                <Users className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <span className="text-[11px] font-bold tracking-tight text-slate-300">ADMIN</span>
            </div>
          </div>
        </header>

        <div className="flex-1 p-4 lg:p-8 overflow-y-auto terminal-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'terminal' && (
              <motion.div 
                key="terminal"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full flex flex-col gap-4 lg:gap-6"
              >
                {/* Pairing Card - Mobile Optimized */}
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 blur-3xl group-hover:opacity-100 opacity-50 transition-opacity" />
                  <div className="relative bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/5 shadow-2xl overflow-hidden p-6 lg:p-8">
                    <div className="flex flex-col lg:flex-row items-center gap-6 justify-between">
                      <div className="flex items-center gap-4 text-center lg:text-left">
                        <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-violet-700 rounded-2xl flex items-center justify-center shadow-2xl shadow-violet-600/40 ring-4 ring-white/5">
                          <Zap className="text-white w-7 h-7" />
                        </div>
                        <div>
                          <h2 className="text-xl font-black text-white tracking-tight uppercase italic">Pair Device</h2>
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Connect wizard to WhatsApp</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-3">
                        <input 
                          type="text" 
                          placeholder="Phone: 254..." 
                          value={phoneNumber}
                          onChange={(e) => {
                            setPhoneNumber(e.target.value);
                            if (retryReadyNum && e.target.value.replace(/[^0-9]/g, '') !== retryReadyNum) {
                              setRetryReadyNum(null);
                            }
                          }}
                          className="w-full sm:w-64 bg-black/40 border border-white/10 rounded-2xl px-5 py-3 text-sm font-mono focus:ring-2 focus:ring-violet-500 focus:bg-black/60 outline-none transition-all placeholder:text-slate-700"
                        />
                        <button 
                          onClick={() => handlePair()}
                          disabled={isPairing || !phoneNumber}
                          className={`w-full sm:w-auto disabled:opacity-30 px-8 py-3 rounded-2xl text-xs font-black tracking-[0.2em] shadow-xl transition-all active:scale-95 uppercase ${
                            retryReadyNum && retryReadyNum === phoneNumber.replace(/[^0-9]/g, '')
                              ? 'bg-amber-400 text-black hover:bg-amber-300'
                              : 'bg-white text-black hover:bg-violet-500 hover:text-white'
                          }`}
                        >
                          {isPairing
                            ? '...'
                            : (retryReadyNum && retryReadyNum === phoneNumber.replace(/[^0-9]/g, '') ? 'RE-PAIR' : 'LINK')}
                        </button>
                      </div>
                    </div>

                    {statusNotice && (
                      <div className={`mt-5 p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        statusNotice.type === 'warning'
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                          : statusNotice.type === 'error'
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                            : statusNotice.type === 'success'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                              : 'bg-violet-500/10 border-violet-500/30 text-violet-200'
                      }`}>
                        <div className="flex items-start gap-2.5 text-xs font-medium leading-relaxed">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{statusNotice.text}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {statusNotice.actionNumber && (
                            <button
                              type="button"
                              disabled={isPairing}
                              onClick={() => handlePair(statusNotice.actionNumber, true)}
                              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
                            >
                              {isPairing ? 'Resetting...' : 'Break Session & Re-Pair'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setStatusNotice(null)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300"
                            title="Dismiss"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {sessions.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-white/5 w-full">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Active Wizards:</span>
                            <span id="active-bots-counter" className="px-2 py-0.5 rounded-md bg-violet-600/25 border border-violet-500/30 text-violet-400 font-mono text-[10px] font-bold">
                              {sessions.filter(s => s.connected).length} / {sessions.length} Online
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <span>Raw Data Link:</span>
                            <a 
                              id="api-status-link"
                              href="/api/status" 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-violet-400 font-mono hover:underline font-bold"
                            >
                              /api/status
                            </a>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {sessions.map(s => (
                            <div 
                              id={`session-card-${s.phoneNumber}`}
                              key={s.phoneNumber} 
                              className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                                s.connected 
                                  ? 'bg-emerald-500/[0.03] border-emerald-500/10 hover:border-emerald-500/20' 
                                  : 'bg-amber-500/[0.03] border-amber-500/10 hover:border-amber-500/20'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${s.connected ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]' : s.connecting ? 'bg-sky-400 animate-pulse' : 'bg-amber-500'}`} />
                                <div className="flex flex-col min-w-0">
                                  <span className="text-[11px] font-mono font-bold text-slate-200 truncate">+{s.phoneNumber}</span>
                                  <span className={`text-[9px] uppercase font-black tracking-widest ${s.connected ? 'text-green-400 font-extrabold' : s.connecting ? 'text-sky-400' : 'text-amber-400'}`}>
                                    {s.connected ? 'Active & Online 24/7' : s.connecting ? 'Connecting...' : 'Standby / Offline'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={isPairing}
                                  onClick={() => handlePair(s.phoneNumber, true)}
                                  title="Break session and generate new pairing code"
                                  className="px-2.5 py-2 rounded-xl bg-violet-500/10 hover:bg-violet-500 text-violet-300 hover:text-white border border-violet-500/20 hover:border-violet-500 transition-all duration-200 active:scale-95 flex items-center gap-1 text-[9px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-40"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Re-Pair</span>
                                </button>

                                {confirmDisconnectNum === s.phoneNumber ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleDisconnect(s.phoneNumber)}
                                      className="px-2.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[9px] font-black uppercase tracking-wider cursor-pointer"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDisconnectNum(null)}
                                      className="px-2 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 text-[9px] font-black uppercase cursor-pointer"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    id={`btn-disconnect-${s.phoneNumber}`}
                                    type="button"
                                    onClick={() => setConfirmDisconnectNum(s.phoneNumber)}
                                    title="Disconnect and delete session"
                                    className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 hover:border-rose-500 transition-all duration-200 active:scale-95 flex items-center justify-center cursor-pointer"
                                  >
                                    <LogOut className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats Grid - Horizontal Scroll on small mobile */}
                <div className="flex lg:grid lg:grid-cols-3 gap-4 overflow-x-auto pb-2 lg:pb-0 no-scrollbar">
                  <StatCard icon={Cpu} label="CPU" value="12.4%" color="sky" />
                  <StatCard icon={Network} label="NET" value="2.1 MB" color="violet" />
                  <StatCard icon={Activity} label="SPEED" value={`${stats.latency}ms`} color="amber" />
                </div>

                {/* Terminal Section */}
                <div className="flex-1 min-h-[400px] bg-slate-900/60 backdrop-blur-sm rounded-[2rem] border border-white/5 flex flex-col overflow-hidden shadow-2xl relative">
                  <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                      <span className="text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase">wizard_kernel.log</span>
                    </div>
                    <div className="flex gap-2">
                       <span className="text-[10px] font-bold text-slate-700">TWH_V2.0</span>
                    </div>
                  </div>
                  <div className="flex-1 p-6 font-mono text-[11px] lg:text-xs overflow-y-auto terminal-scrollbar leading-relaxed">
                    {logs.length === 0 ? (
                      <div className="text-slate-800 animate-pulse font-bold tracking-widest text-center mt-20">ESTABLISHING CONNECTION...</div>
                    ) : (
                      logs.map((log, i) => (
                        <motion.div 
                          initial={{ opacity: 0, x: -5 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={i} 
                          dangerouslySetInnerHTML={{ __html: log }} 
                        />
                      ))
                    )}
                    <div ref={terminalEndRef} />
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'commands' && (
              <motion.div 
                key="commands"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {COMMANDS_CATEGORIES.map((cat) => (
                  <div key={cat.id} className="bg-slate-900/40 p-6 rounded-3xl border border-white/5 hover:border-violet-500/20 transition-all group flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center group-hover:bg-violet-600 transition-colors shadow-lg">
                        <cat.icon className="w-6 h-6 text-violet-400 group-hover:text-white" />
                      </div>
                      <h3 className="text-base font-black text-white italic tracking-tight">{cat.name}</h3>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.commands.map(cmd => (
                        <span key={cmd} className="px-3 py-1.5 bg-black/40 rounded-xl text-[10px] font-bold text-slate-400 border border-white/5 hover:text-violet-400 hover:border-violet-500/30 cursor-pointer transition-all uppercase tracking-wider">
                          .{cmd}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-xl mx-auto w-full"
              >
                <div className="bg-slate-900/60 rounded-[2.5rem] border border-white/5 p-8 lg:p-10 space-y-10">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-black text-white italic tracking-tighter">CONFIG</h2>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Core System Settings</p>
                    </div>
                    <div className="w-14 h-14 bg-violet-600/10 rounded-2xl flex items-center justify-center border border-violet-600/20">
                      <Settings className="w-7 h-7 text-violet-500" />
                    </div>
                  </div>

                  <div className="space-y-6">
                     <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Target Number</label>
                        <div className="relative group">
                          <input 
                            type="text" 
                            placeholder="Full number (254...)" 
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-sm font-mono focus:ring-2 focus:ring-violet-500 transition-all outline-none"
                          />
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => handlePair()}
                        disabled={isPairing || !phoneNumber}
                        className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 py-4 rounded-2xl text-xs font-black tracking-widest text-white shadow-2xl shadow-violet-600/20 uppercase transition-all active:scale-[0.98]"
                      >
                        {isPairing
                          ? 'Processing Magic...'
                          : (retryReadyNum && retryReadyNum === phoneNumber.replace(/[^0-9]/g, '')
                            ? 'Break Session & Re-Pair'
                            : 'Request Code')}
                      </button>

                      {statusNotice && (
                        <div className={`p-4 rounded-2xl border flex flex-col gap-3 ${
                          statusNotice.type === 'warning'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                            : statusNotice.type === 'error'
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                              : statusNotice.type === 'success'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                : 'bg-violet-500/10 border-violet-500/30 text-violet-200'
                        }`}>
                          <span className="text-xs leading-relaxed">{statusNotice.text}</span>
                          {statusNotice.actionNumber && (
                            <button
                              type="button"
                              disabled={isPairing}
                              onClick={() => handlePair(statusNotice.actionNumber, true)}
                              className="self-start px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-[10px] font-black uppercase tracking-widest"
                            >
                              Break Session &amp; Re-Pair
                            </button>
                          )}
                        </div>
                      )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <button
                      type="button"
                      disabled={!phoneNumber}
                      onClick={() => handleDisconnect(phoneNumber)}
                      className="flex flex-col items-center gap-3 p-6 bg-red-500/5 border border-red-500/10 rounded-3xl hover:bg-red-500/10 transition-colors group disabled:opacity-40"
                    >
                      <div className="p-3 bg-red-500/10 rounded-xl group-hover:scale-110 transition-transform">
                        <LogOut className="w-5 h-5 text-red-500" />
                      </div>
                      <span className="text-[10px] font-black text-red-500/80 uppercase tracking-widest">Break Session</span>
                    </button>
                    <button
                      type="button"
                      disabled={!phoneNumber || isPairing}
                      onClick={() => handlePair(phoneNumber, true)}
                      className="flex flex-col items-center gap-3 p-6 bg-slate-800/30 border border-white/5 rounded-3xl hover:bg-slate-800/50 transition-colors group disabled:opacity-40"
                    >
                      <div className="p-3 bg-slate-800 rounded-xl group-hover:scale-110 transition-transform">
                        <RefreshCw className="w-5 h-5 text-slate-400" />
                      </div>
                      <span className="text-[10px] font-black text-white uppercase tracking-widest">Force Re-Pair</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'info' && (
               <motion.div 
               key="info"
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               className="max-w-xl mx-auto w-full space-y-6"
             >
                <div className="bg-slate-900/60 rounded-[2rem] border border-white/5 p-8 relative overflow-hidden group">
                  <div className="absolute -top-24 -right-24 w-48 h-48 bg-violet-600/20 rounded-full blur-3xl group-hover:bg-violet-600/30 transition-colors" />
                  <div className="relative">
                    <h3 className="text-2xl font-black text-white italic mb-2 tracking-tighter">TECHWIZARD v2.0</h3>
                    <p className="text-sm text-slate-400 mb-6 leading-relaxed">A high-performance WhatsApp automation engine developed for power users who value speed, magic, and reliability.</p>
                    
                    <div className="px-6 py-4 mb-6 bg-violet-600/15 border border-violet-500/30 rounded-2xl text-center">
                      <p className="text-xs font-black tracking-[0.3em] text-violet-400 uppercase">Made by techwolf</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-black/40 rounded-2xl border border-white/5">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Developer</p>
                        <p className="text-sm font-bold text-white uppercase">TECHWOLF</p>
                      </div>
                      <div className="p-4 bg-black/40 rounded-2xl border border-white/5">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Status</p>
                        <p className="text-sm font-bold text-green-500 uppercase">Operational</p>
                      </div>
                    </div>
                  </div>
                </div>
             </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Nav - Mobile Only */}
        <nav className="lg:hidden fixed bottom-4 left-4 right-4 h-16 bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-3xl px-6 flex items-center justify-between z-50 shadow-2xl">
          <MobileNavBtn active={activeTab === 'terminal'} onClick={() => setActiveTab('terminal')} icon={TerminalIcon} />
          <MobileNavBtn active={activeTab === 'commands'} onClick={() => setActiveTab('commands')} icon={Code2} />
          <MobileNavBtn active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={Settings} />
          <MobileNavBtn active={activeTab === 'info'} onClick={() => setActiveTab('info')} icon={Info} />
        </nav>
      </main>

      {/* Right panel - Quick Actions (Hidden fully on mobile and smaller desktop) */}
      <aside className="hidden 2xl:flex w-80 border-l border-slate-800 bg-slate-900/30 flex-col">
        <div className="p-8 space-y-8">
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-6 flex items-center justify-between">
              ACTIVE MODULES
              <span className="bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full text-[9px]">4 ONLINE</span>
            </h3>
            <div className="space-y-4">
              <ModuleToggle label="Always Online" active />
              <ModuleToggle label="Auto Read" />
              <ModuleToggle label="AI Chatbot" active />
              <ModuleToggle label="Status Viewer" />
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-6">QUICK ACTIONS</h3>
            <div className="grid grid-cols-2 gap-4">
              <ToolButton icon={RefreshCw} label="Reboot" />
              <ToolButton icon={LogOut} label="Logout" danger />
              <ToolButton icon={Users} label="Admins" />
              <ToolButton icon={ShieldCheck} label="Security" />
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function NavButton({ active, icon: Icon, label, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group relative overflow-hidden ${
        active 
          ? 'bg-violet-600 text-white shadow-xl shadow-violet-600/30' 
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      <Icon className={`w-5 h-5 transition-transform duration-300 ${active ? 'text-white scale-110' : 'group-hover:text-violet-400 group-hover:scale-110'}`} />
      <span className="font-bold text-[10px] uppercase tracking-widest">{label}</span>
      {active && (
        <motion.div 
          layoutId="nav-pill" 
          className="ml-auto w-1 h-1 rounded-full bg-white shadow-[0_0_8px_white]" 
        />
      )}
    </button>
  );
}

function StatCard({ icon: Icon, label, value, color }: any) {
  const colors: any = {
    sky: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
    violet: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
    amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  };

  return (
    <div className="min-w-[140px] lg:min-w-0 flex-1 bg-slate-900/40 backdrop-blur-md p-5 rounded-3xl border border-white/5 flex items-center gap-4 shadow-xl hover:bg-slate-900/60 transition-all group">
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border shadow-inner transition-transform group-hover:scale-110 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">{label}</p>
        <p className="text-lg font-black text-white italic tracking-tighter">{value}</p>
      </div>
    </div>
  );
}

function ModuleToggle({ label, active = false }: any) {
  return (
    <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5 hover:border-violet-500/20 transition-colors group">
      <span className="text-[11px] font-black text-slate-300 uppercase tracking-widest">{label}</span>
      <div className={`w-11 h-6 rounded-full transition-all relative cursor-pointer shadow-inner ${active ? 'bg-violet-600' : 'bg-slate-700'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all ${active ? 'left-6' : 'left-1'}`} />
      </div>
    </div>
  );
}

function ToolButton({ icon: Icon, label, danger }: any) {
  return (
    <button className={`p-5 rounded-3xl border flex flex-col items-center gap-3 transition-all group overflow-hidden relative ${
      danger 
        ? 'border-red-500/10 bg-red-500/5 hover:bg-red-500/10 text-red-500 shadow-lg shadow-red-500/5' 
        : 'border-white/5 bg-slate-800/30 hover:bg-slate-800/60 text-slate-500 hover:text-white shadow-lg'
    }`}>
      <Icon className="w-6 h-6 transition-transform group-hover:scale-110" />
      <span className="text-[9px] font-black uppercase tracking-[0.2em]">{label}</span>
    </button>
  );
}

function MobileNavBtn({ active, icon: Icon, onClick }: any) {
  return (
    <button onClick={onClick} className="relative flex flex-col items-center justify-center w-12 h-12">
      <div className={`p-2.5 rounded-2xl transition-all duration-300 ${active ? 'bg-violet-600 text-white scale-110 shadow-lg shadow-violet-600/40' : 'text-slate-500'}`}>
        <Icon className="w-5 h-5" />
      </div>
      {active && (
        <motion.div 
          layoutId="mob-nav-pill" 
          className="absolute -bottom-1 w-1 h-1 rounded-full bg-violet-400" 
        />
      )}
    </button>
  );
}
