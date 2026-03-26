
/* ══════════════════════════════════════════════════════════════════════════
 * ReflexShowdown — app.js
 * WebSocket client + UI controller
 * ══════════════════════════════════════════════════════════════════════════ */

// ── Config ─────────────────────────────────────────────────────────────────
const WS_URL = 'ws://' + window.location.hostname + ':8080/ws';

// ── State ──────────────────────────────────────────────────────────────────
let ws        = null;
let myName    = '';
let isHost    = false;
let roomCode  = '';
let roomRounds= 5;
let players   = [];   // array of usernames in room
let hostName  = '';
let gameChart = null;

// Game state
let currentRound = 0;
let totalRounds  = 5;
let scores       = {};   // username => points
let clicked      = false;
let signalActive = false;

// ── DOM refs ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── WebSocket ──────────────────────────────────────────────────────────────
function connect(onReady) {
    ws = new WebSocket(WS_URL);
    ws.onopen  = () => { console.log('WS connected'); onReady && onReady(); };
    ws.onclose = () => toast('Koneksi terputus. Reload halaman.');
    ws.onerror = () => toast('Gagal terhubung ke server.');
    ws.onmessage = e => handleMessage(JSON.parse(e.data));
}

function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

// ── Message router ─────────────────────────────────────────────────────────
function handleMessage(msg) {
    switch (msg.type) {
        case 'login_ok':    onLoginOk(msg);      break;
        case 'room_joined': onRoomJoined(msg);   break;
        case 'room_update': onRoomUpdate(msg);   break;
        case 'game_start':  onGameStart(msg);    break;
        case 'round_wait':  onRoundWait(msg);    break;
        case 'round_signal':onRoundSignal(msg);  break;
        case 'early_click': onEarlyClick(msg);   break;
        case 'round_result':onRoundResult(msg);  break;
        case 'game_over':   onGameOver(msg);     break;
        case 'error':       toast(msg.message);  break;
    }
}

// ── Handlers ───────────────────────────────────────────────────────────────

function onLoginOk(msg) {
    myName = msg.username;
    showScreen('menu');
    $('menu-username-label').textContent = 'Halo, ' + myName + ' 👋';
}

function onRoomJoined(msg) {
    roomCode   = msg.code;
    isHost     = msg.is_host;
    hostName   = msg.host;
    roomRounds = msg.rounds;
    players    = msg.players;
    showScreen('room');
    renderRoom();
}

function onRoomUpdate(msg) {
    players  = msg.players;
    hostName = msg.host;
    renderRoom();
}

function onGameStart(msg) {
    totalRounds  = msg.total_rounds;
    currentRound = 0;
    scores       = {};
    players.forEach(p => scores[p] = 0);
    showScreen('game');
    $('game-room-label').textContent = 'ROOM: ' + roomCode;
    renderPlayersStrip();
    renderScoreboard();
    setSignal('idle', '⚔');
    $('btn-click').disabled = true;
    $('btn-click').className = '';
    $('btn-click').textContent = 'BERSIAP...';
}

function onRoundWait(msg) {
    currentRound = msg.round;
    clicked      = false;
    signalActive = false;
    $('game-round-label').textContent = `Ronde ${msg.round}/${msg.total}`;
    $('result-overlay').classList.remove('show');

    setSignal('wait', 'WAIT...');

    // Reset semua chip player
    players.forEach(p => updateChip(p, '-', false, false));

    $('btn-click').disabled  = true;
    $('btn-click').className  = '';
    $('btn-click').textContent = 'TUNGGU SINYAL...';
}

function onRoundSignal(msg) {
    signalActive = true;
    setSignal('signal', 'CLICK!');

    if (!clicked) {
        $('btn-click').disabled  = false;
        $('btn-click').className  = 'ready';
        $('btn-click').textContent = 'KLIK SEKARANG!';
    }
}

function onEarlyClick(msg) {
    toast('⚠ Terlalu cepat! Penalti poin.');
    $('btn-click').disabled  = true;
    $('btn-click').className  = 'clicked';
    $('btn-click').textContent = '⚠ Early Click!';
}

function onRoundResult(msg) {
    signalActive = false;
    $('btn-click').disabled  = true;
    $('btn-click').className  = '';
    $('btn-click').textContent = 'Lihat hasil...';

    scores = msg.scores;
    renderScoreboard();

    // Update chip tiap pemain
    msg.results.forEach(r => {
        updateChip(r.username, r.rt < 9000 ? r.rt + 'ms' : 'TIMEOUT',
                   r.rank === 1, r.is_early);
    });

    // Tampilkan overlay result
    const overlay = $('result-overlay');
    overlay.innerHTML = `
        <p style="color:var(--muted);font-size:.75rem;letter-spacing:2px;margin-bottom:4px">HASIL RONDE ${msg.round}</p>
        ${msg.results.map(r => `
        <div class="result-row">
            <span class="pos">${r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}</span>
            <span class="uname">${esc(r.username)}${r.username === myName ? ' <span style="color:var(--blue);font-size:.75rem">YOU</span>' : ''}</span>
            <span class="rtime">${r.rt < 9000 ? r.rt + 'ms' : 'TIMEOUT'}${r.is_early ? ' ⚠' : ''}</span>
            <span class="rpts">${r.points >= 0 ? '+' : ''}${r.points}pt</span>
        </div>`).join('')}
    `;
    overlay.classList.add('show');
}

function onGameOver(msg) {
    // Bangun layar statistik
    $('winner-name').textContent = msg.winner || '?';

    const container = $('all-player-stats');
    container.innerHTML = '';
    const datasets = [];
    const colors   = ['#e63946','#ffd700','#2196f3','#4caf50'];
    let i = 0;

    for (const [uname, s] of Object.entries(msg.stats)) {
        const isSelf = uname === myName;
        container.innerHTML += `
        <div class="card" style="margin-bottom:12px;border-color:${isSelf ? 'var(--blue)' : 'var(--border)'}">
            <p style="font-weight:700;margin-bottom:12px;color:${isSelf ? 'var(--blue)' : 'var(--text)'}">
                ${esc(uname)}${isSelf ? '  <span style="font-size:.75rem;color:var(--muted)">(kamu)</span>' : ''}
                ${uname === msg.winner ? '  🏆' : ''}
            </p>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="sc-label">TOTAL POIN</div>
                    <div class="sc-val" style="color:var(--gold)">${s.points}</div>
                </div>
                <div class="stat-card">
                    <div class="sc-label">AVG REACTION</div>
                    <div class="sc-val">${s.avg_rt}ms</div>
                </div>
                <div class="stat-card">
                    <div class="sc-label">BEST RT</div>
                    <div class="sc-val" style="color:var(--green)">${s.best_rt}ms</div>
                </div>
                <div class="stat-card">
                    <div class="sc-label">KONSISTENSI</div>
                    <div class="sc-val">${s.range_rt}ms</div>
                    <div class="sc-sub">range (rendah = konsisten)</div>
                </div>
            </div>
        </div>`;

        datasets.push({
            label: uname,
            data: s.rt_history.map(rt => rt < 9000 ? rt : null),
            borderColor: colors[i % colors.length],
            backgroundColor: colors[i % colors.length] + '22',
            tension: 0.3, fill: false,
            pointRadius: 5, pointHoverRadius: 7,
        });
        i++;
    }

    // Chart.js — RT per ronde
    const ctx = $('rt-chart').getContext('2d');
    if (gameChart) gameChart.destroy();
    gameChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({length: totalRounds}, (_, i) => 'Ronde ' + (i+1)),
            datasets,
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#8888aa', font: { size: 11 } } },
                tooltip: {
                    callbacks: { label: ctx => ctx.dataset.label + ': ' + (ctx.raw ?? 'TIMEOUT') + 'ms' }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Reaction Time (ms)', color: '#8888aa' },
                    ticks: { color: '#8888aa' }, grid: { color: '#2a2a45' }
                },
                x: { ticks: { color: '#8888aa' }, grid: { color: '#2a2a45' } }
            }
        }
    });

    showScreen('stats');
}

// ── UI Helpers ─────────────────────────────────────────────────────────────

function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('screen-' + name).classList.add('active');
}

function setSignal(cls, text) {
    const el = $('signal-display');
    el.className = cls;
    el.textContent = text;
}

function renderRoom() {
    $('room-code-display').textContent = roomCode;
    $('room-count').textContent        = players.length;
    $('rounds-label').textContent      = 'RONDE: ' + roomRounds;

    const ul = $('room-player-list');
    ul.innerHTML = players.map(p => `
        <li>
            <span class="dot"></span>
            ${esc(p)}
            ${p === hostName ? '<span class="badge">HOST</span>' : ''}
            ${p === myName   ? '<span style="color:var(--blue);font-size:.75rem;margin-left:4px">(kamu)</span>' : ''}
        </li>`).join('');

    if (isHost) {
        $('host-controls').style.display  = 'block';
        $('guest-waiting').style.display  = 'none';
        $('btn-start-game').disabled       = players.length < 2;
    } else {
        $('host-controls').style.display  = 'none';
        $('guest-waiting').style.display  = 'block';
    }
}

function renderPlayersStrip() {
    $('players-strip').innerHTML = players.map(p => `
        <div class="player-chip${p === myName ? ' me' : ''}" id="chip-${safeid(p)}">
            <div class="pname">${esc(p)}${p === myName ? ' ★' : ''}</div>
            <div class="prt">-</div>
        </div>`).join('');
}

function updateChip(username, rtText, isWinner, isEarly) {
    const el = $('chip-' + safeid(username));
    if (!el) return;
    el.querySelector('.prt').textContent = rtText;
    el.classList.toggle('winner', isWinner);
    el.classList.toggle('early',  isEarly);
}

function renderScoreboard() {
    $('scoreboard').innerHTML = Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .map(([name, pts]) => `
        <div class="score-chip">
            <div class="sc-name">${esc(name)}</div>
            <div class="sc-pts">${pts} pt</div>
        </div>`).join('');
}

function toast(msg, duration = 3000) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
}

function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function safeid(s) { return s.replace(/[^a-zA-Z0-9]/g, '_'); }

// ── Event listeners ────────────────────────────────────────────────────────

$('btn-login').onclick = () => {
    const name = $('inp-username').value.trim();
    if (!name) return toast('Masukkan username dulu!');
    connect(() => send({ type: 'login', username: name }));
};
$('inp-username').onkeydown = e => { if (e.key === 'Enter') $('btn-login').click(); };

$('btn-create-room').onclick = () => {
    const rounds = parseInt($('sel-rounds').value);
    send({ type: 'create_room', rounds });
};

$('btn-join-room').onclick = () => {
    const code = $('inp-room-code').value.trim().toUpperCase();
    if (code.length !== 6) return toast('Kode room harus 6 karakter.');
    send({ type: 'join_room', code });
};
$('inp-room-code').oninput = e => {
    e.target.value = e.target.value.toUpperCase();
};

$('btn-copy-code').onclick = () => {
    navigator.clipboard.writeText(roomCode).then(() => toast('Kode ' + roomCode + ' disalin!'));
};

$('btn-start-game').onclick = () => send({ type: 'start_game' });

$('btn-leave-room').onclick = () => {
    if (ws) { ws.close(); ws = null; }
    showScreen('login');
};

$('btn-click').onclick = () => {
    if (clicked) return;
    clicked = true;
    $('btn-click').disabled   = true;
    $('btn-click').className  = 'clicked';
    $('btn-click').textContent = '✓ KLIK!';
    send({ type: 'player_click' });
};

// Keyboard: spasi / enter juga bisa klik
document.addEventListener('keydown', e => {
    if ((e.code === 'Space' || e.code === 'Enter') &&
        $('screen-game').classList.contains('active')) {
        e.preventDefault();
        $('btn-click').click();
    }
});

$('btn-play-again').onclick = () => showScreen('room');
$('btn-back-menu').onclick  = () => { showScreen('menu'); };
