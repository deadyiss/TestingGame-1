/**
 * game-canvas.js — Canvas renderer bergaya samurai
 *
 * FITUR BARU: tampilkan target input di tengah arena
 *   Keyboard: kotak abu-abu bergaya tombol fisik dengan huruf/angka
 *   Mouse: ikon mouse dengan tombol yang disorot
 *
 * IMAGE_SWAP: Cari komentar ini untuk mengganti placeholder dengan sprite asli.
 */
class GameRenderer {
    constructor(canvas) {
        this.canvas  = canvas;
        this.ctx     = canvas.getContext('2d');
        this.W = this.H = 0;
        this.state     = 'idle';
        this.players   = [];
        this.frame     = 0;
        this.slashAlpha= 0;
        this.startAnimT= 0;
        this.target    = null;   // {type, value} atau null
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this._loop();
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width  = rect.width  || this.canvas.offsetWidth  || 600;
        this.canvas.height = rect.height || this.canvas.offsetHeight || 360;
        this.W = this.canvas.width;
        this.H = this.canvas.height;
    }

    setPlayers(names, myName) {
        this.players = names.map((name, i) => ({
            name, isMe: name === myName,
            state: 'idle', rt: null, rank: null,
            points: 0, isEarly: false, x: 0, y: 0, flipX: false,
            color: ['#E63946','#2196F3','#4CAF50','#FF9800'][i % 4],
        }));
        this._calcPositions();
    }

    setState(s) {
        this.state = s;
        if (s === 'starting') this.startAnimT = this.frame;
        if (s === 'wait')     { this.slashAlpha = 0; this.players.forEach(p => { p.state='idle'; p.rt=null; p.rank=null; p.isEarly=false; }); }
        if (s === 'signal')   this.slashAlpha = 0;
    }

    /** target = {type:'key'|'mouse', value} atau null */
    setTarget(target) { this.target = target; }

    setResult(results, scores) {
        results.forEach(r => {
            const p = this.players.find(pl => pl.name === r.username);
            if (!p) return;
            p.rt = r.rt; p.rank = r.rank; p.isEarly = r.is_early;
            p.state = (r.rank === 1 && !r.is_early) ? 'win' : 'lose';
        });
        if (scores) this.players.forEach(p => { p.points = scores[p.name] ?? p.points; });
        this.slashAlpha = 1;
        this.state = 'result';
    }

    _loop() {
        this.frame++;
        this._draw();
        this._raf = requestAnimationFrame(() => this._loop());
    }

    destroy() { if (this._raf) cancelAnimationFrame(this._raf); }

    // ── Draw ──────────────────────────────────────────────────────────────────

    _draw() {
        const { ctx, W, H } = this;
        ctx.clearRect(0, 0, W, H);
        this._drawBackground();
        if (this.state === 'starting') this._drawMatchStart();
        this._drawPlayers();
        this._drawCenter();
        if (this.slashAlpha > 0) this._drawSlash();
        if (this.slashAlpha > 0) this.slashAlpha = Math.max(0, this.slashAlpha - 0.008);
    }

    _drawBackground() {
        const { ctx, W, H } = this;
        // IMAGE_SWAP: ctx.drawImage(bgImg, 0, 0, W, H); return;
        const sky = ctx.createLinearGradient(0,0,0,H);
        sky.addColorStop(0,'#050510'); sky.addColorStop(0.6,'#0d0d24'); sky.addColorStop(1,'#1a0808');
        ctx.fillStyle = sky; ctx.fillRect(0,0,W,H);
        ctx.save(); ctx.shadowColor='#ffffaa'; ctx.shadowBlur=30;
        ctx.fillStyle='#fffff0'; ctx.beginPath(); ctx.arc(W*.82,H*.18,H*.07,0,Math.PI*2); ctx.fill();
        ctx.restore();
        ctx.fillStyle='rgba(255,255,255,0.5)';
        for(let i=0;i<30;i++){
            const sx=((i*137+17)%100)/100*W, sy=((i*251+43)%60)/100*H;
            ctx.globalAlpha=(0.5+0.5*Math.sin(this.frame*.02+i))*.6;
            ctx.beginPath(); ctx.arc(sx,sy,0.5+(i%3)*.5,0,Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha=1;
        const gnd=ctx.createLinearGradient(0,H*.72,0,H);
        gnd.addColorStop(0,'#1a0505'); gnd.addColorStop(1,'#0a0202');
        ctx.fillStyle=gnd; ctx.fillRect(0,H*.72,W,H*.28);
        ctx.strokeStyle='#442211'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(0,H*.72); ctx.lineTo(W,H*.72); ctx.stroke();
        ctx.strokeStyle='rgba(100,40,20,0.25)'; ctx.lineWidth=1;
        for(let i=0;i<=8;i++){
            const x=(i/8)*W;
            ctx.beginPath(); ctx.moveTo(W/2,H*.72); ctx.lineTo(x,H); ctx.stroke();
        }
        for(let i=1;i<=5;i++){
            const y=H*.72+(H*.28)*(i/5);
            ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
        }
    }

    _drawMatchStart() {
        const { ctx, W, H } = this;
        const elapsed = (this.frame - this.startAnimT) / 60;
        if (elapsed > 2) { this.state = 'wait'; return; }
        const alpha = Math.max(0, 1 - elapsed * 0.8);
        ctx.save(); ctx.globalAlpha = alpha;
        const offset = elapsed * H * 0.8;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H/2 - offset);
        ctx.fillRect(0, H/2 + offset, W, H/2);
        if (elapsed < 1.2) {
            ctx.fillStyle='#cc2222'; ctx.font=`bold ${H*.15}px serif`;
            ctx.textAlign='center'; ctx.shadowColor='#ff0000'; ctx.shadowBlur=30;
            ctx.fillText('VS', W/2, H/2+H*.06);
        }
        ctx.restore();
    }

    _calcPositions() {
        const n=this.players.length, W=this.W, H=this.H, cy=H*.58;
        if(n===2){
            this.players[0].x=W*.28; this.players[0].y=cy; this.players[0].flipX=false;
            this.players[1].x=W*.72; this.players[1].y=cy; this.players[1].flipX=true;
        } else {
            const cx=W/2, r=Math.min(W,H)*.28;
            this.players.forEach((p,i)=>{
                const a=(i/n)*Math.PI*2-Math.PI/2;
                p.x=cx+r*Math.cos(a); p.y=cy+r*Math.sin(a)*.5; p.flipX=p.x<cx;
            });
        }
    }

    _drawPlayers() { this._calcPositions(); this.players.forEach(p=>this._drawOne(p)); }

    _drawOne(p) {
        const { ctx, W, H, frame } = this;
        const sz = Math.min(W,H)*.13;
        let { x, y, flipX } = p;
        if(p.state==='lose') y+=sz*.3;
        if(p.state==='win')  x+=(W/2-x)*.25;
        // IMAGE_SWAP: ctx.save(); if(flipX){ctx.translate(x,y);ctx.scale(-1,1);ctx.translate(-x,-y);}
        // ctx.drawImage(stateImg, x-sz*.6, y-sz*1.1, sz*1.2, sz*1.5); ctx.restore();
        ctx.save();
        if(flipX){ctx.translate(x,y);ctx.scale(-1,1);ctx.translate(-x,-y);}
        let col=p.color;
        if(p.state==='win'){col='#ffd700';ctx.shadowColor='#ffd700';ctx.shadowBlur=15+Math.sin(frame*.1)*8;}
        if(p.state==='lose') col='#444';
        if(p.isEarly)        col='#cc2222';
        ctx.fillStyle=col;
        ctx.beginPath();ctx.arc(x,y-sz*.82,sz*.16,0,Math.PI*2);ctx.fill();
        ctx.fillRect(x-sz*.22,y-sz*1.02,sz*.44,sz*.1);
        ctx.fillRect(x-sz*.12,y-sz*1.12,sz*.24,sz*.1);
        ctx.fillRect(x-sz*.18,y-sz*.65,sz*.36,sz*.5);
        ctx.fillStyle=p.state==='win'?'#aa8800':(p.color+'99');
        ctx.fillRect(x-sz*.2,y-sz*.22,sz*.4,sz*.08);
        ctx.fillStyle=col;
        ctx.fillRect(x-sz*.15,y-sz*.15,sz*.12,sz*.38);
        ctx.fillRect(x+sz*.03,y-sz*.15,sz*.12,sz*.38);
        if(p.state==='win'){
            ctx.save();ctx.translate(x+sz*.18,y-sz*.5);ctx.rotate(-Math.PI/4);
            ctx.fillStyle='#ccccff';ctx.fillRect(-sz*.035,-sz*.55,sz*.035,sz*.55);
            ctx.fillStyle=col;ctx.fillRect(-sz*.07,0,sz*.1,sz*.08);ctx.restore();
        } else {
            ctx.fillStyle='#aaaacc';ctx.fillRect(x+sz*.18,y-sz*.5,sz*.03,sz*.5);
            ctx.fillStyle=col;ctx.fillRect(x+sz*.14,y-sz*.52,sz*.1,sz*.07);
        }
        ctx.restore();
        ctx.textAlign='center';ctx.shadowBlur=0;
        ctx.font=`bold ${Math.max(11,sz*.22)}px monospace`;
        ctx.fillStyle=p.isMe?'#5bc8ff':'#ccccee';
        ctx.fillText(p.name+(p.isMe?' ★':''),x,y+sz*.35);
        if(p.rt!==null){
            const rtTxt=p.isEarly?'⚠ EARLY':(p.rt<9000?p.rt+'ms':'TIMEOUT');
            ctx.font=`${Math.max(10,sz*.19)}px monospace`;
            ctx.fillStyle=p.state==='win'?'#ffd700':'#888899';
            ctx.fillText(rtTxt,x,y+sz*.53);
        }
        if(p.points!==0){
            ctx.font=`bold ${Math.max(10,sz*.2)}px monospace`;
            ctx.fillStyle=p.points>0?'#ffd700':'#cc2222';
            ctx.fillText(p.points+' pt',x,y-sz*1.2);
        }
    }

    _drawCenter() {
        const { ctx, W, H, frame, state, target } = this;
        const cx=W/2, cy=H*.42, sz=Math.min(W,H)*.12;
        ctx.textAlign='center';

        if (state === 'wait') {
            // IMAGE_SWAP: ctx.drawImage(waitImg, cx-sz, cy-sz, sz*2, sz*2);
            const pulse=0.55+0.45*Math.sin(frame*.09);
            ctx.globalAlpha=pulse; ctx.shadowColor='#ff2222'; ctx.shadowBlur=25*pulse;
            ctx.fillStyle='#cc2222'; ctx.font=`bold ${sz*.9}px monospace`;
            ctx.fillText('WAIT...',cx,cy+sz*.35);
            ctx.globalAlpha=1; ctx.shadowBlur=0;
            return;
        }

        if (state === 'signal' && target) {
            // Tampilkan target input dengan gaya bergantung tipenya
            if (target.type === 'key') {
                this._drawKeyTarget(cx, cy, sz, target.value);
            } else {
                this._drawMouseTarget(cx, cy, sz, target.value);
            }
            return;
        }

        if (state === 'result') {
            // Tampilkan tanda seru setelah ronde
            ctx.shadowColor='#ffd700'; ctx.shadowBlur=40;
            ctx.fillStyle='#ffd700'; ctx.font=`bold ${sz*1.6}px serif`;
            ctx.fillText('!',cx,cy+sz*.6); ctx.shadowBlur=0;
            return;
        }

        ctx.fillStyle='#333355'; ctx.font=`${sz*.5}px monospace`;
        ctx.fillText('⚔',cx,cy+sz*.2);
    }

    /** Gambar kotak tombol keyboard bergaya 3D */
    _drawKeyTarget(cx, cy, sz, key) {
        const { ctx, frame } = this;
        const flash = 0.7 + 0.3 * Math.sin(frame * 0.15);
        const bw = sz * 1.6, bh = sz * 1.6;
        const bx = cx - bw/2, by = cy - bh/2 - sz*.2;

        // Shadow tombol (efek 3D)
        ctx.fillStyle = '#1a1a00';
        ctx.beginPath();
        ctx.roundRect(bx+6, by+8, bw, bh, 12);
        ctx.fill();

        // Badan tombol
        const grad = ctx.createLinearGradient(bx, by, bx, by+bh);
        grad.addColorStop(0, `rgba(255,220,0,${flash})`);
        grad.addColorStop(1, `rgba(200,160,0,${flash})`);
        ctx.fillStyle = grad;
        ctx.shadowColor = `rgba(255,220,0,${flash})`;
        ctx.shadowBlur = 20 * flash;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 12);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Border atas (efek highlight)
        ctx.strokeStyle = `rgba(255,255,150,${flash})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(bx+2, by+2, bw-4, bh-4, 10);
        ctx.stroke();

        // Huruf / angka di dalam tombol
        ctx.fillStyle = '#1a1000';
        ctx.font = `bold ${sz * 0.95}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(key, cx, by + bh * 0.68);

        // Label kecil di atas
        ctx.fillStyle = `rgba(255,220,0,${flash * 0.9})`;
        ctx.font = `bold ${sz * 0.3}px monospace`;
        ctx.fillText('TEKAN', cx, by - sz * 0.2);
    }

    /** Gambar ikon mouse dengan tombol yang disorot */
    _drawMouseTarget(cx, cy, sz, button) {
        const { ctx, frame } = this;
        const flash = 0.7 + 0.3 * Math.sin(frame * 0.15);
        const mw = sz * 1.1, mh = sz * 1.8;
        const mx = cx - mw/2, my = cy - mh/2 - sz*.2;

        // Label di atas
        ctx.fillStyle = `rgba(255,220,0,${flash})`;
        ctx.font = `bold ${sz*.28}px monospace`;
        ctx.textAlign='center';
        const lbl = button==='left'?'KLIK KIRI':button==='right'?'KLIK KANAN':'KLIK TENGAH';
        ctx.fillText(lbl, cx, my - sz*.15);

        // Body mouse (abu-abu gelap)
        ctx.fillStyle = '#2a2a3a';
        ctx.shadowColor='#00000088'; ctx.shadowBlur=10;
        ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, mw*0.4); ctx.fill();
        ctx.shadowBlur=0;

        // Garis tengah pemisah
        ctx.strokeStyle='#444455'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(cx,my+2); ctx.lineTo(cx,my+mh*.45); ctx.stroke();

        // Highlight tombol yang benar
        const hlGrad = ctx.createLinearGradient(0,my,0,my+mh*.45);
        hlGrad.addColorStop(0, `rgba(255,220,0,${flash*0.9})`);
        hlGrad.addColorStop(1, `rgba(200,160,0,${flash*0.5})`);
        ctx.fillStyle = hlGrad;
        ctx.shadowColor = `rgba(255,220,0,${flash})`;
        ctx.shadowBlur = 15 * flash;

        if (button === 'left') {
            ctx.beginPath();
            ctx.moveTo(mx+2, my+2);
            ctx.lineTo(cx-1, my+2);
            ctx.lineTo(cx-1, my+mh*.44);
            ctx.quadraticCurveTo(mx+2, my+mh*.44, mx+2, my+mh*.3);
            ctx.closePath(); ctx.fill();
        } else if (button === 'right') {
            ctx.beginPath();
            ctx.moveTo(cx+1, my+2);
            ctx.lineTo(mx+mw-2, my+2);
            ctx.lineTo(mx+mw-2, my+mh*.3);
            ctx.quadraticCurveTo(mx+mw-2, my+mh*.44, cx+1, my+mh*.44);
            ctx.closePath(); ctx.fill();
        } else {
            // Tengah: scroll wheel highlight
            ctx.beginPath();
            ctx.roundRect(cx-sz*.12, my+sz*.15, sz*.24, sz*.35, 4);
            ctx.fill();
        }
        ctx.shadowBlur=0;

        // Scroll wheel (abu-abu)
        ctx.fillStyle=button==='middle'?`rgba(255,220,0,${flash})`:'#555566';
        ctx.beginPath();
        ctx.roundRect(cx-sz*.08, my+sz*.2, sz*.16, sz*.25, 3);
        ctx.fill();

        // Kabel mouse (garis melengkung)
        ctx.strokeStyle='#333344'; ctx.lineWidth=2; ctx.lineCap='round';
        ctx.beginPath();
        ctx.moveTo(cx, my+mh);
        ctx.bezierCurveTo(cx, my+mh+sz*.3, cx+sz*.4, my+mh+sz*.4, cx+sz*.5, my+mh+sz*.2);
        ctx.stroke();
    }

    _drawSlash() {
        const { ctx, W, H, slashAlpha } = this;
        // IMAGE_SWAP: ctx.globalAlpha=slashAlpha*.85; ctx.drawImage(slashImg,...); ctx.globalAlpha=1;
        ctx.save(); ctx.globalAlpha=slashAlpha*.85;
        ctx.strokeStyle='#e63946'; ctx.shadowColor='#ff0000'; ctx.shadowBlur=20;
        ctx.lineWidth=4+slashAlpha*4; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(W*.28,H*.22); ctx.lineTo(W*.72,H*.72); ctx.stroke();
        ctx.lineWidth=(4+slashAlpha*4)*.6;
        ctx.beginPath(); ctx.moveTo(W*.33,H*.20); ctx.lineTo(W*.77,H*.70); ctx.stroke();
        ctx.restore();
    }
}
