/* ==========================================================================
   lol/player.js — le champion joueur. Aucune attaque, aucun sort offensif.
   --------------------------------------------------------------------------
   Déplacement LoL : on donne un ORDRE (clic droit), le champion part à
   vitesse pleine vers ce point — aucune inertie, aucune accélération. Tout
   le skill est dans le choix du point et l'instant du re-clic.

   Contrôle de foule, fidèle au jeu :
     root    -> immobilisé, mais le Flash passe encore
     pull    -> tiré vers le lanceur, puis immobilisé
     knockup -> projeté : plus rien ne répond
     slow    -> vitesse réduite
   Un CC ne tue pas. Il te met en position de mourir du sort d'après.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.LOLCFG, P = CFG.PLAYER;

  function Player(game) {
    this.game = game;
    this.reset();
  }

  Player.prototype.reset = function () {
    this.x = this.game.arena.cx;
    this.y = this.game.arena.cy;
    this.vx = 0; this.vy = 0;
    this.face = -Math.PI / 2;
    this.moveTarget = null;

    this.buffs = Object.create(null);
    this.msBonus = 0;

    this.rootT = 0;
    this.knockT = 0;
    this.slowT = 0; this.slowAmt = 0;
    this.pull = null;              // traction de grappin en cours
    this.queuedOrder = null;       // ordre donné pendant un CC, joué à sa fin

    this.flashCd = 0;
    this.dashMax = 1; this.dashCharges = 0; this.dashCd = 0;
    this.dashing = 0; this.dashAng = 0;
    this.cleanseCd = 0;
    this.zhonyaCd = 0; this.zhonyaT = 0;
    this.shieldUp = false; this.shieldCd = 0;

    this.iframes = 0;
    this.alive = true;
    this.outOfBounds = false;
    this.outRatio = 0;
    this.clickFx = 0;
    this.clickX = 0; this.clickY = 0;
    this.lastOrderAt = -99;
  };

  Player.prototype.has = function (id) { return !!this.buffs[id]; };

  Player.prototype.grant = function (id) {
    this.buffs[id] = true;
    if (id === 'boots' || id === 'boots2') this.msBonus += 45;
    if (id === 'dash') { this.dashMax = Math.max(1, this.dashMax); this.dashCharges = this.dashMax; }
    if (id === 'dash2') { this.dashMax = 2; this.dashCharges = this.dashMax; }
    if (id === 'shield') this.shieldUp = true;
  };

  Player.prototype.ccMul = function () {
    return this.game.diff.ccMul * (this.has('tenacity') ? 0.6 : 1);
  };

  Player.prototype.speed = function () {
    let s = this.game.diff.ms + this.msBonus;
    if (this.slowT > 0) s *= (1 - this.slowAmt);
    return s;
  };

  /** Immobilisé ? (racine, projection, stase) */
  Player.prototype.stunned = function () {
    return this.rootT > 0 || this.knockT > 0 || this.zhonyaT > 0;
  };

  Player.prototype.invulnerable = function () {
    return this.iframes > 0 || this.dashing > 0 || this.zhonyaT > 0;
  };

  /* --- Ordres et sorts ---------------------------------------------------- */
  Player.prototype.order = function (wx, wy) {
    this.moveTarget = { x: wx, y: wy };
    this.clickX = wx; this.clickY = wy;
    this.clickFx = 0.45;
    this.lastOrderAt = this.game.elapsed;
    this.game.stats.orders++;
  };

  Player.prototype.stop = function () { this.moveTarget = null; };

  Player.prototype.tryFlash = function (wx, wy) {
    // Le Flash traverse la racine — comme en jeu. Pas la projection.
    if (!this.has('flash') || this.flashCd > 0 || this.knockT > 0 || this.zhonyaT > 0) return false;
    const a = Math.atan2(wy - this.y, wx - this.x);
    const d = Math.min(P.flashRange, Math.max(60, U.dist(this.x, this.y, wx, wy)));
    this.game.fx.burst(this.x, this.y, 26, '#ffd166', 700, 7, 0.45);
    this.x += Math.cos(a) * d;
    this.y += Math.sin(a) * d;
    this.game.fx.burst(this.x, this.y, 26, '#ffd166', 700, 7, 0.45);
    this.game.fx.ring(this.x, this.y, 18, 40, '#ffd166', 900);
    this.flashCd = this.game.diff.flashCd;
    this.rootT = 0;                    // le déplacement casse la racine
    this.moveTarget = null;
    this.iframes = Math.max(this.iframes, 0.08);
    this.game.stats.flashes++;
    this.game.audio.flash();
    return true;
  };

  Player.prototype.tryDash = function (wx, wy) {
    if (!this.has('dash') || this.dashCharges <= 0 || this.stunned()) return false;
    this.dashCharges--;
    if (this.dashCd <= 0) this.dashCd = this.game.diff.dashCd;
    this.dashAng = Math.atan2(wy - this.y, wx - this.x);
    this.dashing = P.dashTime;
    this.game.stats.dashes++;
    this.game.fx.ring(this.x, this.y, 14, 30, '#4de3ff', 500);
    this.game.audio.dash();
    return true;
  };

  Player.prototype.tryCleanse = function () {
    if (!this.has('cleanse') || this.cleanseCd > 0) return false;
    if (this.rootT <= 0 && this.knockT <= 0 && this.slowT <= 0) return false;
    this.rootT = this.knockT = this.slowT = 0;
    this.cleanseCd = P.cleanseCd;
    this.game.fx.ring(this.x, this.y, 22, 50, '#4ade80', 700);
    this.game.fx.text(this.x, this.y - 80, 'PURGE', '#4ade80', 24, 70);
    this.game.audio.cleanse();
    return true;
  };

  Player.prototype.tryZhonya = function () {
    if (!this.has('zhonya') || this.zhonyaCd > 0) return false;
    this.zhonyaT = P.zhonyaDur;
    this.zhonyaCd = P.zhonyaCd;
    this.moveTarget = null;
    this.game.fx.ring(this.x, this.y, 28, 60, '#ffd166', 800);
    this.game.audio.zhonya();
    return true;
  };

  /* --- Subir un effet ------------------------------------------------------ */
  Player.prototype.applyEffect = function (eff, haz) {
    if (eff.kind === 'kill') return 'die';

    const m = this.ccMul();
    if (eff.kind === 'root') {
      this.rootT = Math.max(this.rootT, eff.dur * m);
      this.moveTarget = null;
      this.game.fx.text(this.x, this.y - 80, 'ENRACINÉ', '#c77dff', 24, 60);
    } else if (eff.kind === 'pull') {
      this.rootT = Math.max(this.rootT, eff.dur * m);
      this.moveTarget = null;
      const src = eff.from;
      if (src) {                        // tiré vers le lanceur, comme un grappin
        const a = Math.atan2(src.y - this.y, src.x - this.x);
        const d = Math.max(0, U.dist(this.x, this.y, src.x, src.y) - src.r - P.hitbox);
        this.pull = { a, left: d, speed: 1500 };
      }
      this.game.fx.text(this.x, this.y - 80, 'ATTRAPÉ', '#ffd166', 26, 60);
    } else if (eff.kind === 'knockup') {
      this.knockT = Math.max(this.knockT, eff.dur * m);
      this.moveTarget = null;
      this.game.fx.text(this.x, this.y - 80, 'PROJETÉ', '#ff3b6b', 26, 60);
    } else if (eff.kind === 'slow') {
      this.slowT = Math.max(this.slowT, eff.dur * m);
      this.slowAmt = Math.max(this.slowAmt, eff.amount);
      this.game.fx.text(this.x, this.y - 80, 'RALENTI', '#7b8cff', 20, 50);
    }

    this.queuedOrder = null;
    this.game.stats.ccTaken++;
    this.game.fx.kick(9);
    this.game.fx.blink('#ff3b30', 0.18);
    this.game.audio.cc();
    return 'cc';
  };

  /* --- Mise à jour ---------------------------------------------------------- */
  Player.prototype.update = function (dt, In, cursor) {
    // Temps de recharge
    if (this.flashCd > 0) this.flashCd -= dt;
    if (this.cleanseCd > 0) this.cleanseCd -= dt;
    if (this.zhonyaCd > 0) this.zhonyaCd -= dt;
    if (this.iframes > 0) this.iframes -= dt;
    if (this.clickFx > 0) this.clickFx -= dt;
    if (this.zhonyaT > 0) this.zhonyaT -= dt;
    if (this.rootT > 0) this.rootT -= dt;
    if (this.knockT > 0) this.knockT -= dt;
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowAmt = 0; }

    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.dashCd <= 0 && this.has('dash') && this.dashCharges < this.dashMax) {
      this.dashCharges++;
      if (this.dashCharges < this.dashMax) this.dashCd = this.game.diff.dashCd;
    }
    if (this.shieldCd > 0) {
      this.shieldCd -= dt;
      if (this.shieldCd <= 0) { this.shieldUp = true; this.game.audio.pickup(); }
    }

    // --- Commandes -------------------------------------------------------
    if (In.tapped('flash')) this.tryFlash(cursor.x, cursor.y);
    if (In.tapped('dash')) this.tryDash(cursor.x, cursor.y);
    if (In.tapped('cleanse')) this.tryCleanse();
    if (In.tapped('zhonya')) this.tryZhonya();
    if (In.tapped('stop')) this.stop();

    const ord = In.takeMoveOrder();
    if (ord) {
      const w = this.game.screenToWorld(ord.sx, ord.sy);
      if (this.stunned()) {
        // Comme en jeu : on peut cliquer pendant un CC, le champion part
        // dès qu'il est libéré. Perdre l'ordre obligerait à re-cliquer.
        this.queuedOrder = { x: w.x, y: w.y, held: !!ord.held };
      } else if (ord.held) {
        // Un clic maintenu ne compte pas comme un nouvel ordre : sinon les
        // statistiques de juke seraient faussées.
        this.moveTarget = { x: w.x, y: w.y };
      } else {
        this.order(w.x, w.y);
      }
    }

    // Sortie de CC : on rejoue l'ordre mis en attente.
    if (this.queuedOrder && !this.stunned()) {
      const q = this.queuedOrder;
      this.queuedOrder = null;
      if (q.held) this.moveTarget = { x: q.x, y: q.y };
      else this.order(q.x, q.y);
    }

    // --- Traction du grappin ---------------------------------------------
    if (this.pull) {
      const step = Math.min(this.pull.speed * dt, this.pull.left);
      this.x += Math.cos(this.pull.a) * step;
      this.y += Math.sin(this.pull.a) * step;
      this.pull.left -= step;
      if (this.pull.left <= 0) this.pull = null;
      return;
    }

    // --- Ruée --------------------------------------------------------------
    if (this.dashing > 0) {
      this.dashing -= dt;
      const sp = P.dashRange / P.dashTime;
      this.x += Math.cos(this.dashAng) * sp * dt;
      this.y += Math.sin(this.dashAng) * sp * dt;
      this.face = this.dashAng;
      this.game.fx.trail(this.x, this.y, '#4de3ff', 16);
      return;
    }

    if (this.stunned()) { this.vx = this.vy = 0; return; }

    // --- Déplacement : vitesse pleine vers l'ordre, sans inertie ----------
    if (this.moveTarget) {
      const dx = this.moveTarget.x - this.x, dy = this.moveTarget.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d <= P.stopDist) {
        this.moveTarget = null;
        this.vx = this.vy = 0;
      } else {
        const s = this.speed();
        const step = Math.min(s * dt, d);
        this.x += dx / d * step;
        this.y += dy / d * step;
        this.vx = dx / d * s; this.vy = dy / d * s;
        this.face = Math.atan2(dy, dx);
      }
    } else { this.vx = this.vy = 0; }
  };

  /* --- Rendu ---------------------------------------------------------------- */
  Player.prototype.draw = function (ctx) {
    // Marqueur de clic, comme le curseur de déplacement de LoL.
    if (this.clickFx > 0 && this.moveTarget) {
      const k = this.clickFx / 0.45;
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = U.rgba('#4ade80', k);
      ctx.beginPath(); ctx.arc(this.clickX, this.clickY, 16 + (1 - k) * 26, 0, U.TAU); ctx.stroke();
      ctx.restore();
    }
    // Ligne vers la destination : c'est CE vecteur que l'ennemi anticipe.
    if (this.moveTarget) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(74,222,128,.28)';
      ctx.setLineDash([12, 12]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.moveTarget.x, this.moveTarget.y); ctx.stroke();
      ctx.restore();
    }

    const inv = this.invulnerable();
    const c = this.zhonyaT > 0 ? '#ffd166' : (inv ? '#ffd166' : '#4de3ff');

    U.glow(ctx, this.x, this.y, P.hitbox * 2.6, U.rgba(c, inv ? 0.40 : 0.24), U.rgba(c, 0));

    // Cercle de sélection, comme sous les pieds d'un champion.
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = U.rgba('#4ade80', 0.55);
    ctx.beginPath(); ctx.ellipse(this.x, this.y + P.hitbox * 0.5, P.hitbox * 1.15, P.hitbox * 0.52, 0, 0, U.TAU);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.face);
    ctx.fillStyle = U.rgba(c, 0.92);
    ctx.beginPath();
    ctx.moveTo(P.visual, 0);
    ctx.lineTo(-P.visual * 0.7, -P.visual * 0.7);
    ctx.lineTo(-P.visual * 0.32, 0);
    ctx.lineTo(-P.visual * 0.7, P.visual * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Hitbox réel, toujours visible : aucune mort inexpliquée.
    ctx.lineWidth = 2;
    ctx.strokeStyle = U.rgba('#fff', 0.5);
    ctx.beginPath(); ctx.arc(this.x, this.y, P.hitbox, 0, U.TAU); ctx.stroke();

    if (this.shieldUp) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(180,220,255,.85)';
      ctx.beginPath(); ctx.arc(this.x, this.y, P.hitbox + 16, 0, U.TAU); ctx.stroke();
    }
    if (this.zhonyaT > 0) {
      ctx.fillStyle = 'rgba(255,209,102,.30)';
      ctx.beginPath(); ctx.arc(this.x, this.y, P.hitbox + 26, 0, U.TAU); ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = '#ffd166'; ctx.stroke();
    }
    if (this.rootT > 0 || this.knockT > 0) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = this.knockT > 0 ? 'rgba(255,59,107,.9)' : 'rgba(199,125,255,.9)';
      ctx.beginPath(); ctx.arc(this.x, this.y, P.hitbox + 10, 0, U.TAU); ctx.stroke();
    }
  };

  root.LolPlayer = Player;
})(window);
