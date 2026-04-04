<?php
namespace App;

use Ratchet\ConnectionInterface;
use React\EventLoop\LoopInterface;
use React\EventLoop\TimerInterface;

/**
 * Room — state machine satu sesi permainan.
 *
 * PERUBAHAN DARI VERSI SEBELUMNYA:
 *   1. Spam click fix: tambah $hasClicked[] per pemain per ronde.
 *      Klik pertama (early atau normal) dicatat; klik berikutnya diabaikan.
 *   2. Early click penalty benar: -1 poin (bukan 0).
 *   3. State machine lebih ketat: handleClick cek $hasClicked sebelum proses.
 */
class Room
{
    const S_WAITING      = 'waiting';
    const S_ROUND_WAIT   = 'round_wait';
    const S_ROUND_SIGNAL = 'round_signal';
    const S_ROUND_RESULT = 'round_result';
    const S_GAME_OVER    = 'game_over';

    public string  $code;
    public string  $state        = self::S_WAITING;
    public int     $totalRounds;
    public int     $currentRound = 0;
    public ?int    $sessionId    = null;
    public array   $players      = [];
    public ?string $hostConnId   = null;

    private LoopInterface   $loop;
    private DB              $db;
    private array           $clicks     = [];   // connId => {rt, is_early, recv_ms}
    private array           $hasClicked = [];   // FIX: track siapa sudah klik ronde ini
    private int             $signalMs   = 0;
    private ?TimerInterface $timer      = null;

    public function __construct(string $code, LoopInterface $loop, DB $db, int $rounds = 5)
    {
        $this->code        = $code;
        $this->loop        = $loop;
        $this->db          = $db;
        $this->totalRounds = $rounds;
    }

    // ── Player management ─────────────────────────────────────────────────────

    public function addPlayer(ConnectionInterface $conn, string $username, int $playerId): void
    {
        $id = $this->connId($conn);
        $this->players[$id] = [
            'conn'       => $conn,
            'username'   => $username,
            'player_id'  => $playerId,
            'points'     => 0,
            'rt_history' => [],
            'active'     => true,
        ];
        if ($this->hostConnId === null) $this->hostConnId = $id;
    }

    public function removePlayer(ConnectionInterface $conn): void
    {
        $id = $this->connId($conn);
        if (isset($this->players[$id])) {
            $this->players[$id]['active'] = false;
        }
        // Jika host pergi, transfer ke pemain aktif berikutnya
        if ($this->hostConnId === $id) {
            $this->hostConnId = null;
            foreach ($this->active() as $cid => $_) {
                $this->hostConnId = $cid;
                break;
            }
        }
    }

    public function active(): array
    {
        return array_filter($this->players, fn($p) => $p['active']);
    }

    public function isEmpty(): bool
    {
        return count($this->active()) === 0;
    }

    // ── Game flow ─────────────────────────────────────────────────────────────

    public function startGame(): void
    {
        if ($this->state !== self::S_WAITING) return;
        $this->currentRound = 0;
        foreach ($this->players as &$p) {
            $p['points'] = 0;
            $p['rt_history'] = [];
        }
        unset($p);

        $this->sessionId = $this->db->createSession($this->code, date('Y-m-d H:i:s'));
        $this->broadcast(['type' => 'game_start', 'total_rounds' => $this->totalRounds]);
        $this->timer = $this->loop->addTimer(1.5, fn() => $this->startWait());
    }

    private function startWait(): void
    {
        $this->currentRound++;
        $this->clicks     = [];
        $this->hasClicked = [];   // FIX: reset per ronde
        $this->signalMs   = 0;
        $this->state      = self::S_ROUND_WAIT;

        $this->broadcast([
            'type'  => 'round_wait',
            'round' => $this->currentRound,
            'total' => $this->totalRounds,
        ]);

        // Delay acak 2–6 detik
        $delay = rand(20, 60) / 10.0;
        $this->timer = $this->loop->addTimer($delay, fn() => $this->fireSignal());
    }

    private function fireSignal(): void
    {
        if ($this->state !== self::S_ROUND_WAIT) return;
        $this->state    = self::S_ROUND_SIGNAL;
        $this->signalMs = (int)(microtime(true) * 1000);

        // Reset hasClicked untuk fase signal (early click tadi sudah tercatat di clicks[])
        // Pemain yang sudah early click tidak bisa klik lagi di fase signal
        $this->broadcast(['type' => 'round_signal', 'signal_ms' => $this->signalMs]);

        // Timeout 4 detik
        $this->timer = $this->loop->addTimer(4.0, fn() => $this->resolve());
    }

    /**
     * FIX SPAM CLICK:
     * hasClicked[] memastikan setiap pemain hanya bisa klik SATU KALI per ronde,
     * baik di fase WAIT (early) maupun SIGNAL. Klik kedua dst diabaikan.
     */
    public function handleClick(string $connId): void
    {
        if (!isset($this->players[$connId]) || !$this->players[$connId]['active']) return;

        // FIX: Jika sudah pernah klik ronde ini (early atau normal), abaikan
        if (isset($this->hasClicked[$connId])) return;

        $now = (int)(microtime(true) * 1000);

        if ($this->state === self::S_ROUND_WAIT) {
            // Early click — catat sekali, kirim penalti
            $this->hasClicked[$connId] = true;                       // FIX: lock
            $this->clicks[$connId]     = [
                'rt'       => 9999,
                'is_early' => true,
                'recv_ms'  => $now,
            ];
            $this->sendTo($connId, ['type' => 'early_click', 'message' => 'Klik terlalu cepat! -1 poin.']);
            return;
        }

        if ($this->state !== self::S_ROUND_SIGNAL) return;
        if (isset($this->clicks[$connId])) return;  // sudah klik di fase ini

        $rt = max(1, $now - $this->signalMs);
        $this->hasClicked[$connId] = true;
        $this->clicks[$connId]     = ['rt' => $rt, 'is_early' => false, 'recv_ms' => $now];

        // Semua pemain aktif sudah klik?
        $activeCnt  = count($this->active());
        $clickedCnt = count(array_filter($this->clicks, fn($c) => !$c['is_early']));
        $earlyCnt   = count(array_filter($this->clicks, fn($c) => $c['is_early']));
        if ($clickedCnt + $earlyCnt >= $activeCnt) {
            $this->cancelTimer();
            $this->resolve();
        }
    }

    private function resolve(): void
    {
        if (!in_array($this->state, [self::S_ROUND_SIGNAL, self::S_ROUND_WAIT])) return;
        $this->state = self::S_ROUND_RESULT;
        $this->cancelTimer();

        // Pemain yang tidak klik sama sekali = timeout
        foreach ($this->active() as $cid => $_) {
            if (!isset($this->clicks[$cid])) {
                $this->clicks[$cid] = ['rt' => 9999, 'is_early' => false, 'recv_ms' => 0];
            }
        }

        // Urutkan: non-early dulu (sort by rt), lalu early click, lalu timeout
        $ranked = [];
        foreach ($this->clicks as $cid => $c) {
            if (!isset($this->players[$cid])) continue;
            $ranked[] = array_merge([
                'connId'    => $cid,
                'username'  => $this->players[$cid]['username'],
                'player_id' => $this->players[$cid]['player_id'],
            ], $c);
        }

        // Sort: normal klik dulu (is_early=false, rt asc), lalu early/timeout
        usort($ranked, function ($a, $b) {
            if ($a['is_early'] !== $b['is_early']) return $a['is_early'] <=> $b['is_early'];
            return $a['rt'] <=> $b['rt'];
        });

        /**
         * FIX POIN:
         * - Posisi 1 = 3pt, 2 = 2pt, 3 = 1pt, selainnya = 0pt
         * - Early click: -1pt (tanpa memandang posisi)
         * Ini sesuai proposal: early click = penalti poin
         */
        $ptMap   = [3, 2, 1, 0, 0, 0];
        $results = [];
        $roundId = $this->db->createRound($this->sessionId, $this->currentRound, $this->signalMs);

        foreach ($ranked as $i => $r) {
            $pts = $r['is_early'] ? -1 : ($ptMap[min($i, 5)]);  // FIX: early = selalu -1
            $this->players[$r['connId']]['points']      += $pts;
            $this->players[$r['connId']]['rt_history'][] = $r['rt'];

            $this->db->saveResult(
                $roundId, $r['player_id'], $r['recv_ms'],
                $r['rt'], $r['is_early'], $i + 1, $pts
            );

            $results[] = [
                'username' => $r['username'],
                'rt'       => $r['rt'],
                'is_early' => $r['is_early'],
                'rank'     => $i + 1,
                'points'   => $pts,
            ];
        }

        $scores = [];
        foreach ($this->active() as $p) $scores[$p['username']] = $p['points'];

        $this->broadcast([
            'type'    => 'round_result',
            'round'   => $this->currentRound,
            'total'   => $this->totalRounds,
            'results' => $results,
            'scores'  => $scores,
        ]);

        $this->timer = $this->loop->addTimer(4.5, function () {
            if ($this->currentRound >= $this->totalRounds) $this->endGame();
            else { $this->state = self::S_WAITING; $this->startWait(); }
        });
    }

    private function endGame(): void
    {
        $this->state = self::S_GAME_OVER;

        $winner = null; $bestPts = PHP_INT_MIN;
        foreach ($this->active() as $cid => $p) {
            if ($p['points'] > $bestPts ||
                ($p['points'] === $bestPts && $this->avgRt($p) < $this->avgRt($winner ?? []))) {
                $bestPts = $p['points'];
                $winner  = $p;
            }
        }

        $stats = [];
        foreach ($this->active() as $p) {
            $rts   = array_filter($p['rt_history'], fn($r) => $r < 9000);
            $count = count($rts);
            $avg   = $count ? (int)round(array_sum($rts) / $count) : 0;
            $sorted = array_values($rts); sort($sorted);
            $trend = $count >= 4
                ? (int)round(array_sum(array_slice($sorted, -2))/2 - array_sum(array_slice($sorted,0,2))/2)
                : 0;
            $stats[$p['username']] = [
                'points'     => $p['points'],
                'avg_rt'     => $avg,
                'best_rt'    => $count ? (int)min($rts) : 0,
                'worst_rt'   => $count ? (int)max($rts) : 0,
                'range_rt'   => $count ? (int)(max($rts) - min($rts)) : 0,
                'trend'      => $trend,
                'rt_history' => array_values($p['rt_history']),
            ];
        }

        if ($this->sessionId && $winner) {
            $this->db->finalizeSession($this->sessionId, $winner['player_id'], date('Y-m-d H:i:s'));
        }

        $this->broadcast([
            'type'   => 'game_over',
            'winner' => $winner ? $winner['username'] : null,
            'stats'  => $stats,
        ]);

        $this->timer = $this->loop->addTimer(3.0, function () {
            $this->state     = self::S_WAITING;
            $this->sessionId = null;
            foreach ($this->players as &$p) { $p['points'] = 0; $p['rt_history'] = []; }
        });
    }

    // ── Broadcast / utils ─────────────────────────────────────────────────────

    public function broadcast(array $data): void
    {
        $json = json_encode($data);
        foreach ($this->active() as $p) {
            try { $p['conn']->send($json); } catch (\Throwable $_) {}
        }
    }

    public function sendTo(string $connId, array $data): void
    {
        if ($this->players[$connId]['active'] ?? false) {
            try { $this->players[$connId]['conn']->send(json_encode($data)); } catch (\Throwable $_) {}
        }
    }

    private function connId(ConnectionInterface $conn): string
    {
        return (string)spl_object_id($conn);
    }

    private function avgRt(array $player): float
    {
        if (empty($player)) return PHP_INT_MAX;
        $rts = array_filter($player['rt_history'] ?? [], fn($r) => $r < 9000);
        return count($rts) ? array_sum($rts) / count($rts) : PHP_INT_MAX;
    }

    private function cancelTimer(): void
    {
        if ($this->timer) {
            $this->loop->cancelTimer($this->timer);
            $this->timer = null;
        }
    }
}
