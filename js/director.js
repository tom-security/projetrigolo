/* ==========================================================================
   director.js — chef d'orchestre
   --------------------------------------------------------------------------
   · Fait monter l'intensité en continu (difficulté progressive).
   · Choisit les patterns par tirage pondéré selon le profil de difficulté.
   · Déclenche les salves de « grosses boules » sur leur propre horloge.
   · Envoie les vagues de punition quand le joueur rate un objectif.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, P = root.Patterns;

  function Director(game) {
    this.game = game;
    this.reset(game.diff);
  }

  Director.prototype.reset = function (diff) {
    this.diff = diff;
    this.I = 1;                       // intensité courante
    // Sursis d'ouverture : on laisse le temps de lire l'arène avant le premier
    // pattern. Il se raccourcit avec la difficulté, et n'existe presque pas en
    // infernal.
    this.next = Math.max(0.9, diff.spawnBase * 0.85);
    this.nextBomb = diff.id === 'infernal' ? 2.5 : 7;
    this.lastId = null;
    this.recent = [];
    this.count = 0;
    this.surge = 0;                   // multiplicateur temporaire (punition)
    this.surgeT = 0;
  };

  /** Palier de patterns débloqué : la variété arrive progressivement. */
  Director.prototype.tier = function () {
    const t = Math.floor(U.inv(1, this.diff.intensityCap, this.I) * (this.diff.maxTier + 1));
    return U.clamp(t, 0, this.diff.maxTier);
  };

  /** Contexte passé aux patterns : tout y est déjà mis à l'échelle. */
  Director.prototype.ctx = function () {
    const g = this.game, d = this.diff, I = this.I;
    const scale = 0.55 + I * 0.28;
    return {
      game: g, diff: d, player: g.player, arena: g.arena, I,
      teleMul: d.telegraphMul * (g.player.has('sonar') ? 1.35 : 1) / Math.max(0.6, 0.85 + I * 0.06),
      sonarMul: (g.player.has('sonar') ? 1.35 : 1) * (1 / Math.max(0.7, 0.9 + I * 0.05)),
      aimError: d.id === 'infernal' ? 0 : U.lerp(0.22, 0.04, U.clamp(I / 5, 0, 1)),
      spd: base => base * d.speedMul * (1 + I * 0.045),
      cnt: base => Math.max(1, base * d.countMul * U.clamp(scale, 0.5, 2.6)),
      sched: (t, fn) => g.schedule(t, fn)
    };
  };

  Director.prototype.pickPattern = function () {
    const tier = this.tier();
    const W = this.diff.tagWeights;
    const pool = P.PATTERNS.filter(p => p.tier <= tier);
    return U.weighted(pool, p => {
      let w = p.w.skill * W.skill + p.w.spam * W.spam + p.w.brutal * W.brutal;
      // Anti-répétition : on ne veut pas trois fois le même pattern d'affilée.
      if (p.id === this.lastId) w *= 0.15;
      else if (this.recent.indexOf(p.id) >= 0) w *= 0.45;
      // Les patterns récents (haut tier) sont légèrement favorisés : la montée
      // en difficulté doit se *voir*, pas seulement s'accélérer.
      if (p.tier === tier && tier > 0) w *= 1.35;
      return w;
    });
  };

  Director.prototype.fire = function (pat) {
    pat.run(this.ctx());
    this.lastId = pat.id;
    this.recent.push(pat.id);
    if (this.recent.length > 3) this.recent.shift();
    this.count++;
    this.game.lastPattern = pat.name;
    this.game.lastPatternT = 1.8;
  };

  /** Vague de punition : réponse immédiate à un objectif raté. */
  Director.prototype.punish = function (severity) {
    const g = this.game;
    g.fx.blink('#ff3b30', 0.42);
    g.fx.kick(14);
    g.audio.fail();
    const c = this.ctx();
    const tier = this.tier();
    const pool = P.PATTERNS.filter(p => p.tier <= Math.min(this.diff.maxTier, tier + 1));
    const n = 2 + Math.round(severity);
    for (let i = 0; i < n; i++) {
      const pat = U.pick(pool);
      g.schedule(i * 0.28, () => pat.run(this.ctx()));
    }
    // Et un surcroît d'intensité temporaire : la sanction se ressent dans le temps.
    this.surge = 1 + 0.5 * severity;
    this.surgeT = 6;
    this.I = Math.min(this.diff.intensityCap, this.I + 0.35 * severity);
  };

  Director.prototype.update = function (dt, elapsed) {
    const d = this.diff;

    // --- Intensité : montée continue, jamais de palier de repos ------------
    this.I = Math.min(d.intensityCap, 1 + elapsed * d.intensityRate);

    if (this.surgeT > 0) {
      this.surgeT -= dt;
      if (this.surgeT <= 0) this.surge = 0;
    }
    const rate = this.I * (1 + (this.surge || 0));

    // --- Patterns ----------------------------------------------------------
    this.next -= dt;
    if (this.next <= 0) {
      const interval = Math.max(d.spawnFloor, d.spawnBase / rate);
      this.next = interval * U.rr(0.82, 1.18);
      this.fire(this.pickPattern());

      // À haute intensité, les patterns se superposent volontairement.
      const overlap = U.clamp((this.I - d.intensityCap * 0.45) / d.intensityCap, 0, 1);
      if (U.chance(overlap * (d.tagWeights.spam > 0.5 ? 0.85 : 0.25))) {
        this.game.schedule(interval * 0.45, () => this.fire(this.pickPattern()));
      }
    }

    // --- Grosses boules : horloge séparée, elles ne ratent jamais leur tour -
    this.nextBomb -= dt;
    if (this.nextBomb <= 0) {
      const base = U.lerp(9.5, 3.2, U.clamp(this.I / d.intensityCap, 0, 1));
      this.nextBomb = Math.max(1.1, base / (d.tagWeights.brutal > 1 ? 1.8 : 1)) * U.rr(0.85, 1.15);
      const bomb = P.PATTERNS.find(p => p.id === 'bomb');
      this.fire(bomb);
    }
  };

  root.Director = Director;
})(window);
