/* ============================================================
   Sreon Arcade — game pack 4 (FX-heavy)
   ============================================================ */

/* ---------------- NEON TUNNEL ---------------- */
const GAME_TUNNEL = {
  id: 'tunnel', name: 'Neon Tunnel', emoji: '🌀',
  desc: 'Fly the shrinking corridor. Pure speed.',
  controls: '↑ ↓ or mouse',
  w: 700, h: 460,
  init(g) {
    g.y = g.h/2; g.vy = 0;
    g.segs = [];
    g.gap = 230; g.speed = 260; g.scroll = 0;
    for (let i=0;i<40;i++) g.segs.push({ x: i*24, cy: g.h/2, gap: g.gap });
    g.phase = 0;
  },
  update(g, dt) {
    g.speed += 12*dt;
    g.score += g.speed*dt*0.08;
    g.gap = Math.max(96, 230 - g.time*7);

    if (Input.anyHeld('ArrowUp','w')) g.vy -= 980*dt;
    if (Input.anyHeld('ArrowDown','s')) g.vy += 980*dt;
    if (Input.pointer.y) g.vy += (Input.pointer.y - g.y) * 7 * dt;
    g.vy *= 0.92;
    g.y = clamp(g.y + g.vy*dt, 0, g.h);

    g.scroll += g.speed*dt;
    while (g.scroll > 24) {
      g.scroll -= 24;
      g.segs.shift();
      const last = g.segs[g.segs.length-1];
      g.phase += 0.09;
      const cy = clamp(
        last.cy + Math.sin(g.phase)*26 + rand(-14,14),
        g.gap/2 + 20, g.h - g.gap/2 - 20
      );
      g.segs.push({ x: last.x + 24, cy, gap: g.gap });
    }

    FX.trail(110, g.y, '#22d3ee', {life:0.35, size:5});

    const at = g.segs[4];
    if (at) {
      const top = at.cy - at.gap/2, bot = at.cy + at.gap/2;
      if (g.y < top || g.y > bot) {
        Sound.bad();
        FX.burst(110, g.y, '#f43f5e', 40, {speed:320, grav:0});
        FX.kick(22, 0.45); FX.blink('#f43f5e', 0.6);
        g.gameOver();
      }
    }
  },
  draw(g, ctx) {
    FX.sky(ctx, g.w, g.h, '#120a2a', '#04030d');
    const off = -g.scroll;
    ctx.save();
    ctx.shadowColor = '#7C3AED'; ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(124,58,237,0.75)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    g.segs.forEach((s,i) => ctx.lineTo(s.x + off, s.cy - s.gap/2));
    ctx.lineTo(g.w, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, g.h);
    g.segs.forEach((s,i) => ctx.lineTo(s.x + off, s.cy + s.gap/2));
    ctx.lineTo(g.w, g.h); ctx.closePath(); ctx.fill();
    ctx.restore();

    // neon edge lines
    ctx.save();
    ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 14;
    ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    g.segs.forEach((s,i)=> i? ctx.lineTo(s.x+off, s.cy-s.gap/2) : ctx.moveTo(s.x+off, s.cy-s.gap/2));
    ctx.stroke();
    ctx.beginPath();
    g.segs.forEach((s,i)=> i? ctx.lineTo(s.x+off, s.cy+s.gap/2) : ctx.moveTo(s.x+off, s.cy+s.gap/2));
    ctx.stroke();
    ctx.restore();

    FX.glowCircle(ctx, 110, g.y, 8, '#ffffff', 24);
    text(ctx, String(Math.floor(g.score)), g.w-20, 40, 26, '#e0f2fe', 'right', 700);
    FX.vignette(ctx, g.w, g.h, 0.55);
  }
};

/* ---------------- ORBIT DODGE ---------------- */
const GAME_ORBIT = {
  id: 'orbit', name: 'Orbit', emoji: '🪐',
  desc: 'Swap orbits to dodge incoming debris.',
  controls: 'Space / click to switch orbit',
  w: 560, h: 560,
  init(g) {
    g.cx = g.w/2; g.cy = g.h/2;
    g.radii = [90, 150, 210];
    g.ring = 1; g.ang = 0; g.spin = 1.9;
    g.rocks = []; g.spawnT = 0.8;
  },
  update(g, dt) {
    g.ang += g.spin*dt;
    g.spin = Math.min(3.4, g.spin + dt*0.05);
    g.score += dt*12;

    if (Input.pressed(' ') || Input.pointer.justDown) {
      g.ring = (g.ring + 1) % g.radii.length;
      Sound.blip();
      FX.kick(4, 0.12);
    }

    g.spawnT -= dt;
    if (g.spawnT <= 0) {
      g.spawnT = rand(0.45, 0.95);
      const a = rand(0, Math.PI*2);
      const ringIdx = randi(0, g.radii.length);
      g.rocks.push({ a, r: 330, ring: ringIdx, speed: rand(80,140) });
    }
    for (let i=g.rocks.length-1;i>=0;i--) {
      const r = g.rocks[i];
      r.r -= r.speed*dt;
      if (r.r < 30) { g.rocks.splice(i,1); continue; }
      if (Math.abs(r.r - g.radii[g.ring]) < 12 && r.ring === g.ring) {
        const px = g.cx + Math.cos(g.ang)*g.radii[g.ring];
        const py = g.cy + Math.sin(g.ang)*g.radii[g.ring];
        const rx = g.cx + Math.cos(r.a)*r.r;
        const ry = g.cy + Math.sin(r.a)*r.r;
        if (dist(px,py,rx,ry) < 22) {
          Sound.bad();
          FX.burst(px, py, '#f43f5e', 36, {speed:300, grav:0});
          FX.kick(20, 0.4); FX.blink('#f43f5e', 0.55);
          return g.gameOver();
        }
      }
    }
    const px = g.cx + Math.cos(g.ang)*g.radii[g.ring];
    const py = g.cy + Math.sin(g.ang)*g.radii[g.ring];
    FX.trail(px, py, '#a855f7', {life:0.4, size:4});
  },
  draw(g, ctx) {
    FX.sky(ctx, g.w, g.h, '#140d2e', '#05040e');
    FX.stars(ctx, g.w, g.h, 0, 70, 'orb');

    g.radii.forEach((r,i) => {
      ctx.save();
      ctx.strokeStyle = i === g.ring ? 'rgba(168,85,247,0.85)' : 'rgba(148,120,220,0.18)';
      ctx.lineWidth = i === g.ring ? 2.5 : 1.5;
      if (i === g.ring) { ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 14; }
      ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, 7); ctx.stroke();
      ctx.restore();
    });

    FX.glowCircle(ctx, g.cx, g.cy, 22, '#fbbf24', 30);

    g.rocks.forEach(r => {
      const x = g.cx + Math.cos(r.a)*r.r, y = g.cy + Math.sin(r.a)*r.r;
      FX.glowCircle(ctx, x, y, 9, '#f43f5e', 14);
    });

    const px = g.cx + Math.cos(g.ang)*g.radii[g.ring];
    const py = g.cy + Math.sin(g.ang)*g.radii[g.ring];
    FX.glowCircle(ctx, px, py, 11, '#ffffff', 22);

    text(ctx, String(Math.floor(g.score)), g.w/2, 44, 26, '#e9d5ff', 'center', 700);
    FX.vignette(ctx, g.w, g.h, 0.5);
  }
};

/* ---------------- LASER DEFENSE ---------------- */
const GAME_DEFENSE = {
  id: 'defense', name: 'Laser Defense', emoji: '🛡',
  desc: 'Aim, fire, hold the core. Waves escalate.',
  controls: 'Mouse aim · click to fire',
  w: 660, h: 560,
  init(g) {
    g.cx = g.w/2; g.cy = g.h - 60;
    g.hp = 100; g.wave = 1; g.waveT = 0;
    g.enemies = []; g.shots = []; g.cool = 0;
    g.spawnT = 0;
  },
  update(g, dt) {
    g.cool -= dt;
    g.waveT += dt;
    if (g.waveT > 22) { g.waveT = 0; g.wave++; g.score += 200; Sound.good(); FX.blink('#4ade80',0.3); }

    const p = Input.pointer;
    g.aim = Math.atan2(p.y - g.cy, p.x - g.cx);

    if (p.down && g.cool <= 0) {
      g.cool = 0.16;
      g.shots.push({ x: g.cx, y: g.cy, vx: Math.cos(g.aim)*620, vy: Math.sin(g.aim)*620, life: 1.4 });
      Sound.blip();
      FX.spark(g.cx + Math.cos(g.aim)*26, g.cy + Math.sin(g.aim)*26, '#22d3ee', g.aim, 6);
      FX.kick(2, 0.08);
    }

    g.spawnT -= dt;
    if (g.spawnT <= 0) {
      g.spawnT = Math.max(0.35, 1.4 - g.wave*0.1);
      const a = rand(Math.PI*1.05, Math.PI*1.95);
      const d = 420;
      g.enemies.push({
        x: g.cx + Math.cos(a)*d, y: g.cy + Math.sin(a)*d,
        r: rand(13,20), hp: 1 + Math.floor(g.wave/3),
        speed: rand(40,70) + g.wave*4
      });
    }

    for (let i=g.enemies.length-1;i>=0;i--) {
      const e = g.enemies[i];
      const a = Math.atan2(g.cy - e.y, g.cx - e.x);
      e.x += Math.cos(a)*e.speed*dt;
      e.y += Math.sin(a)*e.speed*dt;
      if (dist(e.x,e.y,g.cx,g.cy) < 34) {
        g.enemies.splice(i,1); g.hp -= 12; Sound.bad();
        FX.burst(e.x, e.y, '#f43f5e', 22, {speed:220, grav:0});
        FX.kick(14, 0.3); FX.blink('#f43f5e', 0.35);
        if (g.hp <= 0) return g.gameOver();
        continue;
      }
      for (let j=g.shots.length-1;j>=0;j--) {
        const s = g.shots[j];
        if (dist(s.x,s.y,e.x,e.y) < e.r+4) {
          g.shots.splice(j,1); e.hp--;
          FX.burst(s.x, s.y, '#67e8f9', 8, {speed:140, grav:0, life:0.35});
          if (e.hp <= 0) {
            g.enemies.splice(i,1);
            g.score += 40; Sound.pop();
            FX.burst(e.x, e.y, '#a855f7', 20, {speed:240, grav:0});
            FX.kick(5, 0.14);
          }
          break;
        }
      }
    }

    g.shots.forEach(s => { s.x += s.vx*dt; s.y += s.vy*dt; s.life -= dt; });
    g.shots = g.shots.filter(s => s.life>0 && s.x>-40 && s.x<g.w+40 && s.y>-40 && s.y<g.h+40);
  },
  draw(g, ctx) {
    FX.sky(ctx, g.w, g.h, '#0d1128', '#04050e');
    FX.stars(ctx, g.w, g.h, 0, 60, 'def');

    // core + shield ring
    const pulse = 1 + Math.sin(g.time*4)*0.06;
    ctx.save();
    ctx.strokeStyle = 'rgba(34,211,238,0.35)'; ctx.lineWidth = 2;
    ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(g.cx, g.cy, 34*pulse, 0, 7); ctx.stroke();
    ctx.restore();
    FX.glowCircle(ctx, g.cx, g.cy, 20, '#22d3ee', 26);

    // turret barrel
    if (g.aim !== undefined) {
      ctx.save();
      ctx.translate(g.cx, g.cy); ctx.rotate(g.aim);
      ctx.shadowColor='#c4b5fd'; ctx.shadowBlur=12;
      ctx.fillStyle = '#c4b5fd';
      FX.roundRect(ctx, 14, -5, 26, 10, 3); ctx.fill();
      ctx.restore();
    }

    g.enemies.forEach(e => {
      FX.glowCircle(ctx, e.x, e.y, e.r, e.hp>1 ? '#fb923c' : '#f43f5e', 14);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r*0.45, 0, 7); ctx.fill();
    });
    g.shots.forEach(s => FX.glowCircle(ctx, s.x, s.y, 3.5, '#67e8f9', 14));

    // HP bar
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    FX.roundRect(ctx, 18, 18, 200, 12, 6); ctx.fill();
    const hpCol = g.hp>50 ? '#4ade80' : g.hp>25 ? '#fbbf24' : '#f43f5e';
    ctx.save(); ctx.shadowColor = hpCol; ctx.shadowBlur = 12;
    ctx.fillStyle = hpCol;
    FX.roundRect(ctx, 18, 18, Math.max(0, 200*g.hp/100), 12, 6); ctx.fill();
    ctx.restore();

    text(ctx, 'WAVE ' + g.wave, g.w/2, 32, 15, '#c4b5fd', 'center', 700);
    text(ctx, 'SCORE ' + g.score, g.w-18, 32, 14, PALETTE.dim, 'right');
    FX.vignette(ctx, g.w, g.h, 0.5);
  }
};

/* ---------------- GEM CASCADE (match-3) ---------------- */
const GAME_GEMS = {
  id: 'gems', name: 'Gem Cascade', emoji: '💎',
  desc: 'Swap adjacent gems, match 3+, chain combos.',
  controls: 'Click two adjacent gems',
  w: 560, h: 620,
  init(g) {
    g.n = 8; g.cell = 62; g.pad = 4;
    g.ox = (g.w - g.n*g.cell)/2; g.oy = 90;
    g.cols = ['#f43f5e','#fb923c','#fbbf24','#4ade80','#22d3ee','#a855f7'];
    g.grid = [];
    g.sel = null; g.settleT = 0; g.combo = 0;
    g.moves = 30;

    g.fill = function() {
      for (let r=0;r<g.n;r++) { g.grid[r] = g.grid[r]||[];
        for (let c=0;c<g.n;c++) if (g.grid[r][c]==null) g.grid[r][c] = randi(0,6); }
    };
    g.findMatches = function() {
      const hits = new Set();
      for (let r=0;r<g.n;r++) for (let c=0;c<g.n-2;c++) {
        const v = g.grid[r][c];
        if (v!=null && v===g.grid[r][c+1] && v===g.grid[r][c+2]) {
          let k=c; while(k<g.n && g.grid[r][k]===v){ hits.add(r+','+k); k++; }
        }
      }
      for (let c=0;c<g.n;c++) for (let r=0;r<g.n-2;r++) {
        const v = g.grid[r][c];
        if (v!=null && v===g.grid[r+1][c] && v===g.grid[r+2][c]) {
          let k=r; while(k<g.n && g.grid[k][c]===v){ hits.add(k+','+c); k++; }
        }
      }
      return hits;
    };
    g.clearMatches = function() {
      const hits = g.findMatches();
      if (!hits.size) { g.combo = 0; return false; }
      g.combo++;
      hits.forEach(k => {
        const [r,c] = k.split(',').map(Number);
        const x = g.ox + c*g.cell + g.cell/2, y = g.oy + r*g.cell + g.cell/2;
        FX.burst(x, y, g.cols[g.grid[r][c]], 12, {speed:180});
        g.grid[r][c] = null;
      });
      g.score += hits.size * 20 * g.combo;
      Sound.good();
      FX.kick(Math.min(12, 3+g.combo*2), 0.18);
      return true;
    };
    g.collapse = function() {
      for (let c=0;c<g.n;c++) {
        let write = g.n-1;
        for (let r=g.n-1;r>=0;r--) if (g.grid[r][c]!=null) { g.grid[write][c]=g.grid[r][c]; if(write!==r) g.grid[r][c]=null; write--; }
        for (let r=write;r>=0;r--) g.grid[r][c]=randi(0,6);
      }
    };

    g.fill();
    // clear any starting matches silently
    for (let i=0;i<12;i++) { const h=g.findMatches(); if(!h.size) break;
      h.forEach(k=>{const[r,c]=k.split(',').map(Number); g.grid[r][c]=null;}); g.collapse(); }
    g.combo = 0;
  },
  update(g, dt) {
    if (g.settleT > 0) {
      g.settleT -= dt;
      if (g.settleT <= 0) {
        g.collapse();
        if (g.clearMatches()) g.settleT = 0.22;
      }
      return;
    }
    if (g.moves <= 0) { Sound.good(); return g.gameOver(true); }

    const p = Input.pointer;
    if (!p.justDown) return;
    const c = Math.floor((p.x-g.ox)/g.cell), r = Math.floor((p.y-g.oy)/g.cell);
    if (r<0||c<0||r>=g.n||c>=g.n) return;

    if (!g.sel) { g.sel = {r,c}; Sound.blip(); return; }
    const d = Math.abs(g.sel.r-r) + Math.abs(g.sel.c-c);
    if (d !== 1) { g.sel = {r,c}; Sound.blip(); return; }

    const a = g.grid[g.sel.r][g.sel.c];
    g.grid[g.sel.r][g.sel.c] = g.grid[r][c];
    g.grid[r][c] = a;

    if (g.findMatches().size) {
      g.moves--;
      g.combo = 0;
      g.clearMatches();
      g.settleT = 0.22;
    } else {
      // swap back
      const b = g.grid[g.sel.r][g.sel.c];
      g.grid[g.sel.r][g.sel.c] = g.grid[r][c];
      g.grid[r][c] = b;
      Sound.bad();
    }
    g.sel = null;
  },
  draw(g, ctx) {
    FX.sky(ctx, g.w, g.h, '#161030', '#08060f');
    text(ctx, 'Gem Cascade', 22, 44, 22, '#e9d5ff', 'left', 700);
    text(ctx, 'MOVES ' + g.moves, g.w-22, 44, 14, g.moves<6?'#f43f5e':PALETTE.dim, 'right', 700);
    if (g.combo > 1) text(ctx, 'COMBO x'+g.combo, g.w/2, 44, 16, '#fbbf24', 'center', 700);

    for (let r=0;r<g.n;r++) for (let c=0;c<g.n;c++) {
      const v = g.grid[r][c];
      if (v==null) continue;
      const x = g.ox + c*g.cell, y = g.oy + r*g.cell;
      const isSel = g.sel && g.sel.r===r && g.sel.c===c;
      const s = isSel ? 4 : 6;
      if (isSel) {
        FX.glowRoundRect(ctx, x+2, y+2, g.cell-4, g.cell-4, 10, '#ffffff', 18);
      }
      FX.glowRoundRect(ctx, x+s, y+s, g.cell-s*2, g.cell-s*2, 9, g.cols[v], isSel?18:8);
      const gr = ctx.createLinearGradient(x, y, x, y+g.cell);
      gr.addColorStop(0,'rgba(255,255,255,0.45)');
      gr.addColorStop(0.55,'rgba(255,255,255,0.04)');
      gr.addColorStop(1,'rgba(0,0,0,0.3)');
      ctx.fillStyle = gr;
      FX.roundRect(ctx, x+s, y+s, g.cell-s*2, g.cell-s*2, 9); ctx.fill();
    }
    FX.vignette(ctx, g.w, g.h, 0.45);
  }
};

/* ---------------- LIGHT CYCLES ---------------- */
const GAME_CYCLES = {
  id: 'cycles', name: 'Light Cycles', emoji: '🏍',
  desc: 'Trap the AI in its own trail. Tron-style.',
  controls: 'Arrow keys',
  w: 600, h: 600,
  init(g) {
    g.cell = 12; g.cols = g.w/g.cell; g.rows = g.h/g.cell;
    g.grid = Array.from({length:g.rows}, ()=>Array(g.cols).fill(0));
    g.me  = { x: 8, y: g.rows>>1, dx: 1, dy: 0, alive: true };
    g.ai  = { x: g.cols-9, y: g.rows>>1, dx: -1, dy: 0, alive: true };
    g.grid[g.me.y][g.me.x] = 1;
    g.grid[g.ai.y][g.ai.x] = 2;
    g.tick = 0; g.rate = 0.055;

    g.free = function(x,y) {
      return x>=0 && y>=0 && x<g.cols && y<g.rows && !g.grid[y][x];
    };
    g.aiThink = function() {
      const a = g.ai;
      const opts = [[a.dx,a.dy],[-a.dy,a.dx],[a.dy,-a.dx]];
      // score each option by how much open space it leads to (flood-ish lookahead)
      let best = null, bestScore = -1;
      for (const [dx,dy] of opts) {
        if (!g.free(a.x+dx, a.y+dy)) continue;
        let depth = 0, cx = a.x+dx, cy = a.y+dy;
        while (depth < 14 && g.free(cx,cy)) { cx+=dx; cy+=dy; depth++; }
        const jitter = Math.random()*2;
        if (depth + jitter > bestScore) { bestScore = depth + jitter; best = [dx,dy]; }
      }
      if (best) { a.dx = best[0]; a.dy = best[1]; }
    };
  },
  update(g, dt) {
    const m = g.me;
    if (Input.anyHeld('ArrowUp','w')    && m.dy === 0) { m.dx=0; m.dy=-1; }
    if (Input.anyHeld('ArrowDown','s')  && m.dy === 0) { m.dx=0; m.dy=1; }
    if (Input.anyHeld('ArrowLeft','a')  && m.dx === 0) { m.dx=-1; m.dy=0; }
    if (Input.anyHeld('ArrowRight','d') && m.dx === 0) { m.dx=1; m.dy=0; }

    g.tick += dt;
    if (g.tick < g.rate) return;
    g.tick = 0;
    g.score += 2;

    g.aiThink();
    const nm = { x: m.x+m.dx, y: m.y+m.dy };
    const na = { x: g.ai.x+g.ai.dx, y: g.ai.y+g.ai.dy };
    const meDead = !g.free(nm.x, nm.y);
    const aiDead = !g.free(na.x, na.y);

    if (meDead || aiDead) {
      const px = (meDead?nm.x:na.x)*g.cell, py = (meDead?nm.y:na.y)*g.cell;
      FX.burst(px, py, meDead?'#f43f5e':'#22d3ee', 40, {speed:300, grav:0});
      FX.kick(20, 0.4); FX.blink(meDead?'#f43f5e':'#22d3ee', 0.5);
      Sound.bad();
      if (!meDead && aiDead) g.score += 1500;
      return g.gameOver(!meDead && aiDead);
    }

    m.x = nm.x; m.y = nm.y; g.grid[m.y][m.x] = 1;
    g.ai.x = na.x; g.ai.y = na.y; g.grid[g.ai.y][g.ai.x] = 2;
    FX.trail(m.x*g.cell+6, m.y*g.cell+6, '#22d3ee', {life:0.3, size:3});
  },
  draw(g, ctx) {
    FX.sky(ctx, g.w, g.h, '#061018', '#02060a');
    ctx.strokeStyle = 'rgba(34,211,238,0.05)';
    for (let i=0;i<=g.cols;i+=4) {
      ctx.beginPath(); ctx.moveTo(i*g.cell,0); ctx.lineTo(i*g.cell,g.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,i*g.cell); ctx.lineTo(g.w,i*g.cell); ctx.stroke();
    }
    for (let r=0;r<g.rows;r++) for (let c=0;c<g.cols;c++) {
      const v = g.grid[r][c];
      if (!v) continue;
      ctx.fillStyle = v===1 ? 'rgba(34,211,238,0.75)' : 'rgba(244,63,94,0.75)';
      ctx.fillRect(c*g.cell, r*g.cell, g.cell-1, g.cell-1);
    }
    FX.glowRect(ctx, g.me.x*g.cell, g.me.y*g.cell, g.cell, g.cell, '#67e8f9', 18);
    FX.glowRect(ctx, g.ai.x*g.cell, g.ai.y*g.cell, g.cell, g.cell, '#fb7185', 18);
    text(ctx, String(g.score), 16, 34, 22, '#67e8f9', 'left', 700);
    FX.vignette(ctx, g.w, g.h, 0.5);
  }
};

/* ---------------- REACTION GRID ---------------- */
const GAME_REACT = {
  id: 'react', name: 'Reaction', emoji: '⚡',
  desc: 'Hit the lit tiles before they expire. Gets brutal.',
  controls: 'Click lit tiles',
  w: 520, h: 560,
  init(g) {
    g.n = 4; g.cell = 110; g.pad = 10;
    g.ox = (g.w - (g.n*g.cell + (g.n-1)*g.pad))/2; g.oy = 110;
    g.tiles = Array.from({length:16}, ()=>({ lit:0, max:1 }));
    g.spawnT = 0.5; g.lives = 3; g.interval = 1.1; g.hold = 1.5;
  },
  update(g, dt) {
    g.interval = Math.max(0.28, 1.1 - g.time*0.02);
    g.hold     = Math.max(0.55, 1.5 - g.time*0.02);

    g.tiles.forEach((t,i) => {
      if (t.lit > 0) {
        t.lit -= dt;
        if (t.lit <= 0) {
          g.lives--; Sound.bad();
          FX.kick(12, 0.28); FX.blink('#f43f5e', 0.3);
          if (g.lives <= 0) g.gameOver();
        }
      }
    });
    if (g.over) return;

    g.spawnT -= dt;
    if (g.spawnT <= 0) {
      g.spawnT = g.interval;
      const dark = g.tiles.map((t,i)=>({t,i})).filter(x=>x.t.lit<=0);
      if (dark.length) { const p = choice(dark); p.t.lit = g.hold; p.t.max = g.hold; }
    }

    const p = Input.pointer;
    if (!p.justDown) return;
    const c = Math.floor((p.x-g.ox)/(g.cell+g.pad)), r = Math.floor((p.y-g.oy)/(g.cell+g.pad));
    if (c<0||r<0||c>=g.n||r>=g.n) return;
    const t = g.tiles[r*g.n+c];
    const x = g.ox + c*(g.cell+g.pad) + g.cell/2, y = g.oy + r*(g.cell+g.pad) + g.cell/2;
    if (t.lit > 0) {
      g.score += Math.ceil(50 * (t.lit/t.max)) + 10;
      t.lit = 0; Sound.good();
      FX.burst(x, y, '#4ade80', 16, {speed:200});
      FX.kick(4, 0.1);
    } else {
      g.score = Math.max(0, g.score-20); Sound.bad();
      FX.burst(x, y, '#f43f5e', 8, {speed:120});
    }
  },
  draw(g, ctx) {
    FX.sky(ctx, g.w, g.h, '#11162e', '#05060e');
    text(ctx, 'SCORE ' + g.score, 24, 48, 22, '#e0f2fe', 'left', 700);
    text(ctx, '♥ '.repeat(Math.max(0,g.lives)), g.w-24, 48, 20, '#f43f5e', 'right');
    g.tiles.forEach((t,i) => {
      const r = Math.floor(i/g.n), c = i%g.n;
      const x = g.ox + c*(g.cell+g.pad), y = g.oy + r*(g.cell+g.pad);
      if (t.lit > 0) {
        const k = t.lit/t.max;
        const col = k>0.5 ? '#4ade80' : k>0.25 ? '#fbbf24' : '#f43f5e';
        FX.glowRoundRect(ctx, x, y, g.cell, g.cell, 12, col, 20);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        FX.roundRect(ctx, x, y+g.cell*(1-k), g.cell, g.cell*k, 12); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        FX.roundRect(ctx, x, y, g.cell, g.cell, 12); ctx.fill();
      }
    });
    FX.vignette(ctx, g.w, g.h, 0.45);
  }
};

window.GAME_PACK_4 = [GAME_TUNNEL, GAME_ORBIT, GAME_DEFENSE, GAME_GEMS, GAME_CYCLES, GAME_REACT];
