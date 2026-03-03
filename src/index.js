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
  console.log('WhatsApp AI Bot Starting - WA v' + version.join('.'));

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

  // Pairing code - digunakan saat pertama kali login
  if (!sock.authState.creds.registered) {
    const phoneNumber = process.env.PHONE_NUMBER;
    if (!phoneNumber) {
      console.error('ERROR: Isi PHONE_NUMBER di Railway Variables!');
      process.exit(1);
    }
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    await new Promise(r => setTimeout(r, 3000));
    const code = await sock.requestPairingCode(cleanNumber);
    console.log('\n=====================================');
    console.log('PAIRING CODE: ' + code);
    console.log('=====================================');
    console.log('Buka WhatsApp > Perangkat Tertaut > Tautkan dengan nomor telepon');
    console.log('Masukkan kode di atas, lalu tunggu...\n');
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode : null;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus, kode: ' + statusCode);
      if (shouldReconnect && retryCount < MAX_RETRY) {
        retryCount++;
        const delay = Math.min(3000 * retryCount, 30000);
        console.log('Reconnect ke-' + retryCount + ' dalam ' + (delay / 1000) + 's...');
        setTimeout(startBot, delay);
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