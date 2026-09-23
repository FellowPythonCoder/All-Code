/* ============================================================
   Sreon Arcade — Free Kick Simulator
   Behind-the-ball perspective. Aim reticle -> power meter ->
   curve meter -> real ballistic flight with mid-flight bend
   around the wall, then keeper reaction check at the goal line.
   ============================================================ */

const GAME_FK = {
  id: 'freekick', name: 'Free Kick', emoji: '⚽',
  desc: 'Aim, time your power, time your curve. Bend it around the wall.',
  controls: 'Move mouse to aim · click to lock aim, then power, then curve',
  w: 760, h: 560,

  init(g) {
    g.GRAVITY = 15.2;
    g.GOAL_HALF_W = 3.66;
    g.BAR_H = 2.44;
    g.misses = 0; g.maxMisses = 5;
    g.streak = 0; g.level = 1;

    g.BALL_SKINS = ['#ffffff', '#fbbf24', '#f43f5e', '#22d3ee', '#a855f7'];
    g.KIT_COLORS = ['#3730a3', '#dc2626', '#0891b2', '#15803d', '#7c2d12'];
    g.ballSkinIdx = Number(localStorage.getItem('sreon_fk_ball')||0);
    g.kitIdx = Number(localStorage.getItem('sreon_fk_kit')||0);

    g.project = function(x, y, z) {
      const t = clamp(z / g.Z0, 0, 1.4);
      const scale = lerp(1, 0.52, Math.min(1,t));
      const groundY = g.h - 66, horizonY = 168;
      const sy0 = lerp(groundY, horizonY, Math.min(1,t));
      const ppm = 24;
      return {
        x: g.w/2 + x * ppm * scale,
        y: sy0 - y * ppm * scale * 0.92,
        scale
      };
    };

    g.newRound = function() {
      g.Z0 = rand(13, 19);
      g.X0 = choice([-1,1]) * rand(2.5, 7.5);
      g.wallFrac = 9.1 / g.Z0;
      g.wallZ = g.Z0 * g.wallFrac;
      g.wallX = g.X0 + (0 - g.X0) * g.wallFrac;
      g.wallN = Math.min(5, 3 + Math.floor(g.level/2));
      g.wallJump = 0; g.wallJumping = false;
      g.keeperX = 0; g.keeperReaction = Math.max(0.14, 0.30 - g.level*0.015);
      g.keeperSpeed = 4.6 + g.level*0.35;
      g.state = 'aim';
      g.aimX = -g.X0*0.15; g.aimY = 1.1;
      g.powerT = 0; g.power = 0;
      g.curveT = 0; g.curve = 0;
      g.ball = { x: g.X0, y: 0.15, z: 0, vx:0, vy:0, vz:0, t:0, T:0 };
      g.resultMsg = ''; g.resultT = 0;
      g.ballTrail = [];
      g.wind = rand(-1, 1) * (0.5 + g.level*0.08); // signed crosswind strength
    };
    g.newRound();
  },

  update(g, dt) {
    const p = Input.pointer;

    if (g.state === 'aim') {
      // customization swatches (top-left, below HUD) — check these before reticle movement
      if (p.justDown && p.y < 96 && p.y > 46) {
        const sw = 22, gap = 6, startX = 16;
        for (let i=0;i<g.BALL_SKINS.length;i++) {
          const bx = startX + i*(sw+gap);
          if (p.x>=bx && p.x<=bx+sw) { g.ballSkinIdx=i; localStorage.setItem('sreon_fk_ball',i); Sound.blip(); return; }
        }
        const kitStartX = startX + g.BALL_SKINS.length*(sw+gap) + 16;
        for (let i=0;i<g.KIT_COLORS.length;i++) {
          const bx = kitStartX + i*(sw+gap);
          if (p.x>=bx && p.x<=bx+sw) { g.kitIdx=i; localStorage.setItem('sreon_fk_kit',i); Sound.blip(); return; }
        }
      }
      // reticle follows pointer, mapped into goal-plane meters
      const relX = (p.x - g.w/2) / (g.w*0.42);
      const relY = 1 - (p.y - 130) / (g.h*0.42);
      g.aimX = clamp(relX * (g.GOAL_HALF_W + 2.4), -6.5, 6.5);
      g.aimY = clamp(relY * (g.BAR_H + 1.6), 0.15, 3.6);
      if (p.justDown) { Sound.blip(); g.state = 'power'; g.powerT = 0; }
    }
    else if (g.state === 'power') {
      g.powerT += dt * 1.7;
      g.power = (Math.sin(g.powerT) + 1) / 2;
      if (p.justDown) { Sound.pop(); g.power = clamp(g.power, 0, 1); g.state = 'curve'; g.curveT = 0; }
    }
    else if (g.state === 'curve') {
      g.curveT += dt * 2.1;
      g.curve = Math.sin(g.curveT);
      if (p.justDown) {
        Sound.good();
        g.curve = clamp(g.curve, -1, 1);
        g.launch(g);
        g.state = 'flight';
      }
    }
    else if (g.state === 'flight') {
      g.stepFlight(g, dt);
    }
    else if (g.state === 'result') {
      g.resultT -= dt;
      if (g.resultT <= 0) {
        if (g.misses >= g.maxMisses) return g.gameOver(g.streak > 0);
        g.newRound();
      }
    }
  },

  draw(g, ctx) {
    g.drawPitch(g, ctx);
    g.drawGoalAndWall(g, ctx);
    g.drawBall(g, ctx);
    g.drawHUD(g, ctx);
    FX.vignette(ctx, g.w, g.h, 0.5);
  }
};

/* ---- helpers ---- */
function lerp(a,b,t){ return a+(b-a)*t; }

/* ---- attach instance logic (closures over g) ---- */
(function(){
  const origInit = GAME_FK.init;
  GAME_FK.init = function(g) {
    origInit(g);

    g.launch = function(g) {
      const T = lerp(1.05, 0.62, g.power); // more power = faster/flatter/less reaction time
      g.ball.T = T;
      g.ball.t = 0;
      g.ball.y0 = 0.12; // launch height, held constant through the flight
      g.ball.z = 0; g.ball.x = g.X0; g.ball.y = g.ball.y0;
      g.ball.vz = g.Z0 / T;
      // solve vy0 so ball reaches targetHeight at t=T under gravity
      g.ball.vy0 = (g.aimY - g.ball.y0 + 0.5*g.GRAVITY*T*T) / T;
      g.targetX = g.aimX;
      g.bendMag = g.curve * lerp(1.6, 3.4, clamp(g.Z0/24,0,1)) * (0.4 + Math.abs(g.curve)*0.6);
      g.blocked = false;
      g.wallJumping = false; g.wallJumpT = 0;
      g.keeperDiving = false; g.keeperDiveX = 0; g.keeperDiveT = 0;
      g.keeperCommitted = false;
      Sound.tone(200, 0.05, 'triangle', 0.05);
    };

    g.ballWorldAt = function(t) {
      const u = t / g.ball.T;
      const windDrift = g.wind * 0.9 * u*u; // wind pushes more the longer it's airborne
      const x = lerp(g.X0, g.targetX, u) + g.bendMag * Math.sin(u*Math.PI) + windDrift;
      const y = g.ball.y0 + g.ball.vy0*t - 0.5*g.GRAVITY*t*t;
      const z = g.ball.vz * t;
      return { x, y: Math.max(0,y), z };
    };

    g.stepFlight = function(g, dt) {
      g.ball.t += dt;
      const pos = g.ballWorldAt(g.ball.t);
      g.ball.x = pos.x; g.ball.y = pos.y; g.ball.z = pos.z;
      g.ballTrail.push({ x: pos.x, y: pos.y, z: pos.z, life: 0.4 });
      g.ballTrail = g.ballTrail.filter(pt => (pt.life -= dt) > 0);

      // wall jump trigger
      if (!g.wallJumping && pos.z > g.wallZ - 3.2) { g.wallJumping = true; g.wallJumpT = 0; }
      if (g.wallJumping) g.wallJumpT += dt;
      const wallReach = g.wallJumping ? lerp(1.1, 2.15, clamp(g.wallJumpT/0.35,0,1)) : 1.1;

      // wall block check — thin slab around wallZ
      if (!g.blocked && pos.z >= g.wallZ - 0.35 && pos.z <= g.wallZ + 0.35) {
        const spread = (g.wallN-1) * 0.62;
        for (let i=0;i<g.wallN;i++) {
          const dx = g.wallX - spread/2 + i*0.62;
          if (Math.abs(pos.x - dx) < 0.42 && pos.y < wallReach) {
            g.blocked = true;
            FX.burst(...projPt(g,pos.x,pos.y,pos.z), '#f43f5e', 22, {speed:180});
            FX.kick(14, 0.3); Sound.bad();
            g.finish(g, 'BLOCKED', '#f43f5e');
            break;
          }
        }
      }

      // keeper reacts to the ball's CURRENT position (so a curling shot can
      // genuinely wrong-foot him), not the final target — with capped speed
      if (!g.blocked && g.ball.t > g.keeperReaction) {
        const dir = Math.sign(pos.x - g.keeperX);
        g.keeperX += dir * Math.min(g.keeperSpeed * dt, Math.abs(pos.x - g.keeperX));
        g.keeperX = clamp(g.keeperX, -g.GOAL_HALF_W-1, g.GOAL_HALF_W+1);
      }

      // resolve at goal plane
      if (!g.blocked && pos.z >= g.Z0) {
        const nearBar = Math.abs(pos.y - g.BAR_H) < 0.22;
        const nearPost = Math.abs(Math.abs(pos.x) - g.GOAL_HALF_W) < 0.22;
        if (pos.y > g.BAR_H + 0.05) {
          g.finish(g, nearBar ? 'OFF THE BAR' : 'OVER THE BAR', '#fbbf24');
        } else if (Math.abs(pos.x) > g.GOAL_HALF_W) {
          g.finish(g, nearPost ? 'OFF THE POST' : 'WIDE', '#fbbf24');
        } else {
          const edgeFactor = 1 - clamp(Math.abs(pos.x - g.keeperX) / 1.5, 0, 1);
          const reachH = lerp(0.85, 2.2, edgeFactor);
          const reachX = 1.35;
          if (Math.abs(pos.x - g.keeperX) < reachX && pos.y < reachH) {
            g.finish(g, 'SAVED', '#22d3ee');
          } else {
            g.finish(g, 'GOAL!', '#4ade80');
          }
        }
      }
    };

    g.finish = function(g, msg, color) {
      g.resultMsg = msg; g.resultT = 1.6; g.state = 'result';
      const isGoal = msg === 'GOAL!';
      if (isGoal) {
        g.streak++; g.made = (g.made||0) + 1;
        g.score += 100 * g.level + g.streak*20;
        if (g.made % 3 === 0) g.level++;
        FX.blink('#4ade80', 0.35); FX.kick(10, 0.25);
        Sound.good();
      } else {
        g.streak = 0; g.misses++;
        FX.blink(color, 0.3); Sound.bad();
      }
      const pp = projPt(g, clamp(g.ball.x,-6,6), Math.min(g.ball.y,3), Math.min(g.ball.z,g.Z0));
      FX.floatText(pp[0], pp[1]-10, msg, color, 15);
    };

    g.drawPitch = function(g, ctx) {
      const skyH = 118;
      FX.sky(ctx, g.w, skyH, '#0b1f3a', '#123159');
      const gr = ctx.createLinearGradient(0, skyH, 0, g.h);
      gr.addColorStop(0, '#1c6b3a'); gr.addColorStop(1, '#0e3d20');
      ctx.fillStyle = gr; ctx.fillRect(0, skyH, g.w, g.h-skyH);
      // mow stripes using perspective trapezoids
      ctx.save();
      for (let i=0;i<10;i++) {
        const t0 = i/10, t1=(i+1)/10;
        const y0 = lerp(g.h, skyH, t0), y1 = lerp(g.h, skyH, t1);
        const half0 = lerp(g.w*0.75, 10, t0), half1 = lerp(g.w*0.75, 10, t1);
        ctx.fillStyle = i%2===0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)';
        ctx.beginPath();
        ctx.moveTo(g.w/2-half0, y0); ctx.lineTo(g.w/2+half0, y0);
        ctx.lineTo(g.w/2+half1, y1); ctx.lineTo(g.w/2-half1, y1);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // floodlight glow top corners
      FX.glowCircle(ctx, 40, 30, 3, '#fef9c3', 30);
      FX.glowCircle(ctx, g.w-40, 30, 3, '#fef9c3', 30);
    };

    g.drawGoalAndWall = function(g, ctx) {
      const postL = g.project(-g.GOAL_HALF_W, 0, g.Z0);
      const postR = g.project(g.GOAL_HALF_W, 0, g.Z0);
      const barL  = g.project(-g.GOAL_HALF_W, g.BAR_H, g.Z0);
      const barR  = g.project(g.GOAL_HALF_W, g.BAR_H, g.Z0);

      // net with a subtle sag/bulge for a cloth-like feel
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.lineWidth = 1;
      const netDepth = 14;
      for (let i=0;i<=10;i++) {
        const u = i/10;
        const x = lerp(barL.x, barR.x, u);
        const sag = Math.sin(u*Math.PI) * netDepth * (barR.x-barL.x > 0 ? 1 : -1) * 0.4;
        ctx.beginPath();
        ctx.moveTo(x, barL.y);
        ctx.quadraticCurveTo(x+sag*0.3, (barL.y+postL.y)/2, x+sag, postL.y+3);
        ctx.stroke();
      }
      for (let i=0;i<=5;i++) {
        const u = i/5;
        const y = lerp(barL.y, postL.y, u);
        const bulge = Math.sin(u*Math.PI) * netDepth * 0.5;
        ctx.beginPath();
        ctx.moveTo(barL.x, y+bulge*0.15);
        ctx.quadraticCurveTo((barL.x+barR.x)/2, y+bulge, barR.x, y+bulge*0.15);
        ctx.stroke();
      }
      ctx.restore();

      // posts + bar glow white
      ctx.save();
      ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 5;
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(postL.x, postL.y); ctx.lineTo(barL.x, barL.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(postR.x, postR.y); ctx.lineTo(barR.x, barR.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(barL.x, barL.y); ctx.lineTo(barR.x, barR.y); ctx.stroke();
      ctx.restore();

      // keeper — leans/dives in the direction he's moving, more dramatically once he's committed
      const kp = g.project(g.keeperX, 0.05, g.Z0-0.3);
      const kh = 34*kp.scale;
      const kvx = g._prevKeeperX !== undefined ? (g.keeperX - g._prevKeeperX) : 0;
      g._prevKeeperX = g.keeperX;
      const diveAmount = g.state === 'flight' ? clamp(Math.abs(kvx) * 14, 0, 1) : 0;
      const diveDir = Math.sign(kvx) || 1;
      ctx.save();
      ctx.translate(kp.x, kp.y);
      ctx.rotate(diveDir * diveAmount * 0.85); // lean into the dive
      ctx.scale(1 + diveAmount*0.3, 1 - diveAmount*0.25); // stretch horizontally when diving
      ctx.fillStyle = '#facc15';
      FX.roundRect(ctx, -7*kp.scale, -kh, 14*kp.scale, kh, 4*kp.scale); ctx.fill();
      ctx.fillStyle = '#1e293b';
      ctx.beginPath(); ctx.arc(0, -kh-5*kp.scale, 5*kp.scale, 0, 7); ctx.fill();
      // gloves — extend further out when diving, showing reach
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath(); ctx.arc(diveDir*10*kp.scale*diveAmount, -kh*0.6, 3.5*kp.scale, 0, 7); ctx.fill();
      ctx.restore();

      // wall players (with jump)
      const spread = (g.wallN-1) * 0.62;
      for (let i=0;i<g.wallN;i++) {
        const dx = g.wallX - spread/2 + i*0.62;
        const jump = g.wallJumping ? Math.sin(clamp(g.wallJumpT/0.4,0,1)*Math.PI) * 0.55 : 0;
        const wp = g.project(dx, jump, g.wallZ);
        const wh = 30*wp.scale;
        ctx.save();
        ctx.fillStyle = g.KIT_COLORS[g.kitIdx];
        FX.roundRect(ctx, wp.x-6*wp.scale, wp.y-wh, 12*wp.scale, wh, 4*wp.scale); ctx.fill();
        ctx.fillStyle = '#fde68a';
        ctx.beginPath(); ctx.arc(wp.x, wp.y-wh-4*wp.scale, 4.5*wp.scale, 0, 7); ctx.fill();
        ctx.restore();
      }
    };

    g.drawBall = function(g, ctx) {
      g.ballTrail.forEach(pt => {
        const p = g.project(pt.x, pt.y, pt.z);
        ctx.globalAlpha = clamp(pt.life/0.4, 0, 1) * 0.5;
        FX.glowCircle(ctx, p.x, p.y, 3*p.scale, '#e2e8f0', 8);
      });
      ctx.globalAlpha = 1;

      let bx, by, bz;
      if (g.state === 'aim' || g.state === 'power' || g.state === 'curve') {
        bx = g.X0; by = 0.12; bz = 0;
      } else {
        bx = g.ball.x; by = g.ball.y; bz = g.ball.z;
      }
      const bp = g.project(bx, by, bz);
      const ballColor = g.BALL_SKINS[g.ballSkinIdx];
      FX.glowCircle(ctx, bp.x, bp.y, 6*bp.scale, ballColor, 14);
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(bp.x, bp.y, 6*bp.scale, 0, 7); ctx.stroke();
      ctx.restore();

      // spin marks — rotate proportional to curve magnitude & elapsed flight time,
      // so a heavily curved shot visibly spins faster than a straight one
      if (g.state === 'flight') {
        const spinRate = 22 * (0.4 + Math.abs(g.curve||0));
        const spinAngle = g.ball.t * spinRate;
        ctx.save();
        ctx.translate(bp.x, bp.y);
        ctx.rotate(spinAngle);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
        for (let k=0;k<3;k++) {
          const a = (k/3)*Math.PI*2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a)*2*bp.scale, Math.sin(a)*2*bp.scale);
          ctx.lineTo(Math.cos(a)*5.5*bp.scale, Math.sin(a)*5.5*bp.scale);
          ctx.stroke();
        }
        ctx.restore();
      }

      // aim reticle + shot preview line (only during aim)
      if (g.state === 'aim') {
        const target = g.project(g.aimX, g.aimY, g.Z0);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.setLineDash([5,6]);
        ctx.beginPath(); ctx.moveTo(bp.x,bp.y); ctx.lineTo(target.x,target.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2;
        ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(target.x, target.y, 10, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(target.x-14,target.y); ctx.lineTo(target.x+14,target.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(target.x,target.y-14); ctx.lineTo(target.x,target.y+14); ctx.stroke();
        ctx.restore();
      }
    };

    g.drawHUD = function(g, ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(6,10,18,0.55)';
      ctx.fillRect(0,0,g.w,40);
      ctx.restore();
      text(ctx, 'SCORE ' + Math.floor(g.score||0), 16, 26, 15, '#e2e8f0', 'left', 700);
      text(ctx, 'STREAK ' + g.streak, g.w/2, 26, 14, '#4ade80', 'center', 700);
      const dots = Array.from({length:g.maxMisses}, (_,i) => i<g.misses ? '●' : '○').join(' ');
      text(ctx, dots, g.w-16, 26, 14, '#f43f5e', 'right');

      // wind indicator — arrow + strength, always visible so it's a real factor to plan around
      const windDir = g.wind > 0 ? '\u2192' : '\u2190';
      const windMag = Math.abs(g.wind);
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      FX.roundRect(ctx, g.w/2-58, 46, 116, 22, 11); ctx.fill();
      ctx.restore();
      text(ctx, 'WIND ' + windDir + ' ' + windMag.toFixed(1), g.w/2, 61, 11, windMag>0.9?'#fbbf24':'rgba(255,255,255,0.5)', 'center', 700);

      if (g.state === 'aim') {
        const sw = 22, gap = 6, startX = 16, y = 50;
        g.BALL_SKINS.forEach((c,i) => {
          const bx = startX + i*(sw+gap);
          ctx.save();
          if (i===g.ballSkinIdx) { ctx.shadowColor = c; ctx.shadowBlur = 10; ctx.strokeStyle='#fff'; ctx.lineWidth=2; }
          ctx.fillStyle = c;
          ctx.beginPath(); ctx.arc(bx+sw/2, y+sw/2, sw/2, 0, 7); ctx.fill();
          if (i===g.ballSkinIdx) ctx.stroke();
          ctx.restore();
        });
        const kitStartX = startX + g.BALL_SKINS.length*(sw+gap) + 16;
        g.KIT_COLORS.forEach((c,i) => {
          const bx = kitStartX + i*(sw+gap);
          ctx.save();
          if (i===g.kitIdx) { ctx.shadowColor = c; ctx.shadowBlur = 10; ctx.strokeStyle='#fff'; ctx.lineWidth=2; }
          ctx.fillStyle = c;
          FX.roundRect(ctx, bx, y, sw, sw, 5); ctx.fill();
          if (i===g.kitIdx) ctx.stroke();
          ctx.restore();
        });
      }

      const barY = g.h - 46;
      if (g.state === 'power' || g.state === 'curve') {
        ctx.save();
        ctx.fillStyle = 'rgba(6,10,18,0.65)';
        ctx.fillRect(g.w/2-160, barY-8, 320, 40);
        ctx.restore();
        const val = g.state === 'power' ? g.power : (g.curve+1)/2;
        const label = g.state === 'power' ? 'POWER' : 'CURVE';
        text(ctx, label, g.w/2, barY-12, 11, '#c4b5fd', 'center', 700);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        FX.roundRect(ctx, g.w/2-150, barY, 300, 16, 8); ctx.fill();
        const col = g.state==='power' ? '#4ade80' : '#22d3ee';
        ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 10;
        ctx.fillStyle = col;
        const w = 4;
        ctx.fillRect(g.w/2-150 + val*300 - w/2, barY-2, w, 20);
        ctx.restore();
        if (g.state === 'power') {
          ctx.fillStyle = 'rgba(74,222,128,0.25)';
          ctx.fillRect(g.w/2-150+300*0.7, barY, 300*0.22, 16);
        }
      }
      if (g.state === 'aim') {
        text(ctx, 'Aim, then click to lock', g.w/2, barY+10, 13, 'rgba(255,255,255,0.5)', 'center');
      }
      if (g.state === 'result') {
        ctx.save();
        ctx.shadowColor = g.resultMsg==='GOAL!' ? '#4ade80' : '#f43f5e';
        ctx.shadowBlur = 20;
        ctx.fillStyle = g.resultMsg==='GOAL!' ? '#4ade80' : '#f43f5e';
        ctx.font = '700 34px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(g.resultMsg, g.w/2, g.h/2);
        ctx.restore();
      }
    };
  };

  function projPt(g, x, y, z) {
    const p = g.project(x, y, z);
    return [p.x, p.y];
  }
})();

window.GAME_PACK_6 = [GAME_FK];
