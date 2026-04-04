<?php
namespace App;
use PDO;

class DB
{
    private PDO $pdo;

    public function __construct(array $cfg)
    {
        $dsn = "mysql:host={$cfg['host']};port={$cfg['port']};dbname={$cfg['name']};charset=utf8mb4";
        $this->pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }

    public function register(string $username, string $password): ?int
    {
        $stmt = $this->pdo->prepare('SELECT player_id FROM players WHERE username = ?');
        $stmt->execute([$username]);
        if ($stmt->fetch()) return null;
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $this->pdo->prepare('INSERT INTO players (username, password_hash) VALUES (?, ?)');
        $stmt->execute([$username, $hash]);
        return (int)$this->pdo->lastInsertId();
    }

    public function verifyLogin(string $username, string $password): ?array
    {
        $stmt = $this->pdo->prepare('SELECT player_id, username, password_hash FROM players WHERE username = ?');
        $stmt->execute([$username]);
        $row = $stmt->fetch();
        if (!$row || !password_verify($password, $row['password_hash'])) return null;
        return ['player_id' => $row['player_id'], 'username' => $row['username']];
    }

    public function createSession(string $roomCode, string $startedAt): int
    {
        $stmt = $this->pdo->prepare('INSERT INTO game_sessions (room_code, started_at) VALUES (?, ?)');
        $stmt->execute([$roomCode, $startedAt]);
        return (int)$this->pdo->lastInsertId();
    }

    public function createRound(int $sessionId, int $roundNum, int $signalTime): int
    {
        $stmt = $this->pdo->prepare('INSERT INTO rounds (session_id, round_number, signal_time) VALUES (?, ?, ?)');
        $stmt->execute([$sessionId, $roundNum, $signalTime]);
        return (int)$this->pdo->lastInsertId();
    }

    public function saveResult(int $roundId, int $playerId, int $clickTime, int $rtMs,
                               bool $isEarly, int $rank, int $points): void
    {
        $this->pdo->prepare('INSERT INTO round_results
            (round_id, player_id, click_time, reaction_time_ms, is_early_click, rank_in_round, points_earned)
            VALUES (?, ?, ?, ?, ?, ?, ?)')
        ->execute([$roundId, $playerId, $clickTime, $rtMs, (int)$isEarly, $rank, $points]);
    }

    public function finalizeSession(int $sessionId, int $winnerPlayerId, string $endedAt): void
    {
        $this->pdo->prepare('UPDATE game_sessions SET winner_player_id=?, ended_at=? WHERE session_id=?')
            ->execute([$winnerPlayerId, $endedAt, $sessionId]);
        $this->pdo->prepare('UPDATE players SET total_games=total_games+1 WHERE player_id IN
            (SELECT DISTINCT player_id FROM round_results WHERE round_id IN
             (SELECT round_id FROM rounds WHERE session_id=?))')
            ->execute([$sessionId]);
        $this->pdo->prepare('UPDATE players SET total_wins=total_wins+1 WHERE player_id=?')
            ->execute([$winnerPlayerId]);
    }
}
