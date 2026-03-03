const { findMatchingRule } = require('./rules');
const { askClaude } = require('./ai');
const path = require('path');
const fs = require('fs');

async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');

  // Abaikan pesan grup (kecuali diaktifkan di .env)
  if (isGroup && process.env.ALLOW_GROUPS !== 'true') return;

  // Ambil teks pesan
  const text = msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.imageMessage?.caption
    || '';

  if (!text.trim()) return;

  const sender = jid.split('@')[0];
  const timestamp = new Date().toLocaleString('id-ID');
  console.log('[' + timestamp + '] Pesan dari ' + sender + ': ' + text);

  // Kirim tanda "sedang mengetik..."
  await sock.sendPresenceUpdate('composing', jid);

  try {
    // Cari rule yang cocok
    const rule = findMatchingRule(text);

    if (rule) {
      console.log('  > Rule cocok: ' + rule.id);
      await handleRule(sock, jid, msg, rule, text);
    } else {
      // Tidak ada rule -> jawab dengan Claude AI
      const aiReply = await askClaude(text);
      await sock.sendMessage(jid, { text: aiReply }, { quoted: msg });
    }
  } catch (err) {
    console.error('Error saat handle pesan:', err.message);
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
      // Kirim file LALU kirim teks
      await sendFile(sock, jid, msg, rule);
      if (rule.text) {
        await sock.sendMessage(jid, { text: rule.text }, { quoted: msg });
      }
      break;

    case 'file+ai':
      // Kirim file LALU jawaban AI berdasarkan konteks
      await sendFile(sock, jid, msg, rule);
      const aiReply = await askClaude(userText, rule.ai_context || '');
      await sock.sendMessage(jid, { text: aiReply }, { quoted: msg });
      break;

    case 'ai':
      // Jawab AI dengan konteks khusus dari rule
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
    await sock.sendMessage(jid, {
      text: 'Maaf, file tidak ditemukan. Hubungi admin.'
    }, { quoted: msg });
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  const caption = rule.caption || fileName;

  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const videoExts = ['.mp4', '.mov', '.avi', '.mkv'];

  if (imageExts.includes(ext)) {
    await sock.sendMessage(jid, { image: fileBuffer, caption }, { quoted: msg });
  } else if (videoExts.includes(ext)) {
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
  const mimes = {
    '.pdf':  'application/pdf',
    '.doc':  'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls':  'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt':  'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip':  'application/zip',
    '.rar':  'application/x-rar-compressed',
    '.txt':  'text/plain',
    '.mp3':  'audio/mpeg',
  };
  return mimes[ext] || 'application/octet-stream';
}

module.exports = { handleMessage };
