<?php
// ── Konfigurasi ReflexShowdown ───────────────────────────────────────────────
// Ganti nilai di bawah sesuai environment kamu

return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'reflexshowdown',
        'user' => 'root',
        'pass' => '',   // ← ganti ini
    ],
    'ws' => [
        'host' => 'localhost',
        'port' => 8080,
    ],
];
