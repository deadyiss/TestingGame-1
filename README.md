# ⚔ ReflexShowdown Online

Game duel refleks real-time berbasis WebSocket.  
Adaptasi dari [ReflexShowdown by LuisBoto](https://github.com/LuisBoto/ReflexShowdown)
dengan tambahan: online multiplayer, PHP backend, MySQL database, dan modul statistik.

## Stack Teknologi
| Layer | Teknologi |
|---|---|
| Frontend | HTML5 · CSS3 · Vanilla JS · Chart.js |
| Backend | PHP 8.1+ · Ratchet WebSocket (cboden/ratchet) |
| Database | MySQL 8.0+ |
| Build | Composer (PHP) |

## Instalasi (Lihat PANDUAN.md untuk langkah detail)

```bash
# 1. Install dependensi PHP
composer install

# 2. Konfigurasi database
cp config.php config.php  # edit 'your_password_here'
mysql -u root -p < database/schema.sql

# 3. Jalankan WebSocket server
php server.php

# 4. Akses via web server atau
cd public && php -S 0.0.0.0:3000
```

Buka browser: http://localhost:3000
