<?php
require __DIR__ . '/vendor/autoload.php';

use Ratchet\App;
use App\GameServer;
use App\DB;

$config = require __DIR__ . '/config.php';
$loop   = \React\EventLoop\Loop::get();
$db     = new DB($config['db']);
$server = new GameServer($loop, $db);

$app = new App($config['ws']['host'], $config['ws']['port'], '0.0.0.0', $loop);
$app->route('/ws', $server, ['*']);

echo "\n";
echo " ⚔  ReflexShowdown WebSocket Server\n";
echo "    ws://localhost:{$config['ws']['port']}/ws\n\n";

$app->run();
