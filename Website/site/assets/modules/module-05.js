/* ============================================================
   Sreon Arcade — Tower Defense
   Path-based TD: place towers, survive waves, protect the core.
   ============================================================ */

const GAME_TD = {
  id: 'towerdefense', name: 'Bastion', emoji: '🏰',
  desc: 'Place towers, hold the path, survive escalating waves.',
  controls: 'Click a tower type, then click the map · click a placed tower to upgrade/sell',
  w: 780, h: 560,

  init(g) {
    g.cell = 40;
    g.cols = Math.floor(g.w / g.cell);
    g.rows = Math.floor(g.h / g.cell);

    // waypoint path in grid cells (a winding S-shape)
    g.path = [
      {x:-1,y:2},{x:4,y:2},{x:4,y:6},{x:9,y:6},{x:9,y:2},
      {x:14,y:2},{x:14,y:9},{x:6,y:9},{x:6,y:12},{x:19,y:12}
    ].filter(p => p.x < g.cols+1);
    g.pathPix = g.path.map(p => ({ x: p.x*g.cell + g.cell/2, y: p.y*g.cell + g.cell/2 }));

    // mark which cells are "on path" (blocked for building) with some margin
    g.blocked = new Set();
    for (let i=0;i<g.pathPix.length-1;i++) {
      const a = g.path[i], b = g.path[i+1];
      const steps = Math.max(Math.abs(b.x-a.x), Math.abs(b.y-a.y));
      for (let s=0;s<=steps;s++) {
        const x = Math.round(a.x + (b.x-a.x)*s/steps);
        const y = Math.round(a.y + (b.y-a.y)*s/steps);
        g.blocked.add(x+','+y);
      }
    }

    g.gold = 150;
    g.lives = 20;
    g.wave = 0;
    g.waveActive = false;
    g.spawnQueue = [];
    g.spawnT = 0;
    g.enemies = [];
    g.towers = [];
    g.shots = [];
    g.selectedType = null; // tower type key being placed
    g.selectedTower = null; // placed tower being inspected
    g.hoverCell = null;
    g.betweenWaveT = 3;

    g.TYPES = {
      pulse:  { name:'Pulse',  cost:45,  range:2.6, rate:0.7, dmg:9,  color:'#22d3ee', splash:0,   proj:'#67e8f9' },
      cannon: { name:'Cannon', cost:80,  range:2.1, rate:1.3, dmg:26, color:'#fb923c', splash:0.9, proj:'#fbbf24' },
      frost:  { name:'Frost',  cost:60,  range:2.3, rate:1.0, dmg:5,  color:'#60a5fa', splash:0,   proj:'#bfdbfe', slow:0.45 },
      laser:  { name:'Laser',  cost:120, range:3.2, rate:0.15,dmg:3,  color:'#a855f7', splash:0,   proj:'#e9d5ff', beam:true },
    };

    g.ENEMY_TYPES = {
      grunt: { hp:26,  speed:1.15, color:'#f43f5e', r:9,  bounty:6 },
      runner:{ hp:16,  speed:2.0,  color:'#fbbf24', r:7,  bounty:7 },
      tank:  { hp:110, speed:0.65, color:'#7c3aed', r:13, bounty:16 },
      swarm: { hp:9,   speed:1.5,  color:'#4ade80', r:6,  bounty:3 },
    };

    g.startWave = function() {
      g.wave++;
      g.waveActive = true;
      g.betweenWaveT = 0;
      const n = 6 + g.wave*2;
      const list = [];
      for (let i=0;i<n;i++) {
        let type = 'grunt';
        const r = Math.random();
        if (g.wave > 2 && r < 0.22) type = 'runner';
        if (g.wave > 4 && r < 0.12) type = 'swarm';
        if (g.wave % 4 === 0 && i === n-1) type = 'tank';
        list.push(type);
      }
      g.spawnQueue = list;
      g.spawnT = 0;
    };

    g.cellFree = function(cx, cy) {
      if (cx<0||cy<0||cx>=g.cols||cy>=g.rows) return false;
      if (g.blocked.has(cx+','+cy)) return false;
      return !g.towers.some(t => t.cx===cx && t.cy===cy);
    };

    g.spawnEnemy = function(type) {
      const def = g.ENEMY_TYPES[type];
      g.enemies.push({
        type, hp: def.hp*(1+g.wave*0.12), maxHp: def.hp*(1+g.wave*0.12),
        speed: def.speed, color: def.color, r: def.r, bounty: def.bounty,
        seg: 0, t: 0, x: g.pathPix[0].x, y: g.pathPix[0].y, slow: 0
      });
    };
  },

  update(g, dt) {
    // UI bar interaction (tower shop buttons across the bottom, drawn in draw())
    const p = Input.pointer;
    const barY = g.h - 56;
    if (p.justDown && p.y >= barY) {
      const keys = Object.keys(g.TYPES);
      const bw = 96;
      const startX = 12;
      let handled = false;
      keys.forEach((k, i) => {
        const bx = startX + i*(bw+8);
        if (p.x >= bx && p.x <= bx+bw) {
          g.selectedType = g.selectedType === k ? null : k;
          handled = true;
        }
      });
      // upgrade / sell buttons (only shown when a tower is selected)
      if (!handled && g.selectedTower) {
        if (p.x >= g.w-190 && p.x <= g.w-100) { // upgrade
          const def = g.TYPES[g.selectedTower.type];
          const cost = Math.floor(def.cost * 0.7 * (g.selectedTower.lvl+1));
          if (g.gold >= cost && g.selectedTower.lvl < 3) {
            g.gold -= cost; g.selectedTower.lvl++;
            Sound.good(); FX.shockwave(g.selectedTower.px, g.selectedTower.py, '#fbbf24', 30, 0.3);
          }
        }
        if (p.x >= g.w-96 && p.x <= g.w-16) { // sell
          const def = g.TYPES[g.selectedTower.type];
          g.gold += Math.floor(def.cost * 0.5 * (1+g.selectedTower.lvl*0.5));
          g.towers = g.towers.filter(t => t !== g.selectedTower);
          g.selectedTower = null;
          Sound.pop();
        }
      }
    } else {
      GAME_TD.handlePointer(g);
    }

    // wave pacing
    if (!g.waveActive) {
      g.betweenWaveT -= dt;
      if (g.betweenWaveT <= 0) g.startWave();
    } else {
      g.spawnT -= dt;
      if (g.spawnT <= 0 && g.spawnQueue.length) {
        g.spawnT = 0.55;
        g.spawnEnemy(g.spawnQueue.shift());
      }
      if (!g.spawnQueue.length && !g.enemies.length) {
        g.waveActive = false;
        g.betweenWaveT = 3.5;
        g.gold += 25 + g.wave*4;
        FX.blink('#4ade80', 0.25);
      }
    }

    // move enemies along path
    for (let i=g.enemies.length-1;i>=0;i--) {
      const e = g.enemies[i];
      const slowMul = e.slow > 0 ? 0.45 : 1;
      if (e.slow > 0) e.slow -= dt;
      const from = g.pathPix[e.seg], to = g.pathPix[e.seg+1];
      if (!to) { // reached core
        g.enemies.splice(i,1);
        g.lives--; Sound.bad();
        FX.kick(14, 0.3); FX.blink('#f43f5e', 0.35);
        if (g.lives <= 0) return g.gameOver();
        continue;
      }
      const segLen = dist(from.x,from.y,to.x,to.y);
      e.t += (e.speed*slowMul*g.cell*0.9) * dt / segLen;
      if (e.t >= 1) { e.seg++; e.t = 0; }
      const seg2to = g.pathPix[e.seg+1] || to;
      const seg2from = g.pathPix[e.seg] || from;
      e.x = seg2from.x + (seg2to.x-seg2from.x)*e.t;
      e.y = seg2from.y + (seg2to.y-seg2from.y)*e.t;
    }

    // towers acquire targets & fire
    for (const tw of g.towers) {
      const def = g.TYPES[tw.type];
      tw.cool -= dt;
      const rangePx = def.range * g.cell * (1 + tw.lvl*0.18);
      let target = null, bestT = -1;
      for (const e of g.enemies) {
        const d = dist(tw.px, tw.py, e.x, e.y);
        if (d <= rangePx && e.t + e.seg > bestT) { bestT = e.t+e.seg; target = e; }
      }
      tw.target = target;
      tw.angle = target ? Math.atan2(target.y-tw.py, target.x-tw.px) : tw.angle;

      if (target && tw.cool <= 0) {
        tw.cool = def.rate / (1 + tw.lvl*0.25);
        const dmg = def.dmg * (1 + tw.lvl*0.4);
        if (def.beam) {
          target.hp -= dmg;
          FX.spark(target.x, target.y, def.proj, 0, 2);
          g.hitEnemy(target, dmg, tw);
        } else {
          g.shots.push({
            x: tw.px, y: tw.py, tx: target, dmg, color: def.proj,
            splash: def.splash*g.cell*(1+tw.lvl*0.15), slow: def.slow, speed: 480
          });
        }
        Sound.blip();
      }
    }

    // move shots
    for (let i=g.shots.length-1;i>=0;i--) {
      const s = g.shots[i];
      if (!s.tx || s.tx.hp <= 0) { g.shots.splice(i,1); continue; }
      const d = dist(s.x,s.y,s.tx.x,s.tx.y);
      const step = s.speed*dt;
      if (d <= step) {
        g.hitEnemy(s.tx, s.dmg, null, s.splash, s.slow, s.color);
        g.shots.splice(i,1);
      } else {
        s.x += (s.tx.x-s.x)/d*step;
        s.y += (s.tx.y-s.y)/d*step;
      }
    }

    g.enemies = g.enemies.filter(e => e.hp > 0);
  },

  draw(g, ctx) {
    FX.sky(ctx, g.w, g.h, '#0e1524', '#050810');

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    for (let x=0;x<=g.cols;x++){ ctx.beginPath(); ctx.moveTo(x*g.cell,0); ctx.lineTo(x*g.cell,g.h); ctx.stroke(); }
    for (let y=0;y<=g.rows;y++){ ctx.beginPath(); ctx.moveTo(0,y*g.cell); ctx.lineTo(g.w,y*g.cell); ctx.stroke(); }

    // path
    ctx.save();
    ctx.strokeStyle = 'rgba(124,58,237,0.18)';
    ctx.lineWidth = g.cell*0.82;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    g.pathPix.forEach((p,i)=> i? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(168,85,247,0.35)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10,10]);
    ctx.lineDashOffset = -g.time*30;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // hover placement preview
    if (g.hoverCell && g.selectedType) {
      const def = g.TYPES[g.selectedType];
      const ok = g.cellFree(g.hoverCell.x, g.hoverCell.y);
      const px = g.hoverCell.x*g.cell+g.cell/2, py = g.hoverCell.y*g.cell+g.cell/2;
      ctx.save();
      ctx.strokeStyle = ok ? 'rgba(74,222,128,0.5)' : 'rgba(244,63,94,0.6)';
      ctx.fillStyle = ok ? 'rgba(74,222,128,0.08)' : 'rgba(244,63,94,0.08)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px,py, def.range*g.cell, 0, 7); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // towers
    g.towers.forEach(tw => {
      const def = g.TYPES[tw.type];
      const isSel = g.selectedTower === tw;
      if (isSel) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.arc(tw.px, tw.py, def.range*g.cell*(1+tw.lvl*0.18), 0, 7); ctx.stroke();
        ctx.restore();
      }
      // base
      FX.glowRoundRect(ctx, tw.px-16, tw.py-16, 32, 32, 6, '#1b1828', 0);
      ctx.strokeStyle = def.color; ctx.lineWidth = 2;
      FX.roundRect(ctx, tw.px-16, tw.py-16, 32, 32, 6); ctx.stroke();
      // turret
      ctx.save();
      ctx.translate(tw.px, tw.py); ctx.rotate(tw.angle||0);
      FX.glowRoundRect(ctx, -4, -18, 22, 8, 3, def.color, 10);
      ctx.restore();
      FX.glowCircle(ctx, tw.px, tw.py, 8, def.color, 12);
      if (tw.lvl > 0) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = '700 10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('★'.repeat(tw.lvl), tw.px, tw.py+26);
      }
    });

    // shots
    g.shots.forEach(s => FX.glowCircle(ctx, s.x, s.y, 4, s.color, 12));

    // enemies
    g.enemies.forEach(e => {
      FX.glowCircle(ctx, e.x, e.y, e.r, e.color, e.slow>0 ? 6 : 12);
      if (e.slow > 0) {
        ctx.strokeStyle = 'rgba(191,219,254,0.7)';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r+4, 0, 7); ctx.stroke();
      }
      // hp bar
      const w = e.r*2.2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x-w/2, e.y-e.r-10, w, 4);
      ctx.fillStyle = e.hp/e.maxHp > 0.5 ? '#4ade80' : e.hp/e.maxHp > 0.25 ? '#fbbf24' : '#f43f5e';
      ctx.fillRect(e.x-w/2, e.y-e.r-10, w*clamp(e.hp/e.maxHp,0,1), 4);
    });

    FX.vignette(ctx, g.w, g.h, 0.4);

    // ---- HUD top ----
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,18,0.55)';
    ctx.fillRect(0, 0, g.w, 40);
    ctx.restore();
    text(ctx, '💰 ' + g.gold, 16, 26, 15, '#fbbf24', 'left', 700);
    text(ctx, '♥ ' + g.lives, 130, 26, 15, '#f43f5e', 'left', 700);
    text(ctx, g.waveActive ? ('WAVE ' + g.wave) : ('Next wave in ' + Math.ceil(g.betweenWaveT) + 's'),
      g.w/2, 26, 14, '#c4b5fd', 'center', 700);
    text(ctx, 'SCORE ' + Math.floor(g.score), g.w-16, 26, 14, PALETTE.dim, 'right');

    // ---- shop bar bottom ----
    const barY = g.h - 56;
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,18,0.72)';
    ctx.fillRect(0, barY, g.w, 56);
    ctx.restore();

    const keys = Object.keys(g.TYPES);
    const bw = 96;
    keys.forEach((k, i) => {
      const def = g.TYPES[k];
      const bx = 12 + i*(bw+8);
      const active = g.selectedType === k;
      const afford = g.gold >= def.cost;
      ctx.save();
      if (active) { ctx.shadowColor = def.color; ctx.shadowBlur = 16; }
      ctx.fillStyle = active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
      FX.roundRect(ctx, bx, barY+7, bw, 42, 8); ctx.fill();
      ctx.strokeStyle = active ? def.color : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = active ? 2 : 1;
      FX.roundRect(ctx, bx, barY+7, bw, 42, 8); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(bx+16, barY+28, 7, 0, 7); ctx.fill();
      text(ctx, def.name, bx+30, barY+24, 11.5, afford?'#efeaff':'rgba(255,255,255,0.3)', 'left', 700);
      text(ctx, '$'+def.cost, bx+30, barY+40, 10.5, afford?'#fbbf24':'rgba(255,255,255,0.25)', 'left', 600);
    });

    // ---- upgrade/sell panel when a tower is selected ----
    if (g.selectedTower) {
      const def = g.TYPES[g.selectedTower.type];
      const cost = Math.floor(def.cost * 0.7 * (g.selectedTower.lvl+1));
      const canUp = g.selectedTower.lvl < 3;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      FX.roundRect(ctx, g.w-190, barY+7, 90, 42, 8); ctx.fill();
      ctx.strokeStyle = canUp ? '#4ade80' : 'rgba(255,255,255,0.15)';
      FX.roundRect(ctx, g.w-190, barY+7, 90, 42, 8); ctx.stroke();
      ctx.restore();
      text(ctx, canUp ? ('⬆ $'+cost) : 'MAX LVL', g.w-145, barY+24, 11.5, canUp?'#4ade80':'rgba(255,255,255,0.4)', 'center', 700);
      text(ctx, 'Upgrade', g.w-145, barY+40, 9.5, PALETTE.dim, 'center');

      const sellVal = Math.floor(def.cost * 0.5 * (1+g.selectedTower.lvl*0.5));
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      FX.roundRect(ctx, g.w-96, barY+7, 80, 42, 8); ctx.fill();
      ctx.strokeStyle = '#f43f5e';
      FX.roundRect(ctx, g.w-96, barY+7, 80, 42, 8); ctx.stroke();
      ctx.restore();
      text(ctx, '$'+sellVal, g.w-56, barY+24, 11.5, '#f43f5e', 'center', 700);
      text(ctx, 'Sell', g.w-56, barY+40, 9.5, PALETTE.dim, 'center');
    }
  }
};

// hitEnemy is attached per game-instance below (needs closures over g)

// The engine only calls init/update/draw, so wrap init to attach instance methods
(function(){
  const origInit = GAME_TD.init;
  GAME_TD.init = function(g) {
    origInit(g);
    g.hitEnemy = function(e, dmg, tower, splash, slow, splashColor) {
      e.hp -= dmg;
      if (slow) e.slow = 1.2;
      FX.spark(e.x, e.y, splashColor || '#fff', 0, 3);
      if (splash && splash > 0) {
        for (const other of g.enemies) {
          if (other === e) continue;
          if (dist(other.x,other.y,e.x,e.y) < splash) {
            other.hp -= dmg*0.5;
          }
        }
        FX.shockwave(e.x, e.y, splashColor || '#fb923c', splash, 0.3);
      }
      if (e.hp <= 0 && !e.dead) {
        e.dead = true;
        g.gold += e.bounty;
        g.score += e.bounty*4;
        FX.burst(e.x, e.y, e.color, 16, {speed:180});
        FX.floatText(e.x, e.y-10, '+'+e.bounty, '#fbbf24', 13);
        Sound.pop();
      }
    };
  };
})();

// ---- placement / UI interaction (mouse) ----
GAME_TD.handlePointer = function(g) {
  const p = Input.pointer;
  const cx = Math.floor(p.x / g.cell), cy = Math.floor(p.y / g.cell);
  g.hoverCell = { x: cx, y: cy };
  if (!p.justDown) return;

  if (g.selectedType) {
    const def = g.TYPES[g.selectedType];
    if (g.cellFree(cx, cy) && g.gold >= def.cost) {
      g.towers.push({
        type: g.selectedType, cx, cy,
        px: cx*g.cell+g.cell/2, py: cy*g.cell+g.cell/2,
        cool: 0, lvl: 0, angle: 0
      });
      g.gold -= def.cost;
      Sound.good();
      FX.shockwave(cx*g.cell+g.cell/2, cy*g.cell+g.cell/2, def.color, 40, 0.3);
      g.selectedType = null;
    } else {
      Sound.bad();
    }
    return;
  }

  // select existing tower
  const hit = g.towers.find(t => dist(p.x,p.y,t.px,t.py) < 18);
  g.selectedTower = hit || null;
};

window.GAME_PACK_5 = [GAME_TD];
