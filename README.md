# WhatsApp AI Bot

Bot WhatsApp otomatis menggunakan **Baileys** + **Claude AI** (Anthropic).

## Fitur
- Auto-reply dengan Claude AI untuk pertanyaan umum
- Kirim file otomatis berdasarkan keyword (tugas, dokumen, dll)
- Sistem rules yang mudah dikonfigurasi lewat `config/rules.json`
- Support respons teks, file, atau kombinasi file+teks
- Deploy ke Railway / Render

---

## Setup Lokal

### 1. Clone & Install
```bash
git clone <repo-kamu>
cd whatsapp-ai-bot
npm install
```

### 2. Konfigurasi .env
```bash
cp .env.example .env
```
Edit `.env` dan isi:
- `PHONE_NUMBER` - nomor WA kamu (format: 6281234567890)
- `ANTHROPIC_API_KEY` - dari https://console.anthropic.com

### 3. Tambahkan file-file kamu
Taruh file di folder `files/`:
```
files/
  tugas_a.pdf
  tugas_b.pdf
  tugas_c.pdf
```

### 4. Konfigurasi rules
Edit `config/rules.json` untuk mengatur keyword dan respons.

### 5. Jalankan
```bash
npm start
```

Saat pertama kali jalan, akan muncul **PAIRING CODE**.  
Buka WhatsApp > Perangkat Tertaut > Tautkan dengan nomor telepon > masukkan kode.

---

## Deploy ke Railway

1. Push project ke GitHub (pastikan folder `auth/` dan `.env` ada di `.gitignore`)
2. Buka https://railway.app → New Project → Deploy from GitHub
3. Set Environment Variables:
   - `PHONE_NUMBER`
   - `ANTHROPIC_API_KEY`
4. Deploy! Lihat logs untuk mendapatkan Pairing Code

> ⚠️ **PENTING**: Setelah berhasil login, folder `auth/` harus persist.  
> Di Railway free tier, gunakan **Volume** agar sesi tidak hilang saat restart.  
> Caranya: Railway dashboard > project kamu > Add Volume > mount path `/app/auth`

---

## Deploy ke Render

1. Push ke GitHub
2. Buka https://render.com → New → Background Worker
3. Set Build Command: `npm install`
4. Set Start Command: `node src/index.js`
5. Set Environment Variables di dashboard
6. Deploy

> ⚠️ Di Render free tier, tambahkan **Disk** (Disks tab) dan mount ke `/app/auth`

---

## Konfigurasi Rules (`config/rules.json`)

```json
{
  "system_prompt": "Prompt karakter AI kamu di sini",
  "rules": [
    {
      "id": "nama_rule",
      "active": true,
      "keywords": ["kata kunci 1", "kata kunci 2"],
      "response_type": "file",
      "file_path": "files/nama_file.pdf",
      "caption": "Teks yang dikirim bersama file"
    }
  ]
}
```

### Tipe Respons:
| `response_type` | Keterangan |
|---|---|
| `text` | Kirim teks biasa |
| `file` | Kirim file |
| `file+text` | Kirim file lalu teks |
| `file+ai` | Kirim file lalu jawaban AI |
| `ai` | Jawaban AI dengan konteks dari rule |

---

## Struktur Folder
```
whatsapp-ai-bot/
  src/
    index.js      # Entry point utama
    handler.js    # Routing pesan
    ai.js         # Integrasi Claude AI
    rules.js      # Engine pencocokan keyword
  config/
    rules.json    # Konfigurasi rules & prompt
  files/          # Taruh file yang akan dikirim di sini
  auth/           # Sesi WhatsApp (auto-generated, jangan dihapus)
  .env            # Konfigurasi rahasia
```
