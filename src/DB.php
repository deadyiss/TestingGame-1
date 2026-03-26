<?php
namespace App;

use PDO;

/**
 * Database wrapper untuk ReflexShowdown.
 * Semua operasi tulis/baca ke MySQL dilakukan di sini.
 */
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

    // ── Pemain ────────────────────────────────────────────────────────────────

    /** Ambil atau buat data pemain berdasarkan username. */
    public function getOrCreatePlayer(string $username): array
    {
        $stmt = $this->pdo->prepare('SELECT player_id, username FROM players WHERE username = ?');
        $stmt->execute([$username]);
        $row = $stmt->fetch();
        if ($row) return $row;

        $stmt = $this->pdo->prepare('INSERT INTO players (username) VALUES (?)');
        $stmt->execute([$username]);
        return ['player_id' => (int)$this->pdo->lastInsertId(), 'username' => $username];
    }

    /** Statistik lengkap satu pemain untuk dashboard. */
    public function getPlayerStats(int $playerId): array
    {
        $stmt = $this->pdo->prepare('
            SELECT p.username, p.total_games, p.total_wins,
                   ROUND(p.total_wins * 100.0 / NULLIF(p.total_games,0), 1) AS win_rate,
                   MIN(rr.reaction_time_ms)                                  AS best_rt,
                   ROUND(AVG(rr.reaction_time_ms), 0)                        AS avg_rt
            FROM players p
            LEFT JOIN round_results rr
                   ON rr.player_id = p.player_id
                  AND rr.is_early_click = 0
                  AND rr.reaction_time_ms < 9000
            WHERE p.player_id = ?
            GROUP BY p.player_id
        ');
        $stmt->execute([$playerId]);
        return $stmt->fetch() ?: [];
    }

    /** Leaderboard global (top 20). */
    public function getLeaderboard(): array
    {
        return $this->pdo->query('
            SELECT username, total_games, total_wins,
                   ROUND(total_wins * 100.0 / NULLIF(total_games,0), 1) AS win_rate
            FROM players
            WHERE total_games > 0
            ORDER BY total_wins DESC, total_games ASC
            LIMIT 20
        ')->fetchAll();
    }

    // ── Sesi & Ronde ──────────────────────────────────────────────────────────

    public function createSession(string $roomCode, string $startedAt): int
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO game_sessions (room_code, started_at) VALUES (?, ?)'
        );
        $stmt->execute([$roomCode, $startedAt]);
        return (int)$this->pdo->lastInsertId();
    }

    public function createRound(int $sessionId, int $roundNum, int $signalTime): int
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO rounds (session_id, round_number, signal_time) VALUES (?, ?, ?)'
        );
        $stmt->execute([$sessionId, $roundNum, $signalTime]);
        return (int)$this->pdo->lastInsertId();
    }

    public function saveResult(
        int $roundId, int $playerId, int $clickTime,
        int $rtMs, bool $isEarly, int $rank, int $points
    ): void {
        $stmt = $this->pdo->prepare('
            INSERT INTO round_results
                (round_id, player_id, click_time, reaction_time_ms, is_early_click, rank_in_round, points_earned)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute([$roundId, $playerId, $clickTime, $rtMs, (int)$isEarly, $rank, $points]);
    }

    public function finalizeSession(int $sessionId, int $winnerPlayerId, string $endedAt): void
    {
        $this->pdo->prepare(
            'UPDATE game_sessions SET winner_player_id = ?, ended_at = ? WHERE session_id = ?'
        )->execute([$winnerPlayerId, $endedAt, $sessionId]);

        // Update statistik agregat pemain
        $this->pdo->prepare('
            UPDATE players SET total_games = total_games + 1
            WHERE player_id IN (
                SELECT DISTINCT player_id FROM round_results
                WHERE round_id IN (SELECT round_id FROM rounds WHERE session_id = ?)
            )
        ')->execute([$sessionId]);

        $this->pdo->prepare(
            'UPDATE players SET total_wins = total_wins + 1 WHERE player_id = ?'
        )->execute([$winnerPlayerId]);
    }
}
