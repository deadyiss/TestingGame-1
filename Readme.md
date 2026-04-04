# ⚔ ReflexShowdown Online

> Game duel refleks real-time berbasis WebSocket. Siapa yang paling cepat klik saat sinyal muncul — dialah pemenangnya. Tapi hati-hati, klik terlalu cepat sebelum sinyal = penalti −1 poin!

---

## Cara Main

1. **Register / Login** — buat akun dengan username dan password
2. **Buat Room** — pilih jumlah ronde (3–10), dapat kode 6 huruf
3. **Bagikan kode** ke teman, mereka join pakai kode tersebut
4. **Host klik Mulai Game** saat semua pemain sudah masuk
5. **Tunggu sinyal `!`** muncul di layar — lalu klik secepat mungkin!
6. Lihat **statistik & grafik reaction time** setelah semua ronde selesai

### Sistem Poin per Ronde
| Posisi | Poin |
|--------|------|
| 🥇 1st (tercepat) | +3 |
| 🥈 2nd | +2 |
| 🥉 3rd | +1 |
| Lainnya / Timeout | 0 |
| ⚠ Early Click (klik sebelum sinyal) | −1 |

---

## Stack Teknologi

| Layer | Teknologi |
|-------|-----------|
| Frontend | HTML5 · CSS3 · Vanilla JS · Canvas API · Chart.js |
| Backend | PHP 8.1+ · Ratchet WebSocket (cboden/ratchet) · React PHP |
| Database | MySQL 8.0+ |
| Deploy Backend | Railway.app |
| Deploy Frontend | Vercel |

---

## Struktur Folder

```
reflexshowdown-v3/
├── config.php          ← konfigurasi DB & WebSocket host/port
├── server.php          ← entry point: php server.php
├── composer.json       ← dependensi PHP (cboden/ratchet)
├── Dockerfile          ← untuk deploy Railway
├── src/
│   ├── DB.php          ← semua query MySQL (prepared statement)
│   ├── GameServer.php  ← WebSocket handler & router pesan
│   └── Room.php        ← state machine game & timer sinyal
├── public/             ← frontend (static files)
│   ├── index.html      ← single-page app (5 layar)
│   ├── css/style.css   ← tema dark samurai
│   └── js/
│       ├── config.js       ← URL WebSocket server
│       ├── game-canvas.js  ← renderer Canvas API
│       └── app.js          ← WebSocket client & UI logic
└── database/
    └── schema.sql      ← CREATE TABLE MySQL
```

---

## Instalasi Lokal

### Prasyarat
- PHP 8.1+
- Composer 2.x
- MySQL 8.0+

### Langkah

```bash
# 1. Install dependensi PHP
composer install

# 2. Buat database
mysql -u root -p < database/schema.sql

# 3. Konfigurasi (opsional — edit langsung atau buat .env)
#    Edit config.php bagian 'pass' => '' dengan password MySQL kamu

# 4. Jalankan WebSocket server (Terminal 1 — biarkan terbuka)
php server.php

# 5. Jalankan web server frontend (Terminal 2)
cd public
php -S 0.0.0.0:3000

# 6. Buka browser
# http://localhost:3000
```

### Multiplayer LAN

```bash
# Cari IP komputer server (Windows)
ipconfig
# Cari: IPv4 Address → misal 192.168.1.105

# Dari HP/laptop lain (WiFi yang sama):
# http://192.168.1.105:3000

# Pastikan firewall membuka port 8080 dan 3000:
netsh advfirewall firewall add rule name="RS-WS" dir=in action=allow protocol=TCP localport=8080
netsh advfirewall firewall add rule name="RS-Web" dir=in action=allow protocol=TCP localport=3000
```

> **Penting:** Web server harus dijalankan dengan `0.0.0.0`, bukan `localhost`.  
> Server WebSocket juga sudah dikonfigurasi ke `0.0.0.0` di `config.php`.

---

## Deploy Online Gratis (Railway + Vercel)

### Backend → Railway

1. Push kode ke GitHub
2. Buka [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Tambah MySQL addon → import `database/schema.sql` via Query tab
4. Set environment variables:

```
DB_HOST     = [dari MySQL addon Railway]
DB_PORT     = 3306
DB_NAME     = [dari MySQL addon Railway]
DB_USER     = [dari MySQL addon Railway]
DB_PASS     = [dari MySQL addon Railway]
WS_PORT     = 8080
```

5. Generate Domain di Settings → Networking → catat URL-nya

### Update config.js

Buka `public/js/config.js`, uncomment dan isi URL Railway:

```js
const WS_SERVER_URL = 'wss://NAMA-KAMU.up.railway.app';
```

### Frontend → Vercel

1. Push perubahan config.js ke GitHub
2. Buka [vercel.com](https://vercel.com) → New Project → import repo
3. **Root Directory: `public`** ← wajib diisi
4. Deploy → dapat URL `nama.vercel.app`

---

## Arsitektur WebSocket

```
Browser (app.js)
    │
    │  ws:// atau wss://
    ▼
server.php (IoServer + HttpServer + WsServer)
    │
    ▼
GameServer.php ── routing pesan JSON ──► register / login
    │                                    create_room / join_room
    │                                    start_game
    │                                    player_click
    │                                    leave_room
    ▼
Room.php ── state machine ──► WAITING
    │                         ROUND_WAIT  (timer acak 2–6 detik)
    │                         ROUND_SIGNAL (microtime server)
    │                         ROUND_RESULT (hitung RT & poin)
    │                         GAME_OVER   (statistik & simpan DB)
    ▼
DB.php ── MySQL ──► players | game_sessions | rounds | round_results
```

### Anti-cheat

Reaction time dihitung **sepenuhnya di server**:

```
RT = server_recv_time - server_signal_time
```

- `server_signal_time` = `microtime(true) * 1000` saat server broadcast sinyal
- `server_recv_time`   = `microtime(true) * 1000` saat server terima klik pemain
- Client tidak pernah mengirim timestamp — hanya mengirim event `player_click`

---

## Fitur

- ✅ Register & login dengan password (bcrypt)
- ✅ Room system dengan kode 6 huruf
- ✅ 2–4 pemain per room
- ✅ Sinyal acak 2–6 detik (dikontrol server)
- ✅ Anti-spam: setiap pemain hanya bisa klik 1x per ronde
- ✅ Early click penalty: klik sebelum sinyal = −1 poin
- ✅ Canvas renderer bergaya samurai (mudah diganti sprite)
- ✅ Grafik reaction time per ronde (Chart.js)
- ✅ Statistik: avg RT, best RT, konsistensi, tren 5 ronde
- ✅ Multiplayer LAN & online
- ✅ Auto-reconnect WebSocket

---

## Lisensi

Terinspirasi dari [ReflexShowdown by LuisBoto](https://github.com/LuisBoto/ReflexShowdown).  
Dikembangkan untuk keperluan tugas kelompok mata kuliah Pemrograman Web / Jaringan Komputer.
