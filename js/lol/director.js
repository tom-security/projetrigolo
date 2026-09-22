/* ==========================================================================
   lol/director.js — chef d'orchestre du mode LoL
   Gère le nombre de casters présents et la cadence des incantations.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, AB = root.LolAbilities, Units = root.LolUnits;

  function Director(game) {
    this.game = game;
    this.reset(game.diff);
  }

  Director.prototype.reset = function (diff) {
    this.diff = diff;
    this.I = 1;
    this.bonus = 0;                   // surcroît durable infligé par les punitions
    this.next = Math.max(1.0, diff.castEvery * 0.9);
    this.recent = [];
    this.surge = 0; this.surgeT = 0;
  };

  Director.prototype.tier = function () {
    const t = Math.floor(U.inv(1, this.diff.intensityCap, this.I) * (this.diff.maxTier + 1));
    return U.clamp(t, 0, this.diff.maxTier);
  };

  /** Nombre de casters voulu à l'instant t : ils arrivent progressivement. */
  Director.prototype.wantCasters = function () {
    const [lo, hi] = this.diff.casters;
    const k = U.inv(1, this.diff.intensityCap, this.I);
    return Math.round(U.lerp(lo, hi, U.clamp(k, 0, 1)));
  };

  /** Tirage pondéré parmi les sorts disponibles POUR CE LANCEUR.
      Filtrer sur ses recharges est indispensable : sans ça, tirer un sort
      indisponible faisait perdre le tour entier et le rythme s'effondrait. */
  Director.prototype.pickAbility = function (caster) {
    const tier = this.tier(), W = this.diff.tagWeights;
    let pool = AB.ABILITIES.filter(a => a.tier <= tier);
    if (caster) {
      const ready = pool.filter(a => !(caster.cds[a.id] > 0));
      if (ready.length) pool = ready;
    }
    return U.weighted(pool, a => {
      let w = a.w.skill * W.skill + a.w.spam * W.spam + a.w.brutal * W.brutal;
      if (this.recent.indexOf(a.id) >= 0) w *= 0.35;
      if (a.tier === tier && tier > 0) w *= 1.35;
      return w;
    });
  };

  Director.prototype.punish = function (severity) {
    const g = this.game;
    g.fx.blink('#ff3b30', 0.42);
    g.fx.kick(14);
    g.audio.fail();
    const n = 2 + Math.round(severity);
    for (let i = 0; i < n; i++) {
      g.schedule(i * 0.3, () => {
        const ready = g.casters.filter(c => c.alive);
        if (!ready.length) return;
        const c = U.pick(ready);
        c.gcd = 0;
        c.casting = null;
        c.startCast(this.pickAbility(c), g);
      });
    }
    this.surge = 1 + 0.5 * severity;
    this.surgeT = 6;
    // Ce surcroît doit SURVIVRE au recalcul de la rampe fait à chaque frame :
    // il est donc stocké à part et ajouté, pas écrit dans this.I.
    this.bonus += 0.35 * severity;
  };

  Director.prototype.update = function (dt, elapsed) {
    const d = this.diff, g = this.game;
    if (this.bonus > 0) this.bonus = Math.max(0, this.bonus - dt * 0.03);
    this.I = Math.min(d.intensityCap, 1 + elapsed * d.intensityRate + this.bonus);

    if (this.surgeT > 0) { this.surgeT -= dt; if (this.surgeT <= 0) this.surge = 0; }
    const rate = this.I * (1 + (this.surge || 0));

    // --- Effectif ennemi ---------------------------------------------------
    const want = this.wantCasters();
    while (g.casters.length < want) {
      const A = g.arena, p = g.player;
      const a = U.rr(0, U.TAU), dist = U.rr(800, 1100);
      let x = p.x + Math.cos(a) * dist, y = p.y + Math.sin(a) * dist;
      const fc = U.dist(x, y, A.cx, A.cy);
      if (fc > A.radius * 0.92) {
        const ca = Math.atan2(y - A.cy, x - A.cx);
        x = A.cx + Math.cos(ca) * A.radius * 0.92;
        y = A.cy + Math.sin(ca) * A.radius * 0.92;
      }
      const c = new Units.Caster(g, x, y);
      g.casters.push(c);
      g.fx.ring(x, y, 20, 40, c.hue, 700);
    }
    while (g.casters.length > want) {
      const gone = g.casters.pop();
      // Sans ça, les sorts différés déjà programmés (barrage, charge)
      // continuaient de se déclencher pour un ennemi qui n'existe plus.
      if (gone) gone.alive = false;
    }

    // --- Cadence des incantations -----------------------------------------
    this.next -= dt;
    if (this.next <= 0) {
      const interval = Math.max(d.castFloor, d.castEvery / rate);
      this.next = interval * U.rr(0.82, 1.18);

      const ready = g.casters.filter(c => c.ready());
      if (ready.length) {
        const c = U.pick(ready);
        const ab = this.pickAbility(c);
        c.startCast(ab, g);
        this.recent.push(ab.id);
        if (this.recent.length > 3) this.recent.shift();
        g.lastAbility = ab.name;
        g.lastAbilityT = 1.8;
      }

      // À haute intensité, deux ennemis incantent en même temps.
      const overlap = U.clamp((this.I - d.intensityCap * 0.45) / d.intensityCap, 0, 1);
      if (U.chance(overlap * (d.tagWeights.spam > 0.5 ? 0.9 : 0.3))) {
        g.schedule(interval * 0.4, () => {
          const r2 = g.casters.filter(c => c.ready());
          if (r2.length) r2[0].startCast(this.pickAbility(r2[0]), g);
        });
      }
    }
  };

  root.LolDirector = Director;
})(window);
