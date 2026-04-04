<?php
require __DIR__ . '/vendor/autoload.php';

use Ratchet\Server\IoServer;
use Ratchet\Http\HttpServer;
use Ratchet\WebSocket\WsServer;
use App\GameServer;
use App\DB;

$config  = require __DIR__ . '/config.php';
$wsHost  = $config['ws']['host'];
$wsPort  = $config['ws']['port'];

// ── Satu event loop untuk socket + timer game ─────────────────────────────
//
// PENJELASAN KENAPA SEBELUMNYA LANGSUNG STOP:
//   IoServer::factory() membuat loop baru sendiri (Loop B).
//   Kita punya loop dari Loop::get() (Loop A).
//   Dua loop berbeda: Loop A tidak punya socket → run() langsung exit.
//
// FIX: inject loop yang sama ke socket DAN IoServer DAN GameServer.
//
$loop = \React\EventLoop\Loop::get();

// Database & game logic
$db     = new DB($config['db']);
$server = new GameServer($loop, $db);

// Buat TCP socket dengan loop yang sama
// React\Socket\SocketServer = versi baru (react/socket >= 1.9)
// React\Socket\Server       = versi lama
if (class_exists('\React\Socket\SocketServer')) {
    $socket = new \React\Socket\SocketServer("{$wsHost}:{$wsPort}", [], $loop);
} else {
    $socket = new \React\Socket\Server("{$wsHost}:{$wsPort}", $loop);
}

// Inject socket + loop ke IoServer
$ioServer = new IoServer(
    new HttpServer(new WsServer($server)),
    $socket,
    $loop
);

echo "\n";
echo " ⚔  ReflexShowdown WebSocket Server\n";
echo "    Listening on {$wsHost}:{$wsPort}\n";
echo "    Lokal   : ws://localhost:{$wsPort}\n";
echo "    LAN     : ws://[IP-LAN-KAMU]:{$wsPort}\n";
echo "\n    Server berjalan... tekan Ctrl+C untuk berhenti.\n\n";

// Loop sekarang punya socket → akan BLOCK dan tidak exit
$loop->run();
