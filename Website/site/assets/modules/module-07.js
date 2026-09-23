

function mulberry32(seed) {
  return function() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


function buildLevel(idx, endless = false, stage = 0) {
  const rnd = mulberry32(1000 + idx*97 + stage*7919);
  const difficulty = endless ? 1-Math.exp(-stage/10) : idx/9;
  const speed = endless ? 138+75*difficulty : 138+idx*7;
  const length = 116 + (endless ? 0 : idx*2);
  const zones = [
    {from:0,to:34,mode:'cube'},
    {from:34,to:62,mode:'ship'},
    {from:62,to:90,mode:'wave'},
    {from:90,to:length+5,mode:'cube'}
  ];
  const obs = [];
  const jumpDistance = speed/34*(2*12.8/30);
  for (const zone of zones) {
    if (zone.from) obs.push({x:zone.from-0.5,type:'portal',mode:zone.mode});
    let x = zone.from+7;
    if (zone.mode === 'cube') {
      while (x < Math.min(zone.to,length)-7) {
        const roll = rnd();
        let width;
        if (roll < 0.46) {
          const count = difficulty > 0.24 && rnd() < 0.22+difficulty*0.45 ? 3 : rnd() < 0.4 ? 2 : 1;
          width = 1+(count-1)*0.9;
          for(let n=0;n<count;n++) obs.push({x:x+n*0.9,type:'spike'});
        } else if (roll < 0.68) {
          width = 1.2+difficulty*0.55;
          obs.push({x,type:'gap',w:width});
        } else {
          width = 1.8+rnd();
          obs.push({x,type:'block',w:width,h:0.65+difficulty*0.35});
        }
        x += width+jumpDistance+1.5+rnd()*1.2;
      }
    } else {
      let wall = 0;
      const gap = 3.3-difficulty*0.6;
      while (x < zone.to-4) {
        const low = 0.65 + (Math.sin(wall*0.75+idx+stage)*0.5+0.5)*(0.5+difficulty*0.6);
        const prefix = zone.mode === 'ship' ? 'shipBlock' : 'waveWall';
        obs.push({x,type:prefix+'Top',y:low+gap,h:Math.max(0.3,7-low-gap),w:1.1});
        obs.push({x,type:prefix+'Bot',y:0,h:low,w:1.1});
        x += 5.5-difficulty;
        wall++;
      }
    }
  }
  return {obs,length,speed,zones,seedIdx:idx,difficulty};
}

const GD_THEMES = [
  ['#7C3AED','#c026d3'], ['#0891b2','#22d3ee'], ['#dc2626','#fb923c'],
  ['#15803d','#4ade80'], ['#a855f7','#ec4899'], ['#0284c7','#38bdf8'],
  ['#ea580c','#facc15'], ['#4338ca','#818cf8'], ['#be123c','#fb7185'],
  ['#065f46','#10b981']
];

const GAME_GD = {
  id: 'geodash', name: 'Geometry Rush', emoji: '🔺',
  desc: 'Cube, spaceship, wave. Ten patterned levels and an endless ascent.',
  controls: 'Space / tap: jump · Hold: repeat jumps or fly · 4: autoplay on/off · Escape: levels. Square platforms are safe.',
  w: 760, h: 460,

  init(g) {
    g.PPU = 34;
    g.groundY = g.h - 70;
    g.selMode = true;
    g.selIdx = clamp(Number(localStorage.getItem('sreon_gd_lastlevel'))||0, 0, 9);
    g.best = {};
    for (let i=0;i<10;i++) g.best[i] = Number(localStorage.getItem('sreon_gd_best_'+i)||0);
    g.playerColors = ['#4ade80','#22d3ee','#f43f5e','#fbbf24','#a855f7','#ffffff'];
    g.playerColorIdx = clamp(Number(localStorage.getItem('sreon_gd_color'))||0, 0, 5);
  },

  update(g, dt) {
    if (g.selMode) { g.updateSelect(g, dt); if (!g.selMode && Input.pressed('4')) g.toggleAuto(g); return; }
    g.updatePlay(g, dt);
  },

  draw(g, ctx) {
    if (g.selMode) { g.drawSelect(g, ctx); return; }
    g.drawPlay(g, ctx);
  }
};

(function(){
  const origInit = GAME_GD.init;
  GAME_GD.init = function(g) {
    origInit(g);


    g.updateSelect = function(g, dt) {
      const p = Input.pointer;
      if (Input.pressed('ArrowRight')) g.selIdx = (g.selIdx+1)%10;
      if (Input.pressed('ArrowLeft')) g.selIdx = (g.selIdx+9)%10;
      if (Input.pressed('Enter') || Input.pressed(' ')) { g.startLevel(g, g.selIdx); return; }
      if (Input.pressed('i')) { g.startLevel(g, 0, true); return; }
      if (!p.justDown) return;
      const cols = 5, cw = 132, ch = 104, gapx=14, gapy=14;
      const totalW = cols*cw + (cols-1)*gapx;
      const ox = (g.w-totalW)/2, oy = 100;
      for (let i=0;i<10;i++) {
        const cx = ox + (i%cols)*(cw+gapx), cy = oy + Math.floor(i/cols)*(ch+gapy);
        if (p.x>=cx && p.x<=cx+cw && p.y>=cy && p.y<=cy+ch) {
          g.selIdx = i; localStorage.setItem('sreon_gd_lastlevel', i);
          Sound.blip();
          g.startLevel(g, i);
          return;
        }
      }

      if (p.x >= 160 && p.x <= g.w-160 && p.y >= 340 && p.y <= 375) { g.startLevel(g, 0, true); Sound.blip(); return; }
      const swY = g.h - 60, sw=24, gap=8, startX = g.w/2 - (g.playerColors.length*(sw+gap))/2;
      g.playerColors.forEach((c,i) => {
        const bx = startX+i*(sw+gap);
        if (p.x>=bx&&p.x<=bx+sw&&p.y>=swY&&p.y<=swY+sw) {
          g.playerColorIdx = i; localStorage.setItem('sreon_gd_color', i); Sound.blip();
        }
      });
    };

    g.drawSelect = function(g, ctx) {
      FX.sky(ctx, g.w, g.h, '#150f2e', '#05040c');
      FX.stars(ctx, g.w, g.h, g.time*10, 70, 'gdsel');


      ctx.save();
      ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 22;
      text(ctx, 'GEOMETRY RUSH', g.w/2, 52, 30, '#f3e8ff', 'center', 700);
      ctx.restore();
      text(ctx, g.completed || 'Pick a level · Safe platforms · Press 4 for autoplay', g.w/2, 76, 12.5, 'rgba(255,255,255,0.4)', 'center');

      const cols = 5, cw = 132, ch = 104, gapx=14, gapy=14;
      const totalW = cols*cw + (cols-1)*gapx;
      const ox = (g.w-totalW)/2, oy = 100;
      for (let i=0;i<10;i++) {
        const cx = ox + (i%cols)*(cw+gapx), cy = oy + Math.floor(i/cols)*(ch+gapy);
        const theme = GD_THEMES[i];
        const best = g.best[i]||0;
        const done = best >= 100;

        ctx.save();
        const grad = ctx.createLinearGradient(cx, cy, cx, cy+ch);
        grad.addColorStop(0, 'rgba(255,255,255,0.07)');
        grad.addColorStop(1, 'rgba(255,255,255,0.02)');
        ctx.fillStyle = grad;
        FX.roundRect(ctx, cx, cy, cw, ch, 12); ctx.fill();
        ctx.strokeStyle = done ? '#4ade80' : theme[0];
        ctx.lineWidth = i === g.selIdx ? 3 : 1;
        ctx.shadowColor = done ? '#4ade80' : theme[0]; ctx.shadowBlur = 12;
        FX.roundRect(ctx, cx, cy, cw, ch, 12); ctx.stroke();
        ctx.restore();


        ctx.save();
        ctx.fillStyle = theme[1];
        ctx.shadowColor = theme[1]; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(cx+22, cy+24, 13, 0, 7); ctx.fill();
        ctx.restore();
        text(ctx, String(i+1), cx+22, cy+29, 14, '#0a0814', 'center', 800);

        text(ctx, 'LEVEL ' + (i+1), cx+cw-12, cy+22, 10.5, 'rgba(255,255,255,0.4)', 'right', 700);

        const diff = Math.min(5, 1 + Math.floor(i/2));
        let dotsStr = '';
        for (let d=0; d<5; d++) dotsStr += d<diff ? '\u25CF' : '\u25CB';
        text(ctx, dotsStr, cx+cw-12, cy+36, 9, theme[1], 'right');


        const barY = cy+56, barW = cw-24;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        FX.roundRect(ctx, cx+12, barY, barW, 8, 4); ctx.fill();
        ctx.save();
        ctx.shadowColor = done?'#4ade80':theme[1]; ctx.shadowBlur = 8;
        ctx.fillStyle = done ? '#4ade80' : theme[1];
        FX.roundRect(ctx, cx+12, barY, barW*clamp(best/100,0,1), 8, 4); ctx.fill();
        ctx.restore();

        text(ctx, done ? 'COMPLETE' : best+'%', cx+cw/2, cy+82, 13, done?'#4ade80':'#efeaff', 'center', 700);
      }

      ctx.fillStyle = 'rgba(199,173,237,0.16)';
      FX.roundRect(ctx, 160, 340, g.w-320, 35, 8); ctx.fill();
      text(ctx, '∞  ENDLESS  ·  CUBE / SHIP / WAVE', g.w/2, 363, 12, '#e4caff', 'center', 700);
      text(ctx, 'CUBE COLOR', g.w/2, g.h-78, 11, 'rgba(255,255,255,0.4)', 'center', 700);
      const swY = g.h-60, sw=24, gap=8, startX = g.w/2 - (g.playerColors.length*(sw+gap))/2;
      g.playerColors.forEach((c,i) => {
        const bx = startX+i*(sw+gap);
        ctx.save();
        if (i===g.playerColorIdx) { ctx.shadowColor=c; ctx.shadowBlur=12; ctx.strokeStyle='#fff'; ctx.lineWidth=2; }
        ctx.fillStyle = c;
        FX.roundRect(ctx, bx, swY, sw, sw, 5); ctx.fill();
        if (i===g.playerColorIdx) ctx.stroke();
        ctx.restore();
      });
    };

    g.startLevel = function(g, idx, endless = false) {
      if (!endless) { g.selIdx = idx; localStorage.setItem('sreon_gd_lastlevel', idx); }
      g.endless = endless;
      g.stage = 0;
      g.distance = 0;
      g.score = 0;
      g.completed = null;
      g.selMode = false;
      g.autoPlay = false;
      g.usedAuto = false;
      g._heldPrev = false;
      g.jumpBuffer = 0;
      g.coyote = 0.12;
      g.lvl = buildLevel(idx, endless, 0);
      g.theme = GD_THEMES[idx];
      g.px = 2.2; g.py = 0; g.pvy = 0;
      g.mode = 'cube';
      g.angle = 0;
      g.grounded = true;
      g.scrollX = 0;
      g.dead = false; g.deadT = 0;
      g.progress = 0;
      g.attempts = (g.attempts||0) + 1;
      g.trail = [];
      g.holding = false;
      g.flashT = 0;
      g.gravityDir = 1;
    };

    g.currentZoneMode = function(g, worldX) {
      for (const z of g.lvl.zones) if (worldX >= z.from && worldX < z.to) return z.mode;
      return 'cube';
    };

    g.resetToStart = function(g) {
      if (g.endless) { g.stage = 0; g.distance = 0; g.lvl = buildLevel(0, true, 0); g.theme = GD_THEMES[0]; g.score = 0; }
      g.jumpBuffer = 0; g.coyote = 0.12; g._heldPrev = false;
      g.px = 2.2; g.py = 0; g.pvy = 0; g.mode = 'cube';
      g.grounded = true;
      g.scrollX = 0; g.dead = false; g.trail = [];
      g.gravityDir = 1;
    };


    g.updatePlay = function(g, dt) {
      const p = Input.pointer;
      const wantAction = Input.held(' ') || Input.held('ArrowUp') || p.down;
      if (Input.pressed('4')) g.toggleAuto(g);

      if (g.dead) {
        g.deadT -= dt;
        if (g.deadT <= 0) g.resetToStart(g);
        return;
      }

      if (Input.pressed('Escape')) { g.selMode = true; return; }
      if (Input.pointer.justDown && Input.pointer.x >= 10 && Input.pointer.x <= 34 && Input.pointer.y >= 7 && Input.pointer.y <= 29) {
        g.selMode = true; Sound.blip(); return;
      }

      const speed = g.lvl.speed / g.PPU;
      g.scrollX += speed*dt;
      g.distance += speed*dt;
      if (g.endless) g.score = g.usedAuto ? 0 : Math.floor(g.distance*10);
      const worldX = g.px + g.scrollX;
      g.progress = clamp(worldX/g.lvl.length, 0, 1);

      const zoneMode = g.currentZoneMode(g, worldX);
      if (zoneMode !== g.mode) { g.mode = zoneMode; g.pvy = 0; FX.shockwave(g.px*g.PPU, g.h-140, '#fff', 40, 0.3); Sound.pop(); }

      if (g.autoPlay) {
        g.usedAuto = true;
        if (g.mode === 'cube') {
          let height = 0;
          for (const o of g.lvl.obs) {
            if (!['spike', 'gap'].includes(o.type)) continue;
            const width = o.w || 1;
            const start = o.x - 1.9;
            const end = o.x + width + 1;
            if (worldX >= start && worldX <= end)
              height = Math.max(height, Math.sin((worldX-start)/(end-start)*Math.PI)*2.8);
          }
          g.py = height;
          g.pvy = 0;
          g.grounded = height === 0;
          g.angle += height > 0 ? dt*7 : 0;
        } else {
          const wall = g.lvl.obs.find(o => ['shipBlockBot', 'waveWallBot'].includes(o.type) && o.x + o.w >= worldX && o.x < worldX + 5);
          const top = wall && g.lvl.obs.find(o => o.x === wall.x && ['shipBlockTop', 'waveWallTop'].includes(o.type));
          const target = top ? (wall.y+wall.h+top.y-0.84)/2 : 2.3;
          g.py += clamp(target-g.py, -4*dt, 4*dt);
          g.pvy = 0;
          g.angle = 0;
        }
      } else if (g.mode === 'cube') {
        g.coyote = g.grounded ? 0.12 : Math.max(0, g.coyote-dt);
        g.jumpBuffer = wantAction && !g._heldPrev ? 0.14 : Math.max(0, g.jumpBuffer-dt);
        g.pvy -= 30*dt;
        if ((wantAction && g.grounded) || (g.jumpBuffer > 0 && g.coyote > 0)) {
          g.pvy = 12.8;
          g.grounded = false;
          g.coyote = 0;
          g.jumpBuffer = 0;
          Sound.blip();
        }
        g.py += g.pvy*dt;
        g.angle += (g.grounded ? 0 : 8)*dt;
        if (g.groundSolidAt(g, worldX) && g.py <= 0 && g.pvy <= 0) {
          g.py = 0; g.pvy = 0; g.grounded = true;
          g.angle = Math.round(g.angle/(Math.PI/2))*(Math.PI/2);
        } else g.grounded = false;
        if (g.py < -3) g.kill(g);
      } else if (g.mode === 'ship') {
        g.pvy = clamp(g.pvy + (wantAction ? 17 : -11)*dt, -6, 6);
        g.py += g.pvy*dt;
        g.angle = clamp(-g.pvy*0.06, -0.5, 0.5);
      } else if (g.mode === 'wave') {
        const dir = wantAction ? 1 : -1;
        g.py += dir*6*dt;
        g.angle = dir > 0 ? -0.5 : 0.5;
      }
      if (g.mode !== 'cube') g.py = clamp(g.py, 0, 5.5);
      g.resolvePlatforms(g, worldX);

      g._heldPrev = wantAction;

      g.trail.push({ x: worldX, y: g.py, life: 0.35 });
      g.trail = g.trail.filter(t => (t.life -= dt) > 0);


      for (const o of g.lvl.obs) {
        if (g.checkHit(g, o, worldX)) { g.kill(g); break; }
      }

      if (!g.dead && worldX >= g.lvl.length) g.finishLevel(g);
    };

    g.toggleAuto = function(g) {
      g.autoPlay = !g.autoPlay;
      if (g.autoPlay) {
        g.usedAuto = true;
        if (g.dead) g.resetToStart(g);
      }
    };

    g.resolvePlatforms = function(g, worldX) {
      for (const o of g.lvl.obs) {
        if (!(worldX+0.76 > o.x && worldX+0.08 < o.x+(o.w || 0))) continue;
        if (o.type === 'block' && g.py <= o.h) {
          g.py = o.h; g.pvy = Math.max(0, g.pvy); g.grounded = true;
        } else if (['shipBlockBot', 'waveWallBot'].includes(o.type) && g.py < o.y+o.h) {
          g.py = o.y+o.h; g.pvy = Math.max(0, g.pvy);
        } else if (['shipBlockTop', 'waveWallTop'].includes(o.type) && g.py+0.84 > o.y) {
          g.py = o.y-0.84; g.pvy = Math.min(0, g.pvy);
        }
      }
    };

    g.groundSolidAt = function(g, worldX) {
      for (const o of g.lvl.obs) {
        if (o.type === 'gap' && worldX >= o.x && worldX <= o.x + o.w) return false;
      }
      return true;
    };

    g.checkHit = function(g, o, worldX) {
      const px = worldX, py = g.py;
      const pr = 0.36;
      if (o.type === 'spike') {
        if (px+0.7 > o.x+0.25 && px+0.12 < o.x+0.75 && py < 0.65) return true;
      } else if (o.type === 'gap') {
        if (worldX >= o.x+0.15 && worldX <= o.x+o.w-0.15 && py <= 0.05 && g.mode==='cube') return true;
      }
      return false;
    };

    g.kill = function(g) {
      if (g.dead || g.autoPlay) return;
      g.dead = true; g.deadT = 0.28;
      Sound.bad(); FX.kick(16, 0.35); FX.blink('#f43f5e', 0.45);
      FX.burst(g.px*g.PPU, g.h-140-g.py*g.PPU, g.theme[1], 30, {speed:240});
      if (g.endless) {
        const best = Number(localStorage.getItem('sreon_gd_endless_best')) || 0;
        if (!g.usedAuto && g.distance > best) localStorage.setItem('sreon_gd_endless_best', Math.floor(g.distance));
        return;
      }
      const pct = Math.floor(g.progress*100);
      if (pct > (g.best[g.lvl.seedIdx]||0)) {
        g.best[g.lvl.seedIdx] = pct;
        localStorage.setItem('sreon_gd_best_'+g.lvl.seedIdx, pct);
      }
    };

    g.finishLevel = function(g) {
      if (g.endless) {
        g.stage++;
        g.lvl = buildLevel(0, true, g.stage);
        g.theme = GD_THEMES[g.stage%GD_THEMES.length];
        g.scrollX = 0; g.py = 0; g.pvy = 0; g.mode = 'cube';
        g.grounded = true; g.trail = []; g._heldPrev = false;
        g.jumpBuffer = 0; g.coyote = 0.12;
        Sound.good(); FX.blink(g.theme[1], 0.15);
        return;
      }
      g.completed = 'Level ' + (g.lvl.seedIdx+1) + ' complete' + (g.usedAuto ? ' · Assisted run' : ' · Nicely done');
      g.best[g.lvl.seedIdx] = 100;
      localStorage.setItem('sreon_gd_best_'+g.lvl.seedIdx, 100);
      if (!g.usedAuto) g.score += 500 + g.lvl.seedIdx*100;
      localStorage.setItem('sreon_gd_assisted_'+g.lvl.seedIdx, String(g.usedAuto));
      Sound.good(); FX.blink('#4ade80', 0.5); FX.kick(10,0.3);
      g.selMode = true;
    };


    g.drawPlay = function(g, ctx) {
      const th = g.theme;
      FX.sky(ctx, g.w, g.h, th[0]+'44', '#050510');
      FX.stars(ctx, g.w, g.groundY, g.scrollX*5, 45, 'rush-depth');

      ctx.save();
      ctx.globalAlpha = 0.15;
      for (let i=0;i<8;i++) {
        const bx = ((i*140 - g.scrollX*g.PPU*0.2) % (g.w+140)) - 70;
        ctx.fillStyle = th[1];
        ctx.beginPath();
        ctx.moveTo(bx, g.groundY); ctx.lineTo(bx+40, g.groundY-70); ctx.lineTo(bx+80, g.groundY);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();


      ctx.save();
      ctx.fillStyle = 'rgba(10,8,20,0.9)';
      ctx.fillRect(0, g.groundY, g.w, g.h-g.groundY);
      ctx.strokeStyle = th[1]; ctx.lineWidth = 2;
      ctx.shadowColor = th[1]; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(0,g.groundY); ctx.lineTo(g.w,g.groundY); ctx.stroke();
      ctx.restore();

      const toScreenX = (worldX) => (worldX - g.scrollX)*g.PPU;
      const toScreenY = (worldY) => g.groundY - worldY*g.PPU;


      for (const o of g.lvl.obs) {
        const sx = toScreenX(o.x);
        if (sx < -100 || sx > g.w+100) continue;

        if (o.type === 'spike') {
          const sy = g.groundY;
          const w = g.PPU, h2 = g.PPU*0.92;
          ctx.save();

          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.beginPath();
          ctx.moveTo(sx-2, sy); ctx.lineTo(sx+w/2, sy-h2-2); ctx.lineTo(sx+w+2, sy);
          ctx.closePath(); ctx.fill();

          ctx.shadowColor = th[1]; ctx.shadowBlur = 14;
          const grad = ctx.createLinearGradient(sx, sy-h2, sx+w, sy);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.5, '#fb7185');
          grad.addColorStop(1, '#be123c');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(sx, sy); ctx.lineTo(sx+w/2, sy-h2); ctx.lineTo(sx+w, sy);
          ctx.closePath(); ctx.fill();

          ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
          ctx.shadowBlur = 0;
          ctx.beginPath(); ctx.moveTo(sx+w/2, sy-h2); ctx.lineTo(sx+w/2, sy); ctx.stroke();
          ctx.restore();
        } else if (o.type === 'block') {
          const h = o.h*g.PPU, w=o.w*g.PPU;
          const by = g.groundY-h;
          ctx.save();
          ctx.shadowColor = th[0]; ctx.shadowBlur = 10;
          const grad = ctx.createLinearGradient(sx, by, sx, by+h);
          grad.addColorStop(0, '#ffffff33');
          grad.addColorStop(0.12, th[1]);
          grad.addColorStop(1, th[0]);
          ctx.fillStyle = grad;
          ctx.fillRect(sx, by, w, h);
          ctx.shadowBlur = 0;

          ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
          ctx.strokeRect(sx+3, by+3, w-6, h-6);
          ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
          ctx.strokeRect(sx+0.5, by+0.5, w-1, h-1);

          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(sx, by, w, 3);
          ctx.restore();
        } else if (o.type === 'gap') {
          ctx.fillStyle = '#050510';
          ctx.fillRect(sx, g.groundY, o.w*g.PPU, g.h-g.groundY);
          ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.moveTo(sx,g.groundY); ctx.lineTo(sx,g.h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(sx+o.w*g.PPU,g.groundY); ctx.lineTo(sx+o.w*g.PPU,g.h); ctx.stroke();
        } else if (o.type === 'shipBlockTop' || o.type === 'shipBlockBot' || o.type==='waveWallTop' || o.type==='waveWallBot') {
          const sy = toScreenY(o.y+o.h);
          const h = o.h*g.PPU, w=o.w*g.PPU;
          ctx.save();
          ctx.shadowColor = th[1]; ctx.shadowBlur = 10;
          const grad = ctx.createLinearGradient(sx, sy, sx+w, sy);
          grad.addColorStop(0, th[1]); grad.addColorStop(1, th[0]);
          ctx.fillStyle = grad;
          ctx.fillRect(sx, sy, w, h);
          ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.strokeRect(sx+2, sy+2, w-4, h-4);
          ctx.restore();
        } else if (o.type === 'portal') {
          const sy = g.groundY - 1.1*g.PPU;
          const col = o.mode==='ship' ? '#22d3ee' : o.mode==='wave' ? '#fbbf24' : '#4ade80';
          ctx.save();
          const grad = ctx.createLinearGradient(sx, sy-46, sx+32, sy+46);
          grad.addColorStop(0, col+'55'); grad.addColorStop(1, col+'11');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.ellipse(sx+16, sy, 16, 46, 0, 0, 7); ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 3;
          ctx.shadowColor = col; ctx.shadowBlur = 16;
          ctx.beginPath(); ctx.ellipse(sx+16, sy, 16, 46, 0, 0, 7); ctx.stroke();
          ctx.restore();
        }
      }


      if (g.mode === 'wave' && g.trail.length > 1) {
        ctx.save(); ctx.strokeStyle = g.playerColors[g.playerColorIdx]; ctx.lineWidth = 4; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12; ctx.beginPath();
        g.trail.forEach((t,i) => { const x=toScreenX(t.x)+g.PPU*0.42, y=toScreenY(t.y)-g.PPU*0.42; if (!i) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
        ctx.stroke(); ctx.restore();
      }
      g.trail.forEach(t => {
        ctx.globalAlpha = clamp(t.life/0.35,0,1)*0.5;
        FX.glowRect(ctx, toScreenX(t.x)-4, toScreenY(t.y)-4, 8, 8, g.playerColors[g.playerColorIdx], 6);
      });
      ctx.globalAlpha = 1;


      if (!g.dead) {
        const sx = g.px*g.PPU, sy = toScreenY(g.py);
        const col = g.playerColors[g.playerColorIdx];
        ctx.save();
        ctx.translate(sx+g.PPU*0.42, sy-g.PPU*0.42);
        ctx.rotate(g.angle);
        const size = g.PPU*0.84;
        ctx.shadowColor = col; ctx.shadowBlur = 18;
        if (g.mode === 'ship') {
          const flame = 14+Math.sin(g.time*35)*5;
          ctx.fillStyle = '#ffd18a';
          ctx.beginPath(); ctx.moveTo(-size/2,-5); ctx.lineTo(-size/2-flame,0); ctx.lineTo(-size/2,5); ctx.fill();
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(size*0.7,0); ctx.lineTo(-size*0.5,-size*0.4); ctx.lineTo(-size*0.35,0); ctx.lineTo(-size*0.5,size*0.4); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#eaf8ff'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = '#152943'; ctx.beginPath(); ctx.ellipse(size*0.02,0,7,4,0,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#c8f4ff'; ctx.fillRect(0,-2,4,2);
        } else if (g.mode === 'wave') {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.moveTo(size*0.65,0); ctx.lineTo(-size*0.5,-size*0.42); ctx.lineTo(-size*0.15,0); ctx.lineTo(-size*0.5,size*0.42); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
        } else {
          const grad = ctx.createLinearGradient(-size/2,-size/2,size/2,size/2);
          grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.3,col); grad.addColorStop(1,'#203246');
          ctx.fillStyle = grad; ctx.fillRect(-size/2,-size/2,size,size);
          ctx.shadowBlur = 0; ctx.strokeStyle = '#e3fcff'; ctx.lineWidth = 1.5; ctx.strokeRect(-size/2+3,-size/2+3,size-6,size-6);
          ctx.fillStyle = '#142338'; ctx.fillRect(-7,-5,5,5); ctx.fillRect(3,-5,5,5); ctx.fillRect(-4,5,9,3);
        }
        ctx.restore();
      }

      FX.vignette(ctx, g.w, g.h, 0.4);


      ctx.save();
      const hudGrad = ctx.createLinearGradient(0,0,0,38);
      hudGrad.addColorStop(0,'rgba(6,10,18,0.75)'); hudGrad.addColorStop(1,'rgba(6,10,18,0.15)');
      ctx.fillStyle = hudGrad;
      ctx.fillRect(0,0,g.w,38);
      ctx.restore();


      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      FX.roundRect(ctx, 10, 7, 24, 22, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth=1;
      FX.roundRect(ctx, 10, 7, 24, 22, 6); ctx.stroke();
      ctx.restore();
      text(ctx, '\u2190', 22, 23, 13, 'rgba(255,255,255,0.7)', 'center', 700);

      text(ctx, g.endless ? '∞ SECTOR ' + (g.stage+1) : 'LEVEL ' + (g.lvl.seedIdx+1), 46, 22, 12.5, '#efeaff', 'left', 700);
      ctx.save();
      ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 8;
      text(ctx, g.endless ? Math.floor(g.distance)+' m' : Math.floor(g.progress*100)+'%', g.w/2, 22, 14, '#4ade80', 'center', 700);
      ctx.restore();
      text(ctx, g.autoPlay ? 'AUTO · 4 TO TAKE OVER' : g.mode.toUpperCase(), g.w-16, 22, 11.5, th[1], 'right', 700);


      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, 36, g.w, 3);
      ctx.save();
      ctx.shadowColor = th[1]; ctx.shadowBlur = 6;
      ctx.fillStyle = th[1];
      ctx.fillRect(0, 36, g.w*g.progress, 3);
      ctx.restore();

      text(ctx, g.autoPlay ? 'Autoplay is on. Enjoy the ride.' : 'Squares are safe. Hold to jump. Press 4 to autoplay.', g.w/2, g.h-25, 12, '#c8bfdc', 'center');
      if (g.dead) {
        ctx.save();
        ctx.fillStyle = 'rgba(244,63,94,0.18)';
        ctx.fillRect(0,0,g.w,g.h);
        ctx.restore();
      }
    };
  };
})();

window.GAME_PACK_7 = [GAME_GD];
