-- ═══════════════════════════════════════════════════════════════════════
-- ReflexShowdown Online — Database Schema
-- Cara pakai:
--   mysql -u root -p < database/schema.sql
-- ═══════════════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS reflexshowdown
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE reflexshowdown;

-- ── Pemain ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
    player_id    INT         NOT NULL AUTO_INCREMENT,
    username     VARCHAR(50) NOT NULL,
    total_games  INT         NOT NULL DEFAULT 0,
    total_wins   INT         NOT NULL DEFAULT 0,
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id),
    UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Sesi permainan ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_sessions (
    session_id        INT        NOT NULL AUTO_INCREMENT,
    room_code         VARCHAR(8) NOT NULL,
    winner_player_id  INT        NULL,
    started_at        DATETIME   NOT NULL,
    ended_at          DATETIME   NULL,
    PRIMARY KEY (session_id),
    KEY idx_room (room_code),
    CONSTRAINT fk_sess_winner FOREIGN KEY (winner_player_id)
        REFERENCES players (player_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Ronde ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rounds (
    round_id      INT      NOT NULL AUTO_INCREMENT,
    session_id    INT      NOT NULL,
    round_number  TINYINT  NOT NULL,
    signal_time   BIGINT   NOT NULL COMMENT 'Unix ms saat sinyal dikirim server',
    PRIMARY KEY (round_id),
    KEY idx_sess (session_id),
    CONSTRAINT fk_rnd_sess FOREIGN KEY (session_id)
        REFERENCES game_sessions (session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Hasil tiap pemain per ronde ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS round_results (
    result_id         INT        NOT NULL AUTO_INCREMENT,
    round_id          INT        NOT NULL,
    player_id         INT        NOT NULL,
    click_time        BIGINT     NOT NULL COMMENT 'Unix ms klik diterima server',
    reaction_time_ms  INT        NOT NULL COMMENT 'click_time - signal_time',
    is_early_click    TINYINT(1) NOT NULL DEFAULT 0,
    rank_in_round     TINYINT    NOT NULL,
    points_earned     TINYINT    NOT NULL DEFAULT 0,
    PRIMARY KEY (result_id),
    KEY idx_round  (round_id),
    KEY idx_player (player_id),
    CONSTRAINT fk_res_round  FOREIGN KEY (round_id)  REFERENCES rounds (round_id)  ON DELETE CASCADE,
    CONSTRAINT fk_res_player FOREIGN KEY (player_id) REFERENCES players (player_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── View statistik pemain ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_player_stats AS
SELECT
    p.player_id,
    p.username,
    p.total_games,
    p.total_wins,
    ROUND(p.total_wins * 100.0 / NULLIF(p.total_games, 0), 1)  AS win_rate_pct,
    MIN(rr.reaction_time_ms)                                    AS best_rt_ms,
    ROUND(AVG(rr.reaction_time_ms), 0)                          AS avg_rt_ms,
    COUNT(rr.result_id)                                         AS total_rounds_played
FROM players p
LEFT JOIN round_results rr
       ON rr.player_id     = p.player_id
      AND rr.is_early_click = 0
      AND rr.reaction_time_ms < 9000
GROUP BY p.player_id;
