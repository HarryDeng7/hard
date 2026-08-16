/* ============================================================
   Life Quest · 横屏跑酷游戏引擎（马里奥风格）
   纯 Canvas 实现，无任何依赖
   ============================================================ */
(function () {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const W = 960, H = 540;          // 画布尺寸
  const TILE = 48;                 // 瓦片尺寸
  const GROUND_ROW = 8;            // 地面顶层所在行号
  const GROUND_TOP = GROUND_ROW * TILE; // 地面顶部 y = 384

  /* ---------------- 关卡数据 ---------------- */
  let level = null;      // { id, title, difficulty }
  let worldLen = 0;      // 世界总宽度(px)
  let totalTiles = 0;
  let ground = [];       // ground[xTile] = true/false
  let solids = new Map(); // "x,y" -> {x,y,type:'brick'|'block',used}
  let coins = [];        // {x,y,taken,hidden,spin}
  let spikes = [];       // {x,y}
  let bushes = [];       // 装饰
  let flag = null;       // {x,y,baseX}
  let totalCoins = 0;

  /* ---------------- 玩家 ---------------- */
  const PW = 32, PH = 44;
  const player = {
    x: 0, y: 0, vx: 0, vy: 0,
    onGround: false, facing: 1, runPhase: 0,
    coyote: 0, buffer: 0, dead: false, win: false
  };

  /* ---------------- 游戏状态 ---------------- */
  const G = {
    state: 'idle',   // idle | playing | paused | dead | win
    camX: 0, time: 0, coinCount: 0,
    wonNotified: false, deadNotified: false,
    dieTimer: 0, winTimer: 0, bump: null, bumpT: 0,
    shake: 0, particles: [], lastTs: 0
  };

  const keys = { left: false, right: false, jump: false };
  let rafId = 0;

  /* ---------------- 物理参数 ---------------- */
  const PHYS = {
    gravity: 2300, move: 340, accel: 2600, friction: 2400,
    jumpV: -790, maxFall: 980, coyote: 0.1, buffer: 0.14
  };

  /* ============================================================
     关卡生成
     ============================================================ */
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function buildLevel(lvl) {
    level = lvl;
    const diff = Math.min(5, Math.max(1, lvl.difficulty || 1));
    const rand = rng(hashStr(lvl.id));

    totalTiles = 78 + diff * 10;
    worldLen = totalTiles * TILE;
    ground = new Array(totalTiles).fill(true);

    /* ---- 挖坑（间距） ---- */
    const maxGap = diff <= 1 ? 1 : diff <= 3 ? 2 : 3;
    const gapChance = 0.07 + diff * 0.028;
    let x = 14;
    while (x < totalTiles - 16) {
      if (rand() < gapChance) {
        const g = 1 + Math.floor(rand() * maxGap);
        for (let i = 0; i < g && x + i < totalTiles - 16; i++) ground[x + i] = false;
        x += g + 1;
      } else {
        x += 2 + Math.floor(rand() * 3);
      }
    }

    /* ---- 放置特征（砖块/平台/金币/尖刺） ---- */
    coins = []; spikes = []; bushes = []; solids.clear();
    const brickChance = 0.16 + diff * 0.02;
    const platChance = 0.20;
    const spikeChance = diff >= 2 ? (diff - 1) * 0.06 : 0;
    const coinChance = 0.30;

    for (let i = 8; i < totalTiles - 12; i++) {
      if (!ground[i]) continue;

      const r = rand();

      /* 金币弧线 */
      if (r < coinChance) {
        const n = 3 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k++) {
          const tx = i + k;
          if (tx >= totalTiles - 12) break;
          const gy = GROUND_TOP - TILE * 1.5;
          if (ground[tx] && !occupied(tx, 1) && !occupied(tx, 2)) {
            coins.push({ x: tx * TILE + TILE / 2, y: gy, taken: false, spin: rand() * 6, hidden: false });
          }
        }
        i += n + 1;
        continue;
      }

      /* 浮动平台 + 上方金币 */
      if (r < coinChance + platChance) {
        const n = 2 + Math.floor(rand() * 3);
        const h = 1 + (rand() < 0.35 ? 1 : 0);
        let ok = true;
        for (let k = 0; k < n; k++) {
          if (!ground[i + k] || occupied(i + k, h) || occupied(i + k, h + 1)) { ok = false; break; }
        }
        if (ok) {
          for (let k = 0; k < n; k++) {
            solids.set(key(i + k, h), { x: (i + k) * TILE, y: GROUND_TOP - h * TILE, type: 'brick', used: false });
          }
          for (let k = 0; k < n; k++) {
            coins.push({ x: (i + k) * TILE + TILE / 2, y: GROUND_TOP - (h + 1) * TILE + 6, taken: false, spin: rand() * 6, hidden: false });
          }
          i += n + 1;
          continue;
        }
      }

      /* 砖块/问号块 */
      if (r < coinChance + platChance + brickChance && i < totalTiles - 14) {
        const h = 1 + (rand() < 0.3 ? 1 : 0);
        if (!occupied(i, h)) {
          const isQuestion = diff >= 2 && rand() < 0.5;
          solids.set(key(i, h), { x: i * TILE, y: GROUND_TOP - h * TILE, type: isQuestion ? 'block' : 'brick', used: false });
        }
        i += 1;
        continue;
      }

      /* 尖刺 */
      if (r < coinChance + platChance + brickChance + spikeChance && diff >= 2) {
        const n = 1 + Math.floor(rand() * 2);
        let ok = true;
        for (let k = 0; k < n; k++) {
          if (!ground[i + k] || occupied(i + k, 1)) { ok = false; break; }
        }
        if (ok) {
          for (let k = 0; k < n; k++) {
            spikes.push({ x: (i + k) * TILE, y: GROUND_TOP });
          }
          i += n + 1;
          continue;
        }
      }
    }

    /* ---- 装饰灌木 ---- */
    for (let i = 4; i < totalTiles; i += 3 + Math.floor(rand() * 4)) {
      if (ground[i]) bushes.push({ x: i * TILE + TILE / 2, s: 0.7 + rand() * 0.7 });
    }

    /* ---- 终点旗杆 ---- */
    const fx = (totalTiles - 3) * TILE;
    flag = {
      x: fx + TILE / 2,
      y: GROUND_TOP - 3 * TILE,
      baseX: fx,
      phase: 0
    };
    // 终点前补平地面
    for (let i = totalTiles - 10; i < totalTiles; i++) ground[i] = true;

    totalCoins = coins.filter(c => !c.hidden).length;
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function key(tx, ty) { return tx + ',' + ty; }
  function occupied(tx, ty) {
    if (solids.has(key(tx, ty))) return true;
    const cellY = GROUND_ROW - ty; // 高度 ty 的固体占据的格子行
    for (const c of coins) {
      if (!c.taken && !c.hidden && Math.floor(c.x / TILE) === tx && Math.floor(c.y / TILE) === cellY) return true;
    }
    for (const s of spikes) {
      if (Math.floor(s.x / TILE) === tx && ty === 1) return true;
    }
    return false;
  }

  /* ============================================================
     碰撞
     ============================================================ */
  function solidAt(tx, ty) {
    if (ty < 0 || tx < 0 || tx >= totalTiles) return null;
    if (ground[tx] && ty >= GROUND_ROW) return { x: tx * TILE, y: GROUND_TOP, type: 'ground' };
    return solids.get(key(tx, ty)) || null;
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function movePlayer(dt) {
    const p = player;
    const wasOnGround = p.onGround;

    /* 水平移动 */
    let target = 0;
    if (keys.left) target = -PHYS.move;
    if (keys.right) target = PHYS.move;
    if (target !== 0) {
      const rate = p.onGround ? PHYS.accel : PHYS.accel * 0.6;
      p.vx += Math.sign(target - p.vx) * Math.min(Math.abs(target - p.vx), rate * dt);
      p.facing = target > 0 ? 1 : -1;
    } else if (p.onGround) {
      const s = Math.sign(p.vx);
      p.vx -= s * Math.min(Math.abs(p.vx), PHYS.friction * dt);
    }

    /* 跳跃（输入缓冲 + 土狼时间） */
    if (keys.jump) p.buffer = PHYS.buffer;
    p.buffer -= dt;
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = PHYS.jumpV;
      p.onGround = false;
      p.coyote = 0;
      p.buffer = 0;
      spawnDust(4);
      sfx.jump();
    }

    p.coyote = p.onGround ? PHYS.coyote : p.coyote - dt;
    p.vy = Math.min(p.vy + PHYS.gravity * dt, PHYS.maxFall);

    /* X 轴移动 + 碰撞 */
    p.x += p.vx * dt;
    resolveAxis(true, p.vx * dt);

    /* Y 轴移动 + 碰撞 */
    const wasFalling = p.vy > 0;
    p.y += p.vy * dt;
    p.onGround = false;
    resolveAxis(false, p.vy * dt);
    if (wasFalling && p.onGround && !wasOnGround) spawnDust(5);

    /* 跑动尘土 */
    if (p.onGround && Math.abs(p.vx) > 10) {
      p.runPhase += dt * (10 + Math.abs(p.vx) / 40);
      if (Math.random() < dt * 14) spawnDust(1, true);
    } else {
      p.runPhase = 0;
    }

    /* 动画翻转 */
    if (!p.onGround && p.vy < 0) p.runPhase = -1.5;
  }

  function resolveAxis(horizontal, disp) {
    const p = player;
    if (disp === 0) return;
    /* 按位移分小步推进，防止高速穿透 */
    const steps = Math.max(1, Math.ceil(Math.abs(disp) / 2));
    const step = disp / steps;
    for (let i = 0; i < steps; i++) {
      if (horizontal) p.x += step; else p.y += step;
      for (const c of candidates()) {
        if (!rectsOverlap(p.x, p.y, PW, PH, c.x, c.y, TILE, TILE)) continue;
        if (horizontal) {
          if (step > 0) p.x = c.x - PW;
          else p.x = c.x + TILE;
          p.vx = 0;
        } else if (step > 0) {
          p.y = c.y - PH;
          p.vy = 0;
          p.onGround = true;
        } else {
          p.y = c.y + TILE;
          p.vy = 0;
          bumpBlock(c);
        }
        return;
      }
    }
  }

  function candidates() {
    const p = player;
    const out = [];
    const x0 = Math.floor(p.x / TILE) - 1, x1 = Math.floor((p.x + PW) / TILE) + 1;
    const y0 = Math.floor(p.y / TILE) - 1, y1 = Math.floor((p.y + PH) / TILE) + 1;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const s = solidAt(tx, ty);
        if (s) out.push(s);
      }
    }
    return out;
  }

  function bumpBlock(c) {
    if (c.type !== 'block') return;
    if (c.used) { sfx.thud(); return; }
    c.used = true;
    G.bump = c;
    G.bumpT = 0.25;
    spawnCoinBurst(c.x + TILE / 2, c.y);
    G.coinCount++;
    sfx.coin();
    updateHudCoins();
  }

  /* ============================================================
     交互：金币 / 尖刺 / 旗杆
     ============================================================ */
  function checkPickups() {
    const p = player;
    for (const c of coins) {
      if (c.taken || c.hidden) continue;
      if (rectsOverlap(p.x, p.y, PW, PH, c.x - 16, c.y - 16, 32, 32)) {
        c.taken = true;
        G.coinCount++;
        spawnCoinBurst(c.x, c.y);
        sfx.coin();
        updateHudCoins();
      }
    }
    for (const s of spikes) {
      if (rectsOverlap(p.x + 6, p.y + 6, PW - 12, PH - 12, s.x + 6, s.y - 20, TILE - 12, 20)) {
        die();
        return;
      }
    }
    if (flag && p.x + PW > flag.x - 12 && !G.wonNotified) {
      win();
    }
  }

  function updateHudCoins() {
    const el = document.getElementById('hud-coins');
    if (el) el.textContent = '🪙 ' + G.coinCount;
  }

  function die() {
    if (G.state === 'dead' || G.state === 'win') return;
    G.state = 'dead';
    G.dieTimer = 1.0;
    G.shake = 0.5;
    player.dead = true;
    player.vy = -620;
    player.vx = 0;
    sfx.death();
  }

  function win() {
    G.state = 'win';
    G.winTimer = 1.6;
    player.win = true;
    player.dead = false;
    player.vx = 0;
    player.vy = 0;
    sfx.win();
    for (let i = 0; i < 40; i++) fireworks();
  }

  /* ============================================================
     粒子
     ============================================================ */
  function spawnDust(n, behind) {
    for (let i = 0; i < n; i++) {
      G.particles.push({
        x: player.x + PW / 2 + (Math.random() - 0.5) * 20,
        y: player.y + PH,
        vx: (Math.random() - 0.5) * 60 + (behind ? -player.vx * 0.15 : 0),
        vy: -Math.random() * 50 - 20,
        life: 0.35 + Math.random() * 0.25,
        age: 0, size: 3 + Math.random() * 3,
        color: 'rgba(148,163,184,0.8)', grav: 0
      });
    }
  }
  function spawnCoinBurst(x, y) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 130;
      G.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 0.5 + Math.random() * 0.3, age: 0, size: 3 + Math.random() * 3,
        color: '#fbbf24', grav: 260
      });
    }
  }
  function fireworks() {
    G.particles.push({
      x: flag.x, y: flag.y - 20 + Math.random() * 30,
      vx: (Math.random() - 0.5) * 320, vy: (Math.random() - 0.5) * 320 - 60,
      life: 1 + Math.random() * 0.6, age: 0, size: 3 + Math.random() * 3,
      color: ['#f59e0b', '#22c55e', '#3b82f6', '#ef4444', '#e2e8f0'][Math.floor(Math.random() * 5)],
      grav: 140
    });
  }

  function updateParticles(dt) {
    const list = G.particles;
    for (let i = list.length - 1; i >= 0; i--) {
      const pt = list[i];
      pt.age += dt;
      if (pt.age >= pt.life) { list.splice(i, 1); continue; }
      pt.vy += (pt.grav || 0) * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
  }

  /* ============================================================
     主循环
     ============================================================ */
  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    if (G.state === 'idle') { render(); return; }

    let dt = (ts - G.lastTs) / 1000;
    G.lastTs = ts;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05); // 防止切后台后时间跳跃

    if (G.state === 'playing') {
      G.time += dt;
      G.bumpT = Math.max(0, G.bumpT - dt);
      movePlayer(dt);
      checkPickups();

      /* 掉坑 */
      if (player.y > H + 80) die();

      /* 相机 */
      const target = player.x - W * 0.35;
      G.camX += (target - G.camX) * Math.min(1, dt * 8);
      G.camX = Math.max(0, Math.min(G.camX, worldLen - W));
      flag.phase += dt * 4;
    }

    if (G.state === 'dead') {
      G.dieTimer -= dt;
      G.shake = Math.max(0, G.shake - dt * 0.8);
      player.vy += PHYS.gravity * dt;
      player.y += player.vy * dt;
      updateParticles(dt);
      if (G.dieTimer <= 0 && !G.deadNotified) {
        G.deadNotified = true;
        if (window.App) App.onLevelFailed(level.id);
        showOverlay('overlay-fail');
      }
    }

    if (G.state === 'win') {
      G.winTimer -= dt;
      G.time += dt;
      flag.phase += dt * 6;
      /* 滑到旗杆下站定 */
      player.x += (flag.x - PW / 2 - player.x) * Math.min(1, dt * 6);
      const targetY = GROUND_TOP - PH;
      if (player.y < targetY) {
        player.vy += PHYS.gravity * dt;
        player.y += player.vy * dt;
        if (player.y >= targetY) { player.y = targetY; player.vy = 0; }
      }
      if (Math.random() < dt * 25) fireworks();
      updateParticles(dt);
      if (G.winTimer <= 0 && !G.wonNotified) {
        G.wonNotified = true;
        if (window.App) App.onLevelWon(level.id, { coins: G.coinCount, time: G.time });
        showOverlay('overlay-win');
      }
    }

    updateParticles(dt);
    render();
  }
  /* ============================================================
     渲染
     ============================================================ */
  function render() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    /* 天空 */
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0b1120');
    sky.addColorStop(0.55, '#131c33');
    sky.addColorStop(1, '#1b2a4a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    /* 星星 */
    ctx.fillStyle = 'rgba(226,232,240,0.55)';
    for (let i = 0; i < 26; i++) {
      const sx = ((i * 137 + 61) % (W + 100)) - 50;
      const sy = ((i * 89 + 23) % 260) + 10;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(performance.now() / 900 + i));
      ctx.globalAlpha = tw * 0.6;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;

    /* 远景山 */
    drawHills(0.25, '#0d1b33', 170);
    drawHills(0.4, '#112442', 130);

    /* 云 */
    ctx.fillStyle = 'rgba(148,163,184,0.16)';
    for (let i = 0; i < 9; i++) {
      const cx = ((i * 431 + 97) % (W + 300)) - (G.camX * 0.15 % (W + 300)) - 150;
      const cy = 46 + (i * 71) % 120;
      cloud(cx, cy, 60 + (i % 3) * 30);
    }

    /* 相机 */
    ctx.save();
    const shakeX = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 14 : 0;
    const shakeY = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 14 : 0;
    ctx.translate(-Math.round(G.camX) + shakeX, shakeY);

    const t0 = Math.floor(G.camX / TILE) - 1;
    const t1 = Math.ceil((G.camX + W) / TILE) + 1;

    /* 地面（3 层土 + 底部填充） */
    for (let tx = Math.max(0, t0); tx <= Math.min(totalTiles - 1, t1); tx++) {
      if (!ground[tx]) continue;
      const x = tx * TILE;
      drawTileRect(x, GROUND_TOP, TILE, TILE, '#5b3416', '#7c4a21');
      drawTileRect(x, GROUND_TOP + TILE, TILE, TILE, '#4a2c12', '#5b3416');
      drawTileRect(x, GROUND_TOP + TILE * 2, TILE, TILE, '#3d2410', '#4a2c12');
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(x, GROUND_TOP, TILE, 10);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(x, GROUND_TOP, TILE, 4);
    }

    /* 坑底 */
    for (let tx = Math.max(0, t0); tx <= Math.min(totalTiles - 1, t1); tx++) {
      if (ground[tx]) continue;
      ctx.fillStyle = '#0a0f1e';
      ctx.fillRect(tx * TILE, GROUND_TOP + 10, TILE, H);
    }

    /* 尖刺 */
    for (const s of spikes) drawSpike(s);

    /* 固体块 */
    for (const [k, s] of solids) {
      const [tx] = k.split(',').map(Number);
      if (tx < t0 - 1 || tx > t1 + 1) continue;
      if (s.type === 'brick') drawBrick(s);
      else drawQuestion(s);
    }

    /* 金币 */
    for (const c of coins) {
      if (c.taken || c.hidden) continue;
      if (c.x < G.camX - 60 || c.x > G.camX + W + 60) continue;
      c.spin += 0.07;
      drawCoin(c);
    }

    /* 灌木 */
    for (const b of bushes) {
      if (b.x < G.camX - 80 || b.x > G.camX + W + 80) continue;
      drawBush(b);
    }

    /* 旗杆 */
    drawFlag();

    /* 玩家 */
    if (G.state !== 'idle') drawPlayer();

    /* 粒子 */
    for (const pt of G.particles) {
      ctx.globalAlpha = 1 - pt.age / pt.life;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    /* HUD */
    if (G.state === 'playing' || G.state === 'win') drawHud();

    /* 终点指示 */
    if (G.state === 'playing') drawGoalMarker();

    ctx.restore();
  }

  function drawHills(par, color, baseY) {
    ctx.fillStyle = color;
    const off = G.camX * par;
    const span = 420;
    const n = Math.ceil(W / span) + 2;
    for (let i = 0; i < n; i++) {
      const cx = i * span - (off % span) - span + (i * 97) % span * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx - 220, baseY + 220);
      ctx.quadraticCurveTo(cx, baseY - 130, cx + 220, baseY + 220);
      ctx.closePath();
      ctx.fill();
    }
  }

  function cloud(cx, cy, size) {
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
    ctx.arc(cx + size * 0.4, cy + 8, size * 0.35, 0, Math.PI * 2);
    ctx.arc(cx - size * 0.4, cy + 10, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTileRect(x, y, w, h, dark, light) {
    ctx.fillStyle = dark;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = light;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = dark;
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  }

  function drawBrick(s) {
    const x = s.x, y = s.y;
    ctx.fillStyle = '#92400e';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#b45309';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
    ctx.beginPath();
    ctx.moveTo(x + 3, y + TILE / 2);
    ctx.lineTo(x + TILE - 3, y + TILE / 2);
    ctx.moveTo(x + TILE / 2, y + 3);
    ctx.lineTo(x + TILE / 2, y + TILE - 3);
    ctx.stroke();
  }

  function drawQuestion(s) {
    const x = s.x, y = s.y - (G.bump === s ? Math.sin((1 - G.bumpT / 0.25) * Math.PI) * 14 : 0);
    if (G.bump === s && G.bumpT <= 0) G.bump = null;
    ctx.fillStyle = s.used ? '#78350f' : '#92400e';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = s.used ? '#92400e' : '#f59e0b';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.strokeStyle = s.used ? '#78350f' : '#b45309';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
    if (!s.used) {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 26px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', x + TILE / 2, y + TILE / 2 + 2);
    }
  }

  function drawCoin(c) {
    const s = Math.abs(Math.sin(c.spin));
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(Math.max(0.15, s), 1);
    ctx.fillStyle = 'rgba(251,191,36,0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
    ctx.restore();
  }

  function drawSpike(s) {
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(s.x + 4, s.y);
    ctx.lineTo(s.x + TILE / 2, s.y - 24);
    ctx.lineTo(s.x + TILE - 4, s.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(s.x + 8, s.y);
    ctx.lineTo(s.x + TILE / 2, s.y - 20);
    ctx.lineTo(s.x + TILE - 8, s.y);
    ctx.closePath();
    ctx.fill();
  }

  function drawBush(b) {
    ctx.fillStyle = '#14532d';
    ctx.beginPath();
    ctx.arc(b.x - 14 * b.s, GROUND_TOP + 6, 14 * b.s, 0, Math.PI * 2);
    ctx.arc(b.x, GROUND_TOP + 4, 18 * b.s, 0, Math.PI * 2);
    ctx.arc(b.x + 14 * b.s, GROUND_TOP + 6, 14 * b.s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#166534';
    ctx.beginPath();
    ctx.arc(b.x - 6 * b.s, GROUND_TOP + 2, 10 * b.s, 0, Math.PI * 2);
    ctx.arc(b.x + 8 * b.s, GROUND_TOP + 2, 11 * b.s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFlag() {
    const px = flag.x, py = flag.y;
    /* 底座 */
    ctx.fillStyle = '#475569';
    ctx.fillRect(flag.baseX, GROUND_TOP, TILE, TILE);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(flag.baseX + 4, GROUND_TOP + 4, TILE - 8, TILE - 8);
    /* 旗杆 */
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(px - 4, py, 8, GROUND_TOP - py);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(px, py - 4, 9, 0, Math.PI * 2);
    ctx.fill();
    /* 旗面 */
    const wave = Math.sin(flag.phase) * 5;
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(px + 4, py + 6);
    ctx.quadraticCurveTo(px + 34, py + 6 + wave * 0.4, px + 62, py + 16 + wave);
    ctx.lineTo(px + 62, py + 44 + wave);
    ctx.quadraticCurveTo(px + 34, py + 38 + wave * 0.4, px + 4, py + 40);
    ctx.closePath();
    ctx.fill();
    /* 勾 */
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px + 16, py + 26);
    ctx.lineTo(px + 26, py + 36);
    ctx.lineTo(px + 52, py + 14);
    ctx.stroke();
  }

  function drawPlayer() {
    const p = player;
    ctx.save();
    ctx.translate(Math.round(p.x + PW / 2), Math.round(p.y + PH - 18));

    if (p.dead) {
      ctx.rotate(1.2);
      ctx.globalAlpha = 0.85;
    }
    const run = Math.sin(p.runPhase * 6) * 4;
    const leg = p.onGround ? run : (p.vy < 0 ? -6 : 5);

    /* 脚下阴影 */
    ctx.fillStyle = 'rgba(2,6,23,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 16, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    /* 身体（背带裤） */
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(-11, -8, 22, 16);
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(-11, 2, 22, 6);
    /* 腿 */
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(-10, 8 + leg * 0.35, 8, 6);
    ctx.fillRect(2, 8 - leg * 0.35, 8, 6);
    /* 鞋 */
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-11, 14 + leg * 0.35, 10, 4);
    ctx.fillRect(1, 14 - leg * 0.35, 10, 4);

    /* 头 */
    ctx.fillStyle = '#fcd9b8';
    ctx.fillRect(-12, -22, 24, 16);
    /* 帽子 */
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-13, -28, 27, 9);
    ctx.fillRect(-13 + p.facing * 10, -24, 12, 5);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-13, -28, 27, 2);

    /* 眼睛 */
    ctx.fillStyle = '#0f172a';
    const ex = p.facing * 4;
    if (p.dead) {
      ctx.fillRect(-8 + ex, -18, 5, 2);
      ctx.fillRect(-8 + ex, -14, 5, 2);
      ctx.fillRect(-1 + ex, -18, 5, 2);
      ctx.fillRect(-1 + ex, -14, 5, 2);
    } else {
      ctx.beginPath();
      ctx.arc(-5 + ex, -14, 2.4, 0, Math.PI * 2);
      ctx.arc(4 + ex, -14, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    /* 胡子 */
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-10 + ex, -8, 10, 2.5);
    ctx.restore();
  }

  function drawHud() {
    const pad = 14;
    /* 金币 */
    ctx.fillStyle = 'rgba(15,23,42,0.65)';
    roundRect(ctx, pad, pad, 150, 34, 10);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🪙 ' + G.coinCount + ' / ' + totalCoins, pad + 12, pad + 18);

    /* 时间 */
    const t = fmtTime(G.time);
    ctx.fillStyle = 'rgba(15,23,42,0.65)';
    roundRect(ctx, W - pad - 110, pad, 110, 34, 10);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('⏱ ' + t, W - pad - 96, pad + 18);

    /* 进度条 */
    const bw = 240, bx = W / 2 - bw / 2;
    ctx.fillStyle = 'rgba(15,23,42,0.65)';
    roundRect(ctx, bx, pad, bw, 34, 10);
    ctx.fill();
    const prog = Math.min(1, player.x / (worldLen - W * 0.35));
    ctx.fillStyle = 'rgba(245,158,11,0.25)';
    roundRect(ctx, bx + 4, pad + 4, (bw - 8) * prog, 26, 7);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    roundRect(ctx, bx + 4, pad + 4, Math.max(4, (bw - 8) * prog), 8, 4);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(prog * 100) + '%', W / 2, pad + 18);
  }

  function drawGoalMarker() {
    const fx = flag.x;
    if (fx >= G.camX && fx <= G.camX + W) return;
    const dir = fx > G.camX + W ? 1 : -1;
    const mx = dir > 0 ? W - 46 : 46;
    const my = H - 60 + Math.sin(performance.now() / 300) * 6;
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dir > 0 ? '🏁 →' : '← 🏁', mx, my);
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* ============================================================
     音效（WebAudio 合成，无外部资源）
     ============================================================ */
  const sfx = (function () {
    let actx = null;
    function ctxNow() {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }
    function tone(freq, dur, type, vol, slideTo) {
      try {
        const ac = ctxNow();
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, ac.currentTime);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
        g.gain.setValueAtTime(vol, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
        o.connect(g).connect(ac.destination);
        o.start();
        o.stop(ac.currentTime + dur + 0.02);
      } catch (e) { /* 静音模式 */ }
    }
    return {
      jump() { tone(320, 0.18, 'square', 0.06, 560); },
      coin() { tone(880, 0.07, 'square', 0.07); setTimeout(() => tone(1320, 0.14, 'square', 0.07), 60); },
      thud() { tone(160, 0.08, 'triangle', 0.09, 90); },
      death() { tone(440, 0.55, 'sawtooth', 0.09, 90); },
      win() {
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'square', 0.08), i * 130));
      }
    };
  })();

  /* ============================================================
     遮罩控制
     ============================================================ */
  const overlays = {
    intro: document.getElementById('overlay-intro'),
    pause: document.getElementById('overlay-pause'),
    win: document.getElementById('overlay-win'),
    fail: document.getElementById('overlay-fail')
  };
  function showOverlay(name) { overlays[name].hidden = false; }
  function hideOverlay(name) { overlays[name].hidden = true; }
  function hideAllOverlays() {
    Object.values(overlays).forEach(o => { o.hidden = true; });
  }

  /* ============================================================
     输入
     ============================================================ */
  document.addEventListener('keydown', (e) => {
    if (G.state === 'idle') return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { keys.jump = true; e.preventDefault(); }
    if (e.code === 'KeyP') {
      if (G.state === 'playing') pause();
      else if (G.state === 'paused') resume();
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') keys.jump = false;
  });

  /* 触控按钮 */
  document.querySelectorAll('#touch-controls [data-key]').forEach(btn => {
    const k = btn.dataset.key;
    const set = (v) => (e) => { e.preventDefault(); keys[k] = v; };
    btn.addEventListener('touchstart', set(true), { passive: false });
    btn.addEventListener('touchend', set(false), { passive: false });
    btn.addEventListener('touchcancel', set(false), { passive: false });
    btn.addEventListener('pointerdown', set(true));
    btn.addEventListener('pointerup', set(false));
    btn.addEventListener('pointerleave', set(false));
  });

  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.getElementById('touch-controls').hidden = false;
  }

  window.addEventListener('blur', () => { if (G.state === 'playing') pause(); });

  /* ============================================================
     对外 API
     ============================================================ */
  function load(lvl) {
    buildLevel(lvl);
    resetPlayer();
    G.state = 'idle';
    G.camX = 0; G.time = 0; G.coinCount = 0;
    G.wonNotified = false; G.deadNotified = false;
    G.shake = 0; G.particles = [];
    document.getElementById('hud-coins').textContent = '🪙 0';
    hideAllOverlays();
    render();
  }

  function resetPlayer() {
    player.x = 2.5 * TILE;
    player.y = GROUND_TOP - PH;
    player.vx = 0; player.vy = 0;
    player.onGround = true;
    player.facing = 1; player.coyote = 0; player.buffer = 0;
    player.dead = false; player.win = false;
  }

  function showIntro() {
    G.state = 'idle';
    hideAllOverlays();
    showOverlay('intro');
    render();
  }

  function start() {
    if (G.state !== 'idle') return;
    hideOverlay('intro');
    G.state = 'playing';
    G.lastTs = performance.now();
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function pause() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    showOverlay('pause');
  }

  function resume() {
    if (G.state !== 'paused') return;
    hideOverlay('pause');
    G.state = 'playing';
    G.lastTs = performance.now();
  }

  function restart() {
    buildLevel(level);
    resetPlayer();
    G.state = 'playing';
    G.time = 0; G.coinCount = 0;
    G.wonNotified = false; G.deadNotified = false;
    G.shake = 0; G.particles = []; G.bump = null;
    G.camX = 0;
    document.getElementById('hud-coins').textContent = '🪙 0';
    hideAllOverlays();
    G.lastTs = performance.now();
  }

  function stop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    G.state = 'idle';
    keys.left = keys.right = keys.jump = false;
    hideAllOverlays();
  }

  function isPaused() { return G.state === 'paused'; }

  window.Game = { load, showIntro, start, pause, resume, restart, stop, isPaused };

  /* 工具 */
  function fmtTime(s) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  /* 首帧渲染 */
  render();
})();
