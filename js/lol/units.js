/* ==========================================================================
   lol/units.js — champions ennemis et sbires
   --------------------------------------------------------------------------
   Le caster est le « tell » de LoL : on ne réagit pas à un projectile qui
   surgit, on réagit à une animation d'incantation. Et surtout, TANT QU'IL
   INCANTE IL CORRIGE SA VISÉE — donc re-cliquer pendant ce temps déplace la
   ligne. C'est exactement le juke de LoL.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.LOLCFG;

  /* ====================== PRÉDICTION ======================================
     Là où sera le joueur dans `t` secondes SI il garde son ordre de
     déplacement actuel. C'est pour ça qu'un simple re-clic fait rater.      */
  function futurePos(p, t) {
    if (!p.moveTarget) return { x: p.x, y: p.y };
    const dx = p.moveTarget.x - p.x, dy = p.moveTarget.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return { x: p.x, y: p.y };
    const travel = Math.min(p.speed() * t, d);
    return { x: p.x + dx / d * travel, y: p.y + dy / d * travel };
  }

  /** Point visé : mélange entre position actuelle et position anticipée,
      selon `predict` de la difficulté, plus une erreur en unités. */
  function aimPoint(caster, game, projSpeed, extraDelay) {
    const p = game.player, d = game.diff;
    let t = (extraDelay || 0);
    for (let i = 0; i < 2; i++) {
      const f = futurePos(p, t);
      t = (extraDelay || 0) + U.dist(caster.x, caster.y, f.x, f.y) / Math.max(200, projSpeed);
    }
    const f = futurePos(p, t);
    let ax = U.lerp(p.x, f.x, d.predict);
    let ay = U.lerp(p.y, f.y, d.predict);
    if (d.predictNoise) {
      const na = U.rr(0, U.TAU), nd = U.rr(0, d.predictNoise);
      ax += Math.cos(na) * nd; ay += Math.sin(na) * nd;
    }
    return { x: ax, y: ay };
  }

  /* ====================== CASTER ========================================= */
  function Caster(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.r = CFG.CASTER.r;
    this.aim = 0;
    this.alive = true;
    this.casting = null;        // {ability, left, max}
    this.gcd = U.rr(0.4, 1.8);  // délai avant la première incantation
    this.cds = Object.create(null);
    this.dest = null;
    this.repos = 0;
    this.hue = U.pick(['#ff4d7a', '#c77dff', '#ff8a3d', '#7b8cff', '#ff3b6b']);
    this.bob = U.rr(0, U.TAU);
  }

  /** Se replace pour rester dans sa fenêtre de portée : ni collé, ni hors jeu. */
  Caster.prototype.reposition = function (dt) {
    const p = this.game.player, A = this.game.arena;
    this.repos -= dt;
    const d = U.dist(this.x, this.y, p.x, p.y);
    const [lo, hi] = CFG.CASTER.keepRange;

    if (this.repos <= 0 || !this.dest || d < lo * 0.75 || d > hi * 1.3) {
      this.repos = U.rr(CFG.CASTER.repositionEvery[0], CFG.CASTER.repositionEvery[1]);
      const want = U.rr(lo, hi);
      const base = Math.atan2(this.y - p.y, this.x - p.x);
      const a = base + U.rr(-0.9, 0.9);
      let dx = p.x + Math.cos(a) * want, dy = p.y + Math.sin(a) * want;
      // Ils restent dans l'arène : pas d'ennemi qui tire depuis le néant.
      const fromC = U.dist(dx, dy, A.cx, A.cy);
      if (fromC > A.radius * 0.94) {
        const ca = Math.atan2(dy - A.cy, dx - A.cx);
        dx = A.cx + Math.cos(ca) * A.radius * 0.94;
        dy = A.cy + Math.sin(ca) * A.radius * 0.94;
      }
      this.dest = { x: dx, y: dy };
    }

    if (this.dest) {
      const ddx = this.dest.x - this.x, ddy = this.dest.y - this.y;
      const dd = Math.hypot(ddx, ddy);
      if (dd > 6) {
        // On ne bouge pas en incantant : comme en jeu, le cast enracine.
        const sp = CFG.CASTER.speed * (this.casting ? 0 : 1);
        const step = Math.min(sp * dt, dd);
        this.x += ddx / dd * step;
        this.y += ddy / dd * step;
      }
    }
  };

  Caster.prototype.startCast = function (ab, game) {
    const d = game.diff;
    const castTime = Math.max(0.06, ab.cast * d.castTimeMul);
    this.casting = { ab, left: castTime, max: castTime };
    this.cds[ab.id] = ab.cd * U.rr(0.85, 1.2);
    // Le sort est créé dès le début de l'incantation : il s'affiche au sol et
    // continue de suivre la visée du lanceur jusqu'au tir.
    ab.spawn(this, game, castTime);
    game.audio.cast();
  };

  Caster.prototype.update = function (dt, game) {
    this.bob += dt * 3;
    this.reposition(dt);

    for (const k in this.cds) if (this.cds[k] > 0) this.cds[k] -= dt;

    if (this.casting) {
      // Visée corrigée en continu pendant toute l'incantation.
      const ab = this.casting.ab;
      const pt = aimPoint(this, game, ab.speed || 1600, this.casting.left);
      this.aim = Math.atan2(pt.y - this.y, pt.x - this.x);
      this.casting.left -= dt;
      if (this.casting.left <= 0) this.casting = null;
      return;
    }

    const p = game.player;
    this.aim = Math.atan2(p.y - this.y, p.x - this.x);
    if (this.gcd > 0) this.gcd -= dt;
  };

  Caster.prototype.ready = function () { return !this.casting && this.gcd <= 0; };

  Caster.prototype.draw = function (ctx) {
    const wob = Math.sin(this.bob) * 3;

    // Portée de menace : discrète, mais elle apprend le spacing.
    if (this.casting) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = U.rgba(this.hue, 0.18);
      ctx.beginPath(); ctx.arc(this.x, this.y, this.casting.ab.range, 0, U.TAU); ctx.stroke();
      ctx.restore();
    }

    U.glow(ctx, this.x, this.y + wob, this.r * 2.4, U.rgba(this.hue, 0.30), U.rgba(this.hue, 0));
    ctx.fillStyle = 'rgba(14,17,32,.95)';
    ctx.beginPath(); ctx.arc(this.x, this.y + wob, this.r, 0, U.TAU); ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = this.hue;
    ctx.stroke();

    // Direction de visée : le petit repère qui permet d'anticiper.
    ctx.save();
    ctx.translate(this.x, this.y + wob);
    ctx.rotate(this.aim);
    ctx.fillStyle = this.hue;
    ctx.beginPath();
    ctx.moveTo(this.r * 1.35, 0);
    ctx.lineTo(this.r * 0.62, -this.r * 0.42);
    ctx.lineTo(this.r * 0.62, this.r * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Barre d'incantation : le tell principal, exactement comme en jeu.
    if (this.casting) {
      const k = 1 - this.casting.left / this.casting.max;
      const w = this.r * 2.4, h = 13;
      const bx = this.x - w / 2, by = this.y - this.r - 40;
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      ctx.fillRect(bx - 2, by - 2, w + 4, h + 4);
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = k > 0.75 ? '#fff' : '#ffd166';
      ctx.fillRect(bx, by, w * k, h);
      ctx.font = '700 22px Segoe UI, Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(this.casting.ab.key, this.x, by - 10);
    }
  };

  /* ====================== MINION =========================================
     Ils n'attaquent pas : ils existent pour bloquer. Se placer derrière un
     sbire est une esquive à part entière, comme contre un hook.            */
  function Minion(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.r = CFG.MINION.r;
    this.alive = true;
    this.respawn = 0;
    this.a = U.rr(0, U.TAU);
    this.turn = U.rr(-0.5, 0.5);
  }

  Minion.prototype.absorb = function (game) {
    this.alive = false;
    this.respawn = CFG.MINION.respawn;
    game.fx.burst(this.x, this.y, 22, '#9aa6ff', 520, 7, 0.55);
    game.fx.text(this.x, this.y - 60, 'BLOQUÉ', '#9aa6ff', 26, 60);
    game.stats.blocked++;
    game.audio.block();
  };

  Minion.prototype.update = function (dt, game) {
    if (!this.alive) {
      this.respawn -= dt;
      if (this.respawn <= 0) {
        const A = game.arena, p = game.player;
        const a = U.rr(0, U.TAU), d = U.rr(300, 620);
        this.x = p.x + Math.cos(a) * d;
        this.y = p.y + Math.sin(a) * d;
        // On ne le fait pas réapparaître hors de l'arène.
        const fc = U.dist(this.x, this.y, A.cx, A.cy);
        if (fc > A.radius * 0.9) {
          const ca = Math.atan2(this.y - A.cy, this.x - A.cx);
          this.x = A.cx + Math.cos(ca) * A.radius * 0.9;
          this.y = A.cy + Math.sin(ca) * A.radius * 0.9;
        }
        this.alive = true;
      }
      return;
    }
    this.a += this.turn * dt;
    this.x += Math.cos(this.a) * CFG.MINION.speed * dt;
    this.y += Math.sin(this.a) * CFG.MINION.speed * dt;

    const A = game.arena;
    const d = U.dist(this.x, this.y, A.cx, A.cy);
    if (d > A.radius * 0.9) {                     // ils restent dans l'arène
      this.a = Math.atan2(A.cy - this.y, A.cx - this.x) + U.rr(-0.4, 0.4);
    }
  };

  Minion.prototype.draw = function (ctx) {
    if (!this.alive) return;
    U.glow(ctx, this.x, this.y, this.r * 1.9, 'rgba(154,166,255,.18)', 'rgba(154,166,255,0)');
    ctx.fillStyle = 'rgba(28,34,62,.95)';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(154,166,255,.8)';
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(154,166,255,.3)';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.55, 0, U.TAU); ctx.stroke();
  };

  root.LolUnits = { Caster, Minion, aimPoint, futurePos };
})(window);
