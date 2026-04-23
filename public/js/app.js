/**
 * app.js — WebSocket client + UI controller
 *
 * FITUR BARU: Random Input Target
 *   Server memilih target random setiap ronde (huruf, angka, atau mouse button).
 *   Client menerima target lewat round_signal, lalu hanya mengirim player_click
 *   jika input yang benar ditekan. Input salah diabaikan tanpa penalti.
 *   Klik/tekan SEBELUM sinyal = early click = −1 poin.
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
let renderer  = null;

let currentRound   = 0;
let totalRounds    = 5;
let scores         = {};
let clicked        = false;         // sudah klik ronde ini?
let currentTarget  = null;          // {type, value} target ronde ini
let signalActive   = false;         // sinyal sudah muncul?
let intentionalAction = false;

const $ = id => document.getElementById(id);

// ── WebSocket ──────────────────────────────────────────────────────────────
function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    updateStatus('connecting');
    ws = new WebSocket(WS_SERVER_URL);
    ws.onopen  = () => { updateStatus('connected'); intentionalAction = false; };
    ws.onclose = () => {
        updateStatus('connecting');
        if (!intentionalAction) toast('Koneksi terputus. Mencoba kembali...');
        intentionalAction = false;
        setTimeout(connect, 3000);
    };
    ws.onerror = () => updateStatus('connecting');
    ws.onmessage = e => handleMessage(JSON.parse(e.data));
}

function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    else toast('Tidak terhubung ke server.');
}

function updateStatus(s) {
    const el = $('ws-status'); if (!el) return;
    el.innerHTML = s === 'connected'
        ? '<span class="dot dot-green"></span> Terhubung ke server'
        : '<span class="dot dot-yellow"></span> Menghubungkan...';
}

// ── Router ─────────────────────────────────────────────────────────────────
function handleMessage(msg) {
    switch (msg.type) {
        case 'login_ok':    onLoginOk(msg);     break;
        case 'room_joined': onRoomJoined(msg);  break;
        case 'room_update': onRoomUpdate(msg);  break;
        case 'game_start':  onGameStart(msg);   break;
        case 'round_wait':  onRoundWait(msg);   break;
        case 'round_signal':onRoundSignal(msg); break;
        case 'early_click': onEarlyClick(msg);  break;
        case 'round_result':onRoundResult(msg); break;
        case 'game_over':   onGameOver(msg);    break;
        case 'error':       toast(msg.message); break;
    }
}

// ── Game Handlers ──────────────────────────────────────────────────────────

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

function onRoomUpdate(msg) { players = msg.players; hostName = msg.host; renderRoom(); }

function onGameStart(msg) {
    totalRounds = msg.total_rounds; currentRound = 0;
    scores = {}; players.forEach(p => scores[p] = 0);

    if (renderer) renderer.destroy();
    const canvas = $('game-canvas');
    renderer = new GameRenderer(canvas);
    renderer.setPlayers(players, myName);
    renderer.setState('starting');

    showScreen('game');
    $('game-room-label').textContent = 'ROOM: ' + roomCode;
    renderScoreboard();
    setClickBtn('disabled', 'BERSIAP...');
}

function onRoundWait(msg) {
    currentRound   = msg.round;
    clicked        = false;
    signalActive   = false;
    currentTarget  = null;
    $('game-round-label').textContent = `Ronde ${msg.round}/${msg.total}`;
    if (renderer) renderer.setState('wait');
    if (renderer) renderer.setTarget(null);     // hapus target lama

    // Tombol aktif saat WAIT — klik = early click = penalti
    setClickBtn('wait-active', 'TAHAN... JANGAN KLIK DULU!');
    removeInputListeners();   // hapus listener lama dulu
}

/**
 * onRoundSignal — menerima sinyal + target dari server.
 * Pasang event listener SPESIFIK untuk target tersebut.
 * Input lain = diabaikan.
 */
function onRoundSignal(msg) {
    signalActive  = true;
    currentTarget = msg.target;   // {type: 'key'|'mouse', value: 'W'|'left'|...}
    if (renderer) renderer.setState('signal');
    if (renderer) renderer.setTarget(currentTarget);

    if (!clicked) {
        setClickBtn('ready', targetLabel(currentTarget));
        attachInputListeners(currentTarget);
    }
}

function onEarlyClick(msg) {
    toast(msg.message || '⚠ Klik terlalu cepat! Ronde berakhir. −1 poin.');
    setClickBtn('early', '⚠ RONDE BERAKHIR — KAMU KLIK DULUAN!');
    removeInputListeners();
}

function onRoundResult(msg) {
    scores = msg.scores;
    renderScoreboard();
    removeInputListeners();
    currentTarget = null;
    if (renderer) renderer.setResult(msg.results, msg.scores);

    if (msg.early_ended) {
        const culprit = msg.culprit || '?';
        setClickBtn('disabled', `⚠ ${esc(culprit)} klik duluan! Ronde hangus.`);
        if (culprit !== myName)
            toast(`⚠ ${esc(culprit)} klik sebelum sinyal! Mereka dapat −1 poin.`);
    } else {
        setClickBtn('disabled', 'Ronde selesai...');
        const winner = msg.results.find(r => r.rank === 1 && r.rt < 9000 && !r.is_early);
        if (winner) {
            setTimeout(() => {
                const btn = $('btn-click');
                if (btn) btn.textContent = `🥇 ${esc(winner.username)} — ${winner.rt}ms`;
            }, 300);
        }
    }
}

function onGameOver(msg) {
    removeInputListeners();
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
            borderColor: clrs[i % clrs.length], backgroundColor: clrs[i % clrs.length] + '22',
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
                y: { title:{display:true,text:'RT (ms)',color:'#8888aa'},ticks:{color:'#8888aa'},grid:{color:'#2a2a45'} },
                x: { ticks:{color:'#8888aa'},grid:{color:'#2a2a45'} }
            }
        }
    });
    if (renderer) { renderer.destroy(); renderer = null; }
    showScreen('stats');
}

// ── Input System ───────────────────────────────────────────────────────────
/**
 * Listener dinamis yang dipasang hanya saat sinyal aktif.
 * Hanya input yang TEPAT yang memicu player_click.
 * Input salah = diabaikan sepenuhnya.
 */
let _keyListener   = null;
let _mouseListener = null;

function attachInputListeners(target) {
    removeInputListeners();

    if (target.type === 'key') {
        _keyListener = (e) => {
            if (clicked) return;
            // Hanya proses jika key yang benar
            if (e.key.toUpperCase() !== target.value.toUpperCase()) return;
            e.preventDefault();
            doClick();
        };
        document.addEventListener('keydown', _keyListener);

    } else if (target.type === 'mouse') {
        // Map nama ke button number
        const btnMap = { left: 0, middle: 1, right: 2 };
        const targetBtn = btnMap[target.value] ?? 0;

        _mouseListener = (e) => {
            if (clicked) return;
            if (e.button !== targetBtn) return;  // tombol mouse salah = diabaikan
            e.preventDefault();
            doClick();
        };
        // mousedown lebih cepat dari click
        $('game-canvas').addEventListener('mousedown', _mouseListener);
        $('game-canvas').addEventListener('contextmenu', e => e.preventDefault());
    }
}

function removeInputListeners() {
    if (_keyListener) {
        document.removeEventListener('keydown', _keyListener);
        _keyListener = null;
    }
    if (_mouseListener) {
        $('game-canvas')?.removeEventListener('mousedown', _mouseListener);
        _mouseListener = null;
    }
}

/** Lakukan klik (kirim ke server, update UI) */
function doClick() {
    if (clicked) return;
    clicked = true;
    setClickBtn('clicked', '✓ INPUT BENAR!');
    send({ type: 'player_click' });
}

// Early click — tombol di-klik sebelum sinyal (saat wait-active)
$('btn-click') && (document.querySelector('#btn-click') || document.addEventListener('DOMContentLoaded', () => {
    $('btn-click').onclick = () => {
        if (!signalActive && !clicked) {
            // Masih di fase WAIT → early click
            clicked = true;
            setClickBtn('early', '⚠ TERLALU CEPAT!');
            send({ type: 'player_click' });
        }
    };
}));

// Pasang onclick setelah DOM siap
document.addEventListener('DOMContentLoaded', () => {
    const btn = $('btn-click');
    if (btn) {
        btn.onclick = () => {
            if (clicked) return;
            if (!signalActive) {
                // Early click
                clicked = true;
                setClickBtn('early', '⚠ TERLALU CEPAT!');
                send({ type: 'player_click' });
            }
            // Jika signalActive, input ditangani oleh event listener spesifik
        };
    }
});

// ── UI Helpers ─────────────────────────────────────────────────────────────
function setClickBtn(state, text) {
    const btn = $('btn-click');
    if (!btn) return;
    btn.textContent = text;
    btn.className   = 'click-btn ' + state;
    btn.disabled    = (state === 'disabled');
}

/** Label deskriptif untuk target */
function targetLabel(target) {
    if (!target) return 'KLIK!';
    if (target.type === 'key') return `TEKAN TOMBOL  [ ${target.value} ]`;
    const mouseNames = { left: 'KLIK KIRI 🖱', right: 'KLIK KANAN 🖱', middle: 'KLIK TENGAH 🖱' };
    return mouseNames[target.value] || 'KLIK!';
}

function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('screen-'+name).classList.add('active');
    if (name === 'game') setTimeout(() => { if (renderer) renderer.resize(); }, 50);
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
        .sort((a,b) => b[1]-a[1])
        .map(([name,pts]) => `<div class="score-chip"><div class="sc-name">${esc(name)}</div><div class="sc-pts">${pts} pt</div></div>`)
        .join('');
}

function toast(msg, dur=3500) {
    const el=$('toast'); el.textContent=msg; el.classList.add('show');
    setTimeout(()=>el.classList.remove('show'), dur);
}
function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function switchTab(tab) {
    $('tab-login').classList.toggle('active', tab==='login');
    $('tab-register').classList.toggle('active', tab==='register');
    $('form-login').style.display    = tab==='login'    ? 'block' : 'none';
    $('form-register').style.display = tab==='register' ? 'block' : 'none';
}

// ── Auth Events ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
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

    $('btn-leave-room').onclick = () => {
        intentionalAction = true;
        send({ type: 'leave_room' });
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
    $('btn-play-again').onclick = () => showScreen('room');
    $('btn-back-menu').onclick  = () => {
        intentionalAction = true;
        send({ type: 'leave_room' });
        showScreen('menu');
    };
});

connect();
