<?php
/**
 * config.php
 *
 * PERUBAHAN DARI VERSI SEBELUMNYA:
 *   'host' diubah dari 'localhost' → '0.0.0.0'
 *
 * PENJELASAN:
 *   '0.0.0.0' artinya "dengarkan di SEMUA network interface".
 *   'localhost' hanya menerima koneksi dari komputer yang sama.
 *   Jika host = 'localhost', perangkat lain di LAN pasti gagal terhubung
 *   karena server hanya mau menerima dari loopback (127.0.0.1).
 *   Dengan '0.0.0.0', server menerima dari WiFi, kabel LAN, maupun internet.
 */

// Load .env jika ada (untuk development lokal)
if (file_exists(__DIR__ . '/.env')) {
    foreach (file(__DIR__ . '/.env') as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        [$key, $val] = array_pad(explode('=', $line, 2), 2, '');
        putenv(trim($key) . '=' . trim($val));
    }
}

function env(string $key, mixed $default = null): mixed {
    $val = getenv($key);
    return $val !== false ? $val : $default;
}

return [
    'db' => [
        'host' => env('DB_HOST', '127.0.0.1'),
        'port' => (int) env('DB_PORT', 3306),
        'name' => env('DB_NAME', 'reflexshowdown'),
        'user' => env('DB_USER', 'root'),
        'pass' => env('DB_PASS', ''),
    ],
    'ws' => [
        // FIX: '0.0.0.0' agar bisa diakses dari LAN / internet
        // Sebelumnya 'localhost' sehingga hanya bisa dari komputer sendiri
        'host' => env('WS_HOST', '0.0.0.0'),
        'port' => (int) env('WS_PORT', env('PORT', 8080)),
    ],
];
