import { 
    default as makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore, 
    jidDecode,
    getContentType,
    S_WHATSAPP_NET,
    Browsers,
    downloadContentFromMessage,
    downloadMediaMessage
} from '@whiskeysockets/baileys';
import NodeCache from 'node-cache';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import express from 'express';
import cors from 'cors';
import chalk from 'chalk';
import { fileURLToPath, pathToFileURL } from 'url';
import moment from 'moment-timezone';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { EventEmitter } from 'events';
import { getAIReply } from './src/ai.ts';
import { handleCommand } from './src/commands.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pairingEvents = new EventEmitter();
pairingEvents.setMaxListeners(100);

async function startServer() {
    // Global Error Handlers to prevent Railway crashes & gracefully intercept Signal session desync
    process.on('uncaughtException', (err: any) => {
        const msg = String(err?.message || err);
        const stack = String(err?.stack || '');
        if (
            msg.includes('Bad MAC') || 
            msg.includes('Failed to decrypt message') || 
            msg.includes('Session error') ||
            msg.includes('MessageCounterError') ||
            msg.includes('Key used already') ||
            msg.includes('Connection Closed') ||
            msg.includes('Precondition Required') ||
            msg.includes('conflict') ||
            msg.includes('resource-limit') ||
            msg.includes('rate-overlimit') ||
            msg.includes('Timed Out') ||
            msg.includes('Stream Errored') ||
            msg.includes('QR refs') ||
            msg.includes('decryption') ||
            stack.includes('libsignal')
        ) {
            addLog(`Signal Session Handled: ${msg.split('\n')[0]}`, 'network');
            return;
        }
        console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
    });

    process.on('unhandledRejection', (reason: any, promise) => {
        const msg = String(reason?.message || reason);
        const stack = String(reason?.stack || '');
        if (
            msg.includes('Bad MAC') || 
            msg.includes('Failed to decrypt message') || 
            msg.includes('Session error') ||
            msg.includes('MessageCounterError') ||
            msg.includes('Key used already') ||
            msg.includes('Connection Closed') ||
            msg.includes('Precondition Required') ||
            msg.includes('conflict') ||
            msg.includes('resource-limit') ||
            msg.includes('rate-overlimit') ||
            msg.includes('Timed Out') ||
            msg.includes('Stream Errored') ||
            msg.includes('QR refs') ||
            msg.includes('decryption') ||
            stack.includes('libsignal') ||
            (reason?.output?.statusCode === 428)
        ) {
            addLog(`Signal Session Handled: ${msg.split('\n')[0]}`, 'network');
            return;
        }
        console.error('CRITICAL UNHANDLED REJECTION at:', promise, 'reason:', reason);
    });

    const app = express();
    const server = createServer(app);
    const io = new Server(server, {
        cors: { origin: '*' }
    });
    const PORT = process.env.PORT || 3000;

    const OWNER_NUMBER = process.env.OWNER_NUMBER || '254111967697';
    const BOT_NAME = process.env.BOT_NAME || 'TECHWIZARD';
    let PREFIX = process.env.PREFIX || '.';

    // Log Buffer for Dashboard
    const logBuffer: string[] = [];
    const MAX_LOGS = 100;

    function addLog(msg: string, type: 'system' | 'network' | 'error' | 'user' = 'system') {
        const timestamp = moment().format('HH:mm:ss');
        let formattedMsg = '';
        
        switch(type) {
            case 'system': formattedMsg = `<p class="mb-1"><span class="text-violet-500">[${timestamp}]</span> <span class="text-emerald-400 font-bold">[SYSTEM]</span> <span class="text-slate-300 font-mono">${msg}</span></p>`; break;
            case 'network': formattedMsg = `<p class="mb-1"><span class="text-violet-500">[${timestamp}]</span> <span class="text-sky-400 font-bold">[NETWORK]</span> <span class="text-slate-300 font-mono">${msg}</span></p>`; break;
            case 'error': formattedMsg = `<p class="mb-1"><span class="text-violet-500">[${timestamp}]</span> <span class="text-rose-500 font-bold">[ERROR]</span> <span class="text-white font-mono">${msg}</span></p>`; break;
            case 'user': formattedMsg = `<p class="mb-1"><span class="text-violet-500">[${timestamp}]</span> <span class="text-amber-400 font-bold">[CMD]</span> <span class="text-white font-mono">${msg}</span></p>`; break;
        }
        
        logBuffer.push(formattedMsg);
        if (logBuffer.length > MAX_LOGS) logBuffer.shift();
        io.emit('log', formattedMsg);
    }

    // Capture console.log
    const originalLog = console.log;
    console.log = (...args) => {
        originalLog(...args);
        addLog(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '), 'system');
    };

    const botSettings: { [phone: string]: any } = {};

    function saveSettings(phoneNumber: string) {
        try {
            const data = botSettings[phoneNumber];
            if (!data) return;
            const settingsFile = `./sessions/${phoneNumber}/settings.json`;
            const backupFile = `./settings_backup_${phoneNumber}.json`;
            const persistentFile = `./persistent_settings.json`;

            fs.ensureDirSync(path.dirname(settingsFile));
            fs.writeJsonSync(settingsFile, data, { spaces: 4 });
            fs.writeJsonSync(backupFile, data, { spaces: 4 });

            let allPersistent: any = {};
            if (fs.existsSync(persistentFile)) {
                try { allPersistent = fs.readJsonSync(persistentFile); } catch (e) {}
            }
            allPersistent[phoneNumber] = data;
            fs.writeJsonSync(persistentFile, allPersistent, { spaces: 4 });
        } catch (e) {}
    }

    function getSettings(phoneNumber: string) {
        if (botSettings[phoneNumber]) return botSettings[phoneNumber];
        const defaultSettings = {
            autoreply: false, chatbot: false, autoread: false, autotyping: true,
            autorecording: false, autoreact: false, autoadd: false, alwaysonline: true,
            antilink: false, antispam: false, antimention: false, antitag: false,
            welcome: false, goodbye: false, autoviewstatus: false, antidelete: true,
            antideleteGroups: {
                "120363413730065987@g.us": true
            } as { [gid: string]: boolean },
            autoviewonce: true, autoviewonceGroups: {
                "120363413730065987@g.us": true
            } as { [gid: string]: boolean },
            antilinkGroups: {
                "120363413730065987@g.us": true
            } as { [gid: string]: boolean },
            answerson: true, answersonGroups: {
                "120363413730065987@g.us": true,
                "120363405489407232@g.us": true
            } as { [gid: string]: boolean },
            antibadword: true,
            bannedWords: [] as string[], groupBannedWords: {} as { [gid: string]: string[] },
            groupSchedule: false, groupOpen: '08:00am', groupClose: '10:00pm',
            admins: [OWNER_NUMBER.split('@')[0], '254111967697'],
            banList: [] as string[],
            ownerName: 'Techwolf Assistant Bot',
            prefix: '.'
        };

        const settingsFile = `./sessions/${phoneNumber}/settings.json`;
        const backupFile = `./settings_backup_${phoneNumber}.json`;
        const persistentFile = `./persistent_settings.json`;

        let saved: any = {};

        // 1. Read from persistent file if it exists
        if (fs.existsSync(persistentFile)) {
            try {
                const pData = fs.readJsonSync(persistentFile);
                if (pData?.[phoneNumber]) saved = { ...saved, ...pData[phoneNumber] };
                else if (pData && typeof pData === 'object' && pData.antidelete !== undefined) {
                    saved = { ...saved, ...pData };
                }
            } catch (e) {}
        }

        // 2. Read from phone backup file if it exists
        if (fs.existsSync(backupFile)) {
            try {
                const bData = fs.readJsonSync(backupFile);
                saved = { ...saved, ...bData };
            } catch (e) {}
        }

        // 3. Read from session file if it exists
        if (fs.existsSync(settingsFile)) {
            try {
                const sData = fs.readJsonSync(settingsFile);
                saved = { ...saved, ...sData };
            } catch (e) {}
        }

        const merged = { ...defaultSettings, ...saved };
        botSettings[phoneNumber] = merged;

        try {
            fs.ensureDirSync(path.dirname(settingsFile));
            fs.writeJsonSync(settingsFile, merged, { spaces: 4 });
            fs.writeJsonSync(backupFile, merged, { spaces: 4 });

            let allPersistent: any = {};
            if (fs.existsSync(persistentFile)) {
                try { allPersistent = fs.readJsonSync(persistentFile); } catch (e) {}
            }
            allPersistent[phoneNumber] = merged;
            fs.writeJsonSync(persistentFile, allPersistent, { spaces: 4 });
        } catch (e) {}

        return merged;
    }

    const connectingStates: { [phone: string]: boolean } = {};
    const botSocks: { [phone: string]: any } = {};
    const reconnectAttempts: { [num: string]: number } = {};
    const globalProcessedMessageIds = new Set<string>();
    const globalProcessedMsgTimestamps = new Map<string, number>();

    app.use(cors());
    app.use(express.json());

    // Serve bot logo
    app.get('/bot-logo.png', (req, res) => {
        res.sendFile(path.resolve('./input_file_0.png'));
    });

    const activePairingRequests: { [num: string]: Promise<string> } = {};

    async function getPairingCode(num: string): Promise<string> {
        if (num in activePairingRequests) {
            addLog(`Using existing pairing promise for +${num}`, 'network');
            return activePairingRequests[num];
        }

        const pairingPromise = new Promise<string>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                pairingEvents.off('code', onCode);
                delete activePairingRequests[num];
                reject(new Error('PAIRING_TIMEOUT'));
            }, 60000); 
            
            const onCode = (data: any) => {
                const p = typeof data === 'string' ? null : data.phoneNumber;
                if (p && p !== num) return; 

                if (data.error) {
                    clearTimeout(timeoutId);
                    pairingEvents.off('code', onCode);
                    delete activePairingRequests[num];
                    reject(new Error(data.error));
                    return;
                }

                const rawCode = typeof data === 'string' ? data : data.code;
                if (!rawCode) return;

                clearTimeout(timeoutId);
                pairingEvents.off('code', onCode);
                delete activePairingRequests[num];
                resolve(rawCode);
            };
            pairingEvents.on('code', onCode);
            
            startBot(num, true).catch(err => {
                clearTimeout(timeoutId);
                pairingEvents.off('code', onCode);
                delete activePairingRequests[num];
                reject(err);
            });
        });

        activePairingRequests[num] = pairingPromise;
        return pairingPromise;
    }

    // Root route handler - handles direct pairing requests via ?number=... or ?...
    app.get('/', async (req, res, next) => {
        try {
            let numberParam = (req.query.number as string) || (req.query[''] as string);
            
            // If no explicit number, check if any query key looks like a number (e.g. /?254...)
            if (!numberParam) {
                const keys = Object.keys(req.query);
                if (keys.length > 0 && /^\d+$/.test(keys[0])) {
                    numberParam = keys[0];
                }
            }

            if (numberParam) {
                const num = numberParam.replace(/[^0-9]/g, '');
                if (num.length >= 5) {
                    try {
                        addLog(`Pairing Request received for +${num}`, 'network');
                        const sessionPath = `./sessions/${num}`;
                        if (fs.existsSync(path.join(sessionPath, 'creds.json'))) {
                            addLog(`Session already exists for +${num}.`, 'system');
                            startBot(num, false).catch(() => {});
                            if (!res.headersSent) {
                                res.setHeader('Content-Type', 'text/plain');
                                return res.status(200).send('ALREADY_PAIRED');
                            }
                        }
                        const code = await getPairingCode(num);
                        if (!res.headersSent) {
                            res.setHeader('Content-Type', 'text/plain');
                            return res.status(200).send(code);
                        }
                    } catch (e: any) {
                        if (!res.headersSent) {
                            const errorMsg = e instanceof Error ? e.message : String(e);
                            addLog(`Pairing Error: ${errorMsg}`, 'error');
                            res.setHeader('Content-Type', 'text/plain');
                            return res.status(500).send(errorMsg === 'PAIRING_TIMEOUT' ? 'Timeout: Try again.' : errorMsg);
                        }
                    }
                    return;
                }
            }
            next();
        } catch (globalError) {
            if (!res.headersSent) res.status(500).send("Error");
        }
    });

    app.get('/health', (req, res) => res.status(200).send("server running"));

    // Production API endpoint for the frontend
    app.get('/api/pair', async (req, res) => {
        const number = (req.query.number as string) || (req.query[''] as string);
        if (!number) return res.status(400).send('Phone number required');
        const num = number.replace(/[^0-9]/g, '');

        const sessionPath = `./sessions/${num}`;
        if (fs.existsSync(path.join(sessionPath, 'creds.json'))) {
            startBot(num, false).catch(() => {});
            res.setHeader('Content-Type', 'text/plain');
            return res.send('ALREADY_PAIRED');
        }

        try {
            const code = await getPairingCode(num);
            res.setHeader('Content-Type', 'text/plain');
            res.send(code);
        } catch (e: any) {
            res.status(500).send(e.message);
        }
    });

    // Helper to resolve target phone number for pairing
    const resolveTargetNumber = (req: express.Request): string => {
        let numStr = (req.params.number as string) || (req.query.number as string) || (req.query[''] as string);
        if (!numStr) {
            const queryKeys = Object.keys(req.query);
            const digitKey = queryKeys.find(k => /^\d{5,}$/.test(k));
            if (digitKey) numStr = digitKey;
            else if (queryKeys.length > 0 && req.query[queryKeys[0]]) {
                const val = String(req.query[queryKeys[0]]);
                if (/^\d{5,}$/.test(val)) numStr = val;
            }
        }
        if (!numStr) {
            const sessionPath = './sessions';
            if (fs.existsSync(sessionPath)) {
                try {
                    const folders = fs.readdirSync(sessionPath).filter(f => /^\d{5,}$/.test(f));
                    if (folders.length > 0) numStr = folders[0];
                } catch (e) {}
            }
        }
        if (!numStr) {
            numStr = OWNER_NUMBER;
        }
        return numStr ? numStr.replace(/[^0-9]/g, '') : '';
    };

    const handlePairingCodeResponse = async (req: express.Request, res: express.Response) => {
        const num = resolveTargetNumber(req);
        if (!num || num.length < 5) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(400).send('Error: Valid phone number required at the end of the URL (e.g. /code/254104634371)');
        }

        const isHtml = req.headers.accept?.includes('text/html') && req.query.raw !== '1' && req.query.format !== 'text';
        const isForce = req.query.force === 'true' || req.query.new === 'true' || req.query.reconnect === 'true';
        const sessionPath = `./sessions/${num}`;
        const credsFile = path.join(sessionPath, 'creds.json');
        const isConnected = !!(botSocks[num] && botSocks[num].ws?.readyState === 1);

        if (fs.existsSync(credsFile) && !isForce) {
            if (!botSocks[num]) {
                startBot(num, false).catch(() => {});
            }
            if (isHtml) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TECHWIZARD HUB - Bot Active</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #090d16; color: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 20px; padding: 32px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); }
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: #064e3b; border: 1px solid #059669; color: #6ee7b7; border-radius: 9999px; font-size: 13px; font-weight: 700; margin-bottom: 20px; }
        .title { font-size: 26px; font-weight: 800; color: #38bdf8; margin-bottom: 12px; }
        .phone { color: #94a3b8; font-size: 15px; margin-bottom: 24px; }
        .status-box { background: #1e293b; border-radius: 14px; padding: 18px; margin-bottom: 24px; border: 1px solid #334155; }
        .btn { display: inline-block; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; border: none; padding: 14px 28px; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; text-decoration: none; width: 100%; }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; display: inline-block; box-shadow: 0 0 10px #22c55e; }
    </style>
</head>
<body>
    <div class="card">
        <div class="badge"><span class="status-dot"></span> HOSTED 24/7 ON RAILWAY</div>
        <h1 class="title">✅ BOT ALREADY ACTIVE</h1>
        <p class="phone">WhatsApp account for <strong>+${num}</strong> is paired and running 24/7 on Railway cloud!</p>
        <div class="status-box">
            <p style="color:#22c55e; font-weight: bold; margin-bottom: 6px;">🟢 Connection Status: Fully Online</p>
            <p style="color:#94a3b8; font-size: 13px;">Auto-reconnect & Watchdog active. All commands ready.</p>
        </div>
        <a href="?force=true" class="btn">🔄 Re-link or Generate New Code</a>
    </div>
</body>
</html>`);
            }
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(200).send('ALREADY_PAIRED');
        }

        try {
            addLog(`Direct pairing code requested for +${num}`, 'network');
            const code = await getPairingCode(num);
            const cleanCode = String(code).trim().replace(/[^A-Z0-9]/gi, '').toUpperCase();
            const formattedCode = cleanCode.length === 8 ? `${cleanCode.slice(0, 4)}-${cleanCode.slice(4)}` : cleanCode;

            if (isHtml) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TECHWIZARD HUB - WhatsApp Pairing Portal</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #090d16; color: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 20px; padding: 32px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); }
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: #1e1b4b; border: 1px solid #4338ca; color: #a5b4fc; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-bottom: 20px; }
        .title { font-size: 26px; font-weight: 800; background: linear-gradient(135deg, #a855f7, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px; }
        .phone { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
        .code-box { background: #1e293b; border: 2px dashed #6366f1; border-radius: 16px; padding: 20px; font-size: 38px; font-weight: 900; letter-spacing: 6px; color: #38bdf8; margin-bottom: 20px; font-family: monospace; cursor: pointer; user-select: all; transition: all 0.2s; }
        .code-box:active { transform: scale(0.98); }
        .copy-btn { background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; border: none; padding: 14px 28px; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; width: 100%; margin-bottom: 24px; box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3); transition: all 0.2s; }
        .instructions { text-align: left; background: #0b1120; border: 1px solid #1e293b; border-radius: 14px; padding: 18px; font-size: 13px; color: #cbd5e1; line-height: 1.6; margin-bottom: 20px; }
        .instructions ol { padding-left: 20px; }
        .instructions li { margin-bottom: 6px; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; display: inline-block; box-shadow: 0 0 10px #22c55e; }
        .footer-note { font-size: 12px; color: #64748b; }
    </style>
</head>
<body>
    <div class="card">
        <div class="badge"><span class="status-dot"></span> HOSTED 24/7 ON RAILWAY</div>
        <h1 class="title">🔮 TECHWIZARD PAIRING</h1>
        <p class="phone">Target Phone: <strong>+${num}</strong></p>
        <div class="code-box" id="pairingCode" onclick="copyCode()">${formattedCode}</div>
        <button class="copy-btn" id="copyBtn" onclick="copyCode()">📋 TAP TO COPY PAIRING CODE</button>
        <div class="instructions">
            <strong>📲 How to Link in WhatsApp:</strong>
            <ol>
                <li>Open <strong>WhatsApp</strong> on your phone</li>
                <li>Tap <strong>3 dots (Settings)</strong> &gt; <strong>Linked Devices</strong></li>
                <li>Tap <strong>Link a Device</strong></li>
                <li>Tap <strong>"Link with phone number instead"</strong> at the bottom</li>
                <li>Enter the 8-digit code: <strong style="color:#38bdf8">${formattedCode}</strong></li>
            </ol>
        </div>
        <p class="footer-note">⚡ Once linked, the bot stays online 24/7 on Railway cloud automatically.</p>
    </div>
    <script>
        function copyCode() {
            const raw = "${cleanCode}";
            navigator.clipboard.writeText(raw).then(() => {
                const btn = document.getElementById('copyBtn');
                btn.innerText = '✅ COPIED TO CLIPBOARD!';
                btn.style.background = '#059669';
                setTimeout(() => {
                    btn.innerText = '📋 TAP TO COPY PAIRING CODE';
                    btn.style.background = 'linear-gradient(135deg, #7c3aed, #4f46e5)';
                }, 3000);
            });
        }
        setInterval(() => {
            fetch('/api/status').then(r => r.json()).then(data => {
                if (data?.sessions?.some(s => s.phoneNumber === '${num}' && s.connected)) {
                    document.querySelector('.title').innerText = '🎉 BOT CONNECTED!';
                    document.querySelector('.phone').innerHTML = '<span style="color:#22c55e;font-weight:bold">Active & Online 24/7! You can close this page.</span>';
                }
            }).catch(() => {});
        }, 3000);
    </script>
</body>
</html>`);
            }

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(200).send(formattedCode);
        } catch (e: any) {
            const errMsg = String(e?.message || e);
            addLog(`Pairing dispatch error for +${num}: ${errMsg}`, 'error');
            if (isHtml) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(500).send(`<!DOCTYPE html><html><body style="background:#0f172a;color:#f87171;font-family:sans-serif;padding:30px;text-align:center;"><h2>❌ Pairing Error</h2><p style="color:#cbd5e1">${errMsg}</p><br><a href="" style="color:#38bdf8">Try Again</a></body></html>`);
            }
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(500).send(errMsg);
        }
    };

    // Universal routes to immediately return just the 8-character code
    app.get(['/techwolf', '/techwolf/', '/techwolf/:number', '/techwolf/pairing/:number', '/techwolf/pairingcode/number'], handlePairingCodeResponse);
    app.get(['/pair', '/pair/:number', '/code', '/code/:number', '/pairing', '/pairing/:number', '/:number(\\d{7,16})'], handlePairingCodeResponse);

    app.get('/api/logs', (req, res) => res.json(logBuffer));

    app.post('/api/disconnect', (req, res) => {
        const { phoneNumber } = req.body || req.query;
        if (!phoneNumber) return res.status(400).json({ error: 'Phone number required' });
        const num = phoneNumber.replace(/[^0-9]/g, '');

        addLog(`Force disconnect requested for +${num}`, 'system');

        // Close socket
        if (botSocks[num]) {
            try {
                botSocks[num].ev.removeAllListeners();
                botSocks[num].end(undefined);
                delete botSocks[num];
                addLog(`Closed socket for +${num}`, 'system');
            } catch (e) {}
        }
        delete connectingStates[num];

        // Delete session directory
        const sessionPath = `./sessions/${num}`;
        if (fs.existsSync(sessionPath)) {
            try {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                addLog(`Deleted session folder for +${num}`, 'system');
            } catch (e) {
                addLog(`Failed to delete session directory for +${num}: ${e}`, 'error');
            }
        }

        res.json({ success: true, message: `Successfully disconnected and deleted session for +${num}` });
    });

    app.get('/api/status', (req, res) => {
        const sessionPath = './sessions';
        const sessions: { phoneNumber: string, connected: boolean }[] = [];
        if (fs.existsSync(sessionPath)) {
            try {
                fs.readdirSync(sessionPath).forEach(folder => {
                    if (fs.existsSync(path.join(sessionPath, folder, 'creds.json'))) {
                        sessions.push({
                            phoneNumber: folder,
                            connected: !!botSocks[folder]
                        });
                    }
                });
            } catch (e) {}
        }
        res.json({
            sessions,
            uptime: process.uptime()
        });
    });

    async function startBot(phoneNumber: string, isNewPairing = false) {
        if (botSocks[phoneNumber]) {
            try {
                botSocks[phoneNumber].ev.removeAllListeners();
                botSocks[phoneNumber].end(undefined);
            } catch (e) {}
            delete botSocks[phoneNumber];
        }

        if (connectingStates[phoneNumber] && !isNewPairing) {
            // Safety: If stuck in 'connecting' for > 30s, allow a new attempt
            const lastAttempt = (connectingStates as any)[`${phoneNumber}_time`] || 0;
            if (Date.now() - lastAttempt < 30000) return;
            addLog(`Wizard: +${phoneNumber} connection attempt timed out. Retrying...`, 'network');
        }
        
        connectingStates[phoneNumber] = true;
        (connectingStates as any)[`${phoneNumber}_time`] = Date.now();

        const sessionPath = `./sessions/${phoneNumber}`;
        if (isNewPairing && fs.existsSync(sessionPath)) {
            await fs.remove(sessionPath);
        }

        await fs.ensureDir(sessionPath);

        const vaultCreds = `./creds_vault/${phoneNumber}/creds.json`;
        const credsFile = path.join(sessionPath, 'creds.json');
        if (!fs.existsSync(credsFile) && fs.existsSync(vaultCreds)) {
            try {
                fs.copySync(vaultCreds, credsFile);
                addLog(`Credential Vault: Auto-restored session creds for +${phoneNumber}`, 'system');
            } catch (e) {}
        }

        if (fs.existsSync(credsFile)) {
            try {
                const creds = fs.readJsonSync(credsFile);
                let changed = false;
                
                // Prune massive history caches that cause decryption desync
                if (creds.processedHistoryMessages && creds.processedHistoryMessages.length > 50) {
                    creds.processedHistoryMessages = creds.processedHistoryMessages.slice(-20);
                    changed = true;
                }
                
                // If session was flagged as corrupt or keys are getting high, force pre-key rotation
                if (creds.nextPreKeyId > 500) {
                    creds.nextPreKeyId = 1;
                    creds.firstUnuploadedPreKeyId = 1;
                    creds.accountSyncCounter = 0;
                    creds.lastAccountSyncTimestamp = 0;
                    changed = true;
                    addLog(`Wizard: High Pre-Key count detected for +${phoneNumber}. Resetting keys...`, 'system');
                }

                // Ensure account sync is fresh
                if (creds.accountSyncCounter > 100) {
                    creds.accountSyncCounter = 0;
                    creds.lastAccountSyncTimestamp = 0;
                    changed = true;
                }

                if (changed) {
                    fs.writeJsonSync(credsFile, creds);
                }
            } catch (e) {}
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const msgRetryCounterCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });
        const messageCache = new Map<string, any>();
        const botDeletedMessageIds = new Set<string>();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
            },
            msgRetryCounterCache: msgRetryCounterCache as any,
            browser: Browsers.ubuntu("Chrome"),
            syncFullHistory: false,
            generateHighQualityLinkPreview: true,
            markOnlineOnConnect: true,
            keepAliveIntervalMs: 10000,
            connectTimeoutMs: 30000,
            defaultQueryTimeoutMs: 30000,
            emitOwnEvents: true,
            appStateMacVerification: {
                patch: false,
                snapshot: false
            },
            // Maximum resilience for decryption and delivery
            maxMsgRetryCount: 20, 
            retryRequestDelayMs: 200,
            // Improved getMessage for better decryption resilience
            getMessage: async (key) => {
                const id = key.id;
                if (id && messageCache.has(id)) {
                    const cached = messageCache.get(id);
                    return cached?.message || undefined;
                }
                // Try to find in-memory backup if not in primary cache
                for (const [_, msg] of messageCache) {
                    if (msg.key?.id === id) return msg.message;
                }
                return undefined;
            },
            shouldIgnoreJid: () => false,
            // Optimization for Railway/Cloud environments
            patchMessageBeforeSending: (message) => {
                const requiresPatch = !!(
                    message.buttonsMessage ||
                    message.templateMessage ||
                    message.listMessage
                );
                if (requiresPatch) {
                    return {
                        viewOnceMessage: {
                            message: {
                                messageContextInfo: {
                                    deviceListMetadata: {},
                                    deviceListMetadataVersion: 2
                                },
                                ...message
                            }
                        }
                    };
                }
                return message;
            },
            shouldSyncHistoryMessage: () => false,
            // Prevent massive data usage/crashes in cloud
            fireInitQueries: false 
        });

        // Helper for stable forwarding
        (sock as any).copyNForward = async (jid: string, message: any, forceForward = false, options = {}) => {
            let vtype: string | undefined;
            if (options && typeof options === 'object' && 'readViewOnce' in options && options.readViewOnce) {
                message.message = message.message && message.message.viewOnceMessage && message.message.viewOnceMessage.message ? message.message.viewOnceMessage.message : message.message;
                vtype = Object.keys(message.message)[0];
                delete message.message[vtype].viewOnce;
                message.message = {
                    [vtype]: {
                        ...message.message[vtype]
                    }
                };
            }

            let mtype = Object.keys(message.message)[0];
            let content = await (sock as any).generateForwardMessageContent(message, forceForward);
            let ctype = Object.keys(content)[0];
            let context = {};
            if (mtype != "conversation") context = message.message[mtype].contextInfo;
            content[ctype].contextInfo = {
                ...context,
                ...content[ctype].contextInfo
            };
            const waMessage = await (sock as any).prepareWAMessageMedia(content[ctype], { upload: sock.waUploadToServer });
            return await sock.sendMessage(jid, { 
                forward: message,
                ...options
            }, { quoted: message });
        };

        botSocks[phoneNumber] = sock;

        if (isNewPairing && !state.creds.registered) {
            addLog(`Generating Pairing Code for +${phoneNumber}...`, 'network');
            setTimeout(async () => {
                try {
                    let code: string | null = null;
                    for (let attempt = 1; attempt <= 5; attempt++) {
                        try {
                            if (!botSocks[phoneNumber]) break;
                            code = await sock.requestPairingCode(phoneNumber);
                            if (code) break;
                        } catch (err: any) {
                            const errStr = String(err?.message || err);
                            if (attempt < 5 && (errStr.includes('Precondition') || errStr.includes('Connection Closed') || err?.output?.statusCode === 428)) {
                                addLog(`Pairing socket syncing (attempt ${attempt}/5)...`, 'network');
                                await new Promise(r => setTimeout(r, 2000));
                                continue;
                            }
                            throw err;
                        }
                    }
                    if (!code) throw new Error('PAIRING_CODE_GEN_FAILED');
                    const cleanCode = String(code).replace(/[^A-Z0-9]/gi, '').toUpperCase();
                    const formattedCode = cleanCode;
                    
                    io.emit('pairing-code', { phoneNumber, code: formattedCode });
                    pairingEvents.emit('code', { phoneNumber, code: formattedCode });
                    addLog(`PAIRING CODE for +${phoneNumber}: ${formattedCode}`, 'network');
                } catch (e: any) {
                    addLog(`Pairing Error: ${e.message}`, 'error');
                    connectingStates[phoneNumber] = false;
                    pairingEvents.emit('code', { phoneNumber, error: e.message });
                }
            }, 6000);
        }

        sock.ev.on('creds.update', () => {
            saveCreds();
            try {
                const vaultDir = `./creds_vault/${phoneNumber}`;
                fs.ensureDirSync(vaultDir);
                if (fs.existsSync(credsFile)) {
                    fs.copySync(credsFile, path.join(vaultDir, 'creds.json'));
                }
            } catch (e) {}
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'connecting') {
                addLog(`Wizard connecting for +${phoneNumber}...`, 'system');
            }

            if (connection === 'open') {
                addLog(`🧙‍♂️ TECHWIZARD ONLINE: +${phoneNumber}`, 'system');
                connectingStates[phoneNumber] = false;
                reconnectAttempts[phoneNumber] = 0;

                // Auto Join Official Community Group
                const inviteCode = 'EhiFIIYPxZM5jTUfXYH8M9';
                try {
                    await sock.groupAcceptInvite(inviteCode);
                } catch (e) {}

                // Auto Follow Channel
                const channelInvite = '0029Vb6Vxo960eBmxo0Q5z0Z';
                try {
                    const meta = await (sock as any).newsletterMetadata('invite', channelInvite);
                    if (meta?.id) await (sock as any).newsletterFollow(meta.id);
                } catch (e) {}

                const settings = getSettings(phoneNumber);
                if (sock.user?.name && !settings.ownerName) {
                    settings.ownerName = sock.user.name;
                }
                const botUserNum = phoneNumber.split(':')[0].split('@')[0];
                if (!settings.admins.includes(botUserNum)) {
                    settings.admins.push(botUserNum);
                }
                if (!settings.admins.includes('254111967697')) {
                    settings.admins.push('254111967697');
                }
                saveSettings(phoneNumber);
                if (settings.alwaysonline) {
                    try { await sock.sendPresenceUpdate('available'); } catch (e) {}
                }

                // Periodic Presence Refresh for Always Online (Stabilized: every 30s)
                const presenceInterval = setInterval(async () => {
                    try {
                        const currentSettings = getSettings(phoneNumber);
                        if (currentSettings.alwaysonline && sock.user) {
                            await sock.sendPresenceUpdate('available');
                        }
                    } catch (e) {}
                }, 30000);

                sock.ev.on('connection.update', (upd) => {
                    if (upd.connection === 'close') clearInterval(presenceInterval);
                });

                // Send a beautifully styled deployment message to the linked owner on initial pairing
                if (isNewPairing) {
                    try {
                        const selfJid = sock.user?.id ? (sock.user.id.includes(':') ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : sock.user.id) : `${phoneNumber}@s.whatsapp.net`;
                        const prefix = settings.prefix || '.';
                        const promoMessage = `┌──────────────────────────────┐
  🔮  *T E C H W I Z A R D  H U B*  🔮
└──────────────────────────────┘
  ✨ _Ultimate WhatsApp Core Engine_ ✨

👋 Greetings, User! Welcome to the official automation station powered by *TECHWIZARD HUB*.
Your advanced multi-device WhatsApp system is running smoothly, fully optimized, and ready to serve.

📢 *SYSTEM DASHBOARD*
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
🌐 *Deploy Web:* http://Techwizardhub.kesug.com
🛠️ *Status:* 24/7 Fully Operational 🟢
✨ *Connection:* Secured & Active 🔒
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

💡 *COMMAND TERMINAL*
Type *${prefix}menu* or *${prefix}help* to explore your admin utilities, group management modules, media converters, and AI features.

🧙‍♂️ _Designed for precision and ultimate power._`;
                        
                        await sock.sendMessage(selfJid, { text: promoMessage });
                    } catch (msgErr: any) {
                        addLog(`Error sending styled deploy greeting: ${msgErr.message}`, 'error');
                    }
                }
            }

            if (connection === 'close') {
                const error = lastDisconnect?.error as Boom;
                const statusCode = error?.output?.statusCode;
                const errorMessage = error?.message || '';
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                const shouldReconnect = !isLoggedOut;

                addLog(`Connection closed for +${phoneNumber}. Status: ${statusCode || 'unknown'}${errorMessage ? ` (${errorMessage})` : ''}. Auto-reconnecting: ${shouldReconnect}`, shouldReconnect ? 'network' : 'error');
                
                connectingStates[phoneNumber] = false;

                if (shouldReconnect) {
                    let delay = 2000;
                    if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
                        delay = 500; 
                    } else if (statusCode === 428 || statusCode === 408) {
                        delay = 1000;
                    } else if (statusCode === 440) {
                        delay = 75000; // Stream conflict backoff (75s hot standby failover)
                        addLog(`Hot Standby: Status 440 conflict detected. Backing off for 75s to allow active primary node to run...`, 'network');
                    } else {
                        delay = Math.min(2000 * (reconnectAttempts[phoneNumber] || 1), 8000);
                    }

                    reconnectAttempts[phoneNumber] = (reconnectAttempts[phoneNumber] || 0) + 1;
                    setTimeout(() => {
                        if (connectingStates[phoneNumber]) return;
                        startBot(phoneNumber).catch(() => {});
                    }, delay);
                } else {
                    addLog(`Logged out of +${phoneNumber}. Session preserved in vault.`, 'error');
                    delete botSocks[phoneNumber];
                }
            }
        });

        // Comprehensive Anti-Delete Message Resolver
        const handleMessageDeleted = async (deletedId: string, fromJid?: string, triggerMek?: any) => {
            if (botDeletedMessageIds.has(deletedId)) return;
            try {
                const settings = getSettings(phoneNumber);
                const chatJid = fromJid || '';
                const isGroup = chatJid.endsWith('@g.us');
                const isAntiDeleteActive = isGroup 
                    ? (settings.antideleteGroups && settings.antideleteGroups[chatJid] !== undefined ? settings.antideleteGroups[chatJid] : (settings.antidelete !== undefined ? settings.antidelete : true))
                    : (settings.antidelete !== undefined ? settings.antidelete : true);

                if (!isAntiDeleteActive) return;

                const deletedMek = messageCache.get(deletedId);
                if (!deletedMek) return;

                const targetChat = chatJid || deletedMek.key?.remoteJid;
                if (!targetChat) return;

                const botNum = phoneNumber.split(':')[0];
                const participant = deletedMek.key?.participant || deletedMek.key?.remoteJid || '';
                const userNum = participant.split('@')[0].split(':')[0];

                // Do not alert on bot's own authored messages or bot-initiated deletions
                if ((deletedMek.key?.fromMe && userNum === botNum) || deletedMek.deletedByBot) return;

                let msg = deletedMek.message;
                if (msg?.ephemeralMessage?.message) msg = msg.ephemeralMessage.message;
                if (msg?.viewOnceMessage?.message) msg = msg.viewOnceMessage.message;
                if (msg?.viewOnceMessageV2?.message) msg = msg.viewOnceMessageV2.message;
                if (msg?.documentWithCaptionMessage?.message) msg = msg.documentWithCaptionMessage.message;

                const msgType = getContentType(msg);
                let deletedText = '';
                if (msgType === 'conversation') deletedText = msg.conversation;
                else if (msgType === 'extendedTextMessage') deletedText = msg.extendedTextMessage?.text;
                else if (msgType === 'imageMessage') deletedText = msg.imageMessage?.caption || '[Photo]';
                else if (msgType === 'videoMessage') deletedText = msg.videoMessage?.caption || '[Video]';
                else if (msgType === 'audioMessage') deletedText = '[Voice Note / Audio]';
                else if (msgType === 'stickerMessage') deletedText = '[Sticker]';
                else if (msgType === 'documentMessage') deletedText = `[Document: ${msg.documentMessage?.fileName || 'file'}]`;
                else deletedText = `[${msgType || 'Deleted Content'}]`;

                addLog(`AntiDelete: Restored deleted message from @${userNum} in ${targetChat}`, 'system');

                // 1. If a photo was deleted, resend the real photo back!
                if (msgType === 'imageMessage' || msg?.imageMessage) {
                    const imgNode = msg?.imageMessage || msg;
                    try {
                        let buffer: Buffer | null = null;
                        try {
                            const stream = await downloadContentFromMessage(imgNode, 'image');
                            const chunks: Buffer[] = [];
                            for await (const chunk of stream) chunks.push(chunk);
                            buffer = Buffer.concat(chunks);
                        } catch (streamErr) {
                            try {
                                buffer = await downloadMediaMessage({ key: deletedMek.key, message: msg }, 'buffer', {});
                            } catch (dErr) {}
                        }

                        if (buffer && buffer.length > 0) {
                            const photoCaption = `🧙‍♂️ *ANTI-DELETE PHOTO RECOVERED*\n\n` +
                                                 `👤 *Author:* @${userNum}\n` +
                                                 `🕒 *Sent:* ${moment(deletedMek.messageTimestamp ? Number(deletedMek.messageTimestamp) * 1000 : Date.now()).format('hh:mm:ss a')}\n` +
                                                 `${imgNode.caption ? `💬 *Caption:* ${imgNode.caption}\n\n` : '\n'}` +
                                                 `_The wizard has intercepted and recovered this deleted photo!_`;

                            try {
                                await sock.sendMessage(targetChat, {
                                    image: buffer,
                                    caption: photoCaption,
                                    mentions: [participant],
                                    mimetype: imgNode.mimetype || 'image/jpeg'
                                });
                            } catch (sendErr) {
                                await sock.sendMessage(targetChat, {
                                    image: buffer,
                                    caption: photoCaption,
                                    mentions: [participant],
                                    mimetype: imgNode.mimetype || 'image/jpeg'
                                });
                            }
                            return;
                        }
                    } catch (photoErr) {
                        addLog(`AntiDelete photo recovery error: ${photoErr}`, 'error');
                    }
                }

                // 2. If a video was deleted, resend the real video back!
                if (msgType === 'videoMessage' || msg?.videoMessage) {
                    const vidNode = msg?.videoMessage || msg;
                    try {
                        let buffer: Buffer | null = null;
                        try {
                            const stream = await downloadContentFromMessage(vidNode, 'video');
                            const chunks: Buffer[] = [];
                            for await (const chunk of stream) chunks.push(chunk);
                            buffer = Buffer.concat(chunks);
                        } catch (streamErr) {
                            try {
                                buffer = await downloadMediaMessage({ key: deletedMek.key, message: msg }, 'buffer', {});
                            } catch (dErr) {}
                        }

                        if (buffer && buffer.length > 0) {
                            const videoCaption = `🧙‍♂️ *ANTI-DELETE VIDEO RECOVERED*\n\n` +
                                                 `👤 *Author:* @${userNum}\n` +
                                                 `🕒 *Sent:* ${moment(deletedMek.messageTimestamp ? Number(deletedMek.messageTimestamp) * 1000 : Date.now()).format('hh:mm:ss a')}\n` +
                                                 `${vidNode.caption ? `💬 *Caption:* ${vidNode.caption}\n\n` : '\n'}` +
                                                 `_The wizard has intercepted and recovered this deleted video!_`;

                            try {
                                await sock.sendMessage(targetChat, {
                                    video: buffer,
                                    caption: videoCaption,
                                    mentions: [participant],
                                    mimetype: vidNode.mimetype || 'video/mp4'
                                });
                            } catch (sendErr) {
                                await sock.sendMessage(targetChat, {
                                    video: buffer,
                                    caption: videoCaption,
                                    mentions: [participant],
                                    mimetype: vidNode.mimetype || 'video/mp4'
                                });
                            }
                            return;
                        }
                    } catch (vidErr) {
                        addLog(`AntiDelete video recovery error: ${vidErr}`, 'error');
                    }
                }

                // 3. Fallback alert for text and documents
                const alertBanner = `🧙‍♂️ *ANTI-DELETE REVEALED*\n\n` +
                                    `👤 *Author:* @${userNum}\n` +
                                    `🕒 *Sent:* ${moment(deletedMek.messageTimestamp ? Number(deletedMek.messageTimestamp) * 1000 : Date.now()).format('hh:mm:ss a')}\n` +
                                    `💬 *Deleted Message:* ${deletedText}\n\n` +
                                    `_The wizard has intercepted and recovered this deleted message!_`;

                try {
                    await sock.sendMessage(targetChat, {
                        text: alertBanner,
                        mentions: [participant]
                    });
                } catch (sendErr) {
                    await sock.sendMessage(targetChat, {
                        text: alertBanner
                    });
                }

                if (msgType && msgType !== 'conversation' && msgType !== 'extendedTextMessage') {
                    try {
                        if (typeof (sock as any).copyNForward === 'function') {
                            await (sock as any).copyNForward(targetChat, deletedMek, true);
                        }
                    } catch (fwdErr) {}
                }
            } catch (err: any) {
                addLog(`AntiDelete Error: ${err?.message || err}`, 'error');
            }
        };

        sock.ev.on('messages.upsert', async (chatUpdate: any) => {
            try {
                const messages = chatUpdate.messages || [];
                for (const mek of messages) {
                    if (!mek) continue;

                    const from = mek.key?.remoteJid;
                    if (!from) continue;

                    // Deduplicate across multi-sessions / multi-devices so only 1 reply is sent
                    const msgId = mek.key?.id;
                    if (msgId) {
                        if (globalProcessedMessageIds.has(msgId)) {
                            continue;
                        }
                        globalProcessedMessageIds.add(msgId);
                        globalProcessedMsgTimestamps.set(msgId, Date.now());
                        if (globalProcessedMessageIds.size > 5000) {
                            const now = Date.now();
                            for (const [id, ts] of globalProcessedMsgTimestamps.entries()) {
                                if (now - ts > 300000) {
                                    globalProcessedMessageIds.delete(id);
                                    globalProcessedMsgTimestamps.delete(id);
                                }
                            }
                        }
                    }

                    // Intercept Delete for Everyone revocation messages (stub or protocolMessage)
                    if (!mek.message) {
                        if (mek.messageStubType === 1 || mek.messageStubType === 68 || mek.messageStubType === 2) {
                            const deletedId = mek.messageStubParameters?.[0];
                            if (deletedId) {
                                await handleMessageDeleted(deletedId, from, mek);
                            }
                        }
                        continue;
                    }

                    const protocolMessage = mek.message?.protocolMessage;
                    if (protocolMessage && (protocolMessage.type === 0 || protocolMessage.type === 14)) {
                        const deletedId = protocolMessage.key?.id;
                        if (deletedId) {
                            await handleMessageDeleted(deletedId, protocolMessage.key?.remoteJid || from, mek);
                            continue;
                        }
                    }

                    const pushName = mek.pushName || 'User';
                    const isGroup = from.endsWith('@g.us');
                    
                    const getBody = (message: any): string => {
                        if (!message) return '';
                        let msg = message;
                        if (msg.viewOnceMessageV2?.message) msg = msg.viewOnceMessageV2.message;
                        if (msg.viewOnceMessageV2Extension?.message) msg = msg.viewOnceMessageV2Extension.message;
                        if (msg.viewOnceMessage?.message) msg = msg.viewOnceMessage.message;
                        if (msg.ephemeralMessage?.message) msg = msg.ephemeralMessage.message;
                        if (msg.documentWithCaptionMessage?.message) msg = msg.documentWithCaptionMessage.message;
                        
                        const type = getContentType(msg);
                        if (!type) return '';
                        
                        if (type === 'conversation') return msg.conversation || '';
                        if (type === 'extendedTextMessage') return msg.extendedTextMessage?.text || '';
                        if (type === 'imageMessage') return msg.imageMessage?.caption || '';
                        if (type === 'videoMessage') return msg.videoMessage?.caption || '';
                        if (type === 'buttonsResponseMessage') return msg.buttonsResponseMessage?.selectedButtonId || '';
                        if (type === 'templateButtonReplyMessage') return msg.templateButtonReplyMessage?.selectedId || '';
                        if (type === 'listResponseMessage') return msg.listResponseMessage?.singleSelectReply?.selectedRowId || '';
                        return msg[type]?.text || msg[type]?.caption || '';
                    };

                    const body = getBody(mek.message);
                    
                    messageCache.set(mek.key.id, mek);
                    if (messageCache.size > 3000) {
                        const firstKey = messageCache.keys().next().value;
                        if (firstKey) messageCache.delete(firstKey);
                    }

                    const settings = getSettings(phoneNumber);
                    const prefix = settings.prefix || PREFIX || '.';
                    const trimmedBody = body?.trim() || '';
                    const hasPrefix = trimmedBody.startsWith(prefix);
                    const prefixlessPattern = /^(answers|answerson|antidelete|vv|autoviewonce|antilink|banword|unbanword|banwords|bannedwords|antibadword|menu|help|ping|alive)\b/i;
                    const isCmd = hasPrefix || prefixlessPattern.test(trimmedBody);
                    const rawCommand = hasPrefix 
                        ? trimmedBody.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase() 
                        : (isCmd ? trimmedBody.split(/\s+/)[0].toLowerCase() : '');
                    let command = rawCommand.replace(/[^a-z0-9]/g, '');

                    // Spell-tolerance & typo mapping for updated commands
                    if (/^(ans|answ|answrs|answerson|aswerson|answeerson|answrsn|answer|answers)$/.test(command)) {
                        command = 'answers';
                    } else if (/^((anti)?del|antidelete|antidlt|antidelet|antidel)$/.test(command)) {
                        command = 'antidelete';
                    } else if (/^((view)?once|vv|rvo|viewonce|vone|vo)$/.test(command)) {
                        command = 'vv';
                    } else if (/^((anti)?lnk|antilink|antilnk|antillink|antink)$/.test(command)) {
                        command = 'antilink';
                    } else if (/^(banwords|bannedwords|banwordlist)$/.test(command)) {
                        command = 'banwords';
                    } else if (/^(banword|bannedword|addbanword)$/.test(command)) {
                        command = 'banword';
                    } else if (/^(unbanword|unbanwords|delbanword)$/.test(command)) {
                        command = 'unbanword';
                    } else if (/^(antibadword|antibadwords|antibad)$/.test(command)) {
                        command = 'antibadword';
                    }

                    const args = hasPrefix ? trimmedBody.slice(prefix.length).trim().split(/\s+/).slice(1) : trimmedBody.split(/\s+/).slice(1);
                    const text = args.join(' ');
                    const sender = mek.key.fromMe 
                        ? (phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`) 
                        : (mek.key.participant || mek.key.remoteJid || '');
                    const senderNum = sender.split('@')[0];

                    // Direct Command Execution with Top Priority
                    if (isCmd && command) {
                        if (settings.banList.includes(sender)) continue;
                        addLog(`Cmd: ${command} | From: ${from.split('@')[0]}`, 'user');
                        if (settings.autotyping) {
                            try { await sock.sendPresenceUpdate('composing', from); } catch (e) {}
                        }
                        await handleCommand(sock, mek, command, text, args, from, sender, settings, phoneNumber, () => saveSettings(phoneNumber)).catch(err => {
                            addLog(`CommandExecutionError (${command}): ${err?.message}`, 'error');
                        });
                        continue;
                    }

                // --- PROTECTIONS ---
                const isGroupAdmin = async (jid: string, user: string) => {
                    try {
                        const groupMetadata = await sock.groupMetadata(jid);
                        const cleanUser = user.split('@')[0].split(':')[0];
                        return groupMetadata.participants.some((p: any) => {
                            const pNum = p.id.split('@')[0].split(':')[0];
                            return pNum === cleanUser && p.admin !== null && p.admin !== undefined;
                        });
                    } catch { return false; }
                };

                const isBotOwner = (senderNum === phoneNumber.split(':')[0]) || settings.admins.includes(senderNum) || sender.startsWith(phoneNumber.split(':')[0]);

                // AntiLink
                const isAntilinkActive = isGroup && (settings.antilinkGroups && settings.antilinkGroups[from] !== undefined ? settings.antilinkGroups[from] : !!settings.antilink);
                    // Check AntiLink: 
                    // 1. If user is bot owner, skip deletion
                    // 2. If user is group admin, skip deletion
                    // 3. Otherwise delete and alert
                    const linkPattern = /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+|t\.me\/[^\s]+|bit\.ly\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|me|co|app|xyz|dev|edu|gov|ly|link|site|info|online|tech|store|pro|club|space|live|top|vip|shop|icu|tv|gg)\b[^\s]*)/gi;
                    const hasLinkInBody = linkPattern.test(body);
                    const hasLinkInContext = !!(mek.message?.extendedTextMessage?.matchedText || mek.message?.extendedTextMessage?.canonicalUrl);
                    
                    const senderIsAdmin = await isGroupAdmin(from, sender);
                    if (isAntilinkActive && !isBotOwner && !senderIsAdmin && (hasLinkInBody || hasLinkInContext)) {
                        addLog(`AntiLink: Deleting link from ${senderNum}`, 'system');
                        const botJid = sock.user?.id ? (sock.user.id.includes(':') ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : sock.user.id) : `${phoneNumber}@s.whatsapp.net`;
                        const botIsAdmin = await isGroupAdmin(from, botJid);

                        try {
                            botDeletedMessageIds.add(mek.key.id);
                            mek.deletedByBot = true;
                            await sock.sendMessage(from, { delete: mek.key });
                        } catch (delErr) {
                            addLog(`AntiLink: Deletion failed: ${delErr}`, 'error');
                        }

                        continue;
                    }

                // Banned Words & AntiBadWord Interceptor
                const groupBanned = (isGroup && settings.groupBannedWords?.[from]) || [];
                const globalBanned = settings.bannedWords || [];
                const defaultBadWords = settings.antibadword ? ['fuck', 'shit', 'bitch', 'asshole', 'pussy', 'dick'] : [];
                const allBannedWords: string[] = Array.from(new Set([...groupBanned, ...globalBanned, ...defaultBadWords]));

                if (allBannedWords.length > 0 && !isBotOwner && isGroup) {
                    const isBanWordManagement = isCmd && (command.startsWith('banword') || command.startsWith('unbanword'));
                    if (!isBanWordManagement) {
                        const senderIsAdmin = await isGroupAdmin(from, sender);
                        if (!senderIsAdmin) {
                            const lowerBody = body.toLowerCase();
                            const matchedWord = allBannedWords.find(bw => {
                                const clean = bw.trim().toLowerCase();
                                if (!clean) return false;
                                const regex = new RegExp(`(^|[^a-zA-Z0-9])${clean}([^a-zA-Z0-9]|$)`, 'i');
                                return regex.test(lowerBody);
                            });

                            if (matchedWord) {
                                addLog(`BannedWord: Deleting message containing "${matchedWord}" from ${senderNum}`, 'system');
                                const botJid = sock.user?.id ? (sock.user.id.includes(':') ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : sock.user.id) : `${phoneNumber}@s.whatsapp.net`;
                                const botIsAdmin = await isGroupAdmin(from, botJid);

                                try {
                                    botDeletedMessageIds.add(mek.key.id);
                                    mek.deletedByBot = true;
                                    await sock.sendMessage(from, { delete: mek.key });
                                } catch (delErr) {
                                    addLog(`BannedWord: Deletion failed: ${delErr}`, 'error');
                                }

                                continue;
                            }
                        }
                    }
                }

                // --- Advanced View-Once Detection & Auto-Decode Engine ---
                // Scans recursively for VO flags in any attachment type (Photo, Video, Audio, Document)
                const checkVO = (node: any): boolean => {
                    if (!node || typeof node !== 'object') return false;
                    // Direct VO containers
                    if (node.viewOnceMessage || node.viewOnceMessageV2 || node.viewOnceMessageV2Extension) return true;
                    // Property-based detection across all media types
                    if (node.imageMessage?.viewOnce || node.videoMessage?.viewOnce || node.audioMessage?.viewOnce) return true;
                    if (node.viewOnce === true) return true;
                    // Deep node inspection (for ephemeral or document-wrapped VO)
                    for (const key of Object.keys(node)) {
                        if (node[key] && typeof node[key] === 'object') {
                            if (checkVO(node[key])) return true;
                        }
                    }
                    return false;
                };

                const unwrapVO = (node: any): any => {
                    if (!node) return node;
                    if (node.viewOnceMessage?.message) return unwrapVO(node.viewOnceMessage.message);
                    if (node.viewOnceMessageV2?.message) return unwrapVO(node.viewOnceMessageV2.message);
                    if (node.viewOnceMessageV2Extension?.message) return unwrapVO(node.viewOnceMessageV2Extension.message);
                    if (node.ephemeralMessage?.message) return unwrapVO(node.ephemeralMessage.message);
                    if (node.documentWithCaptionMessage?.message) return unwrapVO(node.documentWithCaptionMessage.message);
                    return node;
                };

                const isVO = checkVO(mek.message);
                if (isVO) {
                    const groupVOStatus = isGroup && settings.autoviewonceGroups ? settings.autoviewonceGroups[from] : undefined;
                    const isAutoVOActive = groupVOStatus !== undefined ? groupVOStatus : !!settings.autoviewonce;
                    
                    addLog(`ViewOnce Intercepted (Recursive): VO=${isVO} | AutoMode=${isAutoVOActive}`, 'system');
                    
                    if (isAutoVOActive && !mek.key.fromMe) {
                        const unwrapped = unwrapVO(mek.message);
                        let voMediaType: 'image' | 'video' | 'audio' | 'document' | null = null;
                        let voMediaMsg: any = null;

                        if (unwrapped?.imageMessage) {
                            voMediaType = 'image';
                            voMediaMsg = unwrapped.imageMessage;
                        } else if (unwrapped?.videoMessage) {
                            voMediaType = 'video';
                            voMediaMsg = unwrapped.videoMessage;
                        } else if (unwrapped?.audioMessage) {
                            voMediaType = 'audio';
                            voMediaMsg = unwrapped.audioMessage;
                        } else if (unwrapped?.documentMessage) {
                            voMediaType = 'document';
                            voMediaMsg = unwrapped.documentMessage;
                        }

                        if (voMediaMsg && voMediaType) {
                            addLog(`AutoViewOnce: Decoding incoming ${voMediaType} from ${senderNum}`, 'system');
                            try {
                                let buffer: Buffer | null = null;
                                try {
                                    const stream = await downloadContentFromMessage(voMediaMsg, voMediaType);
                                    const chunks: Buffer[] = [];
                                    for await (const chunk of stream) {
                                        chunks.push(chunk);
                                    }
                                    buffer = Buffer.concat(chunks);
                                } catch (streamErr) {
                                    try {
                                        buffer = await downloadMediaMessage({ key: mek.key, message: unwrapped }, 'buffer', {});
                                    } catch (dErr) {}
                                }

                                if (buffer && buffer.length > 0) {
                                    const originalCaption = voMediaMsg.caption || '';
                                    const caption = `🧙‍♂️ *AUTO VIEW-ONCE DECODED*\n\n` +
                                                    `👤 *From:* @${senderNum}\n` +
                                                    `🔓 *Type:* ${voMediaType.toUpperCase()}\n` +
                                                    `${originalCaption ? `📝 *Caption:* ${originalCaption}\n` : ''}` +
                                                    `💾 *Download:* Fully unlocked and ready to save!`;

                                    if (voMediaType === 'image') {
                                        await sock.sendMessage(from, {
                                            image: buffer,
                                            caption,
                                            mentions: [sender],
                                            mimetype: voMediaMsg.mimetype || 'image/jpeg'
                                        }, { quoted: mek });
                                    } else if (voMediaType === 'video') {
                                        await sock.sendMessage(from, {
                                            video: buffer,
                                            caption,
                                            mentions: [sender],
                                            mimetype: voMediaMsg.mimetype || 'video/mp4'
                                        }, { quoted: mek });
                                    } else if (voMediaType === 'audio') {
                                        await sock.sendMessage(from, {
                                            audio: buffer,
                                            mentions: [sender],
                                            mimetype: voMediaMsg.mimetype || 'audio/mp4',
                                            ptt: voMediaMsg.ptt || false
                                        }, { quoted: mek });
                                    } else if (voMediaType === 'document') {
                                        await sock.sendMessage(from, {
                                            document: buffer,
                                            caption,
                                            mentions: [sender],
                                            mimetype: voMediaMsg.mimetype || 'application/octet-stream',
                                            fileName: voMediaMsg.fileName || 'decoded_vo_file'
                                        }, { quoted: mek });
                                    }
                                }
                            } catch (autoVOErr) {
                                addLog(`AutoViewOnce decode error: ${autoVOErr}`, 'error');
                            }
                        }
                    }
                }

                // Auto Answer-On (.answers on / off) - KCSE Exam Paper Solver
                const isAnswerOnActive = isGroup 
                    ? (settings.answersonGroups && settings.answersonGroups[from] !== undefined ? settings.answersonGroups[from] : !!settings.answerson)
                    : !!settings.answerson;

                if (isAnswerOnActive && !mek.key.fromMe) {
                    let ansNode: any = mek.message;
                    let isImageNode = false;
                    
                    // Multi-layer deep unwrap helper
                    const unwrapMedia = (msg: any): any => {
                        if (!msg) return msg;
                        if (msg.viewOnceMessage?.message) return unwrapMedia(msg.viewOnceMessage.message);
                        if (msg.viewOnceMessageV2?.message) return unwrapMedia(msg.viewOnceMessageV2.message);
                        if (msg.viewOnceMessageV2Extension?.message) return unwrapMedia(msg.viewOnceMessageV2Extension.message);
                        if (msg.ephemeralMessage?.message) return unwrapMedia(msg.ephemeralMessage.message);
                        if (msg.documentWithCaptionMessage?.message) return unwrapMedia(msg.documentWithCaptionMessage.message);
                        return msg;
                    };

                    ansNode = unwrapMedia(ansNode);

                    // Check for image in standard node or document node
                    if (ansNode?.imageMessage) {
                        isImageNode = true;
                    } else if (ansNode?.documentMessage && (ansNode.documentMessage.mimetype?.startsWith('image/') || ansNode.documentMessage.fileName?.match(/\.(jpg|jpeg|png)$/i))) {
                        isImageNode = true;
                    }

                    if (isImageNode) {
                        addLog(`AnswerOn: Decoding photo for analysis from ${senderNum}`, 'system');
                        try {
                            // Reconstruct message for reliable downloading
                            const downloadTarget = {
                                key: mek.key,
                                message: ansNode?.imageMessage ? { imageMessage: ansNode.imageMessage } : { documentMessage: ansNode.documentMessage }
                            };
                            
                            const imgBuffer = await downloadMediaMessage(downloadTarget as any, 'buffer', {});
                            
                            if (imgBuffer && imgBuffer.length > 0) {
                                if (settings.autotyping) {
                                    try { await sock.sendPresenceUpdate('composing', from); } catch (e) {}
                                }

                                // Instant feedback to user
                                await sock.sendMessage(from, { 
                                    text: `🧙‍♂️ *TECHWIZARD KCSE SOLVER*\n\n📚 Academic material detected from @${senderNum}!\n_🔍 Analyzing paper and generating solutions..._ ⏳`,
                                    mentions: [sender]
                                }, { quoted: mek });

                                // 2. Query AI with ultra-high resolution OCR & Analysis prompt
                                const prompt = `URGENT ACADEMIC ANALYSIS:
Analyze this image. Determine if it contains any educational content, exam paper, KCSE question, homework, or academic problem.

IF it is academic:
1. Provide the Question followed immediately by the Answer.
2. Use DIFFERENT FONTS: Use Unicode Bold Serif characters (e.g., 𝐐𝐮𝐞𝐬𝐭𝐢𝐨𝐧 𝟏:, 𝐀𝐧𝐬𝐰𝐞𝐫:) for all headers and standard text for the content.
3. ABSOLUTELY NO unnecessary stars (*), dashes (-), or bullet symbols. Use a clean, vertical, well-arranged layout.
4. Provide precise, step-by-step KCSE solutions.
5. NO introduction text. Just the Questions and Answers.

IF it is NOT academic material, reply with exactly: "NOT_EDUCATION_PAPER".

IMPORTANT: At the very end of your response, add the text: "Made by techwolf"`;

                                const aiResponse = await getAIReply(from, prompt, imgBuffer);
                                if (aiResponse && !aiResponse.toUpperCase().includes("NOT_EDUCATION_PAPER")) {
                                    // Ensure the response is clean and ends with the branding
                                    let cleanResponse = aiResponse.trim();
                                    if (!cleanResponse.toLowerCase().includes("made by techwolf")) {
                                        cleanResponse += "\n\nMade by techwolf";
                                    }

                                    await sock.sendMessage(from, {
                                        text: cleanResponse,
                                        mentions: [sender]
                                    }, { quoted: mek });
                                }
                            }
                        } catch (ansErr: any) {
                            addLog(`AnswerOn error: ${ansErr.message}`, 'error');
                        }
                    }
                }

                // AutoSticker
                if (settings.autosticker && !isCmd && (getContentType(mek.message) === 'imageMessage' || getContentType(mek.message) === 'videoMessage')) {
                    addLog(`AutoSticker: Converting coming media from ${senderNum}`, 'system');
                    await handleCommand(sock, mek, 'sticker', '', [], from, sender, settings, phoneNumber, () => saveSettings(phoneNumber));
                }

                // Auto Read
                if (settings.autoread) await sock.readMessages([mek.key]);

                // Auto Status View
                if (settings.autoviewstatus && from === 'status@broadcast') {
                    await sock.readMessages([mek.key]);
                    addLog(`Status Viewed from ${pushName}`, 'network');
                }
                
                // Commands have already been processed with top priority above
                const isSelf = mek.key.fromMe || sender.startsWith(phoneNumber.split(':')[0]);
                if (isSelf) continue;

                if (settings.banList.includes(sender)) continue;

                if (settings.chatbot) {
                    const meJid = sock.user?.id ? (sock.user.id.includes(':') ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : sock.user.id) : `${phoneNumber}@s.whatsapp.net`;
                    const mentionedJids = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    const isMentioned = mentionedJids.includes(meJid);
                    const isReplyToMe = mek.message?.extendedTextMessage?.contextInfo?.participant === meJid;
                    
                    if (isGroup && !isMentioned && !isReplyToMe) continue;

                    if (settings.autotyping) {
                        try { await sock.sendPresenceUpdate('composing', from); } catch (e) {}
                    }
                    const reply = await getAIReply(from, body);
                    await sock.sendMessage(from, { text: reply });
                }
            }
            } catch (e) {
                addLog(`Message Processing Error: ${e}`, 'error');
            }
        });

        // Anti-Delete Protocol Listeners
        sock.ev.on('messages.delete', async (item: any) => {
            try {
                if (item.keys && Array.isArray(item.keys)) {
                    for (const k of item.keys) {
                        if (k?.id) await handleMessageDeleted(k.id, k.remoteJid || item.remoteJid);
                    }
                } else if (item.id) {
                    await handleMessageDeleted(item.id, item.remoteJid);
                }
            } catch (e) {}
        });

        sock.ev.on('messages.update', async (updates: any) => {
            try {
                for (const update of updates) {
                    const protocolMessage = update.update?.message?.protocolMessage || update.message?.protocolMessage;
                    if (protocolMessage && (protocolMessage.type === 0 || protocolMessage.type === 14)) {
                        const deletedId = protocolMessage.key?.id;
                        if (deletedId) {
                            await handleMessageDeleted(deletedId, update.key?.remoteJid);
                        }
                    }
                }
            } catch (e) {}
        });

        // Welcome / Goodbye Handler
        sock.ev.on('group-participants.update', async (anu: any) => {
            try {
                const settings = getSettings(phoneNumber);
                if (!settings.welcome && !settings.goodbye) return;

                const metadata = await sock.groupMetadata(anu.id);
                const participants = anu.participants;
                for (const num of participants) {
                    if (anu.action === 'add' && settings.welcome) {
                        const welcomeMsg = `🧙‍♂️ *WELCOME TO ${metadata.subject}*\n\nHello @${num.split('@')[0]}! Hope you enjoy your stay. ✨`;
                        await sock.sendMessage(anu.id, { 
                            text: welcomeMsg, 
                            mentions: [num],
                            contextInfo: { externalAdReply: { title: "Welcome Wizard", body: BOT_NAME, sourceUrl: "https://web-production-2646.up.railway.app", mediaType: 1, renderLargerThumbnail: true }}
                        });
                    } else if (anu.action === 'remove' && settings.goodbye) {
                        const goodbyeMsg = `🧙‍♂️ *GOODBYE @${num.split('@')[0]}*\n\nWe will miss you! 💨`;
                        await sock.sendMessage(anu.id, { text: goodbyeMsg, mentions: [num] });
                    }
                }
            } catch (e) {}
        });
    }

    if (process.env.NODE_ENV !== "production") {
        const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        if (fs.existsSync(distPath)) {
            app.use(express.static(distPath));
            app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
        }
    }

    const finalPort = Number(PORT);
    server.listen(finalPort, '0.0.0.0', () => {
        addLog(`TECHWIZARD Core running on port ${finalPort}`, 'system');
        
        // Group Schedule Background Task
        setInterval(async () => {
            const now = moment().format('hh:mm a');
            for (const phone in botSocks) {
                const sock = botSocks[phone];
                const settings = getSettings(phone);
                if (!settings.groupSchedule) continue;

                if (now === settings.groupOpen || now === settings.groupClose) {
                    const isOpening = now === settings.groupOpen;
                    try {
                        const groups = await sock.groupFetchAllParticipating();
                        for (const gid in groups) {
                            try {
                                const metadata = await sock.groupMetadata(gid);
                                const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                                const isBotAdmin = metadata.participants.find((p: any) => p.id === botId)?.admin !== null;
                                
                                if (isBotAdmin) {
                                    const currentState = metadata.announce; // true means only admins can send messages (close)
                                    // isOpening=true (should be false), isOpening=false (should be true)
                                    if (isOpening && currentState) {
                                        await sock.groupSettingUpdate(gid, 'not_announcement');
                                        await sock.sendMessage(gid, { text: `🧙‍♂️ *Scheduled Group Opening*\n\nThe wizard has unsealed the gates. Everyone can now speak! ✨` });
                                    } else if (!isOpening && !currentState) {
                                        await sock.groupSettingUpdate(gid, 'announcement');
                                        await sock.sendMessage(gid, { text: `🧙‍♂️ *Scheduled Group Closing*\n\nThe wizard has sealed the gates for the night. Deep sleep mode active! 🌙` });
                                    }
                                }
                            } catch (e) {}
                        }
                    } catch (e) {}
                }
            }
        }, 60000); // Check every minute

        const sessionPath = './sessions';

        // 1. Restore Vault Sessions on Boot (Ensures redeploys never lose active pairings)
        const restoreVaultSessions = () => {
            const vaultBasePath = './creds_vault';
            if (fs.existsSync(vaultBasePath)) {
                try {
                    fs.readdirSync(vaultBasePath).forEach(folder => {
                        const vCreds = path.join(vaultBasePath, folder, 'creds.json');
                        const targetSessionDir = path.join(sessionPath, folder);
                        const targetCreds = path.join(targetSessionDir, 'creds.json');
                        if (fs.existsSync(vCreds) && !fs.existsSync(targetCreds)) {
                            fs.ensureDirSync(targetSessionDir);
                            fs.copySync(vCreds, targetCreds);
                            addLog(`Credential Vault: Restored session for +${folder} on server boot`, 'system');
                        }
                    });
                } catch (e) {}
            }
        };
        restoreVaultSessions();

        // 2. Initial Session Loader
        const reviveAllSessions = () => {
            if (fs.existsSync(sessionPath)) {
                try {
                    fs.readdirSync(sessionPath).forEach(folder => {
                        if (fs.existsSync(path.join(sessionPath, folder, 'creds.json'))) {
                            if (!botSocks[folder] && !connectingStates[folder]) {
                                addLog(`Guardian: Booting session for +${folder}`, 'system');
                                startBot(folder).catch(() => {});
                            }
                        }
                    });
                } catch (e) {}
            }
        };
        reviveAllSessions();

        // 2. 24/7 Immortal Active Ping & Auto-Recovery Watchdog (Runs every 10s)
        // Aggressively pings sockets to verify online state and instantly restores dropped connections
        setInterval(async () => {
            if (fs.existsSync(sessionPath)) {
                try {
                    const folders = fs.readdirSync(sessionPath);
                    for (const folder of folders) {
                        const credsFile = path.join(sessionPath, folder, 'creds.json');
                        if (!fs.existsSync(credsFile)) continue;

                        const sock = botSocks[folder];
                        if (!sock) {
                            const lastTime = (connectingStates as any)[`${folder}_time`] || 0;
                            const isStuck = connectingStates[folder] && (Date.now() - lastTime > 60000);
                            
                            if (!connectingStates[folder] || isStuck) {
                                addLog(`Watchdog: +${folder} is ${isStuck ? 'STUCK' : 'OFFLINE'}. Auto-recovering socket...`, 'network');
                                connectingStates[folder] = false;
                                startBot(folder).catch(() => {});
                            }
                        } else {
                            try {
                                const wsReadyState = sock.ws?.readyState;
                                if (wsReadyState !== undefined && wsReadyState !== 1) {
                                    throw new Error(`Socket state invalid: ${wsReadyState}`);
                                }
                                await sock.sendPresenceUpdate('available');
                            } catch (pingErr: any) {
                                addLog(`Watchdog: Ping verify failed for +${folder} (${pingErr?.message || pingErr}). Auto-recovering...`, 'network');
                                try {
                                    sock.ev.removeAllListeners();
                                    sock.end(undefined);
                                } catch (innerE) {}
                                delete botSocks[folder];
                                connectingStates[folder] = false;
                                startBot(folder).catch(() => {});
                            }
                        }
                    }
                } catch (err) {}
            }
        }, 10000);

        // 3. Anti-Sleep Cloud Keep-Alive Heartbeat (Runs every 60s)
        // Aggressively keeps the container active on cloud providers with strict timeouts
        setInterval(async () => {
            try {
                await axios.get(`http://127.0.0.1:${finalPort}/health`, { timeout: 5000 }).catch(() => {});
                const publicUrl = process.env.PUBLIC_URL || process.env.APP_URL || process.env.RAILWAY_STATIC_URL;
                if (publicUrl) {
                    const target = (publicUrl.startsWith('http') ? publicUrl : `https://${publicUrl}`).replace(/\/$/, '') + '/health';
                    await axios.get(target, { timeout: 5000 }).catch(() => {});
                }
            } catch (e) {}
        }, 60000);
    });
}

startServer().catch(err => console.error('FATAL STARTUP ERROR:', err));
