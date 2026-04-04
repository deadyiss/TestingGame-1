/**
 * config.js — Konfigurasi URL WebSocket Server
 *
 * CARA PAKAI:
 *   Lokal / LAN  : tidak perlu ubah apapun, otomatis deteksi
 *   Railway      : uncomment baris WS_SERVER_URL di bawah dan isi URL Railway
 */

// ── PRODUCTION (Railway) — uncomment + isi URL kamu ──────────────────────
// const WS_SERVER_URL = 'wss://NAMA-KAMU.up.railway.app';

// ── AUTO DETECT (lokal & LAN) ─────────────────────────────────────────────
// Jika WS_SERVER_URL belum didefinisikan di atas, pakai deteksi otomatis:
//
//   - http://  → ws://   (lokal atau LAN, tidak ada SSL)
//   - https:// → wss://  (production dengan SSL)
//
// Ini menyelesaikan bug sebelumnya di mana LAN dipaksa pakai wss://
// padahal tidak ada SSL → koneksi selalu gagal dari HP/perangkat lain.
if (typeof WS_SERVER_URL === 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const hostname = window.location.hostname;
    window.WS_SERVER_URL = protocol + '://' + hostname + ':8080';
}

console.log('[Config] WS Server URL:', WS_SERVER_URL);
