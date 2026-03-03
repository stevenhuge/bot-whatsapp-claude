import 'dotenv/config';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { handleMessage } from './handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FOLDER = path.join(__dirname, '../auth');
const logger = pino({ level: 'silent' });
const PORT = process.env.PORT || 3000;

let retryCount = 0;
const MAX_RETRY = 5;
let currentQR = null;
let isConnected = false;

// ── Web server untuk tampilkan QR ──────────────────────────
const server = http.createServer(async (req, res) => {
  if (isConnected) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1 style="color:green;font-family:sans-serif;text-align:center;margin-top:100px">✅ Bot WhatsApp Terhubung!<br><small>Kamu bisa tutup halaman ini.</small></h1>');
    return;
  }

  if (!currentQR) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><head><meta http-equiv="refresh" content="3"></head>
    <body style="font-family:sans-serif;text-align:center;margin-top:100px">
      <h2>⏳ Menunggu QR Code...</h2>
      <p>Halaman akan refresh otomatis.</p>
    </body></html>`);
    return;
  }

  // Generate QR sebagai PNG
  try {
    const qrImage = await QRCode.toDataURL(currentQR, { scale: 10, margin: 2 });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><head><meta http-equiv="refresh" content="20"><title>WhatsApp QR</title></head>
    <body style="font-family:sans-serif;text-align:center;background:#f0f0f0">
      <h2 style="margin-top:30px">📱 Scan QR Code dengan WhatsApp</h2>
      <img src="${qrImage}" style="width:300px;height:300px;border:10px solid white;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.2)"/>
      <p style="color:#888">WhatsApp → Settings → Linked Devices → Link a Device</p>
      <p style="color:#aaa;font-size:12px">QR expired dalam ~60 detik. Halaman auto-refresh setiap 20 detik.</p>
    </body></html>`);
  } catch (e) {
    res.writeHead(500);
    res.end('Error generating QR');
  }
});

server.listen(PORT, () => {
  console.log(`\n🌐 Buka browser dan akses URL Railway kamu untuk scan QR`);
  console.log(`   Port: ${PORT}\n`);
});

// ── Bot WhatsApp ───────────────────────────────────────────
async function startBot() {
  if (!fs.existsSync(AUTH_FOLDER)) {
    fs.mkdirSync(AUTH_FOLDER, { recursive: true });
  }
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();
  console.log('WhatsApp AI Bot Starting...');

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    browser: ['WhatsApp AI Bot', 'Chrome', '120.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      console.log('QR Code siap! Buka URL Railway kamu di browser untuk scan.');
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode : null;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect && retryCount < MAX_RETRY) {
        retryCount++;
        setTimeout(startBot, Math.min(3000 * retryCount, 30000));
      } else if (statusCode === DisconnectReason.loggedOut) {
        console.log('Sesi habis. Hapus isi folder /auth dan restart.');
      }
    } else if (connection === 'open') {
      retryCount = 0;
      isConnected = true;
      currentQR = null;
      console.log('✅ Bot terhubung dan siap menerima pesan!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;
      await handleMessage(sock, msg);
    }
  });
}

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err.message));
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));
startBot().catch(console.error);