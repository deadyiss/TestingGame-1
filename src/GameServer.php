<?php
namespace App;

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;
use React\EventLoop\LoopInterface;

class GameServer implements MessageComponentInterface
{
    private LoopInterface $loop;
    private DB            $db;
    private array         $rooms    = [];
    private array         $connRoom = [];
    private array         $connUser = [];

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
            'register'     => $this->register($conn, $connId, $msg),
            'login'        => $this->login($conn, $connId, $msg),
            'create_room'  => $this->createRoom($conn, $connId, $msg),
            'join_room'    => $this->joinRoom($conn, $connId, $msg),
            'start_game'   => $this->startGame($conn, $connId),
            'player_click' => $this->playerClick($connId),
            'leave_room'   => $this->leaveRoom($conn, $connId),
            default        => null,
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
                echo "    Room $code dihapus (kosong)\n";
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

    // ── Auth ──────────────────────────────────────────────────────────────────

    private function register(ConnectionInterface $conn, string $id, array $msg): void
    {
        $name = $this->sanitizeName($msg['username'] ?? '');
        $pass = $msg['password'] ?? '';

        if (!$name) {
            $this->err($conn, 'Username harus 2-20 karakter huruf/angka.');
            return;
        }
        if (strlen($pass) < 6) {
            $this->err($conn, 'Password minimal 6 karakter.');
            return;
        }

        $playerId = $this->db->register($name, $pass);
        if ($playerId === null) {
            $this->err($conn, 'Username sudah dipakai. Coba username lain.');
            return;
        }

        $this->connUser[$id] = ['username' => $name, 'player_id' => $playerId];
        $conn->send(json_encode([
            'type'      => 'login_ok',
            'username'  => $name,
            'player_id' => $playerId,
            'is_new'    => true,
        ]));
        echo "    Register: $name\n";
    }

    private function login(ConnectionInterface $conn, string $id, array $msg): void
    {
        $name = $this->sanitizeName($msg['username'] ?? '');
        $pass = $msg['password'] ?? '';

        if (!$name) {
            $this->err($conn, 'Username tidak valid.');
            return;
        }

        $player = $this->db->verifyLogin($name, $pass);
        if (!$player) {
            $this->err($conn, 'Username atau password salah.');
            return;
        }

        $this->connUser[$id] = $player;
        $conn->send(json_encode([
            'type'      => 'login_ok',
            'username'  => $player['username'],
            'player_id' => $player['player_id'],
            'is_new'    => false,
        ]));
        echo "    Login: {$player['username']}\n";
    }

    // ── Room ──────────────────────────────────────────────────────────────────

    private function createRoom(ConnectionInterface $conn, string $id, array $msg): void
    {
        if (!isset($this->connUser[$id])) {
            $this->err($conn, 'Login dulu sebelum membuat room.');
            return;
        }

        $this->leaveRoom($conn, $id);

        $rounds = max(3, min(10, (int)($msg['rounds'] ?? 5)));
        do {
            $code = strtoupper(substr(md5(uniqid('rs', true)), 0, 6));
        } while (isset($this->rooms[$code]));

        $room = new Room($code, $this->loop, $this->db, $rounds);
        $u    = $this->connUser[$id];
        $room->addPlayer($conn, $u['username'], $u['player_id']);
        $this->rooms[$code]  = $room;
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
        if (!isset($this->connUser[$id])) {
            $this->err($conn, 'Login dulu sebelum bergabung ke room.');
            return;
        }

        $code = strtoupper(trim($msg['code'] ?? ''));
        $room = $this->rooms[$code] ?? null;

        if (!$room) {
            $this->err($conn, 'Room tidak ditemukan. Cek kembali kode room.');
            return;
        }
        if ($room->state !== Room::S_WAITING) {
            $this->err($conn, 'Game sedang berlangsung, tidak bisa bergabung.');
            return;
        }
        if (count($room->active()) >= 4) {
            $this->err($conn, 'Room penuh (maksimal 4 pemain).');
            return;
        }

        $u = $this->connUser[$id];
        foreach ($room->active() as $p) {
            if ($p['username'] === $u['username']) {
                $this->err($conn, 'Kamu sudah ada di room ini.');
                return;
            }
        }

        $this->leaveRoom($conn, $id);

        $room->addPlayer($conn, $u['username'], $u['player_id']);
        $this->connRoom[$id] = $code;

        $room->broadcast([
            'type'    => 'room_update',
            'players' => $this->playerList($room),
            'host'    => $this->hostName($room),
        ]);
        $conn->send(json_encode([
            'type'    => 'room_joined',
            'code'    => $code,
            'is_host' => false,
            'players' => $this->playerList($room),
            'host'    => $this->hostName($room),
            'rounds'  => $room->totalRounds,
        ]));
        echo "    {$u['username']} bergabung ke room $code\n";
    }

    private function leaveRoom(ConnectionInterface $conn, string $id): void
    {
        $code = $this->connRoom[$id] ?? null;
        if (!$code || !isset($this->rooms[$code])) {
            return;
        }

        $room = $this->rooms[$code];
        $room->removePlayer($conn);
        unset($this->connRoom[$id]);

        if ($room->isEmpty()) {
            unset($this->rooms[$code]);
            echo "    Room $code dihapus (ditinggalkan)\n";
        } else {
            $room->broadcast([
                'type'    => 'room_update',
                'players' => $this->playerList($room),
                'host'    => $this->hostName($room),
            ]);
        }
    }

    private function startGame(ConnectionInterface $conn, string $id): void
    {
        $code = $this->connRoom[$id] ?? null;
        $room = $code ? ($this->rooms[$code] ?? null) : null;

        if (!$room) {
            return;
        }
        if ($id !== (string)$room->hostConnId) {
            $this->err($conn, 'Hanya host yang bisa memulai game.');
            return;
        }
        if (count($room->active()) < 2) {
            $this->err($conn, 'Minimal 2 pemain untuk memulai game.');
            return;
        }

        $room->startGame();
        echo "    Game dimulai di room $code\n";
    }

    private function playerClick(string $id): void
    {
        $code = $this->connRoom[$id] ?? null;
        if ($code && isset($this->rooms[$code])) {
            $this->rooms[$code]->handleClick($id);
        }
    }

    // ── Utils ─────────────────────────────────────────────────────────────────

    private function sanitizeName(string $raw): string
    {
        $name = trim(preg_replace('/[^a-zA-Z0-9_\- ]/u', '', $raw));
        return (strlen($name) >= 2 && strlen($name) <= 20) ? $name : '';
    }

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
