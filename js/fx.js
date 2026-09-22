/* ==========================================================================
   fx.js — particules, secousses, textes flottants, flashs
   Tout est en pool fixe : aucune allocation pendant le jeu.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U;

  const MAX_P = 900;

  function Fx() {
    this.p = new Array(MAX_P);
    for (let i = 0; i < MAX_P; i++) {
      this.p[i] = { on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 2, c: '#fff', drag: 2.2, glow: false };
    }
    this.head = 0;
    this.texts = [];
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flash = 0;
    this.flashColor = '#fff';
    this.quality = 'high';
    this.shakeEnabled = true;
  }

  Fx.prototype.reset = function () {
    for (let i = 0; i < MAX_P; i++) this.p[i].on = false;
    this.texts.length = 0;
    this.shake = this.shakeX = this.shakeY = this.flash = 0;
  };

  Fx.prototype.spawn = function (x, y, vx, vy, life, r, c, drag, glow) {
    const q = this.p[this.head];
    this.head = (this.head + 1) % MAX_P;
    q.on = true; q.x = x; q.y = y; q.vx = vx; q.vy = vy;
    q.life = life; q.max = life; q.r = r; q.c = c;
    q.drag = drag === undefined ? 2.2 : drag;
    q.glow = !!glow;
  };

  /** Gerbe radiale (explosions, morts, impacts). */
  Fx.prototype.burst = function (x, y, n, color, speed, size, life) {
    if (this.quality === 'low') n = Math.ceil(n * 0.4);
    for (let i = 0; i < n; i++) {
      const a = U.rr(0, U.TAU), s = U.rr(speed * 0.25, speed);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s,
        U.rr(life * 0.55, life), U.rr(size * 0.5, size), color, 2.4, true);
    }
  };

  /** Anneau net vers l'extérieur (onde de choc). */
  Fx.prototype.ring = function (x, y, n, radius, color, speed) {
    if (this.quality === 'low') n = Math.ceil(n * 0.45);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * U.TAU;
      this.spawn(x + Math.cos(a) * radius, y + Math.sin(a) * radius,
        Math.cos(a) * speed, Math.sin(a) * speed, U.rr(0.3, 0.55), U.rr(1.6, 3), color, 3.0, false);
    }
  };

  /** Traînée discrète (dash, projectiles rapides). */
  Fx.prototype.trail = function (x, y, color, size) {
    if (this.quality === 'low' && Math.random() < 0.5) return;
    this.spawn(x + U.rr(-2, 2), y + U.rr(-2, 2), U.rr(-18, 18), U.rr(-18, 18),
      U.rr(0.18, 0.34), size || 2.6, color, 4.5, false);
  };

  Fx.prototype.text = function (x, y, str, color, size, rise) {
    this.texts.push({ x, y, s: str, c: color || '#fff', size: size || 15, life: 1.1, max: 1.1, rise: rise === undefined ? 44 : rise });
    if (this.texts.length > 24) this.texts.shift();
  };

  Fx.prototype.kick = function (amount) {
    if (!this.shakeEnabled) return;
    this.shake = Math.min(this.shake + amount, 34);
  };

  Fx.prototype.blink = function (color, amount) {
    this.flash = Math.max(this.flash, amount);
    this.flashColor = color;
  };

  Fx.prototype.update = function (dt) {
    for (let i = 0; i < MAX_P; i++) {
      const q = this.p[i];
      if (!q.on) continue;
      q.life -= dt;
      if (q.life <= 0) { q.on = false; continue; }
      const d = Math.max(0, 1 - q.drag * dt);
      q.vx *= d; q.vy *= d;
      q.x += q.vx * dt; q.y += q.vy * dt;
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= t.rise * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 46);
      this.shakeX = U.rr(-this.shake, this.shake);
      this.shakeY = U.rr(-this.shake, this.shake);
    } else { this.shakeX = this.shakeY = 0; }

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.6);
  };

  Fx.prototype.drawParticles = function (ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < MAX_P; i++) {
      const q = this.p[i];
      if (!q.on) continue;
      const a = q.life / q.max;
      ctx.globalAlpha = a * a;
      ctx.fillStyle = q.c;
      const r = q.r * (0.4 + a * 0.6);
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, U.TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  Fx.prototype.drawTexts = function (ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const a = U.clamp(t.life / t.max * 1.6, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = '800 ' + t.size + 'px Segoe UI, Inter, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,.65)';
      ctx.strokeText(t.s, t.x, t.y);
      ctx.fillStyle = t.c;
      ctx.fillText(t.s, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  };

  /** Voile plein écran (dessiné en espace écran, après la caméra). */
  Fx.prototype.drawFlash = function (ctx, w, h) {
    if (this.flash <= 0) return;
    ctx.globalAlpha = Math.min(this.flash, 0.85);
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  };

  root.Fx = Fx;
})(window);
