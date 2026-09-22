/* ==========================================================================
   lol/arena.js — terrain et caméra du mode LoL
   Caméra qui suit le champion, comme la vue de jeu par défaut.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U;

  function Arena(game) {
    this.game = game;
    this.cx = 0; this.cy = 0;
    this.radius = 1200;
    this.camX = 0; this.camY = 0;
    this.outTimer = 0;
  }

  Arena.prototype.init = function (diff) {
    this.diff = diff;
    this.baseRadius = diff.arenaRadius;
    this.radius = this.targetRadius = this.baseRadius;
    this.cx = this.cy = 0;
    this.camX = this.camY = 0;
    this.outTimer = 0;
  };

  /* Le mode LoL n'a pas de piliers : les seuls bloqueurs sont les sbires. */
  Arena.prototype.blocks = function () { return null; };

  Arena.prototype.update = function (dt, player, elapsed) {
    const d = this.diff;
    const phase = Math.floor(elapsed / d.shrinkPeriod);
    const k = (elapsed % d.shrinkPeriod) / d.shrinkPeriod;
    const floor = U.lerp(1, d.shrinkTo, U.clamp(phase / 4, 0, 1));
    this.targetRadius = this.baseRadius * U.lerp(floor, floor * 0.88, U.smooth(k));
    this.radius = U.approach(this.radius, this.targetRadius, 120 * dt);

    const out = U.dist(player.x, player.y, this.cx, this.cy) - this.radius;
    if (out > 0) {
      this.outTimer += dt;
      player.outOfBounds = true;
      player.outRatio = U.clamp(this.outTimer / d.outOfBoundsGrace, 0, 1);
      if (this.outTimer >= d.outOfBoundsGrace) return 'collapse';
    } else {
      this.outTimer = Math.max(0, this.outTimer - dt * 2.2);
      player.outOfBounds = false;
      player.outRatio = this.outTimer / d.outOfBoundsGrace;
    }
    return null;
  };

  Arena.prototype.updateCamera = function (dt, player) {
    // Suivi souple avec une légère avance sur le déplacement : on voit venir
    // ce vers quoi on court, comme avec la caméra semi-verrouillée.
    const tx = player.x + player.vx * 0.12;
    const ty = player.y + player.vy * 0.12;
    const s = 1 - Math.pow(0.0009, dt);
    this.camX += (tx - this.camX) * s;
    this.camY += (ty - this.camY) * s;
  };

  Arena.prototype.innerRadius = function () { return this.radius * 0.45; };

  Arena.prototype.drawFloor = function (ctx, view) {
    const g = 260;                       // grille à l'échelle LoL
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(90,110,190,.075)';
    ctx.beginPath();
    for (let x = Math.floor(view.x0 / g) * g; x < view.x1; x += g) { ctx.moveTo(x, view.y0); ctx.lineTo(x, view.y1); }
    for (let y = Math.floor(view.y0 / g) * g; y < view.y1; y += g) { ctx.moveTo(view.x0, y); ctx.lineTo(view.x1, y); }
    ctx.stroke();
  };

  Arena.prototype.drawBounds = function (ctx, view, elapsed) {
    const danger = this.outTimer > 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    ctx.arc(this.cx, this.cy, this.radius, 0, U.TAU, true);
    ctx.fillStyle = danger ? 'rgba(120,10,25,.42)' : 'rgba(80,10,30,.26)';
    ctx.fill();
    ctx.restore();

    const shrinking = this.radius - this.targetRadius > 2;
    ctx.save();
    ctx.lineWidth = shrinking ? 9 : 6;
    ctx.strokeStyle = danger ? '#ff3b30' : (shrinking ? '#ff8a3d' : 'rgba(120,150,255,.55)');
    ctx.setLineDash([46, 34]);
    ctx.lineDashOffset = -elapsed * 70;
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.radius, 0, U.TAU); ctx.stroke();
    ctx.restore();

    const ch = this.game.objectives && this.game.objectives.activeChallenge;
    if (ch && ch.cond === 'inner') {
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,209,102,.55)';
      ctx.setLineDash([22, 26]);
      ctx.lineDashOffset = elapsed * 90;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, this.innerRadius(), 0, U.TAU); ctx.stroke();
      ctx.restore();
    }
  };

  root.LolArena = Arena;
})(window);
