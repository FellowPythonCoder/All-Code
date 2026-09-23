/* ============================================================
   Sreon Arcade — game pack 1
   ============================================================ */
const { Input, Sound, rand, randi, clamp, aabb, dist, choice } = Arcade;
Object.assign(window, { Input, Sound, rand, randi, clamp, aabb, dist, choice });

const PALETTE = {
  bg:    '#12101c',
  panel: '#1b1828',
  ink:   '#efeaff',
  dim:   '#8f88ad',
  accent:'#7C3AED',
  accent2:'#a855f7',
  good:  '#4ade80',
  bad:   '#f43f5e',
  warn:  '#fbbf24',
};

function bg(ctx, g) {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, g.w, g.h);
}
function text(ctx, str, x, y, size = 16, color = PALETTE.ink, align = 'left', weight = 500) {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.font = `${weight} ${size}px Inter, sans-serif`;
  ctx.fillText(str, x, y);
}

// share across pack files
window.PALETTE = PALETTE;
window.bg = bg;
window.text = text;

/* ---------------- SNAKE ---------------- */
const GAME_SNAKE = {
  id: 'snake', name: 'Snake', emoji: '🐍',
  desc: 'Eat, grow, survive. Speeds up as you go.',
  controls: 'Arrow keys / WASD',
  w: 600, h: 600,
  init(g) {
    g.cell = 24; g.cols = g.w / g.cell; g.rows = g.h / g.cell;
    g.snake = [{x:10,y:12},{x:9,y:12},{x:8,y:12}];
    g.dir = {x:1,y:0}; g.nextDir = {x:1,y:0};
    g.food = {x:15,y:12};
    g.tick = 0; g.speed = 0.13;
  },
  update(g, dt) {
    if (Input.anyHeld('ArrowUp','w','W')    && g.dir.y === 0) g.nextDir = {x:0,y:-1};
    if (Input.anyHeld('ArrowDown','s','S')  && g.dir.y === 0) g.nextDir = {x:0,y:1};
    if (Input.anyHeld('ArrowLeft','a','A')  && g.dir.x === 0) g.nextDir = {x:-1,y:0};
    if (Input.anyHeld('ArrowRight','d','D') && g.dir.x === 0) g.nextDir = {x:1,y:0};

    g.tick += dt;
    if (g.tick < g.speed) return;
    g.tick = 0;
    g.dir = g.nextDir;

    const head = { x: g.snake[0].x + g.dir.x, y: g.snake[0].y + g.dir.y };
    const die = () => {
      Sound.bad();
      FX.burst(head.x*g.cell+g.cell/2, head.y*g.cell+g.cell/2, '#f43f5e', 26, {speed:260});
      FX.kick(14, 0.35); FX.blink('#f43f5e', 0.4);
      g.gameOver();
    };
    if (head.x < 0 || head.y < 0 || head.x >= g.cols || head.y >= g.rows) return die();
    if (g.snake.some(s => s.x === head.x && s.y === head.y))            return die();

    g.snake.unshift(head);
    if (head.x === g.food.x && head.y === g.food.y) {
      g.score += 10; Sound.good();
      FX.burst(g.food.x*g.cell+g.cell/2, g.food.y*g.cell+g.cell/2, '#f43f5e', 18);
      FX.kick(5, 0.15);
      g.speed = Math.max(0.055, g.speed - 0.004);
      do { g.food = { x: randi(0,g.cols), y: randi(0,g.rows) }; }
      while (g.snake.some(s => s.x === g.food.x && s.y === g.food.y));
    } else g.snake.pop();
  },
  draw(g, ctx) {
    FX.sky(ctx, g.w, g.h, '#191430', '#0c0a18');
    ctx.strokeStyle = 'rgba(160,140,255,0.05)';
    for (let i = 0; i <= g.cols; i++) {
      ctx.beginPath(); ctx.moveTo(i*g.cell,0); ctx.lineTo(i*g.cell,g.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,i*g.cell); ctx.lineTo(g.w,i*g.cell); ctx.stroke();
    }
    const pulse = 1 + Math.sin(g.time*6)*0.12;
    FX.glowCircle(ctx, g.food.x*g.cell+g.cell/2, g.food.y*g.cell+g.cell/2, g.cell*0.3*pulse, '#f43f5e', 22);

    g.snake.forEach((s, i) => {
      const t = i / Math.max(1, g.snake.length);
      const col = i === 0 ? '#c4b5fd' : `hsl(${265 - t*40}, 75%, ${62 - t*22}%)`;
      const p = i === 0 ? 2 : 3;
      if (i < 3) {
        FX.glowRoundRect(ctx, s.x*g.cell+p, s.y*g.cell+p, g.cell-p*2, g.cell-p*2, 6, col, i===0?18:10);
      } else {
        ctx.fillStyle = col;
        FX.roundRect(ctx, s.x*g.cell+p, s.y*g.cell+p, g.cell-p*2, g.cell-p*2, 5); ctx.fill();
      }
    });
    FX.vignette(ctx, g.w, g.h, 0.45);
  }
};

/* ---------------- TETRIS ---------------- */
const TETRO = {
  I: { c:'#22d3ee', s:[[1,1,1,1]] },
  O: { c:'#fbbf24', s:[[1,1],[1,1]] },
  T: { c:'#a855f7', s:[[0,1,0],[1,1,1]] },
  S: { c:'#4ade80', s:[[0,1,1],[1,1,0]] },
  Z: { c:'#f43f5e', s:[[1,1,0],[0,1,1]] },
  J: { c:'#3b82f6', s:[[1,0,0],[1,1,1]] },
  L: { c:'#fb923c', s:[[0,0,1],[1,1,1]] },
};
const GAME_TETRIS = {
  id: 'tetris', name: 'Tetris', emoji: '🧱',
  desc: 'Stack, clear lines, don\'t top out.',
  controls: '← → move · ↑ rotate · ↓ soft drop · Space hard drop',
  w: 520, h: 640,
  update(g, dt) {
    if (Input.pressed('ArrowLeft'))  g.move(-1);
    if (Input.pressed('ArrowRight')) g.move(1);
    if (Input.pressed('ArrowUp'))    g.rotate();
    if (Input.pressed(' '))          g.hardDrop();
    const rate = Input.held('ArrowDown') ? 0.05 : g.dropRate;
    g.drop += dt;
    if (g.drop >= rate) { g.drop = 0; g.step(); }
  },
  draw(g, ctx) {
    bg(ctx, g);
    const bw = g.cols*g.cell, bh = g.rows*g.cell;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(g.ox, g.oy, bw, bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let r=0;r<=g.rows;r++){ ctx.beginPath(); ctx.moveTo(g.ox,g.oy+r*g.cell); ctx.lineTo(g.ox+bw,g.oy+r*g.cell); ctx.stroke(); }
    for (let c=0;c<=g.cols;c++){ ctx.beginPath(); ctx.moveTo(g.ox+c*g.cell,g.oy); ctx.lineTo(g.ox+c*g.cell,g.oy+bh); ctx.stroke(); }

    const cellAt = (r,c,color) => {
      ctx.fillStyle = color;
      ctx.fillRect(g.ox+c*g.cell+1, g.oy+r*g.cell+1, g.cell-2, g.cell-2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(g.ox+c*g.cell+1, g.oy+r*g.cell+1, g.cell-2, 4);
    };
    g.grid.forEach((row,r)=>row.forEach((v,c)=>{ if(v) cellAt(r,c,v); }));
    if (g.piece) g.piece.s.forEach((row,r)=>row.forEach((v,c)=>{
      if (v) { const rr=g.piece.r+r, cc=g.piece.c+c; if (rr>=0) cellAt(rr,cc,g.piece.color); }
    }));

    const px = g.ox + bw + 26;
    text(ctx, 'NEXT', px, g.oy+18, 12, PALETTE.dim, 'left', 600);
    if (g.next) g.next.s.forEach((row,r)=>row.forEach((v,c)=>{
      if (v) {
        ctx.fillStyle = g.next.color;
        ctx.fillRect(px + c*22, g.oy+32 + r*22, 20, 20);
      }
    }));
    text(ctx, 'SCORE', px, g.oy+140, 12, PALETTE.dim, 'left', 600);
    text(ctx, String(g.score), px, g.oy+164, 22, PALETTE.ink, 'left', 700);
    text(ctx, 'LINES', px, g.oy+200, 12, PALETTE.dim, 'left', 600);
    text(ctx, String(g.lines), px, g.oy+224, 22, PALETTE.ink, 'left', 700);
    text(ctx, 'LEVEL', px, g.oy+260, 12, PALETTE.dim, 'left', 600);
    text(ctx, String(g.level), px, g.oy+284, 22, PALETTE.accent2, 'left', 700);
  }
};
// Tetris state + helper methods
GAME_TETRIS.init = function(g) {
  g.cols = 10; g.rows = 20; g.cell = 30;
  g.ox = 20; g.oy = 20;
  g.grid = Array.from({length:g.rows}, () => Array(g.cols).fill(null));
  g.bagList = [];
  g.drop = 0; g.dropRate = 0.7; g.lines = 0; g.level = 1;

  g.bag = function() {
    if (!g.bagList.length) {
      g.bagList = Object.keys(TETRO).sort(() => Math.random()-0.5);
    }
    const k = g.bagList.pop();
    return { s: TETRO[k].s.map(r=>r.slice()), color: TETRO[k].c, r: -1, c: 3 };
  };
  g.collides = function(p) {
    return p.s.some((row,r)=>row.some((v,c)=>{
      if (!v) return false;
      const rr = p.r + r, cc = p.c + c;
      return cc < 0 || cc >= g.cols || rr >= g.rows || (rr >= 0 && g.grid[rr][cc]);
    }));
  };
  g.spawn = function() {
    g.piece = g.next || g.bag();
    g.next = g.bag();
    if (g.collides(g.piece)) { Sound.bad(); g.gameOver(); }
  };
  g.move = function(d) {
    g.piece.c += d;
    if (g.collides(g.piece)) g.piece.c -= d; else Sound.blip();
  };
  g.rotate = function() {
    const old = g.piece.s;
    const rot = old[0].map((_,i)=>old.map(r=>r[i]).reverse());
    g.piece.s = rot;
    if (g.collides(g.piece)) g.piece.s = old; else Sound.pop();
  };
  g.lock = function() {
    g.piece.s.forEach((row,r)=>row.forEach((v,c)=>{
      if (v) { const rr=g.piece.r+r, cc=g.piece.c+c; if (rr>=0) g.grid[rr][cc]=g.piece.color; }
    }));
    let cleared = 0;
    for (let r = g.rows-1; r >= 0; r--) {
      if (g.grid[r].every(v=>v)) {
        g.grid.splice(r,1); g.grid.unshift(Array(g.cols).fill(null));
        cleared++; r++;
      }
    }
    if (cleared) {
      g.lines += cleared;
      g.score += [0,100,300,500,800][cleared] * g.level;
      g.level = Math.floor(g.lines/10) + 1;
      g.dropRate = Math.max(0.08, 0.7 - (g.level-1)*0.06);
      Sound.good();
    } else Sound.pop();
    g.spawn();
  };
  g.step = function() {
    g.piece.r++;
    if (g.collides(g.piece)) { g.piece.r--; g.lock(); }
  };
  g.hardDrop = function() {
    while (!g.collides(g.piece)) g.piece.r++;
    g.piece.r--; g.score += 2; g.lock();
  };

  g.piece = null; g.next = null;
  g.spawn();
};

/* ---------------- BREAKOUT ---------------- */
const GAME_BREAKOUT = {
  id: 'breakout', name: 'Breakout', emoji: '🧱',
  desc: 'Clear every brick. Angle matters.',
  controls: '← → or mouse',
  w: 640, h: 520,
  init(g) {
    g.paddle = { x: g.w/2-52, y: g.h-34, w: 104, h: 12, speed: 460 };
    g.ball = { x: g.w/2, y: g.h-60, r: 7, vx: 190, vy: -280, stuck: true };
    g.lives = 3;
    g.bricks = [];
    const cols = 10, rows = 6, bw = 56, bh = 22, pad = 6;
    const offx = (g.w - (cols*(bw+pad) - pad)) / 2;
    const colors = ['#f43f5e','#fb923c','#fbbf24','#4ade80','#22d3ee','#a855f7'];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        g.bricks.push({ x: offx + c*(bw+pad), y: 70 + r*(bh+pad), w: bw, h: bh, color: colors[r], alive: true, pts: (rows-r)*10 });
  },
  update(g, dt) {
    const p = g.paddle;
    if (Input.anyHeld('ArrowLeft','a'))  p.x -= p.speed*dt;
    if (Input.anyHeld('ArrowRight','d')) p.x += p.speed*dt;
    if (Input.pointer.x) p.x = Input.pointer.x - p.w/2;
    p.x = clamp(p.x, 0, g.w - p.w);

    const b = g.ball;
    if (b.stuck) {
      b.x = p.x + p.w/2; b.y = p.y - b.r - 2;
      if (Input.held(' ') || Input.pointer.down) { b.stuck = false; Sound.pop(); }
      return;
    }
    b.x += b.vx*dt; b.y += b.vy*dt;
    if (b.x < b.r) { b.x = b.r; b.vx *= -1; Sound.blip(); }
    if (b.x > g.w-b.r) { b.x = g.w-b.r; b.vx *= -1; Sound.blip(); }
    if (b.y < b.r) { b.y = b.r; b.vy *= -1; Sound.blip(); }

    if (b.y + b.r >= p.y && b.y - b.r <= p.y + p.h && b.x >= p.x && b.x <= p.x + p.w && b.vy > 0) {
      const hit = (b.x - (p.x + p.w/2)) / (p.w/2);
      const ang = hit * 1.05;
      const sp = Math.min(520, Math.hypot(b.vx,b.vy) * 1.03);
      b.vx = Math.sin(ang)*sp; b.vy = -Math.abs(Math.cos(ang)*sp);
      Sound.pop();
      FX.spark(b.x, p.y, '#c4b5fd', -Math.PI/2, 10);
      FX.kick(4, 0.12);
    }

    for (const br of g.bricks) {
      if (!br.alive) continue;
      if (b.x + b.r > br.x && b.x - b.r < br.x+br.w && b.y + b.r > br.y && b.y - b.r < br.y+br.h) {
        br.alive = false; g.score += br.pts; Sound.good();
        FX.burst(br.x+br.w/2, br.y+br.h/2, br.color, 16, {speed:200, grav:180});
        FX.kick(6, 0.15);
        const ox = Math.min(b.x+b.r-br.x, br.x+br.w-(b.x-b.r));
        const oy = Math.min(b.y+b.r-br.y, br.y+br.h-(b.y-b.r));
        if (ox < oy) b.vx *= -1; else b.vy *= -1;
        break;
      }
    }

    if (g.bricks.every(br => !br.alive)) { Sound.good(); FX.blink('#4ade80',0.5); return g.gameOver(true); }

    if (b.y - b.r > g.h) {
      g.lives--; Sound.bad();
      FX.kick(16, 0.35); FX.blink('#f43f5e', 0.45);
      if (g.lives <= 0) return g.gameOver();
      b.stuck = true; b.vx = 190; b.vy = -280;
    }
  },
  draw(g, ctx) {
    FX.sky(ctx, g.w, g.h, '#1a1433', '#0a0814');
    g.bricks.forEach(br => {
      if (!br.alive) return;
      FX.glowRoundRect(ctx, br.x, br.y, br.w, br.h, 4, br.color, 10);
      const gr = ctx.createLinearGradient(br.x, br.y, br.x, br.y+br.h);
      gr.addColorStop(0, 'rgba(255,255,255,0.4)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      gr.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = gr;
      FX.roundRect(ctx, br.x, br.y, br.w, br.h, 4); ctx.fill();
    });
    FX.glowRoundRect(ctx, g.paddle.x, g.paddle.y, g.paddle.w, g.paddle.h, 6, '#c4b5fd', 16);
    if (!g.ball.stuck) FX.trail(g.ball.x, g.ball.y, '#a855f7', {life:0.3, size:5});
    FX.glowCircle(ctx, g.ball.x, g.ball.y, g.ball.r, '#ffffff', 20);
    text(ctx, 'SCORE ' + g.score, 14, 28, 14, PALETTE.dim);
    text(ctx, '♥ '.repeat(g.lives), g.w-14, 28, 14, PALETTE.bad, 'right');
    if (g.ball.stuck) text(ctx, 'Space / tap to launch', g.w/2, g.h/2, 14, PALETTE.dim, 'center');
    FX.vignette(ctx, g.w, g.h, 0.5);
  }
};

/* ---------------- PONG ---------------- */
const GAME_PONG = {
  id: 'pong', name: 'Pong', emoji: '🏓',
  desc: 'First to 7. The AI gets meaner each point.',
  controls: '↑ ↓ or mouse',
  w: 640, h: 440,
  update(g, dt) {
    if (Input.anyHeld('ArrowUp','w'))   g.you.y -= 430*dt;
    if (Input.anyHeld('ArrowDown','s')) g.you.y += 430*dt;
    if (Input.pointer.y) g.you.y = Input.pointer.y - g.ph/2;
    g.you.y = clamp(g.you.y, 0, g.h - g.ph);

    const target = g.ball.y - g.ph/2;
    const d = target - g.cpu.y;
    g.cpu.y += clamp(d, -1, 1) * 400 * g.cpu.skill * dt;
    g.cpu.y = clamp(g.cpu.y, 0, g.h - g.ph);

    const b = g.ball;
    b.x += b.vx*dt; b.y += b.vy*dt;
    if (b.y < b.r || b.y > g.h-b.r) { b.vy *= -1; Sound.blip(); }

    const hitPaddle = (px, py) =>
      b.x - b.r < px + g.pw && b.x + b.r > px && b.y > py && b.y < py + g.ph;

    if (b.vx < 0 && hitPaddle(20, g.you.y)) {
      const hit = (b.y - (g.you.y + g.ph/2)) / (g.ph/2);
      const sp = Math.min(560, Math.hypot(b.vx,b.vy)*1.06);
      b.vx = Math.abs(Math.cos(hit*0.9)*sp); b.vy = Math.sin(hit*0.9)*sp;
      b.x = 20 + g.pw + b.r; Sound.pop();
    }
    if (b.vx > 0 && hitPaddle(g.w-20-g.pw, g.cpu.y)) {
      const hit = (b.y - (g.cpu.y + g.ph/2)) / (g.ph/2);
      const sp = Math.min(560, Math.hypot(b.vx,b.vy)*1.06);
      b.vx = -Math.abs(Math.cos(hit*0.9)*sp); b.vy = Math.sin(hit*0.9)*sp;
      b.x = g.w-20-g.pw - b.r; Sound.pop();
    }

    if (b.x < -20) { g.cpu.score++; Sound.bad(); g.cpu.skill = Math.min(0.97, g.cpu.skill+0.03); g.reset(1); }
    if (b.x > g.w+20) { g.you.score++; g.score += 100; Sound.good(); g.reset(-1); }

    if (g.you.score >= 7) g.gameOver(true);
    if (g.cpu.score >= 7) g.gameOver(false);
  },
  draw(g, ctx) {
    bg(ctx, g);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.setLineDash([8,10]);
    ctx.beginPath(); ctx.moveTo(g.w/2,0); ctx.lineTo(g.w/2,g.h); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = PALETTE.accent2; ctx.fillRect(20, g.you.y, g.pw, g.ph);
    ctx.fillStyle = PALETTE.bad;     ctx.fillRect(g.w-20-g.pw, g.cpu.y, g.pw, g.ph);
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath(); ctx.arc(g.ball.x, g.ball.y, g.ball.r, 0, 7); ctx.fill();
    text(ctx, String(g.you.score), g.w/2-40, 46, 30, PALETTE.accent2, 'center', 700);
    text(ctx, String(g.cpu.score), g.w/2+40, 46, 30, PALETTE.bad, 'center', 700);
  }
};
GAME_PONG.init = function(g) {
  g.pw = 12; g.ph = 78;
  g.you = { y: g.h/2 - 39, score: 0 };
  g.cpu = { y: g.h/2 - 39, score: 0, skill: 0.72 };
  g.reset = function(dir) {
    g.ball = { x: g.w/2, y: g.h/2, r: 8, vx: 300*dir, vy: rand(-160,160) };
  };
  g.reset(1);
};

/* ---------------- 2048 ---------------- */
const GAME_2048 = {
  id: '2048', name: '2048', emoji: '🔢',
  desc: 'Merge tiles. Reach 2048 (or keep going).',
  controls: 'Arrow keys / WASD',
  w: 520, h: 560,
  update(g) {
    let dir = null;
    if (Input.pressed('ArrowLeft')  || Input.pressed('a')) dir = 'L';
    if (Input.pressed('ArrowRight') || Input.pressed('d')) dir = 'R';
    if (Input.pressed('ArrowUp')    || Input.pressed('w')) dir = 'U';
    if (Input.pressed('ArrowDown')  || Input.pressed('s')) dir = 'D';
    if (!dir) return;
    if (g.slide(dir)) { g.addTile(); Sound.pop(); }
    if (!g.canMove()) { Sound.bad(); g.gameOver(); }
  },
  draw(g, ctx) {
    bg(ctx, g);
    const COLORS = {
      2:'#3b3550',4:'#4a4266',8:'#7C3AED',16:'#8b5cf6',32:'#a855f7',64:'#c026d3',
      128:'#f43f5e',256:'#fb923c',512:'#fbbf24',1024:'#4ade80',2048:'#22d3ee'
    };
    text(ctx, '2048', 24, 46, 30, PALETTE.ink, 'left', 700);
    text(ctx, 'SCORE ' + g.score, g.w-24, 44, 15, PALETTE.dim, 'right');
    ctx.fillStyle = PALETTE.panel;
    const bs = g.n*g.cell + (g.n+1)*g.pad;
    ctx.fillRect(g.ox, g.oy, bs, bs);
    for (let r=0;r<g.n;r++) for (let c=0;c<g.n;c++) {
      const x = g.ox + g.pad + c*(g.cell+g.pad);
      const y = g.oy + g.pad + r*(g.cell+g.pad);
      const v = g.board[r][c];
      ctx.fillStyle = v ? (COLORS[v]||'#22d3ee') : 'rgba(255,255,255,0.04)';
      ctx.fillRect(x, y, g.cell, g.cell);
      if (v) {
        const size = v > 999 ? 28 : v > 99 ? 34 : 40;
        text(ctx, String(v), x+g.cell/2, y+g.cell/2+size/3, size, '#fff', 'center', 700);
      }
    }
  }
};
GAME_2048.init = function(g) {
  g.n = 4; g.cell = 110; g.pad = 12;
  g.ox = (g.w - (g.n*g.cell + (g.n+1)*g.pad)) / 2;
  g.oy = 80;
  g.board = Array.from({length:g.n}, ()=>Array(g.n).fill(0));

  g.addTile = function() {
    const empty = [];
    for (let r=0;r<g.n;r++) for (let c=0;c<g.n;c++) if (!g.board[r][c]) empty.push([r,c]);
    if (!empty.length) return;
    const [r,c] = choice(empty);
    g.board[r][c] = Math.random() < 0.9 ? 2 : 4;
  };
  g.slide = function(dir) {
    const before = JSON.stringify(g.board);
    const line = arr => {
      let a = arr.filter(v=>v);
      for (let i=0;i<a.length-1;i++) {
        if (a[i] === a[i+1]) { a[i]*=2; g.score += a[i]; a.splice(i+1,1); }
      }
      while (a.length < g.n) a.push(0);
      return a;
    };
    if (dir==='L') g.board = g.board.map(row=>line(row));
    if (dir==='R') g.board = g.board.map(row=>line(row.slice().reverse()).reverse());
    if (dir==='U'||dir==='D') {
      for (let c=0;c<g.n;c++) {
        let col = g.board.map(r=>r[c]);
        if (dir==='D') col.reverse();
        col = line(col);
        if (dir==='D') col.reverse();
        for (let r=0;r<g.n;r++) g.board[r][c] = col[r];
      }
    }
    return JSON.stringify(g.board) !== before;
  };
  g.canMove = function() {
    for (let r=0;r<g.n;r++) for (let c=0;c<g.n;c++) {
      if (!g.board[r][c]) return true;
      if (c<g.n-1 && g.board[r][c]===g.board[r][c+1]) return true;
      if (r<g.n-1 && g.board[r][c]===g.board[r+1][c]) return true;
    }
    return false;
  };
  g.addTile(); g.addTile();
};

window.GAME_PACK_1 = [GAME_SNAKE, GAME_TETRIS, GAME_BREAKOUT, GAME_PONG, GAME_2048];
