import { findMatchingRule } from './rules.js';
import { askClaude } from './ai.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  if (isGroup && process.env.ALLOW_GROUPS !== 'true') return;

  const text = msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.imageMessage?.caption
    || '';

  if (!text.trim()) return;

  const sender = jid.split('@')[0];
  console.log('[MSG] ' + sender + ': ' + text);

  await sock.sendPresenceUpdate('composing', jid);

  try {
    const rule = findMatchingRule(text);
    if (rule) {
      console.log('  > Rule: ' + rule.id);
      await handleRule(sock, jid, msg, rule, text);
    } else {
      const aiReply = await askClaude(text);
      await sock.sendMessage(jid, { text: aiReply }, { quoted: msg });
    }
  } catch (err) {
    console.error('Error handle pesan:', err.message);
    await sock.sendMessage(jid, {
      text: 'Maaf, terjadi kesalahan teknis. Silakan coba beberapa saat lagi.'
    }, { quoted: msg });
  } finally {
    await sock.sendPresenceUpdate('paused', jid);
  }
}

async function handleRule(sock, jid, msg, rule, userText) {
  switch (rule.response_type) {
    case 'text':
      await sock.sendMessage(jid, { text: rule.text }, { quoted: msg });
      break;
    case 'file':
      await sendFile(sock, jid, msg, rule);
      break;
    case 'file+text':
      await sendFile(sock, jid, msg, rule);
      if (rule.text) await sock.sendMessage(jid, { text: rule.text }, { quoted: msg });
      break;
    case 'file+ai':
      await sendFile(sock, jid, msg, rule);
      const aiReply = await askClaude(userText, rule.ai_context || '');
      await sock.sendMessage(jid, { text: aiReply }, { quoted: msg });
      break;
    case 'ai':
      const reply = await askClaude(userText, rule.ai_context || '');
      await sock.sendMessage(jid, { text: reply }, { quoted: msg });
      break;
    default:
      await sock.sendMessage(jid, { text: rule.text || 'Halo!' }, { quoted: msg });
  }
}

async function sendFile(sock, jid, msg, rule) {
  const filePath = path.join(__dirname, '../', rule.file_path);
  if (!fs.existsSync(filePath)) {
    console.warn('File tidak ditemukan:', filePath);
    await sock.sendMessage(jid, { text: 'Maaf, file tidak tersedia saat ini.' }, { quoted: msg });
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  const caption = rule.caption || fileName;

  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
    await sock.sendMessage(jid, { image: fileBuffer, caption }, { quoted: msg });
  } else if (['.mp4', '.mov', '.avi'].includes(ext)) {
    await sock.sendMessage(jid, { video: fileBuffer, caption }, { quoted: msg });
  } else {
    await sock.sendMessage(jid, {
      document: fileBuffer,
      mimetype: getMimeType(ext),
      fileName,
      caption,
    }, { quoted: msg });
  }
  console.log('  > File terkirim: ' + fileName);
}

function getMimeType(ext) {
  const m = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip', '.txt': 'text/plain', '.mp3': 'audio/mpeg',
  };
  return m[ext] || 'application/octet-stream';
}