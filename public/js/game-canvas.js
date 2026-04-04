/**
 * game-canvas.js — Canvas renderer bergaya ReflexShowdown
 *
 * Merender arena duel menggunakan HTML5 Canvas API.
 * Karakter, background, dan sinyal digambar dengan Canvas (tidak perlu image file).
 * Kamu bisa ganti dengan sprite asli nanti — lihat komentar IMAGE_SWAP di setiap fungsi.
 *
 * Cara pakai dari app.js:
 *   const renderer = new GameRenderer(document.getElementById('game-canvas'));
 *   renderer.setPlayers(['Budi','Andi'], 'Budi');
 *   renderer.setState('wait');
 *   renderer.setResult([...]);
 */
class GameRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        this.W = this.H = 0;

        // State
        this.players    = [];   // [{name, isMe, state, rt, rank, points, isEarly, x, y}]
        this.state      = 'idle';   // idle | starting | wait | signal | result
        this.frame      = 0;
        this.slashAlpha = 0;
        this.startAnimT = 0;   // untuk animasi match start

        // Binding
        this._raf = null;
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this._loop();
    }

    // ── Setup ──────────────────────────────────────────────────────────────────

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width  = rect.width  || this.canvas.offsetWidth  || 600;
        this.canvas.height = rect.height || this.canvas.offsetHeight || 360;
        this.W = this.canvas.width;
        this.H = this.canvas.height;
    }

    /** Atur daftar pemain dan posisinya. Dipanggil dari onGameStart. */
    setPlayers(names, myName) {
        this.players = names.map((name, i) => ({
            name, isMe: name === myName,
            state: 'idle', rt: null, rank: null,
            points: 0, isEarly: false,
            x: 0, y: 0,    // dihitung di calcPositions()
            color: ['#E63946','#2196F3','#4CAF50','#FF9800'][i % 4],
        }));
        this._calcPositions();
    }

    /** Atur state arena: 'idle'|'starting'|'wait'|'signal'|'result' */
    setState(newState) {
        this.state = newState;
        if (newState === 'starting') {
            this.startAnimT = this.frame;
        }
        if (newState === 'wait') {
            this.slashAlpha = 0;
            this.players.forEach(p => {
                p.state = 'idle'; p.rt = null; p.rank = null; p.isEarly = false;
            });
        }
        if (newState === 'signal') {
            this.slashAlpha = 0;
        }
    }

    /** Update hasil ronde. Dipanggil dari onRoundResult. */
    setResult(results, scores) {
        results.forEach(r => {
            const p = this.players.find(pl => pl.name === r.username);
            if (!p) return;
            p.rt       = r.rt;
            p.rank     = r.rank;
            p.isEarly  = r.is_early;
            p.state    = r.rank === 1 && !r.is_early ? 'win' : 'lose';
        });
        if (scores) {
            this.players.forEach(p => { p.points = scores[p.name] ?? p.points; });
        }
        this.slashAlpha = 1;
        this.state = 'result';
    }

    // ── Main loop ──────────────────────────────────────────────────────────────

    _loop() {
        this.frame++;
        this._draw();
        this._raf = requestAnimationFrame(() => this._loop());
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
    }

    // ── Draw ───────────────────────────────────────────────────────────────────

    _draw() {
        const { ctx, W, H } = this;
        ctx.clearRect(0, 0, W, H);

        this._drawBackground();
        if (this.state === 'starting') this._drawMatchStart();
        this._drawPlayers();
        this._drawCenterSignal();
        if (this.slashAlpha > 0) this._drawSlash();

        // Slash fade
        if (this.slashAlpha > 0) this.slashAlpha = Math.max(0, this.slashAlpha - 0.008);
    }

    _drawBackground() {
        const { ctx, W, H } = this;

        // ─── IMAGE_SWAP: ganti dengan gambar background ──────────────────────
        // if (this._bgImg) { ctx.drawImage(this._bgImg, 0, 0, W, H); return; }
        // ────────────────────────────────────────────────────────────────────

        // Langit gradient — gaya malam samurai
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0,   '#050510');
        sky.addColorStop(0.6, '#0d0d24');
        sky.addColorStop(1,   '#1a0808');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // Bulan
        ctx.save();
        ctx.shadowColor = '#ffffaa'; ctx.shadowBlur = 30;
        ctx.fillStyle = '#fffff0';
        ctx.beginPath(); ctx.arc(W * 0.82, H * 0.18, H * 0.07, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // Bintang kecil
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let i = 0; i < 30; i++) {
            // pseudo-random berbasis indeks agar tidak berkedip
            const sx = ((i * 137 + 17) % 100) / 100 * W;
            const sy = ((i * 251 + 43) % 60) / 100 * H;
            const r  = 0.5 + (i % 3) * 0.5;
            const pulse = 0.5 + 0.5 * Math.sin(this.frame * 0.02 + i);
            ctx.globalAlpha = pulse * 0.6;
            ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Garis tanah
        const gnd = ctx.createLinearGradient(0, H * 0.72, 0, H);
        gnd.addColorStop(0, '#1a0505');
        gnd.addColorStop(1, '#0a0202');
        ctx.fillStyle = gnd;
        ctx.fillRect(0, H * 0.72, W, H * 0.28);

        // Garis horizon
        ctx.strokeStyle = '#442211';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, H * 0.72); ctx.lineTo(W, H * 0.72); ctx.stroke();

        // Grid perspektif tanah
        ctx.strokeStyle = 'rgba(100,40,20,0.25)'; ctx.lineWidth = 1;
        for (let i = 0; i <= 8; i++) {
            const x = (i / 8) * W;
            ctx.beginPath(); ctx.moveTo(W/2, H*0.72); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let i = 1; i <= 5; i++) {
            const y = H * 0.72 + (H * 0.28) * (i / 5);
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
    }

    _drawMatchStart() {
        const { ctx, W, H } = this;
        const elapsed = (this.frame - this.startAnimT) / 60; // detik dalam frame
        if (elapsed > 2) { this.state = 'wait'; return; }

        const alpha = Math.max(0, 1 - elapsed * 0.8);
        ctx.save();
        ctx.globalAlpha = alpha;

        // Panel hitam dari atas dan bawah
        const offset = elapsed * H * 0.8;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H/2 - offset);
        ctx.fillRect(0, H/2 + offset, W, H/2);

        // Teks VS di tengah
        if (elapsed < 1.2) {
            ctx.fillStyle = '#cc2222';
            ctx.font = `bold ${H * 0.15}px serif`;
            ctx.textAlign = 'center';
            ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 30;
            ctx.fillText('VS', W/2, H/2 + H*0.06);
        }

        ctx.restore();
    }

    _calcPositions() {
        const n  = this.players.length;
        const W  = this.W, H = this.H;
        const cy = H * 0.58;     // posisi Y karakter di arena

        if (n === 2) {
            this.players[0].x = W * 0.28; this.players[0].y = cy; this.players[0].flipX = false;
            this.players[1].x = W * 0.72; this.players[1].y = cy; this.players[1].flipX = true;
        } else {
            // 3–4 pemain: susun melingkar
            const cx = W / 2, r = Math.min(W, H) * 0.28;
            this.players.forEach((p, i) => {
                const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
                p.x = cx + r * Math.cos(angle);
                p.y = cy + r * Math.sin(angle) * 0.5;
                p.flipX = p.x < cx;
            });
        }
    }

    _drawPlayers() {
        // Setelah resize, recalc posisi
        const W = this.W, H = this.H;
        this._calcPositions();
        this.players.forEach(p => this._drawOnePlayer(p));
    }

    _drawOnePlayer(p) {
        const { ctx, W, H, frame } = this;
        const sz  = Math.min(W, H) * 0.13;    // ukuran karakter
        let   { x, y, flipX } = p;

        // Posisi saat kalah: turun sedikit
        if (p.state === 'lose') y += sz * 0.3;
        // Posisi saat menang: maju ke tengah
        if (p.state === 'win')  x += (W / 2 - x) * 0.25;

        // ─── IMAGE_SWAP: ganti blok ctx.save/restore di bawah ────────────────
        // Contoh pakai gambar:
        //   const img = p.state==='win' ? playerWinImgs[i] :
        //               p.state==='lose'? playerLoseImgs[i] : playerBaseImgs[i];
        //   ctx.save();
        //   if (flipX) { ctx.translate(x, y); ctx.scale(-1,1); ctx.translate(-x,-y); }
        //   ctx.drawImage(img, x - sz*0.6, y - sz*1.1, sz*1.2, sz*1.5);
        //   ctx.restore();
        // ─────────────────────────────────────────────────────────────────────

        ctx.save();
        if (flipX) { ctx.translate(x, y); ctx.scale(-1, 1); ctx.translate(-x, -y); }

        // Warna dan efek berdasarkan state
        let bodyColor = p.color;
        if (p.state === 'win')  { bodyColor = '#ffd700'; ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 15 + Math.sin(frame*0.1)*8; }
        if (p.state === 'lose') { bodyColor = '#444'; }
        if (p.isEarly)          { bodyColor = '#cc2222'; }

        // ── Gambar silhouet samurai ──────────────────────────────────────────
        ctx.fillStyle = bodyColor;

        // Kepala
        ctx.beginPath();
        ctx.arc(x, y - sz * 0.82, sz * 0.16, 0, Math.PI * 2);
        ctx.fill();

        // Topi / kabuto
        ctx.fillRect(x - sz*0.22, y - sz*1.02, sz*0.44, sz*0.1);
        ctx.fillRect(x - sz*0.12, y - sz*1.12, sz*0.24, sz*0.1);

        // Badan
        ctx.fillRect(x - sz*0.18, y - sz*0.65, sz*0.36, sz*0.5);

        // Sabuk obi
        ctx.fillStyle = p.state==='win' ? '#aa8800' : (p.color + '99');
        ctx.fillRect(x - sz*0.2, y - sz*0.22, sz*0.4, sz*0.08);
        ctx.fillStyle = bodyColor;

        // Kaki
        ctx.fillRect(x - sz*0.15, y - sz*0.15, sz*0.12, sz*0.38);
        ctx.fillRect(x + sz*0.03, y - sz*0.15, sz*0.12, sz*0.38);

        // Pedang (katana)
        if (p.state === 'win') {
            // Angkat pedang — diayunkan ke atas
            ctx.save();
            ctx.translate(x + sz*0.18, y - sz*0.5);
            ctx.rotate(-Math.PI / 4);
            ctx.fillStyle = '#ccccff';
            ctx.fillRect(-sz*0.035, -sz*0.55, sz*0.035, sz*0.55);
            ctx.fillStyle = bodyColor;
            ctx.fillRect(-sz*0.07, 0, sz*0.1, sz*0.08);
            ctx.restore();
        } else {
            // Pedang di sisi — posisi siap
            ctx.fillStyle = '#aaaacc';
            ctx.fillRect(x + sz*0.18, y - sz*0.5, sz*0.03, sz*0.5);
            ctx.fillStyle = bodyColor;
            ctx.fillRect(x + sz*0.14, y - sz*0.52, sz*0.1, sz*0.07);
        }

        ctx.restore();

        // ── Nama tag ─────────────────────────────────────────────────────────
        ctx.textAlign = 'center';
        ctx.shadowBlur = 0;
        ctx.font = `bold ${Math.max(11, sz * 0.22)}px monospace`;
        ctx.fillStyle = p.isMe ? '#5bc8ff' : '#ccccee';
        ctx.fillText(p.name + (p.isMe ? ' ★' : ''), x, y + sz * 0.35);

        // ── Reaction time ─────────────────────────────────────────────────────
        if (p.rt !== null) {
            const rtTxt = p.isEarly ? '⚠ EARLY' : (p.rt < 9000 ? p.rt + 'ms' : 'TIMEOUT');
            ctx.font = `${Math.max(10, sz * 0.19)}px monospace`;
            ctx.fillStyle = p.state === 'win' ? '#ffd700' : '#888899';
            ctx.fillText(rtTxt, x, y + sz * 0.53);
        }

        // ── Poin di atas kepala ───────────────────────────────────────────────
        if (p.points !== 0) {
            ctx.font = `bold ${Math.max(10, sz * 0.2)}px monospace`;
            ctx.fillStyle = p.points > 0 ? '#ffd700' : '#cc2222';
            ctx.fillText(p.points + ' pt', x, y - sz * 1.2);
        }
    }

    _drawCenterSignal() {
        const { ctx, W, H, frame, state } = this;
        const cx = W / 2, cy = H * 0.42;
        const sz = Math.min(W, H) * 0.12;

        ctx.textAlign = 'center';

        if (state === 'wait') {
            // ─── IMAGE_SWAP: ganti dengan exclamation.png ──────────────────
            // ctx.drawImage(waitImg, cx - sz, cy - sz, sz*2, sz*2);
            // ──────────────────────────────────────────────────────────────
            const pulse = 0.55 + 0.45 * Math.sin(frame * 0.09);
            ctx.globalAlpha = pulse;
            ctx.shadowColor = '#ff2222'; ctx.shadowBlur = 25 * pulse;
            ctx.fillStyle = '#cc2222';
            ctx.font = `bold ${sz * 0.9}px monospace`;
            ctx.fillText('WAIT...', cx, cy + sz * 0.35);
            ctx.globalAlpha = 1; ctx.shadowBlur = 0;
            return;
        }

        if (state === 'signal') {
            // ─── IMAGE_SWAP: ganti dengan exclamation.png ──────────────────
            // ctx.drawImage(exclamationImg, cx - sz*0.8, cy - sz*1.5, sz*1.6, sz*2);
            // ──────────────────────────────────────────────────────────────
            ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 40;
            ctx.fillStyle = '#ffd700';
            ctx.font = `bold ${sz * 1.6}px serif`;
            ctx.fillText('!', cx, cy + sz * 0.6);
            ctx.shadowBlur = 0;
            return;
        }

        if (state === 'idle' || state === 'result') {
            ctx.fillStyle = '#333355';
            ctx.font = `${sz * 0.5}px monospace`;
            ctx.fillText('⚔', cx, cy + sz * 0.2);
        }
    }

    _drawSlash() {
        // ─── IMAGE_SWAP: ganti dengan slash.png / slash2.png ──────────────
        // const a = this.slashAlpha;
        // ctx.globalAlpha = a;
        // ctx.drawImage(slashImg, W*0.1, H*0.2, W*0.8, H*0.6);
        // ctx.globalAlpha = 1;
        // ──────────────────────────────────────────────────────────────────
        const { ctx, W, H, slashAlpha } = this;
        ctx.save();
        ctx.globalAlpha = slashAlpha * 0.85;
        ctx.strokeStyle = '#e63946';
        ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 20;

        // Dua garis silang diagonal
        const sw = 4 + slashAlpha * 4;
        ctx.lineWidth = sw;
        ctx.lineCap   = 'round';

        ctx.beginPath(); ctx.moveTo(W*0.28, H*0.22); ctx.lineTo(W*0.72, H*0.72); ctx.stroke();
        ctx.lineWidth = sw * 0.6;
        ctx.beginPath(); ctx.moveTo(W*0.33, H*0.20); ctx.lineTo(W*0.77, H*0.70); ctx.stroke();

        ctx.restore();
    }
}
