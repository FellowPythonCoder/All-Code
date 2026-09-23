/* ============================================================
   Sreon Arcade — game pack 3
   ============================================================ */

/* ---------------- DOODLE JUMP ---------------- */
const GAME_JUMP = {
  id: 'jump', name: 'Sky Hop', emoji: '🦘',
  desc: 'Bounce ever upward. Don\'t look down.',
  controls: '← → to steer',
  w: 440, h: 640,
  init(g) {
    g.p = { x: g.w/2-16, y: g.h-140, w: 32, h: 32, vy: 0, vx: 0 };
    g.plats = [];
    for (let i=0;i<11;i++)
      g.plats.push({ x: rand(0,g.w-80), y: g.h-40 - i*62, w: 80, h: 12, type: i>4 && Math.random()<0.18 ? 'break' : 'solid', gone:false });
    g.camY = 0; g.best = 0;
  },
  update(g, dt) {
    const p = g.p;
    if (Input.anyHeld('ArrowLeft','a'))  p.vx = -280;
    else if (Input.anyHeld('ArrowRight','d')) p.vx = 280;
    else p.vx *= 0.86;

    p.x += p.vx*dt;
    if (p.x + p.w < 0) p.x = g.w;
    if (p.x > g.w) p.x = -p.w;

    p.vy += 1150*dt;
    p.y += p.vy*dt;

    if (p.vy > 0) {
      for (const pl of g.plats) {
        if (pl.gone) continue;
        if (p.x + p.w > pl.x && p.x < pl.x + pl.w &&
            p.y + p.h > pl.y && p.y + p.h < pl.y + pl.h + 14) {
          p.vy = -560; Sound.pop();
          if (pl.type === 'break') pl.gone = true;
          break;
        }
      }
    }

    if (p.y < g.h/2.4) {
      const shift = g.h/2.4 - p.y;
      p.y = g.h/2.4;
      g.camY += shift;
      g.plats.forEach(pl => pl.y += shift);
    }
    g.score = Math.floor(g.camY/8);

    g.plats = g.plats.filter(pl => pl.y < g.h + 40);
    while (g.plats.length < 11) {
      const top = Math.min(...g.plats.map(pl=>pl.y));
      g.plats.push({ x: rand(0,g.w-80), y: top - rand(52,78), w: 80, h: 12,
        type: Math.random()<0.2 ? 'break' : 'solid', gone:false });
    }

    if (p.y > g.h + 40) { Sound.bad(); g.gameOver(); }
  },
  draw(g, ctx) {
    bg(ctx, g);
    g.plats.forEach(pl => {
      if (pl.gone) return;
      ctx.fillStyle = pl.type === 'break' ? PALETTE.bad : PALETTE.good;
      ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
    });
    ctx.fillStyle = PALETTE.accent2;
    ctx.fillRect(g.p.x, g.p.y, g.p.w, g.p.h);
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(g.p.x+7, g.p.y+9, 5, 5);
    ctx.fillRect(g.p.x+g.p.w-12, g.p.y+9, 5, 5);
    text(ctx, String(g.score), 18, 38, 26, PALETTE.ink, 'left', 700);
  }
};

/* ---------------- TIC-TAC-TOE (minimax AI) ---------------- */
const GAME_TTT = {
  id: 'ttt', name: 'Tic-Tac-Toe', emoji: '⭕',
  desc: 'Perfect-play AI. Best you can hope for is a draw.',
  controls: 'Click a square',
  w: 480, h: 540,
  init(g) {
    g.b = Array(9).fill('');
    g.cell = 140; g.ox = (g.w - 3*g.cell)/2; g.oy = 90;
    g.turn = 'X'; g.msg = 'Your move';

    g.winner = function(b) {
      const L = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      for (const [a,b2,c] of L) if (b[a] && b[a]===b[b2] && b[a]===b[c]) return b[a];
      return b.every(v=>v) ? 'tie' : null;
    };
    g.minimax = function(b, isMax) {
      const w = g.winner(b);
      if (w === 'O') return { s: 1 };
      if (w === 'X') return { s: -1 };
      if (w === 'tie') return { s: 0 };
      let best = { s: isMax ? -9 : 9, i: -1 };
      for (let i=0;i<9;i++) {
        if (b[i]) continue;
        b[i] = isMax ? 'O' : 'X';
        const r = g.minimax(b, !isMax);
        b[i] = '';
        if (isMax ? r.s > best.s : r.s < best.s) best = { s: r.s, i };
      }
      return best;
    };
    g.aiT = 0;
  },
  update(g, dt) {
    const w = g.winner(g.b);
    if (w) {
      g.msg = w === 'tie' ? 'Draw.' : w === 'X' ? 'You win!' : 'AI wins.';
      if (w === 'X') g.score = 1000;
      if (w === 'tie') g.score = 300;
      g.aiT += dt;
      if (g.aiT > 1.2) g.gameOver(w === 'X');
      return;
    }
    if (g.turn === 'O') {
      g.aiT += dt;
      if (g.aiT > 0.4) {
        const m = g.minimax(g.b.slice(), true);
        if (m.i >= 0) g.b[m.i] = 'O';
        g.turn = 'X'; g.msg = 'Your move'; g.aiT = 0; Sound.pop();
      }
      return;
    }
    const p = Input.pointer;
    if (!p.justDown) return;
    const c = Math.floor((p.x-g.ox)/g.cell), r = Math.floor((p.y-g.oy)/g.cell);
    if (c<0||r<0||c>2||r>2) return;
    const i = r*3+c;
    if (g.b[i]) return;
    g.b[i] = 'X'; g.turn = 'O'; g.msg = 'AI thinking...'; g.aiT = 0; Sound.blip();
  },
  draw(g, ctx) {
    bg(ctx, g);
    text(ctx, 'Tic-Tac-Toe', 24, 46, 24, PALETTE.ink, 'left', 700);
    text(ctx, g.msg, g.w/2, g.oy + 3*g.cell + 40, 15, PALETTE.dim, 'center');
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 3;
    for (let i=1;i<3;i++) {
      ctx.beginPath(); ctx.moveTo(g.ox+i*g.cell, g.oy); ctx.lineTo(g.ox+i*g.cell, g.oy+3*g.cell); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(g.ox, g.oy+i*g.cell); ctx.lineTo(g.ox+3*g.cell, g.oy+i*g.cell); ctx.stroke();
    }
    g.b.forEach((v,i) => {
      if (!v) return;
      const r = Math.floor(i/3), c = i%3;
      const x = g.ox + c*g.cell + g.cell/2, y = g.oy + r*g.cell + g.cell/2;
      text(ctx, v, x, y+22, 64, v==='X'?PALETTE.accent2:PALETTE.bad, 'center', 700);
    });
  }
};

/* ---------------- WHACK-A-MOLE ---------------- */
const GAME_WHACK = {
  id: 'whack', name: 'Whack-a-Mole', emoji: '🔨',
  desc: '30 seconds. Hit moles, avoid bombs.',
  controls: 'Click the moles',
  w: 560, h: 560,
  init(g) {
    g.n = 3; g.cell = 150; g.pad = 16;
    g.ox = (g.w - (g.n*g.cell + (g.n-1)*g.pad))/2; g.oy = 110;
    g.holes = Array.from({length:9}, ()=>({ up:0, type:'mole' }));
    g.spawnT = 0; g.timeLeft = 30;
  },
  update(g, dt) {
    g.timeLeft -= dt;
    if (g.timeLeft <= 0) { Sound.good(); return g.gameOver(true); }

    g.holes.forEach(h => { if (h.up > 0) h.up -= dt; });
    g.spawnT -= dt;
    if (g.spawnT <= 0) {
      g.spawnT = rand(0.35, 0.8);
      const free = g.holes.map((h,i)=>({h,i})).filter(x=>x.h.up<=0);
      if (free.length) {
        const pick = choice(free);
        pick.h.up = rand(0.7, 1.3);
        pick.h.type = Math.random() < 0.18 ? 'bomb' : 'mole';
      }
    }

    const p = Input.pointer;
    if (!p.justDown) return;
    const c = Math.floor((p.x-g.ox)/(g.cell+g.pad)), r = Math.floor((p.y-g.oy)/(g.cell+g.pad));
    if (c<0||r<0||c>=g.n||r>=g.n) return;
    const h = g.holes[r*g.n+c];
    if (h.up <= 0) return;
    if (h.type === 'bomb') { g.score = Math.max(0, g.score-50); Sound.bad(); }
    else { g.score += 25; Sound.good(); }
    h.up = 0;
  },
  draw(g, ctx) {
    bg(ctx, g);
    text(ctx, 'SCORE ' + g.score, 24, 46, 20, PALETTE.ink, 'left', 700);
    text(ctx, Math.ceil(g.timeLeft) + 's', g.w-24, 46, 20, g.timeLeft<6?PALETTE.bad:PALETTE.dim, 'right', 700);
    g.holes.forEach((h,i) => {
      const r = Math.floor(i/g.n), c = i%g.n;
      const x = g.ox + c*(g.cell+g.pad), y = g.oy + r*(g.cell+g.pad);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.ellipse(x+g.cell/2, y+g.cell/2, g.cell/2, g.cell/2.6, 0,0,7); ctx.fill();
      if (h.up > 0) {
        text(ctx, h.type==='bomb'?'💣':'🐹', x+g.cell/2, y+g.cell/2+18, 54, '#fff', 'center');
      }
    });
  }
};

/* ---------------- CONNECT FOUR ---------------- */
const GAME_C4 = {
  id: 'connect4', name: 'Connect Four', emoji: '🔴',
  desc: 'Four in a row beats the AI.',
  controls: 'Click a column',
  w: 560, h: 560,
  init(g) {
    g.cols = 7; g.rows = 6; g.cell = 72;
    g.ox = (g.w - g.cols*g.cell)/2; g.oy = 100;
    g.b = Array.from({length:g.rows}, ()=>Array(g.cols).fill(0));
    g.turn = 1; g.msg = 'Your move'; g.aiT = 0;

    g.drop = function(b, c, who) {
      for (let r=g.rows-1;r>=0;r--) if (!b[r][c]) { b[r][c]=who; return r; }
      return -1;
    };
    g.winAt = function(b) {
      const dirs = [[0,1],[1,0],[1,1],[1,-1]];
      for (let r=0;r<g.rows;r++) for (let c=0;c<g.cols;c++) {
        const v = b[r][c]; if (!v) continue;
        for (const [dr,dc] of dirs) {
          let k=1;
          while (k<4) {
            const rr=r+dr*k, cc=c+dc*k;
            if (rr<0||cc<0||rr>=g.rows||cc>=g.cols||b[rr][cc]!==v) break;
            k++;
          }
          if (k===4) return v;
        }
      }
      return b[0].every(v=>v) ? 'tie' : null;
    };
    g.aiMove = function() {
      const valid = [];
      for (let c=0;c<g.cols;c++) if (!g.b[0][c]) valid.push(c);
      // win now
      for (const c of valid) {
        const copy = g.b.map(r=>r.slice());
        g.drop(copy,c,2);
        if (g.winAt(copy)===2) return c;
      }
      // block player
      for (const c of valid) {
        const copy = g.b.map(r=>r.slice());
        g.drop(copy,c,1);
        if (g.winAt(copy)===1) return c;
      }
      const center = valid.filter(c=>Math.abs(c-3)<=1);
      return choice(center.length?center:valid);
    };
  },
  update(g, dt) {
    const w = g.winAt(g.b);
    if (w) {
      g.msg = w==='tie' ? 'Draw.' : w===1 ? 'You win!' : 'AI wins.';
      if (w===1) g.score = 1000;
      if (w==='tie') g.score = 300;
      g.aiT += dt;
      if (g.aiT>1.3) g.gameOver(w===1);
      return;
    }
    if (g.turn === 2) {
      g.aiT += dt;
      if (g.aiT>0.5) { g.drop(g.b, g.aiMove(), 2); g.turn=1; g.msg='Your move'; g.aiT=0; Sound.pop(); }
      return;
    }
    const p = Input.pointer;
    if (!p.justDown) return;
    const c = Math.floor((p.x-g.ox)/g.cell);
    if (c<0||c>=g.cols||g.b[0][c]) return;
    g.drop(g.b, c, 1); g.turn=2; g.msg='AI thinking...'; g.aiT=0; Sound.blip();
  },
  draw(g, ctx) {
    bg(ctx, g);
    text(ctx, 'Connect Four', 24, 46, 24, PALETTE.ink, 'left', 700);
    text(ctx, g.msg, g.w/2, g.oy + g.rows*g.cell + 34, 15, PALETTE.dim, 'center');
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(g.ox, g.oy, g.cols*g.cell, g.rows*g.cell);
    for (let r=0;r<g.rows;r++) for (let c=0;c<g.cols;c++) {
      const v = g.b[r][c];
      ctx.fillStyle = v===1 ? PALETTE.bad : v===2 ? PALETTE.warn : PALETTE.bg;
      ctx.beginPath();
      ctx.arc(g.ox+c*g.cell+g.cell/2, g.oy+r*g.cell+g.cell/2, g.cell/2-6, 0, 7);
      ctx.fill();
    }
  }
};

/* ---------------- ENDLESS RUNNER ---------------- */
const GAME_RUNNER = {
  id: 'runner', name: 'Runner', emoji: '🏃',
  desc: 'Jump the cacti. It only gets faster.',
  controls: 'Space / click to jump',
  w: 680, h: 400,
  init(g) {
    g.ground = g.h - 70;
    g.p = { x: 80, y: g.ground-42, w: 30, h: 42, vy: 0, onGround: true };
    g.obs = []; g.spawnT = 1.2; g.speed = 320;
  },
  update(g, dt) {
    g.speed += 9*dt;
    g.score += g.speed*dt*0.06;

    const p = g.p;
    if ((Input.pressed(' ') || Input.pointer.justDown) && p.onGround) {
      p.vy = -560; p.onGround = false; Sound.blip();
    }
    p.vy += 1500*dt;
    p.y += p.vy*dt;
    if (p.y >= g.ground - p.h) { p.y = g.ground - p.h; p.vy = 0; p.onGround = true; }

    g.spawnT -= dt;
    if (g.spawnT <= 0) {
      g.spawnT = rand(0.75, 1.5) * (320/g.speed);
      const tall = Math.random() < 0.3;
      g.obs.push({ x: g.w+20, y: g.ground - (tall?54:36), w: tall?22:26, h: tall?54:36 });
    }
    g.obs.forEach(o => o.x -= g.speed*dt);
    g.obs = g.obs.filter(o => o.x > -60);

    for (const o of g.obs) {
      if (aabb({x:p.x+4,y:p.y+3,w:p.w-8,h:p.h-6}, o)) { Sound.bad(); return g.gameOver(); }
    }
  },
  draw(g, ctx) {
    bg(ctx, g);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,g.ground); ctx.lineTo(g.w,g.ground); ctx.stroke();
    ctx.fillStyle = PALETTE.accent2;
    ctx.fillRect(g.p.x, g.p.y, g.p.w, g.p.h);
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(g.p.x+18, g.p.y+10, 6, 6);
    ctx.fillStyle = PALETTE.good;
    g.obs.forEach(o => ctx.fillRect(o.x, o.y, o.w, o.h));
    text(ctx, String(Math.floor(g.score)), g.w-20, 40, 24, PALETTE.ink, 'right', 700);
  }
};

window.GAME_PACK_3 = [GAME_JUMP, GAME_TTT, GAME_WHACK, GAME_C4, GAME_RUNNER];
