/* ==========================================================================
   player.js — le joueur n'a AUCUNE attaque.
   --------------------------------------------------------------------------
   Tout son vocabulaire est défensif : se déplacer, dasher, ralentir pour
   viser son placement, frôler pour charger l'adrénaline. Chaque outil est
   verrouillé au départ et se gagne via les objectifs.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.CFG, P = CFG.PLAYER;

  function Player(game) {
    this.game = game;
    this.reset();
  }

  Player.prototype.reset = function () {
    this.x = this.game.arena.cx;
    this.y = this.game.arena.cy;
    this.vx = 0; this.vy = 0;
    this.face = -Math.PI / 2;

    this.buffs = Object.create(null);
    this.dashMax = 1;
    this.dashCharges = 0;
    this.dashCd = 0;
    this.dashing = 0;
    this.iframes = 0;
    this.lastDashAt = -99;

    this.focus = false;
    this.adrenalin = 0;            // 0..1, se remplit en frôlant
    this.slowT = 0;
    this.wind = 0;                 // charges de « second souffle »

    this.outOfBounds = false;
    this.outRatio = 0;
    this.alive = true;
    this.grazeCd = new WeakMap();
    this.speedMul = 1;
    this.sludge = false;
    this.trailT = 0;
  };

  Player.prototype.has = function (id) { return !!this.buffs[id]; };

  Player.prototype.grant = function (id) {
    this.buffs[id] = true;
    if (id === 'dash') { this.dashMax = Math.max(this.dashMax, 1); this.dashCharges = this.dashMax; }
    if (id === 'dash2') { this.dashMax = 2; this.dashCharges = this.dashMax; }
    if (id === 'dash3') { this.dashMax = 3; this.dashCharges = this.dashMax; }
    if (id === 'wind') this.wind += 1;
    if (id === 'swift') this.speedMul *= 1.12;
  };

  Player.prototype.dashedSince = function (t) { return this.lastDashAt > t; };

  Player.prototype.grazeRadius = function () {
    return this.has('magnet') ? P.grazeRadiusMagnet : P.grazeRadius;
  };

  Player.prototype.iframeDuration = function () {
    const base = this.game.diff.dashIFrames;
    return this.has('phase') ? base * 2.1 + 0.08 : base;
  };

  /* --- Mise à jour -------------------------------------------------------- */
  Player.prototype.update = function (dt, input) {
    const d = this.game.diff;

    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.dashCd <= 0 && this.dashCharges < this.dashMax && this.has('dash')) {
      this.dashCharges++;
      if (this.dashCharges < this.dashMax) this.dashCd = d.dashCooldown;
    }
    if (this.iframes > 0) this.iframes -= dt;
    if (this.slowT > 0) this.slowT -= dt;

    // --- Focus : lent et précis. Le hitbox devient visible. ---------------
    this.focus = this.has('focus') && input.held('focus');

    // --- Dash -------------------------------------------------------------
    if (this.dashing > 0) {
      this.dashing -= dt;
      this.x += Math.cos(this.face) * P.dashSpeed * dt;
      this.y += Math.sin(this.face) * P.dashSpeed * dt;
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.012;
        this.game.fx.trail(this.x, this.y, '#4de3ff', 4.5);
      }
    } else {
      const ax = input.axis();
      if (ax.x || ax.y) this.face = Math.atan2(ax.y, ax.x);

      let speed = d.playerSpeed * this.speedMul;
      if (this.focus) speed *= P.focusMul;
      if (this.sludge) speed *= 0.62;

      const tvx = ax.x * speed, tvy = ax.y * speed;
      const acc = (ax.x || ax.y) ? P.accel : P.friction;
      this.vx = U.approach(this.vx, tvx, acc * dt);
      this.vy = U.approach(this.vy, tvy, acc * dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (this.has('dash') && this.dashCharges > 0 && input.tapped('dash')) {
        this.dashCharges--;
        if (this.dashCd <= 0) this.dashCd = d.dashCooldown;
        this.dashing = P.dashTime;
        this.iframes = this.iframeDuration();
        this.lastDashAt = this.game.elapsed;
        this.game.stats.dashes++;
        this.vx = Math.cos(this.face) * P.dashSpeed * 0.45;
        this.vy = Math.sin(this.face) * P.dashSpeed * 0.45;
        this.game.fx.ring(this.x, this.y, 14, 10, '#4de3ff', 200);
        this.game.audio.dash();
      }
    }

    // --- Adrénaline : ralentir le temps, payé en frôlements ----------------
    if (this.has('adrenalin') && this.adrenalin >= P.adrenalinCost && input.tapped('adren')) {
      this.adrenalin = 0;
      this.slowT = P.adrenalinDuration;
      this.game.fx.blink('#4de3ff', 0.2);
      this.game.fx.ring(this.x, this.y, 26, 18, '#4de3ff', 340);
      this.game.audio.slow();
      this.game.stats.adrenUses++;
    }

    // --- Terrain de la carte infinie --------------------------------------
    this.sludge = false;
    if (this.game.arena.endless) {
      const sl = this.game.arena.featureAt(this.x, this.y, 'sludge');
      if (sl) this.sludge = true;
      const ch = this.game.arena.featureAt(this.x, this.y, 'charge');
      if (ch && ch.used <= 0 && this.has('dash') && this.dashCharges < this.dashMax) {
        ch.used = 14;                                 // se recharge lentement
        this.dashCharges = this.dashMax;
        this.game.fx.text(this.x, this.y - 30, 'DASH RECHARGÉ', '#ffd166', 14);
        this.game.audio.pickup();
      }
      // Les piliers sont solides : on ne les traverse pas.
      const pil = this.game.arena.featureAt(this.x, this.y, 'pillar');
      if (pil) {
        const a = Math.atan2(this.y - pil.y, this.x - pil.x);
        this.x = pil.x + Math.cos(a) * (pil.r + P.hitbox);
        this.y = pil.y + Math.sin(a) * (pil.r + P.hitbox);
        if (this.dashing > 0) this.dashing = 0;
      }
      for (const f of this.game.arena.nearby) if (f.used > 0) f.used -= dt;
    }
  };

  /** Frôlement : récompense le jeu près des balles, punit la fuite. */
  Player.prototype.checkGraze = function (haz, dt) {
    const gr = this.grazeRadius();
    const d = haz.edge(this.x, this.y);
    if (d < 0 || d > gr) return;
    const until = this.grazeCd.get(haz) || 0;
    if (this.game.elapsed < until) return;
    this.grazeCd.set(haz, this.game.elapsed + CFG.PLAYER.grazeCooldown);

    this.game.stats.graze++;
    this.adrenalin = Math.min(1, this.adrenalin + 0.055);
    this.game.fx.spawn(this.x + U.vrr(-6, 6), this.y + U.vrr(-6, 6),
      U.vrr(-40, 40), U.vrr(-70, -20), 0.4, 2.2, '#4de3ff', 2, false);
    if (this.game.stats.graze % 10 === 0) this.game.audio.graze();
  };

  /** Encaisse : le second souffle sauve une fois, mais le prix est immédiat. */
  Player.prototype.tryAbsorb = function () {
    if (this.wind <= 0) return false;
    this.wind--;
    this.iframes = 1.1;
    this.adrenalin = 0;
    this.game.fx.blink('#ffd166', 0.6);
    this.game.fx.kick(20);
    this.game.fx.text(this.x, this.y - 46, 'SECOND SOUFFLE', '#ffd166', 20);
    this.game.audio.save();
    this.game.director.punish(2);
    return true;
  };

  /* --- Rendu -------------------------------------------------------------- */
  Player.prototype.draw = function (ctx) {
    const invuln = this.iframes > 0;
    const c = invuln ? '#ffd166' : '#4de3ff';

    // Rayon de frôlement : uniquement en focus, pour ne pas polluer l'écran.
    if (this.focus) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(77,227,255,.22)';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.grazeRadius(), 0, U.TAU); ctx.stroke();
    }

    U.glow(ctx, this.x, this.y, 30, U.rgba(c, invuln ? 0.42 : 0.26), U.rgba(c, 0));

    // Coque
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.face);
    ctx.fillStyle = U.rgba(c, this.focus ? 0.45 : 0.85);
    ctx.beginPath();
    ctx.moveTo(P.visual, 0);
    ctx.lineTo(-P.visual * 0.7, -P.visual * 0.72);
    ctx.lineTo(-P.visual * 0.35, 0);
    ctx.lineTo(-P.visual * 0.7, P.visual * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Le vrai hitbox — minuscule, toujours affiché : aucune mort inexpliquée.
    ctx.fillStyle = invuln ? '#ffd166' : '#ffffff';
    ctx.beginPath(); ctx.arc(this.x, this.y, P.hitbox, 0, U.TAU); ctx.fill();
    if (this.focus) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ff4d7a';
      ctx.beginPath(); ctx.arc(this.x, this.y, P.hitbox + 3, 0, U.TAU); ctx.stroke();
    }
  };

  root.Player = Player;
})(window);
