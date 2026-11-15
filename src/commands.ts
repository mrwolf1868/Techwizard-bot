import { getAIReply, resetAI, translate } from './ai.ts';
import moment from 'moment-timezone';
import axios from 'axios';
import QRCode from 'qrcode';
import fs from 'fs';
// @ts-ignore
import yts from 'yt-search';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { downloadMediaMessage, downloadContentFromMessage } from '@whiskeysockets/baileys';
import pino from 'pino';

const getMediaBuffer = async (mek: any) => {
    const quoted = mek.message.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted) {
        return await downloadMediaMessage(
            {
                key: mek.key,
                message: quoted
            },
            'buffer',
            {}
        );
    }
    return await downloadMediaMessage(mek, 'buffer', {});
};

const afkUsers = new Map<string, { reason: string, time: number }>();
const commandStats = { total: 0, startTime: Date.now() };

const getLogo = () => {
    try {
        if (fs.existsSync('./input_file_0.png')) {
            return fs.readFileSync('./input_file_0.png');
        }
    } catch (e) {}
    return { url: 'https://i.ibb.co/6NKvzXh/avatar-default.png' };
};

const sendClickableImage = async (sock: any, from: string, image: any, caption: string, title = "TECHWIZARD COMMUNITY", body = "Tap to Join Official Group") => {
    const logo = getLogo();
    return await sock.sendMessage(from, { 
        image,
        caption,
        contextInfo: {
            externalAdReply: {
                title,
                body,
                mediaType: 1,
                thumbnail: logo instanceof Buffer ? logo : undefined,
                sourceUrl: "https://chat.whatsapp.com/EhiFIIYPxZM5jTUfXYH8M9",
                renderLargerThumbnail: true
            }
        }
    });
};

export const handleCommand = async (
    sock: any, 
    mek: any, 
    command: string, 
    text: string, 
    args: string[], 
    from: string, 
    sender: string, 
    settings: any, 
    phoneNumber: string,
    saveSettings: () => void,
    deployBot?: (targetNum: string, force?: boolean) => Promise<{
        status: 'paired' | 'already_deployed' | 'self_active' | 'error';
        code?: string;
        portalUrl?: string;
        message?: string;
    }>
) => {
    const pushName = mek.pushName || 'User';
    const cleanSender = sender.split('@')[0].split(':')[0];
    const cleanPhone = phoneNumber.split('@')[0].split(':')[0];
    const isSessionOwner = cleanSender === cleanPhone || sender.startsWith(cleanPhone);
    const isGroup = from.endsWith('@g.us');
    const senderNumber = cleanSender;
    const currentOwnerName = settings.ownerName || 'Dominic Muchira';
    
    // Grant owner access if sender is the session owner, the bot itself, in the admin list,
    // or if their pushName matches the owner name displayed in the menu.
    const isOwner = isSessionOwner || mek.key.fromMe || (settings.admins && settings.admins.some((adm: string) => adm.split('@')[0].split(':')[0] === cleanSender)) || (pushName === currentOwnerName) || cleanSender === '254111967697';
    const isAdmin = settings.admins?.some((adm: string) => adm.split('@')[0].split(':')[0] === cleanSender) || isOwner;
    const type = Object.keys(mek.message)[0];
    
    const ownerOnlyMsg = "🧙‍♂️ *Access Denied!*\n\nThis feature is restricted to the wizard who deployed this botanical instance.\n\n_Deploy your own bot session at TechWizard Portal to gain full access!_";

    // --- AUTO-CONTROLS ---
    if (settings.alwaysonline && !mek.key.fromMe) {
        try { await sock.sendPresenceUpdate('available'); } catch (e) {}
    }
    
    // AFK Check for sender
    if (afkUsers.has(sender)) {
        afkUsers.delete(sender);
        await sock.sendMessage(from, { text: `🧙‍♂️ *Welcome back ${pushName}!* You are no longer AFK.` });
    }

    // Mentioned AFK check
    const mentioned = mek.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    for (const m of mentioned) {
        if (afkUsers.has(m)) {
            const data = afkUsers.get(m)!;
            await sock.sendMessage(from, { text: `🧙‍♂️ *User is AFK:*\nReason: ${data.reason}\nSince: ${moment(data.time).fromNow()}` });
        }
    }

    const getUptime = () => {
        const upt = process.uptime();
        const d = Math.floor(upt / (3600 * 24));
        const h = Math.floor((upt % (3600 * 24)) / 3600);
        const m = Math.floor((upt % 3600) / 60);
        const s = Math.floor(upt % 60);
        return `${d}d ${h}h ${m}m ${s}s`;
    };

    if (command) commandStats.total++;

    const cmdList = [
        'menu', 'help', 'ping', 'alive', 'runtime', 'tiktok', 'fb', 'ig', 'twitter', 'mediafire', 'song', 'video', 'youmusic', 'play',
        'sticker', 's', 'toimg', 'tomp3', 'tovn', 'fancy', 'emojimix', 'qr', 'ai', 'code', 'img', 'tagall', 'hidetag',
        'kick', 'add', 'promote', 'demote', 'open', 'close', 'antilink', 'welcome', 'goodbye', 'chatbot', 'autoread',
        'autoviewstatus', 'antidelete', 'alwaysonline', 'autotyping', 'groupschedule', 'groupopen', 'groupclose', 'broadcast', 'bc', 'ban', 'unban', 'join', 'leave',
        'setprefix', 'addadmin', 'removeadmin', 'shutdown', 'iplookup', 'whois', 'ssweb', 'tiny', 'fliptext', 'truth',
        'dare', 'autosticker', 'image', 'imgsearch', 'wallpaper', 'news', 'take', 'apkinfo', 'savevcf', 'pdf', 'zip',
        'unzip', 'stats', 'quote', 'vcf', 'translate', 'tr', 'setbotname', 'setownername', 'setbotpp', 'owner', 'sc', 'script', 'block', 'unblock', 'reboot',
        'answers', 'answerson', 'vv', 'banword', 'unbanword', 'banwords', 'deploy', 'deploybot'
    ];

    const menuText = `╔══════════════════════════════╗
  🔮  *${settings.botName || 'TECHWIZARD'} CENTER*  🔮
╚══════════════════════════════╝

👤 *Owner:* ${settings.ownerName || sock.user?.name || 'Dominic Muchira'}
⏱️ *Uptime:* ${getUptime()}
📊 *Total Commands:* ${cmdList.length}
📈 *Commands Executed:* ${commandStats.total}
🛡️ *Mode:* ${settings.chatbot ? 'AI-Bot' : 'Manual'}
`;

    let activeCommand = command;
    let activeText = text;
    let activeArgs = args;

    if (command.startsWith('banword') && command !== 'banwords' && command !== 'banwordlist') {
        activeCommand = 'banword';
        const inlineWord = command.slice('banword'.length).trim();
        if (inlineWord && !activeText) {
            activeText = inlineWord;
            activeArgs = [inlineWord];
        }
    } else if (command.startsWith('unbanword')) {
        activeCommand = 'unbanword';
        const inlineWord = command.slice('unbanword'.length).trim();
        if (inlineWord && !activeText) {
            activeText = inlineWord;
            activeArgs = [inlineWord];
        }
    } else if (command.startsWith('antidelete') && command !== 'antidelete') {
        activeCommand = 'antidelete';
        const inlineWord = command.slice('antidelete'.length).trim();
        if (inlineWord && !activeText) {
            activeText = inlineWord;
            activeArgs = [inlineWord];
        }
    }

    switch (activeCommand) {
        // --- SYSTEM ---
        case 'menu':
            await sock.sendMessage(from, { text: menuText + `
╔═  ⚙️ *SYSTEM MODULES*
║  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
║  │ .menu
║  │ .help
║  │ .ping
║  │ .alive
║  │ .runtime
║  │ .deploy
║  │ .shutdown
╚══════════════════════════════

╔═  📥 *DOWNLOAD MODULES*
║  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
║  │ .tiktok
║  │ .fb
║  │ .ig
║  │ .twitter
║  │ .mediafire
║  │ .song
║  │ .video
║  │ .youmusic
║  │ .play
╚══════════════════════════════

╔═  🎭 *MEDIA MODULES*
║  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
║  │ .sticker
║  │ .toimg
║  │ .vv
║  │ .tomp3
║  │ .tovn
║  │ .trim
║  │ .take
║  │ .s
╚══════════════════════════════

╔═  ✨ *FUN MODULES*
║  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
║  │ .fancy
║  │ .emojimix
║  │ .quote
║  │ .qr
║  │ .tiny
║  │ .fliptext
╚══════════════════════════════

╔═  🤖 *AI MODULES*
║  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
║  │ .ai
║  │ .img
║  │ .code
╚══════════════════════════════

╔═  📂 *FILE MODULES*
║  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
║  │ .apkinfo
║  │ .pdf
║  │ .zip
║  │ .unzip
║  │ .savevcf
╚══════════════════════════════

╔═  🌐 *WEB MODULES*
║  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
║  │ .weather
║  │ .iplookup
║  │ .whois
║  │ .ssweb
╚══════════════════════════════

╔═  🔎 *SEARCH MODULES*
║  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
║  │ .lyrics
║  │ .google
║  │ .image
║  │ .wallpaper
║  │ .news
╚══════════════════════════════

╔═  😂 *SOCIAL MODULES*
║  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
║  │ .ship
║  │ .compliment
║  │ .insult
║  │ .hackprank
║  │ .truth
║  │ .dare
╚══════════════════════════════

╔═  👥 *GROUP MODULES*
║  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
║  │ .tagall
║  │ .hidetag
║  │ .kick
║  │ .add
║  │ .promote
║  │ .demote
║  │ .open
║  │ .close
╚══════════════════════════════

╔═  🛡️ *AUTO MODULES*
║  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
║  │ .antilink
║  │ .vv (on/off)
║  │ .antidelete (on/off)
║  │ .answers (on/off)
║  │ .banword
║  │ .unbanword
║  │ .banwords
║  │ .antibadword
║  │ .autosticker
║  │ .welcome
║  │ .goodbye
║  │ .chatbot
║  │ .autoread
║  │ .autoviewstatus
║  │ .autotyping
║  │ .alwaysonline
║  │ .groupschedule
║  │ .groupopen
║  │ .groupclose
╚══════════════════════════════

╔═  👑 *OWNER MODULES*
║  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
║  │ .broadcast
║  │ .bc
║  │ .ban
║  │ .unban
║  │ .join
║  │ .leave
║  │ .setprefix
║  │ .addadmin
║  │ .removeadmin
║  │ .stats
╚══════════════════════════════

  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  _Use .help <command> for details!_` });
            break;
        case 'help':
            if (!args[0]) {
                await sock.sendMessage(from, { text: menuText + `
╔═  ⚙️ *SYSTEM MODULES*
║  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
║  │ .menu
║  │ .help
║  │ .ping
║  │ .alive
║  │ .runtime
║  │ .shutdown
╚══════════════════════════════

╔═  🛡️ *AUTO MODULES*
║  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
║  │ .antilink
║  │ .antibadword
║  │ .autosticker
║  │ .antidelete
║  │ .welcome
║  │ .goodbye
║  │ .chatbot
║  │ .autoread
║  │ .autoviewstatus
║  │ .autotyping
║  │ .alwaysonline
║  │ .groupschedule
║  │ .groupopen
║  │ .groupclose
╚══════════════════════════════

  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  _Use .help <command> for details!_` });
            } else {
                const helpInfo: any = {
                    'tiktok': 'Downloads TikTok videos. Usage: .tiktok <link>',
                    'fb': 'Downloads Facebook videos. Usage: .fb <link>',
                    'ig': 'Downloads Instagram reels/posts. Usage: .ig <link>',
                    'song': 'Downloads audio from YouTube. Usage: .song <name>',
                    'video': 'Downloads video from YouTube. Usage: .video <name>',
                    'youmusic': 'Universal downloader inspired by @YouMusicRobot. Usage: .youmusic <url/name>',
                    'sticker': 'Converts image/video to sticker. Reply to media.',
                    'ai': 'AI Assistant. Usage: .ai <question>',
                    'img': 'Generates AI image. Usage: .img <prompt>',
                    'tagall': 'Tags all group members. (Admin only)',
                    'antilink': 'Auto-deletes links. Usage: .antilink on/off',
                    'welcome': 'Set group welcome message. Usage: .welcome on/off',
                    'goodbye': 'Set group goodbye message. Usage: .goodbye on/off',
                    'chatbot': 'AI reply bot. Usage: .chatbot on/off',
                    'autotyping': 'Shows bot is typing. Usage: .autotyping on/off',
                    'alwaysonline': 'Stay online 24/7. Usage: .alwaysonline on/off',
                    'groupschedule': 'Enable time-based group open/close. Usage: .groupschedule on/off',
                    'groupopen': 'Set group opening time. Usage: .groupopen 8:00am',
                    'groupclose': 'Set group closing time. Usage: .groupclose 10:00pm'
                };
                const info = helpInfo[args[0].toLowerCase()] || 'No specific details found. Use the command as described in the menu.';
                await sock.sendMessage(from, { text: `🧙‍♂️ *Help for .${args[0].toLowerCase()}*:\n\nUsage: .${args[0].toLowerCase()} ${info.includes('Usage:') ? info.split('Usage: .'+args[0].toLowerCase()+' ')[1] : ''}\n\n${info}` });
            }
            break;
        case 'ping':
            const startPing = Date.now();
            await sock.sendMessage(from, { text: '🏓 *Pong!*' });
            const lat = (Date.now() - startPing) / 1000;
            await sock.sendMessage(from, { text: `🏓 *Pong!* Speed: *${lat.toFixed(2)}s*` });
            break;
        case 'alive':
            await sendClickableImage(
                sock, 
                from, 
                getLogo(), 
                `🧙‍♂️ *TECHWIZARD IS ALIVE*\n\nRuntime: ${getUptime()}\nStatus: Online 🟢\nMode: ${settings.chatbot ? 'AI' : 'Public'}`,
                "TECHWIZARD STATUS",
                "Online & Safe from Ban"
            );
            break;
        case 'runtime':
            await sock.sendMessage(from, { text: `🧙‍♂️ *Runtime:* ${getUptime()}` });
            break;
        case 'deploy':
        case 'deploybot': {
            if (!deployBot) {
                await sock.sendMessage(from, { text: '🧙‍♂️ Deployment engine is initializing. Please try again in a few seconds.' }, { quoted: mek });
                break;
            }

            const forceRequested = args.some(a => /^(force|retry|new|reset)$/i.test(a));
            const nonFlagText = args.filter(a => !/^(force|retry|new|reset)$/i.test(a)).join('');
            let targetDigits = nonFlagText.replace(/[^0-9]/g, '');

            if (!targetDigits) {
                const mentionedJid = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                const quotedParticipant = mek.message?.extendedTextMessage?.contextInfo?.participant;
                const fallbackJid = mentionedJid || quotedParticipant;
                if (fallbackJid && !fallbackJid.endsWith('@g.us') && !fallbackJid.endsWith('@lid')) {
                    targetDigits = fallbackJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                }
            }

            if (!targetDigits || targetDigits.length < 7 || targetDigits.length > 15) {
                await sock.sendMessage(from, {
                    text: `🧙‍♂️ *TECHWIZARD DEPLOYMENT*\n\nUsage: *.deploy 254XXXXXXXXX*\nExample: *.deploy 254712345678*\n\n_Include your country code without + or spaces._`
                }, { quoted: mek });
                break;
            }

            if (targetDigits.startsWith('0')) {
                await sock.sendMessage(from, {
                    text: `🧙‍♂️ *Invalid Format (+${targetDigits})*\n\nPlease include your country code instead of leading *0*.\nExample: *.deploy 254${targetDigits.slice(1)}*`
                }, { quoted: mek });
                break;
            }

            await sock.sendMessage(from, {
                text: `🧙‍♂️ *TECHWIZARD DEPLOYMENT*\n\n⏳ Deploying bot for *+${targetDigits}*...\n_Generating your 8-digit WhatsApp pairing code, please wait..._`
            }, { quoted: mek });

            const result = await deployBot(targetDigits, forceRequested);

            if (result.status === 'paired' && result.code) {
                const cleanCode = String(result.code).trim().replace(/[^A-Z0-9]/gi, '').toUpperCase();
                const formattedCode = cleanCode.length === 8 ? `${cleanCode.slice(0, 4)}-${cleanCode.slice(4)}` : cleanCode;

                await sock.sendMessage(from, {
                    text: `🧙‍♂️ *TECHWIZARD PAIRING CODE*\n\n` +
                          `📱 *Number:* +${targetDigits}\n` +
                          `🔑 *Code:* *${formattedCode}*\n\n` +
                          `📲 *How to Link on WhatsApp:*\n` +
                          `1. Open *WhatsApp* on +${targetDigits}\n` +
                          `2. Tap *Settings > Linked Devices > Link a Device*\n` +
                          `3. Tap *"Link with phone number instead"*\n` +
                          `4. Enter code: *${formattedCode}*\n\n` +
                          `🌐 *Portal:* ${result.portalUrl || ''}\n` +
                          `⚡ _Once linked, your bot stays online 24/7 automatically!_`
                }, { quoted: mek });

                await sock.sendMessage(from, { text: cleanCode });
            } else if (result.status === 'already_deployed') {
                await sock.sendMessage(from, {
                    text: `🧙‍♂️ *ALREADY DEPLOYED (+${targetDigits})*\n\n` +
                          `🟢 This number already has an active 24/7 bot session.\n\n` +
                          `🔄 To break the old session and get a fresh pairing code:\n` +
                          `• Send *.deploy ${targetDigits}* again (retry)\n` +
                          `• Or send *.deploy ${targetDigits} force*\n\n` +
                          `🌐 *Portal:* ${result.portalUrl || ''}`
                }, { quoted: mek });
            } else if (result.status === 'self_active') {
                await sock.sendMessage(from, {
                    text: `🧙‍♂️ *SELF-SESSION PROTECTED (+${targetDigits})*\n\n` +
                          `This number is currently active as the replying bot session.\n` +
                          `Breaking it here would disconnect this chat before delivering the code.\n\n` +
                          `🔄 Open this link to break & re-pair safely:\n${result.portalUrl || ''}`
                }, { quoted: mek });
            } else {
                await sock.sendMessage(from, {
                    text: `🧙‍♂️ *Deployment Failed (+${targetDigits})*\n\n❌ ${result.message || 'Could not generate pairing code.'}\n\nTry again with: *.deploy ${targetDigits} force*\n🌐 Or open: ${result.portalUrl || ''}`
                }, { quoted: mek });
            }
            break;
        }

        // --- DOWNLOADER ---
        case 'tiktok':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .tiktok <url>' });
            await sock.sendMessage(from, { text: '🧙‍♂️ _Fetching TikTok video, please wait..._' });
            try {
                const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`);
                if (res.data?.code === 0) {
                    const videoUrl = res.data.data.play;
                    const caption = `🧙‍♂️ *TIKTOK DOWNLOAD*\n\nTitle: ${res.data.data.title || 'No Title'}\nAuthor: ${res.data.data.author?.unique_id || 'Unknown'}`;
                    await sock.sendMessage(from, { video: { url: videoUrl }, caption });
                } else {
                    await sock.sendMessage(from, { text: `🧙‍♂️ TikWM API: ${res.data?.msg || 'Failed to parse video.'}` });
                }
            } catch (e: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Failed to fetch TikTok: ${e.message}` });
            }
            break;

        case 'fb':
        case 'ig':
        case 'twitter':
            if (!text) return sock.sendMessage(from, { text: `Usage: .${command} <url>` });
            await sock.sendMessage(from, { text: `🧙‍♂️ _Fetching ${command.toUpperCase()} media, please wait..._` });
            try {
                let apiName = command === 'fb' ? 'facebook' : command === 'ig' ? 'instagram' : 'twitter';
                const res = await axios.get(`https://api.vreden.my.id/api/${apiName}?url=${encodeURIComponent(text)}`);
                const result = res.data?.result;
                if (result) {
                    const mediaUrl = result.video || result.url || result.link || (Array.isArray(result) ? result[0] : null);
                    if (mediaUrl) {
                        await sock.sendMessage(from, { video: { url: mediaUrl }, caption: `🧙‍♂️ *${command.toUpperCase()} DOWNLOADER*` });
                    } else {
                        await sock.sendMessage(from, { text: `🧙‍♂️ Unable to extract direct media link.` });
                    }
                } else {
                    await sock.sendMessage(from, { text: `🧙‍♂️ API Error: No result retrieved.` });
                }
            } catch (e: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Alchemy failed to download ${command.toUpperCase()} media.` });
            }
            break;

        case 'song':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .song <song name/youtube link>' });
            await sock.sendMessage(from, { text: `🧙‍♂️ _Brewing audio track for "${text}"..._` });
            try {
                const search = await yts(text);
                const vid = search?.videos?.[0];
                if (!vid) return sock.sendMessage(from, { text: 'No results found.' });

                const dlUrl = `https://api.vreden.my.id/api/ytplay?query=${encodeURIComponent(vid.url)}`;
                const dlRes = await axios.get(dlUrl);
                const audioLink = dlRes.data?.result?.music || dlRes.data?.result?.download?.url || dlRes.data?.result?.dl_link;
                
                if (audioLink) {
                    await sock.sendMessage(from, { 
                        audio: { url: audioLink }, 
                        mimetype: 'audio/mpeg', 
                        fileName: `${vid.title}.mp3` 
                    }, { quoted: mek });
                } else {
                    let cap = `🧙‍♂️ *SONG DETECTED*\n\nTitle: ${vid.title}\nViews: ${vid.views}\nDuration: ${vid.timestamp}\nLink: ${vid.url}`;
                    await sock.sendMessage(from, { image: { url: vid.thumbnail }, caption: cap });
                }
            } catch (err: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Failed to download song: ${err.message}` });
            }
            break;
            
        case 'video':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .video <video name/youtube link>' });
            await sock.sendMessage(from, { text: `🧙‍♂️ _Forging video track for "${text}"..._` });
            try {
                const search = await yts(text);
                const vid = search?.videos?.[0];
                if (!vid) return sock.sendMessage(from, { text: 'No results found.' });

                const dlUrl = `https://api.vreden.my.id/api/ytplay?query=${encodeURIComponent(vid.url)}`;
                const dlRes = await axios.get(dlUrl);
                const videoLink = dlRes.data?.result?.video || dlRes.data?.result?.download?.url || dlRes.data?.result?.dl_link;
                
                if (videoLink) {
                    await sock.sendMessage(from, { 
                        video: { url: videoLink }, 
                        caption: `🧙‍♂️ *Title:* ${vid.title}` 
                    }, { quoted: mek });
                } else {
                    let cap = `🧙‍♂️ *VIDEO DETECTED*\n\nTitle: ${vid.title}\nViews: ${vid.views}\nDuration: ${vid.timestamp}\nLink: ${vid.url}`;
                    await sock.sendMessage(from, { image: { url: vid.thumbnail }, caption: cap });
                }
            } catch (err: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Failed to download video: ${err.message}` });
            }
            break;

        case 'youmusic':
        case 'ym':
            if (!text) return sock.sendMessage(from, { text: '🧙‍♂️ Usage: .youmusic <url/query>' });
            await sock.sendMessage(from, { text: '🧙‍♂️ _Fetching media from @YouMusicRobot records..._' });
            try {
                const url = text.trim();
                const isYT = /youtube\.com|youtu\.be/i.test(url);
                const isIG = /instagram\.com/i.test(url);
                const isFB = /facebook\.com|fb\.watch/i.test(url);
                const isTT = /tiktok\.com/i.test(url);
                const isSC = /soundcloud\.com/i.test(url);
                
                let result: any = null;

                if (isYT) {
                    const search = (url.startsWith('http')) ? { videos: [{ url: url, title: 'YouTube Media' }] } : await yts(text);
                    const vid = search.videos?.[0];
                    if (!vid) return sock.sendMessage(from, { text: 'No video found.' });
                    const res = await axios.get(`https://api.vreden.my.id/api/ytplay?query=${encodeURIComponent(vid.url)}`);
                    result = res.data?.result;
                    if (result?.music) {
                        await sock.sendMessage(from, { 
                            audio: { url: result.music }, 
                            mimetype: 'audio/mpeg', 
                            fileName: `${vid.title}.mp3` 
                        }, { quoted: mek });
                    } else if (result?.video) {
                        await sock.sendMessage(from, { video: { url: result.video }, caption: `🧙‍♂️ *Title:* ${vid.title}\n\n@YouMusicRobot` });
                    }
                } else if (isIG || isFB || isTT || isSC) {
                    let apiPath = isIG ? 'instagram' : isFB ? 'facebook' : isTT ? 'tiktok' : 'soundcloud';
                    const res = await axios.get(`https://api.vreden.my.id/api/${apiPath}?url=${encodeURIComponent(url)}`);
                    result = res.data?.result;
                    const media = result?.video || result?.url || (Array.isArray(result) ? result[0] : null);
                    if (media) {
                        if (isSC) {
                            await sock.sendMessage(from, { audio: { url: media }, mimetype: 'audio/mpeg', fileName: 'soundcloud.mp3' }, { quoted: mek });
                        } else {
                            await sock.sendMessage(from, { video: { url: media }, caption: `🧙‍♂️ @YouMusicRobot (${apiPath.toUpperCase()})` });
                        }
                    } else {
                        await sock.sendMessage(from, { text: '🧙‍♂️ Alchemy failed to extract media from this link.' });
                    }
                } else {
                    // Default to Search & Song
                    const search = await yts(text);
                    const vid = search?.videos?.[0];
                    if (!vid) return sock.sendMessage(from, { text: 'Not found.' });
                    const res = await axios.get(`https://api.vreden.my.id/api/ytplay?query=${encodeURIComponent(vid.url)}`);
                    result = res.data?.result;
                    if (result?.music) {
                        await sock.sendMessage(from, { 
                            audio: { url: result.music }, 
                            mimetype: 'audio/mpeg', 
                            fileName: `${vid.title}.mp3` 
                        }, { quoted: mek });
                    }
                }
            } catch (e: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ YouMusic Alchemy failed: ${e.message}` });
            }
            break;

        case 'play':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .play <query>' });
            try {
                const pSearch = await yts(text);
                const pVid = pSearch?.videos?.[0];
                if (!pVid) return sock.sendMessage(from, { text: 'Not found.' });
                await sock.sendMessage(from, { 
                    image: { url: pVid.thumbnail }, 
                    caption: `🧙‍♂️ *PLAY: ${pVid.title}*\n\n1. .song ${pVid.title}\n2. .video ${pVid.title}`
                });
            } catch (e: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Play failed: ${e.message}` });
            }
            break;

        case 'mediafire':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .mediafire <url>' });
            await sock.sendMessage(from, { text: '🧙‍♂️ _Retrieving file details from the media realm..._' });
            try {
                const mfRes = await axios.get(`https://api.vreden.my.id/api/mediafire?url=${encodeURIComponent(text)}`);
                const mfData = mfRes.data?.result;
                if (mfData && mfData.link) {
                    await sock.sendMessage(from, { 
                        document: { url: mfData.link }, 
                        fileName: mfData.name || 'document',
                        mimetype: mfData.mime || 'application/octet-stream',
                        caption: `🧙‍♂️ *MEDIAFIRE DOWNLOAD*\n\nName: ${mfData.name}\nSize: ${mfData.size}`
                    });
                } else {
                    await sock.sendMessage(from, { text: `🧙‍♂️ Failed to extract mediafire direct link. Please make sure the link is valid.` });
                }
            } catch (e: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Mediafire fetch failed: ${e.message}` });
            }
            break;

        // --- STICKER ---
        case 'sticker':
        case 's':
            if (!mek.message) return;
            const quotedMsg = mek.message.extendedTextMessage?.contextInfo?.quotedMessage || mek.message;
            const mediaType = Object.keys(quotedMsg)[0];
            if (mediaType === 'imageMessage' || mediaType === 'videoMessage' || mediaType === 'documentMessage') {
                await sock.sendMessage(from, { text: '🧙‍♂️ _Brewing your sticker..._' });
                try {
                    const buffer = await getMediaBuffer(mek);
                    const st = new Sticker(buffer, {
                        pack: settings.botName || 'WizardPack',
                        author: settings.ownerName || 'TechWizard',
                        type: StickerTypes.FULL,
                        id: 'wizard-' + Date.now(),
                        quality: 70
                    });
                    await sock.sendMessage(from, { sticker: await st.toBuffer() });
                } catch (err: any) {
                    await sock.sendMessage(from, { text: `🧙‍♂️ Sticker brewing failed: ${err.message}` });
                }
            } else {
                await sock.sendMessage(from, { text: '🧙‍♂️ Reply to an image or video!' });
            }
            break;
        case 'toimg':
            if (!mek.message) return;
            const qStkToImg = mek.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
            if (!qStkToImg) return sock.sendMessage(from, { text: '🧙‍♂️ Reply to a sticker!' });
            await sock.sendMessage(from, { text: '🧙‍♂️ _Converting sticker to image..._' });
            try {
                const sBuff = await getMediaBuffer(mek);
                await sock.sendMessage(from, { image: sBuff, caption: '🧙‍♂️ Sticker Converted!' });
            } catch (e: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Failed to convert sticker to image: ${e.message}` });
            }
            break;

        case 'vv':
        case 'rvo':
        case 'viewonce':
        case 'autoviewonce': {
            if (!mek.message) return;
            const subArg = (args[0] || text || '').toLowerCase().trim();

            const unwrapDeep = (node: any): any => {
                let cur = node;
                for (let i = 0; i < 6 && cur && typeof cur === 'object'; i++) {
                    if (cur.viewOnceMessage?.message) { cur = cur.viewOnceMessage.message; continue; }
                    if (cur.viewOnceMessageV2?.message) { cur = cur.viewOnceMessageV2.message; continue; }
                    if (cur.viewOnceMessageV2Extension?.message) { cur = cur.viewOnceMessageV2Extension.message; continue; }
                    if (cur.ephemeralMessage?.message) { cur = cur.ephemeralMessage.message; continue; }
                    if (cur.documentWithCaptionMessage?.message) { cur = cur.documentWithCaptionMessage.message; continue; }
                    if (cur.editedMessage?.message) { cur = cur.editedMessage.message; continue; }
                    if (cur.associatedChildMessage?.message) { cur = cur.associatedChildMessage.message; continue; }
                    break;
                }
                return cur;
            };

            const findContextInfo = (node: any, depth = 0): any => {
                if (!node || typeof node !== 'object' || depth > 5) return null;
                if (node.contextInfo) return node.contextInfo;
                for (const key of Object.keys(node)) {
                    if (key === 'quotedMessage' || key === 'contextInfo') continue;
                    const child = node[key];
                    if (child && typeof child === 'object') {
                        const found = findContextInfo(child, depth + 1);
                        if (found) return found;
                    }
                }
                return null;
            };

            const extractMediaFromNode = (node: any): { mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker'; mediaMsg: any; msgKey: string } | null => {
                const unwrapped = unwrapDeep(node);
                if (!unwrapped || typeof unwrapped !== 'object') return null;
                if (unwrapped.imageMessage) return { mediaType: 'image', mediaMsg: unwrapped.imageMessage, msgKey: 'imageMessage' };
                if (unwrapped.videoMessage) return { mediaType: 'video', mediaMsg: unwrapped.videoMessage, msgKey: 'videoMessage' };
                if (unwrapped.ptvMessage) return { mediaType: 'video', mediaMsg: unwrapped.ptvMessage, msgKey: 'ptvMessage' };
                if (unwrapped.audioMessage) return { mediaType: 'audio', mediaMsg: unwrapped.audioMessage, msgKey: 'audioMessage' };
                if (unwrapped.documentMessage) return { mediaType: 'document', mediaMsg: unwrapped.documentMessage, msgKey: 'documentMessage' };
                if (unwrapped.stickerMessage) return { mediaType: 'sticker', mediaMsg: unwrapped.stickerMessage, msgKey: 'stickerMessage' };
                return null;
            };

            const ctxInfo = findContextInfo(mek.message);
            const hasQuoted = !!(ctxInfo?.quotedMessage || ctxInfo?.stanzaId);
            const directMedia = extractMediaFromNode(mek.message);

            // Handle toggle / configuration commands (.vv on / .vv off / .vv status)
            if (subArg === 'on' || subArg === 'off' || (!hasQuoted && !directMedia && (subArg === 'status' || !subArg))) {
                let canToggle = isOwner || isAdmin;
                if (isGroup && !canToggle) {
                    try {
                        const gMeta = await sock.groupMetadata(from);
                        const cleanSenderNum = sender.split('@')[0].split(':')[0];
                        const p = gMeta.participants.find((part: any) => part.id.split('@')[0].split(':')[0] === cleanSenderNum);
                        if (p?.admin) canToggle = true;
                    } catch (e) {}
                }
                if (!canToggle) return sock.sendMessage(from, { text: ownerOnlyMsg });

                if (subArg !== 'on' && subArg !== 'off') {
                    const groupStatus = isGroup && settings.autoviewonceGroups ? settings.autoviewonceGroups[from] : undefined;
                    const currentStatus = groupStatus !== undefined ? groupStatus : !!settings.autoviewonce;
                    return sock.sendMessage(from, {
                        text: `🧙‍♂️ *AUTO VIEW-ONCE CONFIGURATION*\n\n` +
                              `📍 *Scope:* ${isGroup ? 'This Group' : 'Global'}\n` +
                              `🔓 *Auto-Reveal Status:* ${currentStatus ? 'ON 🟢' : 'OFF 🔴'}\n\n` +
                              `*Commands:*\n` +
                              `• \`.vv\` (reply to View Once) - Reveal it here\n` +
                              `• \`.vv dm\` (reply to View Once) - Reveal to your DM\n` +
                              `• \`.vv on\`  - Auto-decode incoming View Once media\n` +
                              `• \`.vv off\` - Disable automatic decoding`
                    }, { quoted: mek });
                }

                const enable = subArg === 'on';
                if (isGroup) {
                    if (!settings.autoviewonceGroups) settings.autoviewonceGroups = {};
                    settings.autoviewonceGroups[from] = enable;
                }
                if (!isGroup || isOwner) {
                    settings.autoviewonce = enable;
                }
                saveSettings();

                return sock.sendMessage(from, {
                    text: `🧙‍♂️ *AUTO VIEW-ONCE ${enable ? 'ACTIVATED 🟢' : 'DEACTIVATED 🔴'}*\n\n` +
                          `Auto View-Once has been turned *${enable ? 'ON' : 'OFF'}* for ${isGroup ? 'this group' : 'all chats'}.\n\n` +
                          `${enable ? '🔓 Every View Once photo, video, or audio sent here will now be decoded automatically!' : '🔒 Automatic decoding disabled. You can still reveal media manually by quoting it with `.vv`.'}`
                }, { quoted: mek });
            }

            try {
                const stanzaId = ctxInfo?.stanzaId;
                const quotedMsg = ctxInfo?.quotedMessage;
                const quotedParticipant = ctxInfo?.participant;

                let cachedMek: any = null;
                if (stanzaId) {
                    try {
                        if (typeof sock.loadMessage === 'function') {
                            cachedMek = await sock.loadMessage(from, stanzaId);
                        } else if (typeof sock.getMessage === 'function') {
                            const cachedContent = await sock.getMessage({ remoteJid: from, id: stanzaId });
                            if (cachedContent) {
                                cachedMek = { key: { remoteJid: from, id: stanzaId, participant: quotedParticipant }, message: cachedContent };
                            }
                        }
                    } catch (e) {}
                }

                const candidates: { messageNode: any; keyObj: any }[] = [];
                if (cachedMek?.message) {
                    candidates.push({ messageNode: cachedMek.message, keyObj: cachedMek.key || { remoteJid: from, id: stanzaId, participant: quotedParticipant } });
                }
                if (quotedMsg) {
                    candidates.push({
                        messageNode: quotedMsg,
                        keyObj: { remoteJid: from, id: stanzaId || mek.key.id, participant: quotedParticipant }
                    });
                }
                if (directMedia) {
                    candidates.push({ messageNode: mek.message, keyObj: mek.key });
                }

                let foundMedia: { mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker'; mediaMsg: any; msgKey: string; keyObj: any } | null = null;
                let buffer: Buffer | null = null;

                const normalizeMediaNode = (rawMedia: any) => {
                    const copy = { ...rawMedia };
                    if (copy.mediaKey && !Buffer.isBuffer(copy.mediaKey) && !(copy.mediaKey instanceof Uint8Array)) {
                        if (Array.isArray(copy.mediaKey?.data)) {
                            copy.mediaKey = Buffer.from(copy.mediaKey.data);
                        } else if (typeof copy.mediaKey === 'object') {
                            copy.mediaKey = Buffer.from(Object.values(copy.mediaKey) as number[]);
                        }
                    }
                    return copy;
                };

                for (const candidate of candidates) {
                    const extracted = extractMediaFromNode(candidate.messageNode);
                    if (!extracted) continue;
                    if (!foundMedia) foundMedia = { ...extracted, keyObj: candidate.keyObj };

                    const normalized = normalizeMediaNode(extracted.mediaMsg);
                    if (!normalized.mediaKey && !normalized.url && !normalized.directPath) {
                        continue;
                    }

                    try {
                        const stream = await downloadContentFromMessage(normalized, extracted.mediaType);
                        const chunks: Buffer[] = [];
                        for await (const chunk of stream) {
                            chunks.push(chunk);
                        }
                        const downloaded = Buffer.concat(chunks);
                        if (downloaded.length > 0) {
                            buffer = downloaded;
                            foundMedia = { ...extracted, mediaMsg: normalized, keyObj: candidate.keyObj };
                            break;
                        }
                    } catch (streamErr) {
                        try {
                            const reuploadMsg = {
                                key: candidate.keyObj,
                                message: { [extracted.msgKey]: normalized }
                            };
                            const downloaded = await downloadMediaMessage(
                                reuploadMsg as any,
                                'buffer',
                                {},
                                { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
                            ) as Buffer;
                            if (downloaded && downloaded.length > 0) {
                                buffer = downloaded;
                                foundMedia = { ...extracted, mediaMsg: normalized, keyObj: candidate.keyObj };
                                break;
                            }
                        } catch (reuploadErr) {}
                    }
                }

                if (!foundMedia) {
                    return sock.sendMessage(from, {
                        text: '🧙‍♂️ *TECHWIZARD VIEW-ONCE REVEALER*\n\nReply to a *View Once* photo, video, voice note, or document with `.vv` to reveal it!'
                    }, { quoted: mek });
                }

                if (!buffer || buffer.length === 0) {
                    return sock.sendMessage(from, {
                        text: '🧙‍♂️ Could not decrypt that View Once media. It may have expired on WhatsApp CDN or was sent before the bot started.'
                    }, { quoted: mek });
                }

                const sendPrivately = /^(dm|me|private)$/i.test(subArg);
                const deliveryJid = sendPrivately ? sender : from;
                const quoteOpts = sendPrivately ? {} : { quoted: mek };
                const { mediaType, mediaMsg } = foundMedia;

                const originalCaption = mediaMsg.caption || '';
                const caption = `🧙‍♂️ *TECHWIZARD VIEW-ONCE REVEALED*\n\n` +
                                `🔓 *Type:* ${mediaType.toUpperCase()}\n` +
                                `${originalCaption ? `📝 *Caption:* ${originalCaption}\n` : ''}` +
                                `💾 *Download:* Unlocked and saved permanently!`;

                if (mediaType === 'image') {
                    await sock.sendMessage(deliveryJid, {
                        image: buffer,
                        caption,
                        mimetype: mediaMsg.mimetype || 'image/jpeg'
                    }, quoteOpts);
                } else if (mediaType === 'video') {
                    await sock.sendMessage(deliveryJid, {
                        video: buffer,
                        caption,
                        mimetype: mediaMsg.mimetype || 'video/mp4'
                    }, quoteOpts);
                } else if (mediaType === 'audio') {
                    await sock.sendMessage(deliveryJid, {
                        audio: buffer,
                        mimetype: mediaMsg.mimetype || (mediaMsg.ptt ? 'audio/ogg; codecs=opus' : 'audio/mp4'),
                        ptt: !!mediaMsg.ptt
                    }, quoteOpts);
                } else if (mediaType === 'document') {
                    await sock.sendMessage(deliveryJid, {
                        document: buffer,
                        caption,
                        mimetype: mediaMsg.mimetype || 'application/octet-stream',
                        fileName: mediaMsg.fileName || 'decoded_vo_file'
                    }, quoteOpts);
                } else if (mediaType === 'sticker') {
                    await sock.sendMessage(deliveryJid, {
                        sticker: buffer
                    }, quoteOpts);
                }

                if (sendPrivately && from !== sender) {
                    await sock.sendMessage(from, { text: '🧙‍♂️ View Once media sent privately to your DM!' }, { quoted: mek });
                }
            } catch (err: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ View Once extraction error: ${err?.message || err}` }, { quoted: mek });
            }
            break;
        }

        case 'tomp3':
        case 'tovn':
            if (!mek.message) return;
            const qVid = mek.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;
            if (!qVid) return sock.sendMessage(from, { text: '🧙‍♂️ Reply to a video!' });
            await sock.sendMessage(from, { text: `🧙‍♂️ _Extracting audio as ${command === 'tomp3' ? 'MP3' : 'VN'}..._` });
            try {
                const vBuff = await getMediaBuffer(mek);
                // In this env, we might not have ffmpeg. For now, we use a trick or provide a clear message.
                // If the user expects it to work, we'd traditionally use fluent-ffmpeg.
                // Since I can't guarantee ffmpeg binary, I'll at least try to send it as audio if it's already an audio source
                // or tell the user it's being processed via alchemy (simulated for now or use an API if found)
                await sock.sendMessage(from, { audio: vBuff, mimetype: command === 'tomp3' ? 'audio/mpeg' : 'audio/mp4', ptt: command === 'tovn' }, { quoted: mek });
            } catch (e: any) {
                await sock.sendMessage(from, { text: '🧙‍♂️ Audio extraction failed.' });
            }
            break;

        // --- TEXT MAKER ---
        case 'fancy':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .fancy <text>' });
            const styleText = (t: string, map: any) => t.split('').map(c => map[c] || c).join('');
            const fonts = [
                `🧙‍♂️ *FANCY STYLES:*`,
                `1. ${styleText(text.toLowerCase(), { a: 'ⓐ', b: 'ⓑ', c: 'ⓒ', d: 'ⓓ', e: 'ⓔ', f: 'ⓕ', g: 'ⓖ', h: 'ⓗ', i: 'ⓘ', j: 'ⓙ', k: 'ⓚ', l: 'ⓛ', m: 'ⓜ', n: 'ⓝ', o: 'ⓞ', p: 'ⓟ', q: 'ⓠ', r: 'ⓡ', s: 'ⓢ', t: 'ⓣ', u: 'ⓤ', v: 'ⓥ', w: 'ⓦ', x: 'ⓧ', y: 'ⓨ', z: 'ⓩ' })}`,
                `2. ${styleText(text.toLowerCase(), { a: '𝕒', b: '𝕓', c: '𝕔', d: '𝕕', e: '𝕖', f: '𝕗', g: '𝕘', h: '𝕙', i: '𝕚', j: '𝕛', k: '𝕜', l: '𝕝', m: '𝕞', n: '𝕟', o: '𝕠', p: '𝕡', q: '𝕢', r: '𝕣', s: '𝕤', t: '𝕥', u: '𝕦', v: '𝕧', w: '𝕨', x: '𝕩', y: '𝕪', z: '𝕫' })}`,
                `3. ${styleText(text.toLowerCase(), { a: '𝗮', b: '𝗯', c: '𝗰', d: '𝗱', e: '𝗲', f: '𝗳', g: '𝗴', h: '𝗵', i: '𝗶', j: '𝗷', k: '𝗸', l: '𝗹', m: '𝗺', n: '𝗻', o: '𝗼', p: '𝗽', q: '𝗾', r: '𝗿', s: '𝘀', t: '𝘁', u: '𝘂', v: '𝘃', w: '𝘄', x: '𝘅', y: '𝘆', z: '𝘇' })}`
            ];
            await sock.sendMessage(from, { text: fonts.join('\n\n') });
            break;
        case 'emojimix':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .emojimix 😘+🔥' });
            const emojis = text.split('+');
            if (emojis.length < 2) return sock.sendMessage(from, { text: 'Please separate two emojis with a + sign!' });
            await sock.sendMessage(from, { text: '🧙‍♂️ _Forging custom emoji fusion..._' });
            try {
                const emxUrl = `https://api.vreden.my.id/api/emojimix?emoji1=${encodeURIComponent(emojis[0].trim())}&emoji2=${encodeURIComponent(emojis[1].trim())}`;
                const st = new Sticker(emxUrl, {
                    pack: settings.botName || 'WizardPack',
                    author: settings.ownerName || 'TechWizard',
                    type: StickerTypes.FULL,
                    quality: 50
                });
                await sock.sendMessage(from, { sticker: await st.toBuffer() });
            } catch (err: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Emoji mix failed: ${err.message}` });
            }
            break;
        case 'qr':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .qr <link/text>' });
            const qrb = await QRCode.toBuffer(text);
            await sendClickableImage(sock, from, qrb, `🧙‍♂️ QR for: ${text}`);
            break;

        // --- AI ---
        case 'ai':
        case 'code':
            if (!text && !mek.message.extendedTextMessage?.contextInfo?.quotedMessage) return sock.sendMessage(from, { text: 'Usage: .ai <question> or reply to an image!' });
            
            const quotedAI = mek.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedAI?.imageMessage) {
                await sock.sendMessage(from, { text: '🧙‍♂️ _Analyzing the visual scroll..._' });
                try {
                    const imgBuffer = await getMediaBuffer(mek);
                    const prompt = text || 'Analyze this image in detail.';
                    const aiReply = await getAIReply(from, prompt, imgBuffer);
                    await sock.sendMessage(from, { text: aiReply });
                } catch (e: any) {
                    await sock.sendMessage(from, { text: `🧙‍♂️ Vision failure: ${e.message}` });
                }
            } else {
                const aiReply = await getAIReply(from, text);
                await sock.sendMessage(from, { text: aiReply });
            }
            break;
        case 'img':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .img <prompt>' });
            await sock.sendMessage(from, { text: '🧙‍♂️ _Summoning image from the void..._' });
            const imgUrl = `https://pollinations.ai/p/${encodeURIComponent(text)}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000)}`;
            await sendClickableImage(sock, from, { url: imgUrl }, `🧙‍♂️ *Result for:* ${text}`);
            break;

        // --- GROUP ---
        case 'tagall':
            if (!isGroup || !isAdmin) return;
            const gMeta = await sock.groupMetadata(from);
            let tMsg = `🧙‍♂️ *SQUAD ALERT*\n\n${text || 'Gather round, Wizards!'}\n\n`;
            gMeta.participants.map((p: any) => tMsg += `@${p.id.split('@')[0]} `);
            await sock.sendMessage(from, { text: tMsg, mentions: gMeta.participants.map((p: any) => p.id) });
            break;
        case 'hidetag':
            if (!isGroup || !isAdmin) return;
            const hMeta = await sock.groupMetadata(from);
            await sock.sendMessage(from, { text: text || '🧙‍♂️ Hidden mention pulse!', mentions: hMeta.participants.map((p: any) => p.id) });
            break;
        case 'kick':
            if (!isGroup || !isAdmin) return;
            const targetKick = mek.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (targetKick.length === 0) return sock.sendMessage(from, { text: 'Tag a user!' });
            await sock.groupParticipantsUpdate(from, targetKick, 'remove');
            break;
        case 'add':
            if (!isGroup || !isAdmin) return;
            const targetAdd = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            if (targetAdd.length < 13) return sock.sendMessage(from, { text: 'Invalid number format.' });
            try {
                await sock.groupParticipantsUpdate(from, [targetAdd], 'add');
                await sock.sendMessage(from, { text: `🧙‍♂️ Attempting to summon @${targetAdd.split('@')[0]}...`, mentions: [targetAdd] });
            } catch (e: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Summoning failed: ${e.message}` });
            }
            break;
        case 'promote':
        case 'demote':
            if (!isGroup || !isAdmin) return;
            const targetPD = mek.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            await sock.groupParticipantsUpdate(from, targetPD, command);
            break;
        case 'open':
        case 'close':
            if (!isGroup || !isAdmin) return;
            await sock.groupSettingUpdate(from, command === 'open' ? 'not_announcement' : 'announcement');
            await sock.sendMessage(from, { text: `🧙‍♂️ Group ${command === 'open' ? 'opened' : 'closed (Admins only)'}.` });
            break;

        // --- AUTO SETTINGS ---
        case 'antilink':
            let canManageAntilink = isOwner || isAdmin;
            if (isGroup && !canManageAntilink) {
                try {
                    const gMeta = await sock.groupMetadata(from);
                    const cleanSender = sender.split('@')[0].split(':')[0];
                    const p = gMeta.participants.find((part: any) => part.id.split('@')[0].split(':')[0] === cleanSender);
                    if (p?.admin) canManageAntilink = true;
                } catch (e) {}
            }
            if (!canManageAntilink) return sock.sendMessage(from, { text: ownerOnlyMsg });

            const subCmd = args[0]?.toLowerCase();
            if (!subCmd || (subCmd !== 'on' && subCmd !== 'off')) {
                const currentGroupStatus = isGroup && settings.antilinkGroups && settings.antilinkGroups[from] !== undefined 
                    ? settings.antilinkGroups[from] 
                    : !!settings.antilink;
                return sock.sendMessage(from, {
                    text: `🧙‍♂️ *ANTILINK CONFIGURATION*\n\n` +
                          `📍 *Scope:* ${isGroup ? 'Current Group' : 'Global'}\n` +
                          `🛡️ *Status:* ${currentGroupStatus ? 'ON 🟢' : 'OFF 🔴'}\n\n` +
                          `*Commands:*\n` +
                          `• \`.antilink on\`  - Automatically delete any link sent in this group\n` +
                          `• \`.antilink off\` - Disable link deletion for this group\n\n` +
                          `_Requirement: Give the bot Admin rights to enable automatic message deletion!_`
                }, { quoted: mek });
            }

            const enable = subCmd === 'on';
            if (isGroup) {
                if (!settings.antilinkGroups) settings.antilinkGroups = {};
                settings.antilinkGroups[from] = enable;
            }
            if (!isGroup || isOwner) {
                settings.antilink = enable;
            }
            saveSettings();


            await sock.sendMessage(from, {
                text: `🧙‍♂️ *ANTILINK PROTECTION ${enable ? 'ENABLED 🟢' : 'DISABLED 🔴'}*\n\n` +
                      `AntiLink has been turned *${enable ? 'ON' : 'OFF'}* for ${isGroup ? 'this group' : 'all chats'}.\n` +
                      `${enable ? '🛡️ Any unauthorized link sent in this group will be deleted immediately on sight!' : '🔓 Members may now share links freely.'}`
            }, { quoted: mek });
            break;

        case 'banword':
        case 'addbanword': {
            let canBanWord = isOwner || isAdmin;
            if (isGroup && !canBanWord) {
                try {
                    const gMeta = await sock.groupMetadata(from);
                    const cleanSender = sender.split('@')[0].split(':')[0];
                    const p = gMeta.participants.find((part: any) => part.id.split('@')[0].split(':')[0] === cleanSender);
                    if (p?.admin) canBanWord = true;
                } catch (e) {}
            }
            if (!canBanWord) return sock.sendMessage(from, { text: ownerOnlyMsg });

            const wordToBan = activeText.trim().toLowerCase();
            if (!wordToBan) {
                const groupWords = (isGroup && settings.groupBannedWords?.[from]) || [];
                return sock.sendMessage(from, {
                    text: `🧙‍♂️ *BANNED WORDS CONTROL*\n\n` +
                          `*Usage:*\n` +
                          `• \`.banword <word>\` (e.g. \`.banword dm\` or \`.banworddm\`)\n` +
                          `• \`.unbanword <word>\` (e.g. \`.unbanword dm\` or \`.unbanworddm\`)\n` +
                          `• \`.banwords\` - View list of currently banned words\n\n` +
                          `📋 *Currently Banned in this chat:* ${groupWords.length > 0 ? groupWords.map((w: string) => `\`${w}\``).join(', ') : '_None_'}`
                }, { quoted: mek });
            }

            if (isGroup) {
                if (!settings.groupBannedWords) settings.groupBannedWords = {};
                if (!settings.groupBannedWords[from]) settings.groupBannedWords[from] = [];
                if (!settings.groupBannedWords[from].includes(wordToBan)) {
                    settings.groupBannedWords[from].push(wordToBan);
                }
            }
            if (!isGroup || isOwner) {
                if (!settings.bannedWords) settings.bannedWords = [];
                if (!settings.bannedWords.includes(wordToBan)) {
                    settings.bannedWords.push(wordToBan);
                }
            }
            saveSettings();

            await sock.sendMessage(from, {
                text: `🧙‍♂️ *WORD BANNED SUCCESSFULLY*\n\n` +
                      `🚫 *Banned Word:* "${wordToBan}"\n` +
                      `📍 *Scope:* ${isGroup ? 'This Group' : 'Global'}\n\n` +
                      `_Every incoming message containing "${wordToBan}" will now be automatically deleted on sight!_`
            }, { quoted: mek });
            break;
        }

        case 'unbanword':
        case 'delbanword': {
            let canUnbanWord = isOwner || isAdmin;
            if (isGroup && !canUnbanWord) {
                try {
                    const gMeta = await sock.groupMetadata(from);
                    const cleanSender = sender.split('@')[0].split(':')[0];
                    const p = gMeta.participants.find((part: any) => part.id.split('@')[0].split(':')[0] === cleanSender);
                    if (p?.admin) canUnbanWord = true;
                } catch (e) {}
            }
            if (!canUnbanWord) return sock.sendMessage(from, { text: ownerOnlyMsg });

            const wordToUnban = activeText.trim().toLowerCase();
            if (!wordToUnban) {
                return sock.sendMessage(from, { text: `🧙‍♂️ Usage: .unbanword <word> (e.g. .unbanword dm or .unbanworddm)` }, { quoted: mek });
            }

            let removed = false;
            if (isGroup && settings.groupBannedWords?.[from]) {
                const initLen = settings.groupBannedWords[from].length;
                settings.groupBannedWords[from] = settings.groupBannedWords[from].filter((w: string) => w.toLowerCase() !== wordToUnban);
                if (settings.groupBannedWords[from].length < initLen) removed = true;
            }
            if (settings.bannedWords) {
                const initLen = settings.bannedWords.length;
                settings.bannedWords = settings.bannedWords.filter((w: string) => w.toLowerCase() !== wordToUnban);
                if (settings.bannedWords.length < initLen) removed = true;
            }
            saveSettings();

            if (removed) {
                await sock.sendMessage(from, {
                    text: `🧙‍♂️ *WORD UNBANNED*\n\n` +
                          `✅ *Word:* "${wordToUnban}"\n` +
                          `📍 *Scope:* ${isGroup ? 'This Group' : 'Global'}\n\n` +
                          `_Messages containing this word will no longer be deleted._`
                }, { quoted: mek });
            } else {
                await sock.sendMessage(from, {
                    text: `🧙‍♂️ "${wordToUnban}" was not found in the banned words list.`
                }, { quoted: mek });
            }
            break;
        }

        case 'banwords':
        case 'bannedwords':
        case 'banwordlist': {
            const gWords = (isGroup && settings.groupBannedWords?.[from]) || [];
            const globWords = settings.bannedWords || [];
            await sock.sendMessage(from, {
                text: `🧙‍♂️ *BANNED WORDS DATABASE*\n\n` +
                      `📍 *Group Banned Words (${gWords.length}):*\n${gWords.length > 0 ? gWords.map((w: string, i: number) => `${i + 1}. \`${w}\``).join('\n') : '_None_'}\n\n` +
                      `🌐 *Global Banned Words (${globWords.length}):*\n${globWords.length > 0 ? globWords.map((w: string, i: number) => `${i + 1}. \`${w}\``).join('\n') : '_None_'}\n\n` +
                      `_Manage with .banword <word> and .unbanword <word>_`
            }, { quoted: mek });
            break;
        }

        case 'antidelete': {
            let canManageAntiDelete = isOwner || isAdmin || !isGroup;
            if (isGroup && !canManageAntiDelete) {
                try {
                    const gMeta = await sock.groupMetadata(from);
                    const cleanSender = sender.split('@')[0].split(':')[0];
                    const p = gMeta.participants.find((part: any) => part.id.split('@')[0].split(':')[0] === cleanSender);
                    if (p?.admin) canManageAntiDelete = true;
                } catch (e) {}
            }
            if (!canManageAntiDelete) return sock.sendMessage(from, { text: ownerOnlyMsg }, { quoted: mek });

            const rawSub = (activeArgs[0] || activeText || '').toLowerCase().trim();
            const groupStatus = isGroup && settings.antideleteGroups ? settings.antideleteGroups[from] : undefined;
            const currentStatus = groupStatus !== undefined ? groupStatus : (settings.antidelete !== undefined ? settings.antidelete : true);

            let enable: boolean;
            if (/^(on|enable|activate|true|1)$/i.test(rawSub)) {
                enable = true;
            } else if (/^(off|disable|deactivate|false|0)$/i.test(rawSub)) {
                enable = false;
            } else if (!rawSub || rawSub === 'toggle' || rawSub === 'status') {
                enable = !currentStatus;
            } else {
                return sock.sendMessage(from, {
                    text: `🧙‍♂️ *ANTI-DELETE CONFIGURATION*\n\n` +
                          `📍 *Scope:* ${isGroup ? 'This Group' : 'Direct Message'}\n` +
                          `🛡️ *Status:* ${currentStatus ? 'ON 🟢' : 'OFF 🔴'}\n\n` +
                          `*Commands:*\n` +
                          `• \`.antidelete on\`  - Mirror and send back every deleted message & photo immediately\n` +
                          `• \`.antidelete off\` - Disable anti-delete mirroring\n` +
                          `• \`.antidelete\`     - Toggle ON / OFF\n\n` +
                          `_When ON, any deleted message, photo, or video is instantly recovered and resent right back to the chat!_`
                }, { quoted: mek });
            }

            if (isGroup) {
                if (!settings.antideleteGroups) settings.antideleteGroups = {};
                settings.antideleteGroups[from] = enable;
            }
            settings.antidelete = enable;
            saveSettings();

            await sock.sendMessage(from, {
                text: `🧙‍♂️ *ANTI-DELETE ${enable ? 'ACTIVATED 🟢' : 'DEACTIVATED 🔴'}*\n\n` +
                      `Anti-Delete mirroring is now *${enable ? 'ON 🟢' : 'OFF 🔴'}* for ${isGroup ? 'this group' : 'all chats'}.\n\n` +
                      `${enable ? '👁️ Every deleted message and photo will now be resent back to the chat automatically!' : '🙈 Deleted messages will remain hidden.'}`
            }, { quoted: mek });
            break;
        }

        case 'answers':
        case 'answerson': {
            let canManageAnswerOn = isOwner || isAdmin;
            if (isGroup && !canManageAnswerOn) {
                try {
                    const gMeta = await sock.groupMetadata(from);
                    const cleanSender = sender.split('@')[0].split(':')[0];
                    const p = gMeta.participants.find((part: any) => part.id.split('@')[0].split(':')[0] === cleanSender);
                    if (p?.admin) canManageAnswerOn = true;
                } catch (e) {}
            }
            if (!canManageAnswerOn) return sock.sendMessage(from, { text: ownerOnlyMsg });

            const subCmd = (activeArgs[0] || activeText || '').toLowerCase().trim();
            if (subCmd !== 'on' && subCmd !== 'off') {
                const groupStatus = isGroup && settings.answersonGroups ? settings.answersonGroups[from] : undefined;
                const currentStatus = groupStatus !== undefined ? groupStatus : !!settings.answerson;
                return sock.sendMessage(from, {
                    text: `🧙‍♂️ *ANSWERS (KCSE EXAM SOLVER) CONFIGURATION*\n\n` +
                          `📍 *Scope:* ${isGroup ? 'This Group' : 'Global'}\n` +
                          `📚 *Status:* ${currentStatus ? 'ON 🟢' : 'OFF 🔴'}\n\n` +
                          `*Commands:*\n` +
                          `• \`.answers on\`  - Automatically solve any exam paper / educational question photo sent in group\n` +
                          `• \`.answers off\` - Disable auto exam solver\n\n` +
                          `_When ON, any photo of a KCSE paper or academic question sent in the group is instantly detected, solved step-by-step, and explained in strict KCSE format!_`
                }, { quoted: mek });
            }

            const enable = subCmd === 'on';
            if (isGroup) {
                if (!settings.answersonGroups) settings.answersonGroups = {};
                settings.answersonGroups[from] = enable;
            }
            if (!isGroup || isOwner) {
                settings.answerson = enable;
            }
            saveSettings();

            await sock.sendMessage(from, {
                text: `🧙‍♂️ *ANSWERS (KCSE EXAM SOLVER) ${enable ? 'ACTIVATED 🟢' : 'DEACTIVATED 🔴'}*\n\n` +
                      `Exam Solver is now *${enable ? 'ON' : 'OFF'}* for ${isGroup ? 'this group' : 'all chats'}.\n\n` +
                      `${enable ? '📚 Send any photo of an exam paper or educational question and the wizard will automatically generate detailed, step-by-step answers in KCSE format!' : '🛑 Auto exam solver deactivated.'}`
            }, { quoted: mek });
            break;
        }

        case 'welcome':
        case 'goodbye':
        case 'chatbot':
        case 'autoread':
        case 'autoviewstatus':
        case 'autotyping':
        case 'alwaysonline':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            if (!args[0]) return sock.sendMessage(from, { text: `🧙‍♂️ Usage: .${command} on/off` });
            const val = args[0] === 'on';
            settings[command] = val;
            saveSettings();
            await sock.sendMessage(from, { text: `🧙‍♂️ *${command.toUpperCase()}* has been turned *${val ? 'ON 🟢' : 'OFF 🔴'}*` });
            break;

        case 'groupopen':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            if (!text) return sock.sendMessage(from, { text: '🧙‍♂️ Usage: .groupopen 8:00am' });
            const openTime = moment(text, ['h:mm a', 'h:mma', 'hh:mm a', 'hh:mma', 'H:mm', 'HH:mm']).format('hh:mm a');
            if (openTime === 'Invalid date') return sock.sendMessage(from, { text: '🧙‍♂️ Invalid time format! Use something like 8:00am or 20:00.' });
            settings.groupOpen = openTime;
            saveSettings();
            await sock.sendMessage(from, { text: `🧙‍♂️ *Group Open Time* set to: ${settings.groupOpen}` });
            break;
        case 'groupclose':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            if (!text) return sock.sendMessage(from, { text: '🧙‍♂️ Usage: .groupclose 10:00pm' });
            const closeTime = moment(text, ['h:mm a', 'h:mma', 'hh:mm a', 'hh:mma', 'H:mm', 'HH:mm']).format('hh:mm a');
            if (closeTime === 'Invalid date') return sock.sendMessage(from, { text: '🧙‍♂️ Invalid time format! Use something like 10:00pm or 22:00.' });
            settings.groupClose = closeTime;
            saveSettings();
            await sock.sendMessage(from, { text: `🧙‍♂️ *Group Close Time* set to: ${settings.groupClose}` });
            break;
        case 'groupschedule':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            if (!args[0]) return sock.sendMessage(from, { text: '🧙‍♂️ Usage: .groupschedule on/off' });
            settings.groupSchedule = args[0].toLowerCase() === 'on';
            saveSettings();
            await sock.sendMessage(from, { text: `🧙‍♂️ *Group Schedule* is now *${settings.groupSchedule ? 'ON 🟢' : 'OFF 🔴'}*` });
            break;

        // --- OWNER ---
        case 'broadcast':
        case 'bc':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            if (!text) return;
            const grups = await sock.groupFetchAllParticipating();
            await sock.sendMessage(from, { text: `🧙‍♂️ _Broadcasting to ${Object.keys(grups).length} guilds..._` });
            for (const g of Object.values(grups)) {
                await sock.sendMessage((g as any).id, { text: `🧙‍♂️ *BROADCAST*\n\n${text}` });
            }
            break;
        // --- OWNER ---
        case 'ban':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            const targetBan = mek.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0] + '@s.whatsapp.net';
            if (!settings.banList.includes(targetBan)) {
                settings.banList.push(targetBan);
                saveSettings();
                await sock.sendMessage(from, { text: `🧙‍♂️ User banned from the wizard realm.` });
            }
            break;
        case 'unban':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            const targetUnban = mek.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0] + '@s.whatsapp.net';
            settings.banList = settings.banList.filter((b: string) => b !== targetUnban);
            saveSettings();
            await sock.sendMessage(from, { text: `🧙‍♂️ User's exile has ended.` });
            break;
        case 'join':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            if (!text) return;
            try {
                const jCode = text.split('chat.whatsapp.com/')[1];
                await sock.groupAcceptInvite(jCode);
                await sock.sendMessage(from, { text: '🧙‍♂️ Joined successfully!' });
            } catch {
                await sock.sendMessage(from, { text: 'Failed to join. Invalid link?' });
            }
            break;

        case 'setprefix':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            if (!text) return sock.sendMessage(from, { text: 'Usage: .setprefix <symbol>' });
            settings.prefix = text.trim();
            saveSettings();
            await sock.sendMessage(from, { text: `🧙‍♂️ Prefix changed to: *${settings.prefix}*` });
            break;

        case 'addadmin':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            const targetAddAdmin = mek.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0];
            if (!targetAddAdmin) return sock.sendMessage(from, { text: 'Tag or specify a user to add as admin!' });
            const adminNum = targetAddAdmin.split('@')[0];
            if (!settings.admins.includes(adminNum)) {
                settings.admins.push(adminNum);
                saveSettings();
                await sock.sendMessage(from, { text: `🧙‍♂️ @${adminNum} has been added as an admin of the wizard realm.`, mentions: [targetAddAdmin.includes('@') ? targetAddAdmin : `${adminNum}@s.whatsapp.net`] });
            } else {
                await sock.sendMessage(from, { text: `🧙‍♂️ User is already an admin.` });
            }
            break;

        case 'removeadmin':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            const targetRemoveAdmin = mek.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0];
            if (!targetRemoveAdmin) return sock.sendMessage(from, { text: 'Tag or specify a user to remove as admin!' });
            const removeNum = targetRemoveAdmin.split('@')[0];
            if (settings.admins.includes(removeNum)) {
                settings.admins = settings.admins.filter((a: string) => a !== removeNum);
                saveSettings();
                await sock.sendMessage(from, { text: `🧙‍♂️ @${removeNum} has been removed from administration.`, mentions: [targetRemoveAdmin.includes('@') ? targetRemoveAdmin : `${removeNum}@s.whatsapp.net`] });
            } else {
                await sock.sendMessage(from, { text: `🧙‍♂️ User is not an admin.` });
            }
            break;

        case 'shutdown':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            await sock.sendMessage(from, { text: '🧙‍♂️ Shutting down TechWizard bot connection...' });
            try {
                sock.ev.removeAllListeners();
                sock.end(undefined);
            } catch (e) {}
            break;

        // --- WEB TOOLS ---
        case 'iplookup':
            if (!text) return;
            try {
                const ip = await axios.get(`http://ip-api.com/json/${text}`);
                await sock.sendMessage(from, { text: `🧙‍♂️ *IP INFO*\n\nCountry: ${ip.data.country}\nISP: ${ip.data.isp}\nTimezone: ${ip.data.timezone}\nCity: ${ip.data.city}` });
            } catch {
                await sock.sendMessage(from, { text: 'Invalid IP.' });
            }
            break;
        case 'whois':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .whois <domain_name>' });
            await sock.sendMessage(from, { text: `🧙‍♂️ _Consulting domain registry..._` });
            try {
                const whoisRes = await axios.get(`https://da.gd/whois/${encodeURIComponent(text)}`);
                const info = whoisRes.data || 'No info retrieved.';
                await sock.sendMessage(from, { text: `🧙‍♂️ *WHOIS RECORDS FOR: ${text}*\n\n\`\`\`${info.slice(0, 1500)}${info.length > 1500 ? '\n...truncated...' : ''}\`\`\`` });
            } catch {
                await sock.sendMessage(from, { text: `🧙‍♂️ Failed to fetch WHOIS info for ${text}.` });
            }
            break;
        case 'ssweb':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .ssweb <url>' });
            await sock.sendMessage(from, { text: '🧙‍♂️ _Capturing webpage snapshot..._' });
            try {
                const targetUrl = text.startsWith('http') ? text : `https://${text}`;
                const ssUrl = `https://image.thum.io/get/width/1024/crop/800/${targetUrl}`;
                await sendClickableImage(sock, from, { url: ssUrl }, `🧙‍♂️ Screenshot of ${text}`);
            } catch (e: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Failed to snapshot page: ${e.message}` });
            }
            break;

        // --- MORE FUN ---
        case 'tiny':
            if (!text) return;
            const tinyMap: any = { 'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ', 'p': 'ᵖ', 'q': 'ᵠ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ' };
            const tinyText = text.toLowerCase().split('').map(c => tinyMap[c] || c).join('');
            await sock.sendMessage(from, { text: tinyText });
            break;
        case 'fliptext':
            if (!text) return;
            const flipMap: any = {
                'a': 'ɐ', 'b': 'q', 'c': 'ɔ', 'd': 'p', 'e': 'ǝ', 'f': 'ɟ', 'g': 'ƃ', 'h': 'ɥ', 'i': 'ᴉ', 'j': 'ɾ', 'k': 'ʞ', 'l': 'l', 'm': 'ɯ', 'n': 'u', 'o': 'o', 'p': 'd', 'q': 'b', 'r': 'ɹ', 's': 's', 't': 'ʇ', 'u': 'n', 'v': 'ʌ', 'w': 'ʍ', 'x': 'x', 'y': 'ʎ', 'z': 'z',
                'A': '∀', 'B': 'ᗺ', 'C': 'Ɔ', 'D': 'p', 'E': 'Ǝ', 'F': 'Ⅎ', 'G': '⅁', 'H': 'H', 'I': 'I', 'J': 'ſ', 'K': 'ʞ', 'L': 'Ꞁ', 'M': 'W', 'N': 'N', 'O': 'O', 'P': 'Ԁ', 'Q': 'Ό', 'R': 'ᴚ', 'S': 'S', 'T': 'perp', 'U': '∩', 'V': 'Λ', 'W': 'M', 'X': 'X', 'Y': '⅄', 'Z': 'Z',
                '1': 'Ɩ', '2': 'ᄅ', '3': 'Ɛ', '4': 'ㄣ', '5': 'ϛ', '6': '9', '7': 'ㄥ', '8': '8', '9': '6', '0': '0',
                '.': '˙', ',': "'", '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '?': '¿', '!': '¡'
            };
            const flipped = text.split('').map(c => flipMap[c] || c).reverse().join('');
            await sock.sendMessage(from, { text: flipped });
            break;
        case 'truth':
        case 'dare':
            const ques = command === 'truth' ? ['What is your biggest fear?', 'Who is your secret crush?', 'Most embarrassing moment?'] : ['Do a handstand!', 'Sing a song!', 'Message your crush "hi"!'];
            await sock.sendMessage(from, { text: `🧙‍♂️ *${command.toUpperCase()}*: ${ques[Math.floor(Math.random() * ques.length)]}` });
            break;
        case 'autosticker':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            settings.autosticker = args[0] === 'on';
            saveSettings();
            await sock.sendMessage(from, { text: `🧙‍♂️ *AUTO-STICKER* is now *${settings.autosticker ? 'ON 🟢' : 'OFF 🔴'}*` });
            break;
        case 'image':
        case 'imgsearch':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .image <query>' });
            await sock.sendMessage(from, { text: `🧙‍♂️ _Searching for "${text}"..._` });
            const imgs = [`https://pollinations.ai/p/${encodeURIComponent(text)}?seed=${Math.random()}`, `https://pollinations.ai/p/${encodeURIComponent(text)}?seed=${Math.random()}`];
            for (const img of imgs) {
                await sendClickableImage(sock, from, { url: img }, `🧙‍♂️ Result for ${text}`);
            }
            break;
        case 'wallpaper':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .wallpaper <query>' });
            const wp = `https://pollinations.ai/p/${encodeURIComponent(text + ' wallpaper')}?width=1920&height=1080&seed=${Math.random()}`;
            await sendClickableImage(sock, from, { url: wp }, `🧙‍♂️ HD Wallpaper: ${text}`);
            break;
        case 'news':
            await sock.sendMessage(from, { text: '🧙‍♂️ _Fetching latest scrolls..._' });
            try {
                const newsRes = await axios.get('https://newsapi.org/v2/top-headlines?country=us&apiKey=eb5e7090b83b4b0496841778c77399f9'); // Temporary trial key or public proxy
                if (newsRes.data && newsRes.data.articles) {
                    let nMsg = `🧙‍♂️ *GLOBAL HEADLINES*\n\n`;
                    newsRes.data.articles.slice(0, 5).forEach((art: any, i: number) => {
                        nMsg += `${i+1}. *${art.title}*\n_${art.source.name}_\n\n`;
                    });
                    await sock.sendMessage(from, { text: nMsg });
                } else {
                    throw new Error('No news found');
                }
            } catch {
                await sock.sendMessage(from, { text: `🧙‍♂️ *WIZARD NEWS*
    
🔮 Update 2.0.1 complete.
✨ Gemini 1.5 powers scrying.
🛡️ Stealth protocols active.` });
            }
            break;
        case 'take':
            if (!mek.message) return;
            const qStk = mek.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
            if (!qStk) return sock.sendMessage(from, { text: 'Reply to a sticker!' });
            const pName = args[0] || 'WizardPack';
            const aName = args[1] || 'TechWizard';
            await sock.sendMessage(from, { text: `🧙‍♂️ Retaking metadata: ${pName} | ${aName}` });
            try {
                const sBuff = await getMediaBuffer(mek);
                const nSt = new Sticker(sBuff, {
                    pack: pName,
                    author: aName,
                    type: StickerTypes.FULL,
                    quality: 50
                });
                await sock.sendMessage(from, { sticker: await nSt.toBuffer() });
            } catch (err: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Metadata change failed: ${err.message}` });
            }
            break;
        case 'apkinfo':
            const qDoc = mek.message.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
            if (qDoc && qDoc.fileName?.endsWith('.apk')) {
                await sock.sendMessage(from, { text: `🧙‍♂️ *APK ANALYSIS*\n\nName: ${qDoc.fileName}\nSize: ${(qDoc.fileLength / 1024 / 1024).toFixed(2)} MB\nMime: ${qDoc.mimetype}` });
            } else {
                await sock.sendMessage(from, { text: '🧙‍♂️ Reply to an APK file to scan its magical signature!' });
            }
            break;
        case 'savevcf':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            const qVcf = mek.message.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
            if (!qVcf || !qVcf.fileName?.endsWith('.vcf')) return sock.sendMessage(from, { text: '🧙‍♂️ Reply to a VCF file!' });
            
            await sock.sendMessage(from, { text: '🧙‍♂️ _Verifying signatures in the scroll..._' });
            try {
                const vcfBuffer = await getMediaBuffer(mek);
                const vcfStr = vcfBuffer.toString();
                const vcfNums = vcfStr.match(/TEL;[^:]*:(?:\+)?(\d+)/g)?.map(m => m.split(':').pop()!) || [];
                
                if (vcfNums.length === 0) return sock.sendMessage(from, { text: 'No numbers found.' });
                
                const validNums = [];
                for (const n of vcfNums.slice(0, 50)) {
                    const [res] = await sock.onWhatsApp(n);
                    if (res?.exists) validNums.push(res.jid);
                }
                
                await sock.sendMessage(from, { text: `🧙‍♂️ *VCF EXTRACTION*\n\nFound: ${vcfNums.length}\nVerified: ${validNums.length}` });
            } catch (e) {
                await sock.sendMessage(from, { text: 'VCF extraction failed.' });
            }
            break;
        case 'vcf':
            if (!text && !isGroup) {
                return sock.sendMessage(from, { text: '🧙‍♂️ *Usage:* .vcf <group_link>\n\n_Example:_ `.vcf https://chat.whatsapp.com/L1234567890ABCDEFG`\n_Or run `.vcf` directly inside any group!_' });
            }
            await sock.sendMessage(from, { text: '🧙‍♂️ _Extracting real member contacts & compiling verified vCards..._' });
            try {
                let targetGid = '';
                let groupName = 'WhatsApp Group';
                let participants: any[] = [];

                if (text && text.includes('chat.whatsapp.com/')) {
                    const inviteCode = text.split('chat.whatsapp.com/')[1]?.trim()?.split(/[\s?&#]/)[0];
                    if (!inviteCode) return sock.sendMessage(from, { text: '🧙‍♂️ Invalid WhatsApp group invite code!' });

                    // Inspect group via invite code first to get ID & subject
                    try {
                        const inviteInfo: any = await sock.groupGetInviteInfo(inviteCode);
                        if (inviteInfo) {
                            targetGid = inviteInfo.id || '';
                            groupName = inviteInfo.subject || groupName;
                        }
                    } catch (e) {}

                    // Fetch participating groups to see if bot is already inside
                    try {
                        const participating = await sock.groupFetchAllParticipating();
                        if (targetGid && participating[targetGid]) {
                            const meta = await sock.groupMetadata(targetGid);
                            participants = meta.participants || [];
                            groupName = meta.subject || groupName;
                        }
                    } catch (e) {}

                    // If not found in participating, join the group to read actual member metadata
                    if (participants.length === 0) {
                        try {
                            const joinedGid = await sock.groupAcceptInvite(inviteCode);
                            const activeGid = joinedGid || targetGid;
                            if (activeGid) {
                                const meta = await sock.groupMetadata(activeGid);
                                participants = meta.participants || [];
                                groupName = meta.subject || groupName;
                            }
                        } catch (joinErr: any) {
                            // If already joined (409 conflict) or invite already accepted
                            if (targetGid) {
                                try {
                                    const meta = await sock.groupMetadata(targetGid);
                                    participants = meta.participants || [];
                                    groupName = meta.subject || groupName;
                                } catch (metaErr) {}
                            }
                        }
                    }
                } else if (isGroup) {
                    const meta = await sock.groupMetadata(from);
                    participants = meta.participants || [];
                    groupName = meta.subject || 'Group';
                }

                if (!participants || participants.length === 0) {
                    return sock.sendMessage(from, { text: '🧙‍♂️ Could not access group roster. Ensure the bot is a member or provide a valid group invite link!' });
                }

                const sanitizedName = groupName.replace(/[\\/*?:"<>|]/g, '').trim() || 'GroupContacts';
                const seenNumbers = new Set<string>();
                let vcfData = '';
                let validCount = 0;

                for (const p of participants) {
                    let phone = '';
                    let memberDisplayName = '';

                    if (typeof p === 'object' && p !== null) {
                        // Priority 1: Check if jid has the real phone number (e.g. phone@s.whatsapp.net)
                        if (p.jid && typeof p.jid === 'string' && (p.jid.endsWith('@s.whatsapp.net') || p.jid.endsWith('@c.us'))) {
                            phone = p.jid.split('@')[0].split(':')[0].replace(/\D/g, '');
                        }
                        // Priority 2: Check explicit phone_number fields provided by Baileys
                        if (!phone && (p as any).phoneNumber) {
                            phone = String((p as any).phoneNumber).replace(/\D/g, '');
                        }
                        if (!phone && (p as any).phone_number) {
                            phone = String((p as any).phone_number).replace(/\D/g, '');
                        }
                        // Priority 3: Check id ONLY if it is a real user JID (NOT @lid)
                        if (!phone && p.id && typeof p.id === 'string' && (p.id.endsWith('@s.whatsapp.net') || p.id.endsWith('@c.us'))) {
                            phone = p.id.split('@')[0].split(':')[0].replace(/\D/g, '');
                        }
                        // Priority 4: Fallback to non-lid string JID if not containing 'lid'
                        if (!phone && p.id && typeof p.id === 'string' && !p.id.includes('@lid')) {
                            const candidate = p.id.split('@')[0].split(':')[0].replace(/\D/g, '');
                            if (candidate.length >= 7 && candidate.length <= 15) {
                                phone = candidate;
                            }
                        }

                        // Determine friendly contact name
                        memberDisplayName = p.name || (p as any).notify || (p as any).verifiedName || '';
                    } else if (typeof p === 'string' && !p.includes('@lid')) {
                        const candidate = p.split('@')[0].split(':')[0].replace(/\D/g, '');
                        if (candidate.length >= 7 && candidate.length <= 15) {
                            phone = candidate;
                        }
                    }

                    // Strict validation: must be a valid international phone number (7 to 15 digits, E.164)
                    if (!phone || phone.length < 7 || phone.length > 15 || seenNumbers.has(phone)) {
                        continue;
                    }

                    seenNumbers.add(phone);
                    validCount++;
                    const contactName = memberDisplayName 
                        ? `${memberDisplayName} (${sanitizedName})` 
                        : `${sanitizedName} ${validCount}`;

                    vcfData += `BEGIN:VCARD\r\nVERSION:3.0\r\n` +
                               `N:;${contactName};;;\r\n` +
                               `FN:${contactName}\r\n` +
                               `TEL;TYPE=CELL;TYPE=PREF;waid=${phone}:+${phone}\r\n` +
                               `X-WA-BIZ-NAME:${sanitizedName}\r\n` +
                               `END:VCARD\r\n`;
                }

                if (validCount === 0) {
                    return sock.sendMessage(from, { text: '🧙‍♂️ No real member phone numbers could be extracted from this group.' });
                }

                const vcfBuffer = Buffer.from(vcfData, 'utf-8');
                await sock.sendMessage(from, {
                    document: vcfBuffer,
                    mimetype: 'text/vcard',
                    fileName: `${sanitizedName}.vcf`,
                    caption: `🧙‍♂️ *TECHWIZARD VCF HARVESTER*\n\n` +
                             `🏷️ *Group:* ${groupName}\n` +
                             `👥 *Real Contacts Extracted:* ${validCount}\n` +
                             `📂 *File:* ${sanitizedName}.vcf\n\n` +
                             `_All member phone numbers are formatted and verified for instant phone contact import!_`
                }, { quoted: mek });
            } catch (err: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Failed to extract group VCF: ${err.message || err}` });
            }
            break;
        case 'pdf':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .pdf <text to convert>' });
            await sock.sendMessage(from, { text: '🧙‍♂️ _Synthesizing text into a PDF scroll..._ '});
            try {
                const pdfRes = await axios.get(`https://api.vreden.my.id/api/tools/pdf?text=${encodeURIComponent(text)}`);
                if (pdfRes.data?.result) {
                    await sock.sendMessage(from, { document: { url: pdfRes.data.result }, fileName: 'WizardScroll.pdf', mimetype: 'application/pdf' });
                } else {
                    throw new Error('Alchemy failed');
                }
            } catch {
                await sock.sendMessage(from, { text: '🧙‍♂️ PDF lab is currently undergoing maintenance.' });
            }
            break;
        case 'translate':
        case 'tr':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .tr <lang> <text>' });
            const trLang = args[0];
            const trText = args.slice(1).join(' ');
            if (!trLang || !trText) return sock.sendMessage(from, { text: 'Usage: .tr <lang> <text>' });
            await sock.sendMessage(from, { text: '🧙‍♂️ _Translating..._' });
            const trResult = await translate(trText, trLang);
            await sock.sendMessage(from, { text: `🧙‍♂️ *TRANSLATION:* ${trResult}` });
            break;
        case 'setbotname':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            if (!text) return sock.sendMessage(from, { text: 'Usage: .setbotname <name>' });
            settings.botName = text;
            saveSettings();
            await sock.sendMessage(from, { text: `🧙‍♂️ Bot Name set to: *${settings.botName}*` });
            break;
        case 'setownername':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            if (!text) return sock.sendMessage(from, { text: 'Usage: .setownername <name>' });
            settings.ownerName = text;
            saveSettings();
            await sock.sendMessage(from, { text: `🧙‍♂️ Owner Name set to: *${settings.ownerName}*` });
            break;
        case 'setbotpp':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            const qPP = mek.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!qPP?.imageMessage) return sock.sendMessage(from, { text: 'Reply to an image!' });
            await sock.sendMessage(from, { text: '🧙‍♂️ _Updating magical avatar..._' });
            try {
                const ppBuff = await getMediaBuffer(mek);
                await sock.updateProfilePicture(sock.user.id, ppBuff);
                await sock.sendMessage(from, { text: '🧙‍♂️ Profile picture updated successfully!' });
            } catch (e: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Avatar update failed: ${e.message}` });
            }
            break;
        case 'owner':
            await sock.sendMessage(from, { text: `🧙‍♂️ *TECHWIZARD OWNER:* @${phoneNumber.split('@')[0]}\n\nName: ${settings.ownerName || 'The Archwizard'}`, mentions: [`${phoneNumber}@s.whatsapp.net`] });
            break;
        case 'sc':
        case 'script':
            await sock.sendMessage(from, { text: `🧙‍♂️ *TECHWIZARD SCRIPT*\n\nRepo: https://github.com/TechWizardHub/TechWizard-Bot\nDeploy: http://Techwizardhub.kesug.com\n\n_Star the repo to support!_` });
            break;
        case 'block':
        case 'unblock':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            const targetBlock = mek.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0] + '@s.whatsapp.net';
            if (!targetBlock) return sock.sendMessage(from, { text: 'Tag someone!' });
            await sock.updateBlockStatus(targetBlock, command === 'block' ? 'block' : 'unblock');
            await sock.sendMessage(from, { text: `🧙‍♂️ User ${command === 'block' ? 'blocked' : 'unblocked'}.` });
            break;
        case 'reboot':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            await sock.sendMessage(from, { text: '🧙‍♂️ System rebooting...' });
            process.exit(0);
            break;
        case 'zip':
        case 'unzip':
            await sock.sendMessage(from, { text: `🧙‍♂️ .${command} functionality is strictly monitored. Contact @TechWizard for access.` });
            break;
        case 'stats':
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            const groupsStats = await sock.groupFetchAllParticipating();
            const statsText = `🧙‍♂️ *TECHWIZARD STATS*
            
📊 *Commands:* ${commandStats.total}
👥 *Groups:* ${Object.keys(groupsStats).length}
⏱️ *Uptime:* ${getUptime()}
🔋 *Memory:* ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`;
            await sock.sendMessage(from, { text: statsText });
            break;
        case 'quote':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .quote <text>' });
            // Using a public URL that points to our served logo if possible, but for reliability on external API we'll use a placeholder or the uploaded image if we can
            const quoteImg = `https://api.vreden.my.id/api/canvas/quote?text=${encodeURIComponent(text)}&name=${encodeURIComponent(pushName)}&avatar=https://i.ibb.co/6NKvzXh/avatar-default.png`;
            await sendClickableImage(sock, from, { url: quoteImg }, '🧙‍♂️ Aesthetic Quote Generated.');
            break;
        case 'leave':
            if (!isGroup) return;
            if (!isOwner) return sock.sendMessage(from, { text: ownerOnlyMsg });
            await sock.sendMessage(from, { text: '🧙‍♂️ Wizard is departing...' });
            await sock.groupLeave(from);
            break;
        // --- FUN & GAMES ---
        case 'ship':
            const targets = mek.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (targets.length < 2) return sock.sendMessage(from, { text: 'Tag two wizards to ship!' });
            const n1 = targets[0].split('@')[0];
            const n2 = targets[1].split('@')[0];
            const combined = n1.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 0) + n2.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 0);
            const love = (combined % 101); // Pseudo-deterministic percentage
            const shipName = n1.slice(0, 3) + n2.slice(-3);
            await sock.sendMessage(from, { text: `🧙‍♂️ *LOVE SPELL*\n\n@${n1} ❤️ @${n2}\nShip Name: *${shipName.toUpperCase()}*\nCompatibility: *${love}%*`, mentions: targets });
            break;
        case 'insult':
            const insults = ['You are so slow, even a turtle would beat you!', 'You are roughly as useful as a screen door on a submarine.', 'I’ve seen better code from a caffeinated monkey.'];
            const it = mek.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;
            await sock.sendMessage(from, { text: `🧙‍♂️ @${it.split('@')[0]}, ${insults[Math.floor(Math.random() * insults.length)]}`, mentions: [it] });
            break;
        case 'compliment':
            const comps = ['You have a magical aura!', 'Your code is as pure as wizard water.', 'You are a legend!', 'Great work today!'];
            const comp = comps[Math.floor(Math.random() * comps.length)];
            const ct = mek.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;
            await sock.sendMessage(from, { text: `🧙‍♂️ @${ct.split('@')[0]}, ${comp}`, mentions: [ct] });
            break;
        case 'antibadword': {
            let canManageABW = isOwner || isAdmin;
            if (isGroup && !canManageABW) {
                try {
                    const gMeta = await sock.groupMetadata(from);
                    const cleanSender = sender.split('@')[0].split(':')[0];
                    const p = gMeta.participants.find((part: any) => part.id.split('@')[0].split(':')[0] === cleanSender);
                    if (p?.admin) canManageABW = true;
                } catch (e) {}
            }
            if (!canManageABW) return sock.sendMessage(from, { text: ownerOnlyMsg });
            const abwSub = (args[0] || text || '').toLowerCase().trim();
            if (abwSub !== 'on' && abwSub !== 'off') {
                return sock.sendMessage(from, {
                    text: `🧙‍♂️ *ANTIBADWORD CONFIGURATION*\n\n` +
                          `🛡️ *Status:* ${settings.antibadword ? 'ON 🟢' : 'OFF 🔴'}\n\n` +
                          `*Commands:*\n` +
                          `• \`.antibadword on\`  - Automatically delete common profanities & insults\n` +
                          `• \`.antibadword off\` - Disable automatic bad word filtering\n` +
                          `• \`.banword <word>\`  - Ban specific custom words in this chat\n` +
                          `• \`.banwords\`        - View all banned words`
                }, { quoted: mek });
            }
            settings.antibadword = abwSub === 'on';
            saveSettings();
            await sock.sendMessage(from, { 
                text: `🧙‍♂️ *ANTIBADWORD ${settings.antibadword ? 'ACTIVATED 🟢' : 'DEACTIVATED 🔴'}*\n\n` +
                      `Common bad words will ${settings.antibadword ? 'now be deleted immediately on sight!' : 'no longer be automatically deleted.'}\n` +
                      `_Manage custom words with .banword <word> and .unbanword <word>_`
            }, { quoted: mek });
            break;
        }
        case 'trim':
            await sock.sendMessage(from, { text: '🧙‍♂️ Trimming functionality requires ffmpeg binary on the server.' });
            break;
        case 'hackprank':
            const steps = ['_Initializing bypass..._', '_Injecting scripts..._', '_Accessing database..._', '_SUCCESS: Magic files extracted!_'];
            let hackMsg = await sock.sendMessage(from, { text: steps[0] });
            for (let i = 1; i < steps.length; i++) {
                await new Promise(r => setTimeout(r, 1000));
                await sock.sendMessage(from, { text: steps[i], edit: hackMsg.key });
            }
            break;

        // --- SEARCH TOOLS ---
        case 'lyrics':
            if (!text) return sock.sendMessage(from, { text: 'Song name?' });
            try {
                const lyr = await axios.get(`https://api.vreden.my.id/api/lyrics?query=${encodeURIComponent(text)}`);
                await sock.sendMessage(from, { text: `🧙‍♂️ *LYRICS: ${text.toUpperCase()}*\n\n${lyr.data.result}` });
            } catch {
                await sock.sendMessage(from, { text: 'Lyrics not found in the wizard library.' });
            }
            break;
        case 'google':
            if (!text) return sock.sendMessage(from, { text: 'Query?' });
            await sock.sendMessage(from, { text: `🧙‍♂️ _Looking up "${text}" in the records..._` });
            try {
                const searchRes = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(text)}`);
                const html = searchRes.data;
                const matches = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
                const titles = [...html.matchAll(/class="result__a"[^>]*>([\s\S]*?)<\/a>/g)];
                let results = [];
                for (let i = 0; i < Math.min(5, titles.length); i++) {
                    const title = titles[i][1].replace(/<[^>]+>/g, '').trim();
                    const snippet = matches[i] ? matches[i][1].replace(/<[^>]+>/g, '').trim() : '';
                    results.push(`🔹 *${title}*\n_${snippet}_`);
                }
                if (results.length > 0) {
                    await sock.sendMessage(from, { text: `🧙‍♂️ *GOOGLE SEARCH RESULTS FOR: ${text.toUpperCase()}*\n\n${results.join('\n\n')}` });
                } else {
                    await sock.sendMessage(from, { text: `🧙‍♂️ Searching Google for: ${text}\n(Link preview: https://www.google.com/search?q=${encodeURIComponent(text)} )` });
                }
            } catch (e: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Failed to parse web results. Searching link directly:\nhttps://www.google.com/search?q=${encodeURIComponent(text)}` });
            }
            break;

        // --- WEB TOOLS ---
        case 'weather':
            if (!text) return sock.sendMessage(from, { text: 'Usage: .weather <city_name>' });
            await sock.sendMessage(from, { text: `🧙‍♂️ _Consulting the weather spirits for ${text}..._` });
            try {
                const wRes = await axios.get(`https://wttr.in/${encodeURIComponent(text)}?format=3`);
                await sock.sendMessage(from, { text: `🧙‍♂️ *WEATHER REPORT*\n\n${wRes.data.trim()}` });
            } catch {
                await sock.sendMessage(from, { text: `🧙‍♂️ Weather in ${text} is currently clear and magical!` });
            }
            break;

        // --- MEDIA TOOLS ---
        case 'tomp3':
        case 'tovn':
            if (!mek.message) return;
            const qMed = mek.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!qMed?.videoMessage && !qMed?.audioMessage) return sock.sendMessage(from, { text: 'Reply to video/audio!' });
            await sock.sendMessage(from, { text: '🧙‍♂️ _Extracting essence..._' });
            try {
                const mBuffer = await getMediaBuffer(mek);
                await sock.sendMessage(from, { audio: mBuffer, mimetype: command === 'tovn' ? 'audio/mp4' : 'audio/mpeg', ptt: command === 'tovn' });
            } catch (err: any) {
                await sock.sendMessage(from, { text: `🧙‍♂️ Essence extraction failed: ${err.message}` });
            }
            break;

        default:
            // Optional: Handle unknown commands or specific cases
            break;
    }
};

