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
import { fileURLToPath } from 'url';
import qrcode from 'qrcode';
import { handleMessage } from './handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FOLDER = path.join(__dirname, '../auth');
const logger = pino({ level: 'silent' });
let retryCount = 0;
const MAX_RETRY = 5;

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
    printQRInTerminal: true,
    browser: ['WhatsApp AI Bot', 'Chrome', '120.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n==============================');
      console.log('SCAN QR CODE DI ATAS DENGAN WHATSAPP');
      console.log('==============================\n');
      // Simpan juga sebagai file PNG
      try {
        await qrcode.toFile(path.join(__dirname, '../qr.png'), qr, { scale: 8 });
        console.log('QR juga disimpan sebagai qr.png\n');
      } catch (e) {}
    }

    if (connection === 'close') {
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
      console.log('Bot terhubung dan siap menerima pesan!');
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
```

---

## Setelah Commit & Redeploy

Di Railway Logs akan muncul QR code berupa **karakter ASCII** seperti ini:
```
█▀▀▀▀▀█ ▄▄▀▄▀ █▀▀▀▀▀█
█ ███ █ ▄▀▄▀▄ █ ███ █
█ ▀▀▀ █ ▀▄▄▀▄ █ ▀▀▀ █
▀▀▀▀▀▀▀ ...