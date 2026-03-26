<?php
namespace App;

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;
use React\EventLoop\LoopInterface;

/**
 * GameServer — entry point semua koneksi WebSocket.
 * Routing pesan masuk ke Room yang sesuai.
 */
class GameServer implements MessageComponentInterface
{
    private LoopInterface $loop;
    private DB            $db;
    private array         $rooms      = [];   // code  => Room
    private array         $connRoom   = [];   // connId => room_code
    private array         $connUser   = [];   // connId => [username, player_id]

    public function __construct(LoopInterface $loop, DB $db)
    {
        $this->loop = $loop;
        $this->db   = $db;
    }

    public function onOpen(ConnectionInterface $conn): void
    {
        echo "[+] Koneksi baru #" . spl_object_id($conn) . "\n";
    }

    public function onMessage(ConnectionInterface $conn, $raw): void
    {
        $msg    = json_decode($raw, true);
        $type   = $msg['type'] ?? '';
        $connId = (string)spl_object_id($conn);

        match ($type) {
            'login'        => $this->login($conn, $connId, $msg),
            'create_room'  => $this->createRoom($conn, $connId, $msg),
            'join_room'    => $this->joinRoom($conn, $connId, $msg),
            'start_game'   => $this->startGame($conn, $connId),
            'player_click' => $this->playerClick($connId),
            default         => null,
        };
    }

    public function onClose(ConnectionInterface $conn): void
    {
        $connId = (string)spl_object_id($conn);
        echo "[-] Putus #$connId\n";

        $code = $this->connRoom[$connId] ?? null;
        if ($code && isset($this->rooms[$code])) {
            $room = $this->rooms[$code];
            $room->removePlayer($conn);
            if ($room->isEmpty()) {
                unset($this->rooms[$code]);
            } else {
                $room->broadcast([
                    'type'    => 'room_update',
                    'players' => $this->playerList($room),
                    'host'    => $this->hostName($room),
                ]);
            }
        }
        unset($this->connRoom[$connId], $this->connUser[$connId]);
    }

    public function onError(ConnectionInterface $conn, \Exception $e): void
    {
        echo "[ERR] " . $e->getMessage() . "\n";
        $conn->close();
    }

    // ── Handlers ──────────────────────────────────────────────────────────────

    private function login(ConnectionInterface $conn, string $id, array $msg): void
    {
        $name = trim($msg['username'] ?? '');
        if (strlen($name) < 2 || strlen($name) > 20) {
            return $this->err($conn, 'Username harus 2–20 karakter.');
        }
        $name   = htmlspecialchars($name, ENT_QUOTES);
        $player = $this->db->getOrCreatePlayer($name);
        $this->connUser[$id] = ['username' => $name, 'player_id' => $player['player_id']];
        $conn->send(json_encode(['type' => 'login_ok', 'username' => $name,
                                 'player_id' => $player['player_id']]));
        echo "    Login: $name\n";
    }

    private function createRoom(ConnectionInterface $conn, string $id, array $msg): void
    {
        if (!isset($this->connUser[$id])) return $this->err($conn, 'Login dulu.');
        $rounds = max(3, min(10, (int)($msg['rounds'] ?? 5)));
        // Generate kode unik 6 huruf kapital
        do { $code = strtoupper(substr(md5(uniqid('rs', true)), 0, 6)); }
        while (isset($this->rooms[$code]));

        $room = new Room($code, $this->loop, $this->db, $rounds);
        $u    = $this->connUser[$id];
        $room->addPlayer($conn, $u['username'], $u['player_id']);
        $this->rooms[$code]   = $room;
        $this->connRoom[$id] = $code;

        $conn->send(json_encode([
            'type'    => 'room_joined',
            'code'    => $code,
            'is_host' => true,
            'players' => $this->playerList($room),
            'host'    => $u['username'],
            'rounds'  => $rounds,
        ]));
        echo "    Room dibuat: $code oleh {$u['username']}\n";
    }

    private function joinRoom(ConnectionInterface $conn, string $id, array $msg): void
    {
        if (!isset($this->connUser[$id])) return $this->err($conn, 'Login dulu.');
        $code = strtoupper(trim($msg['code'] ?? ''));
        $room = $this->rooms[$code] ?? null;

        if (!$room)                                   return $this->err($conn, 'Room tidak ditemukan.');
        if ($room->state !== Room::S_WAITING)         return $this->err($conn, 'Game sedang berlangsung.');
        if (count($room->active()) >= 4)              return $this->err($conn, 'Room penuh (max 4).');

        $u = $this->connUser[$id];
        $room->addPlayer($conn, $u['username'], $u['player_id']);
        $this->connRoom[$id] = $code;

        // Beritahu semua
        $room->broadcast(['type' => 'room_update', 'players' => $this->playerList($room),
                          'host' => $this->hostName($room)]);
        // Kirim konfirmasi ke pemain baru
        $conn->send(json_encode([
            'type'    => 'room_joined',
            'code'    => $code,
            'is_host' => false,
            'players' => $this->playerList($room),
            'host'    => $this->hostName($room),
            'rounds'  => $room->totalRounds,
        ]));
        echo "    {$u['username']} bergabung ke $code\n";
    }

    private function startGame(ConnectionInterface $conn, string $id): void
    {
        $code = $this->connRoom[$id] ?? null;
        $room = $code ? ($this->rooms[$code] ?? null) : null;
        if (!$room) return;

        if ($id !== (string)$room->hostConnId) return $this->err($conn, 'Hanya host yang bisa memulai.');
        if (count($room->active()) < 2)         return $this->err($conn, 'Minimal 2 pemain.');

        $room->startGame();
        echo "    Game mulai di room $code\n";
    }

    private function playerClick(string $id): void
    {
        $code = $this->connRoom[$id] ?? null;
        if ($code && isset($this->rooms[$code]))
            $this->rooms[$code]->handleClick($id);
    }

    // ── Utils ─────────────────────────────────────────────────────────────────

    private function playerList(Room $room): array
    {
        return array_values(array_map(fn($p) => $p['username'], $room->active()));
    }

    private function hostName(Room $room): string
    {
        return $room->players[(string)$room->hostConnId]['username'] ?? '';
    }

    private function err(ConnectionInterface $conn, string $msg): void
    {
        $conn->send(json_encode(['type' => 'error', 'message' => $msg]));
    }
}
