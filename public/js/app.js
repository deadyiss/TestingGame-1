/**
 * app.js — WebSocket client + UI controller v3
 *
 * PERUBAHAN DARI VERSI SEBELUMNYA:
 *   1. FIX "koneksi terputus": flag intentionalAction mencegah toast error
 *      saat user sengaja logout/leave room.
 *   2. FIX leave room: kirim pesan 'leave_room' ke server SEBELUM navigasi.
 *      Server membersihkan room, koneksi WS tetap hidup (tidak di-close).
 *   3. FIX spam click: state 'clicked' di-set sebelum send; server juga
 *      ignore klik kedua (hasClicked[] di Room.php).
 *   4. Canvas renderer: game screen sekarang menggunakan GameRenderer.
 */

// WS_SERVER_URL dari config.js
let ws        = null;
let myName    = '';
let isHost    = false;
let roomCode  = '';
let roomRounds= 5;
let players   = [];
let hostName  = '';
let gameChart = null;
let renderer  = null;   // GameRenderer instance

let currentRound = 0;
let totalRounds  = 5;
let scores       = {};
let clicked      = false;

// FIX: flag untuk bedakan disconnect sengaja vs tidak sengaja
let intentionalAction = false;

const $ = id => document.getElementById(id);

// ── WebSocket ──────────────────────────────────────────────────────────────
function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    updateStatus('connecting');
    ws = new WebSocket(WS_SERVER_URL);

    ws.onopen = () => {
        updateStatus('connected');
        intentionalAction = false;
    };

    ws.onclose = () => {
        updateStatus('connecting');
        // FIX: hanya tampilkan error jika bukan karena aksi user (logout/leave)
        if (!intentionalAction) {
            toast('Koneksi terputus. Mencoba kembali...');
        }
        intentionalAction = false;
        // Auto-reconnect
        setTimeout(connect, 3000);
    };

    ws.onerror = () => updateStatus('connecting');
    ws.onmessage = e => handleMessage(JSON.parse(e.data));
}

function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    else toast('Tidak terhubung ke server.');
}

function updateStatus(status) {
    const el = $('ws-status');
    if (!el) return;
    if (status === 'connected')
        el.innerHTML = '<span class="dot dot-green"></span> Terhubung ke server';
    else
        el.innerHTML = '<span class="dot dot-yellow"></span> Menghubungkan ke server...';
}

// ── Router ─────────────────────────────────────────────────────────────────
function handleMessage(msg) {
    switch (msg.type) {
        case 'login_ok':    onLoginOk(msg);     break;
        case 'room_joined': onRoomJoined(msg);  break;
        case 'room_update': onRoomUpdate(msg);  break;
        case 'game_start':  onGameStart(msg);   break;
        case 'round_wait':  onRoundWait(msg);   break;
        case 'round_signal':onRoundSignal();    break;
        case 'early_click': onEarlyClick(msg);  break;
        case 'round_result':onRoundResult(msg); break;
        case 'game_over':   onGameOver(msg);    break;
        case 'error':       toast(msg.message); break;
    }
}

// ── Handlers ───────────────────────────────────────────────────────────────

function onLoginOk(msg) {
    myName = msg.username;
    showScreen('menu');
    $('menu-username-label').textContent = `Halo, ${myName} 👋${msg.is_new ? '  (akun baru)' : ''}`;
}

function onRoomJoined(msg) {
    roomCode = msg.code; isHost = msg.is_host;
    hostName = msg.host; roomRounds = msg.rounds; players = msg.players;
    showScreen('room'); renderRoom();
}

function onRoomUpdate(msg) {
    players = msg.players; hostName = msg.host; renderRoom();
}

function onGameStart(msg) {
    totalRounds = msg.total_rounds; currentRound = 0;
    scores = {}; players.forEach(p => scores[p] = 0);

    // Init Canvas renderer
    if (renderer) renderer.destroy();
    const canvas = $('game-canvas');
    renderer = new GameRenderer(canvas);
    renderer.setPlayers(players, myName);
    renderer.setState('starting');

    showScreen('game');
    $('game-room-label').textContent = 'ROOM: ' + roomCode;
    renderScoreboard();
    resetClickBtn('BERSIAP...');
}

function onRoundWait(msg) {
    currentRound = msg.round; clicked = false;
    $('game-round-label').textContent = `Ronde ${msg.round}/${msg.total}`;
    if (renderer) renderer.setState('wait');
    resetClickBtn('TUNGGU SINYAL...');
}

function onRoundSignal() {
    if (renderer) renderer.setState('signal');
    if (!clicked) {
        const btn = $('btn-click');
        btn.disabled = false;
        btn.className = 'click-btn ready';
        btn.textContent = 'KLIK SEKARANG!';
    }
}

function onEarlyClick(msg) {
    // Server konfirmasi early click kita
    toast(msg.message || '⚠ Terlalu cepat! -1 poin.');
    const btn = $('btn-click');
    btn.disabled = true;
    btn.className = 'click-btn early';
    btn.textContent = '⚠ EARLY CLICK! (-1pt)';
}

function onRoundResult(msg) {
    scores = msg.scores;
    renderScoreboard();
    if (renderer) renderer.setResult(msg.results, msg.scores);
    resetClickBtn('Ronde selesai...');
    // Tampilkan ranking singkat di tombol
    const winner = msg.results.find(r => r.rank === 1 && !r.is_early);
    if (winner) {
        setTimeout(() => {
            $('btn-click').textContent =
                `🥇 ${esc(winner.username)} — ${winner.rt < 9000 ? winner.rt+'ms' : 'TIMEOUT'}`;
        }, 300);
    }
}

function onGameOver(msg) {
    $('winner-name').textContent = msg.winner || '?';
    const container = $('all-player-stats');
    container.innerHTML = '';
    const datasets = [];
    const clrs = ['#e63946','#ffd700','#2196f3','#4caf50'];
    let i = 0;

    for (const [uname, s] of Object.entries(msg.stats)) {
        const isSelf = uname === myName;
        container.innerHTML += `
        <div class="card" style="margin-bottom:12px;border-color:${isSelf?'var(--blue)':'var(--border)'}">
            <p style="font-weight:700;margin-bottom:12px;color:${isSelf?'var(--blue)':'var(--text)'}">
                ${esc(uname)}${isSelf?' <span style="font-size:.75rem;color:var(--muted)">(kamu)</span>':''}
                ${uname===msg.winner?' 🏆':''}
            </p>
            <div class="stats-grid">
                <div class="stat-card"><div class="sc-label">TOTAL POIN</div><div class="sc-val" style="color:var(--gold)">${s.points}</div></div>
                <div class="stat-card"><div class="sc-label">AVG REACTION</div><div class="sc-val">${s.avg_rt}ms</div></div>
                <div class="stat-card"><div class="sc-label">BEST RT</div><div class="sc-val" style="color:var(--green)">${s.best_rt}ms</div></div>
                <div class="stat-card"><div class="sc-label">KONSISTENSI</div><div class="sc-val">${s.range_rt}ms</div><div class="sc-sub">range (rendah=konsisten)</div></div>
            </div>
        </div>`;
        datasets.push({
            label: uname,
            data: s.rt_history.map(rt => rt < 9000 ? rt : null),
            borderColor: clrs[i % clrs.length],
            backgroundColor: clrs[i % clrs.length] + '22',
            tension: 0.3, fill: false, pointRadius: 5,
        });
        i++;
    }

    const ctx = $('rt-chart').getContext('2d');
    if (gameChart) gameChart.destroy();
    gameChart = new Chart(ctx, {
        type: 'line',
        data: { labels: Array.from({length: totalRounds}, (_, i) => 'Ronde '+(i+1)), datasets },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#8888aa' } },
                tooltip: { callbacks: { label: c => c.dataset.label+': '+(c.raw??'TIMEOUT')+'ms' } } },
            scales: {
                y: { title:{display:true,text:'RT (ms)',color:'#8888aa'}, ticks:{color:'#8888aa'}, grid:{color:'#2a2a45'} },
                x: { ticks:{color:'#8888aa'}, grid:{color:'#2a2a45'} }
            }
        }
    });
    if (renderer) { renderer.destroy(); renderer = null; }
    showScreen('stats');
}

// ── UI helpers ─────────────────────────────────────────────────────────────
function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('screen-'+name).classList.add('active');
    if (name === 'game') {
        // Resize canvas setelah screen tampil
        setTimeout(() => { if (renderer) renderer.resize(); }, 50);
    }
}

function resetClickBtn(text) {
    const btn = $('btn-click');
    btn.disabled = true; btn.className = 'click-btn'; btn.textContent = text;
    clicked = false;
}

function renderRoom() {
    $('room-code-display').textContent = roomCode;
    $('room-count').textContent        = players.length;
    $('rounds-label').textContent      = 'RONDE: ' + roomRounds;
    $('room-player-list').innerHTML    = players.map(p => `
        <li><span class="dot dot-green"></span>${esc(p)}
        ${p===hostName?'<span class="badge">HOST</span>':''}
        ${p===myName?'<span style="color:var(--blue);font-size:.75rem;margin-left:4px">(kamu)</span>':''}</li>
    `).join('');
    if (isHost) {
        $('host-controls').style.display = 'block';
        $('guest-waiting').style.display = 'none';
        $('btn-start-game').disabled = players.length < 2;
    } else {
        $('host-controls').style.display = 'none';
        $('guest-waiting').style.display = 'block';
    }
}

function renderScoreboard() {
    $('scoreboard').innerHTML = Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .map(([name, pts]) => `<div class="score-chip"><div class="sc-name">${esc(name)}</div><div class="sc-pts">${pts} pt</div></div>`)
        .join('');
}

function toast(msg, dur = 3500) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), dur);
}

function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function switchTab(tab) {
    $('tab-login').classList.toggle('active', tab === 'login');
    $('tab-register').classList.toggle('active', tab === 'register');
    $('form-login').style.display    = tab === 'login'    ? 'block' : 'none';
    $('form-register').style.display = tab === 'register' ? 'block' : 'none';
}

// ── Events ─────────────────────────────────────────────────────────────────

$('btn-login').onclick = () => {
    const user = $('inp-login-user').value.trim();
    const pass = $('inp-login-pass').value;
    if (!user) return toast('Masukkan username!');
    if (!pass) return toast('Masukkan password!');
    send({ type: 'login', username: user, password: pass });
};

$('btn-register').onclick = () => {
    const user  = $('inp-reg-user').value.trim();
    const pass  = $('inp-reg-pass').value;
    const pass2 = $('inp-reg-pass2').value;
    if (user.length < 2) return toast('Username minimal 2 karakter!');
    if (pass.length < 6) return toast('Password minimal 6 karakter!');
    if (pass !== pass2)  return toast('Password tidak cocok!');
    send({ type: 'register', username: user, password: pass });
};

$('inp-login-pass').onkeydown  = e => { if (e.key==='Enter') $('btn-login').click(); };
$('inp-reg-pass2').onkeydown   = e => { if (e.key==='Enter') $('btn-register').click(); };

$('btn-create-room').onclick = () =>
    send({ type: 'create_room', rounds: parseInt($('sel-rounds').value) });

$('btn-join-room').onclick = () => {
    const code = $('inp-room-code').value.trim().toUpperCase();
    if (code.length !== 6) return toast('Kode room harus 6 karakter.');
    send({ type: 'join_room', code });
};
$('inp-room-code').oninput = e => e.target.value = e.target.value.toUpperCase();

$('btn-copy-code').onclick = () =>
    navigator.clipboard.writeText(roomCode).then(() => toast('Kode ' + roomCode + ' disalin!'));

$('btn-start-game').onclick = () => send({ type: 'start_game' });

/**
 * FIX LEAVE ROOM + "KONEKSI TERPUTUS":
 *   1. Set intentionalAction = true → onclose tidak tampilkan error
 *   2. Kirim 'leave_room' ke server → server bersihkan room
 *   3. TIDAK menutup ws — koneksi tetap hidup untuk sesi berikutnya
 */
$('btn-leave-room').onclick = () => {
    intentionalAction = true;        // FIX: supaya onclose tidak toast error
    send({ type: 'leave_room' });    // FIX: beritahu server untuk cleanup
    isHost = false;
    showScreen('menu');
};

$('btn-logout').onclick = () => {
    intentionalAction = true;
    send({ type: 'leave_room' });
    myName = '';
    if (ws) { ws.close(); ws = null; }
    showScreen('login');
    setTimeout(connect, 500);
};

/**
 * FIX ANTI-SPAM CLICK:
 *   clicked di-set true SEBELUM send → klik kedua tidak dikirim.
 *   Server juga ada hasClicked[] untuk double protection.
 */
$('btn-click').onclick = () => {
    if (clicked) return;             // FIX: client-side lock
    clicked = true;
    const btn = $('btn-click');
    btn.disabled   = true;
    btn.className  = 'click-btn clicked';
    btn.textContent = '✓ KLIK!';
    send({ type: 'player_click' });
};

// Spasi / Enter juga bisa klik (like original game)
document.addEventListener('keydown', e => {
    if ((e.code === 'Space' || e.code === 'Enter') &&
         $('screen-game').classList.contains('active')) {
        e.preventDefault();
        $('btn-click').click();
    }
});

$('btn-play-again').onclick = () => showScreen('room');
$('btn-back-menu').onclick  = () => {
    intentionalAction = true;
    send({ type: 'leave_room' });
    showScreen('menu');
};

// ── Start ──────────────────────────────────────────────────────────────────
connect();
