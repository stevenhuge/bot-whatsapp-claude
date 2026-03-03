import { getRules } from './rules.js';
import { askClaude } from './ai.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILES_FOLDER = path.join(__dirname, '../files');

const userSessions = new Map();
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 menit

export async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  if (isGroup && process.env.ALLOW_GROUPS !== 'true') return;

  const text = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption || ''
  ).trim();

  if (!text) return;

  console.log('[MSG] ' + jid.split('@')[0] + ': ' + text);
  await sock.sendPresenceUpdate('composing', jid);

  try {
    const session = userSessions.get(jid);
    const sessionValid = session && Date.now() < session.expiry;

    // User sedang dalam sesi pilih nomor
    if (sessionValid && session.waitingTaskPick) {
      await handleTaskPick(sock, jid, msg, text, session.files);
      return;
    }

    // Cek keyword trigger
    const config = getRules();
    const normalized = text.toLowerCase();
    const triggered = (config.rules || []).find(r =>
      r.active !== false &&
      r.keywords?.some(k => normalized.includes(k.toLowerCase()))
    );

    if (triggered) {
      await sendTaskMenu(sock, jid, msg);
    } else {
      const reply = await askClaude(text);
      await sock.sendMessage(jid, { text: reply }, { quoted: msg });
    }

  } catch (err) {
    console.error('Error:', err.message);
    await sock.sendMessage(jid, { text: 'Maaf, terjadi kesalahan. Coba lagi.' }, { quoted: msg });
  } finally {
    await sock.sendPresenceUpdate('paused', jid);
  }
}

// Baca folder files/ dan tampilkan daftar
async function sendTaskMenu(sock, jid, msg) {
  const allFiles = fs.readdirSync(FILES_FOLDER).filter(f => !f.startsWith('.'));

  if (allFiles.length === 0) {
    await sock.sendMessage(jid, { text: 'Belum ada file tersedia.' }, { quoted: msg });
    return;
  }

  let menuText = 'Ini tugas yang tersedia dari awan :\n\n';
  allFiles.forEach((file, i) => {
    menuText += `${i + 1}. ${file}\n`;
  });
  menuText += '\nBalas dengan nomor untuk mendapatkan file.\nContoh: ketik *1*';

  userSessions.set(jid, {
    waitingTaskPick: true,
    expiry: Date.now() + SESSION_TIMEOUT,
    files: allFiles,
  });

  await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
}

// Handle pilihan nomor
async function handleTaskPick(sock, jid, msg, text, files) {
  const num = parseInt(text.trim());

  if (isNaN(num) || num < 1 || num > files.length) {
    userSessions.delete(jid);
    const reply = await askClaude(text);
    await sock.sendMessage(jid, { text: reply }, { quoted: msg });
    return;
  }

  userSessions.delete(jid);
  const fileName = files[num - 1];
  const filePath = path.join(FILES_FOLDER, fileName);

  if (!fs.existsSync(filePath)) {
    await sock.sendMessage(jid, { text: 'File tidak ditemukan. Hubungi admin.' }, { quoted: msg });
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(fileName).toLowerCase();

  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    await sock.sendMessage(jid, { image: fileBuffer, caption: fileName }, { quoted: msg });
  } else if (['.mp4', '.mov'].includes(ext)) {
    await sock.sendMessage(jid, { video: fileBuffer, caption: fileName }, { quoted: msg });
  } else {
    await sock.sendMessage(jid, {
      document: fileBuffer,
      mimetype: getMimeType(ext),
      fileName,
      caption: fileName,
    }, { quoted: msg });
  }
  console.log('File terkirim: ' + fileName);
}

function getMimeType(ext) {
  const m = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
    '.txt': 'text/plain',
    '.mp3': 'audio/mpeg',
  };
  return m[ext] || 'application/octet-stream';
}
