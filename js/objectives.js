/* ==========================================================================
   objectives.js — la boucle punition / récompense
   --------------------------------------------------------------------------
   Deux types d'objectifs :
     · survive   : atteindre un temps -> buff offert.
     · challenge : une fenêtre avec une condition (frôler N fois, ne pas
                   dasher, rester au centre). Réussite -> buff. Échec ->
                   vague de punition immédiate + jauge d'adrénaline vidée.
   Le contrat est volontairement dur : un buff se mérite, et rater une
   fenêtre coûte tout de suite, pas plus tard.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.CFG;

  function Objectives(game) {
    this.game = game;
    this.reset(game.diff);
  }

  Objectives.prototype.reset = function (diff) {
    this.list = diff.objectives.map(o => Object.assign({}, o, { done: false, failed: false }));
    this.index = 0;
    this.activeChallenge = null;
    this.completed = 0;
    this.failed = 0;
    this.banner = null;
    this.bannerT = 0;
  };

  Objectives.prototype.say = function (text, sub, color) {
    this.banner = { text, sub, color: color || '#4de3ff' };
    this.bannerT = 2.6;
  };

  Objectives.prototype.next = function () {
    return this.list[this.index] || null;
  };

  Objectives.prototype.award = function (o) {
    const p = this.game.player;
    const buff = CFG.BUFFS[o.reward];
    p.grant(o.reward);
    o.done = true;
    this.completed++;
    this.game.fx.blink('#4de3ff', 0.22);
    this.game.fx.text(p.x, p.y - 42, '+ ' + buff.name, '#ffd166', 19);
    this.game.fx.burst(p.x, p.y, 34, '#ffd166', 300, 3.4, 0.8);
    this.game.audio.reward();
    this.say(buff.name.toUpperCase() + ' DÉBLOQUÉ', buff.desc, '#ffd166');
  };

  Objectives.prototype.failChallenge = function (o, why) {
    o.failed = true;
    this.failed++;
    const p = this.game.player;
    p.adrenalin = 0;
    this.game.fx.text(p.x, p.y - 42, 'ÉCHEC', '#ff3b30', 22);
    this.say('OBJECTIF RATÉ', why + ' — vague de punition.', '#ff3b30');
    // Sévérité : plus on est loin dans la série, plus ça coûte cher.
    this.game.director.punish(1 + Math.min(2, this.completed * 0.4));
  };

  Objectives.prototype.update = function (dt, elapsed) {
    if (this.bannerT > 0) this.bannerT -= dt;

    const ch = this.activeChallenge;
    if (ch) {
      ch.left -= dt;

      if (ch.cond === 'inner') {
        const a = this.game.arena;
        const inside = U.dist(this.game.player.x, this.game.player.y, a.cx, a.cy) < a.innerRadius();
        if (!inside) {
          ch.outT = (ch.outT || 0) + dt;
          if (ch.outT > 0.35) {                      // tolérance minime
            this.activeChallenge = null;
            this.failChallenge(ch.src, 'Sorti du cercle intérieur');
            this.index++;
            return;
          }
        } else ch.outT = 0;
      }

      if (ch.cond === 'nodash' && this.game.player.dashedSince(ch.startedAt)) {
        this.activeChallenge = null;
        this.failChallenge(ch.src, 'Dash utilisé');
        this.index++;
        return;
      }

      if (ch.cond === 'graze') {
        ch.progress = this.game.stats.graze - ch.baseGraze;
        if (ch.progress >= ch.target) {
          this.activeChallenge = null;
          this.award(ch.src);
          this.index++;
          return;
        }
      }

      if (ch.left <= 0) {
        this.activeChallenge = null;
        if (ch.cond === 'graze') {
          this.failChallenge(ch.src, 'Frôlements insuffisants (' + ch.progress + '/' + ch.target + ')');
        } else {
          this.award(ch.src);                        // tenu jusqu'au bout
        }
        this.index++;
        return;
      }
      return;                                        // un challenge à la fois
    }

    const o = this.next();
    if (!o || elapsed < o.t) return;

    if (o.type === 'survive') {
      this.award(o);
      this.index++;
    } else {
      this.activeChallenge = {
        src: o, cond: o.cond, target: o.target || 0,
        left: o.duration, max: o.duration,
        baseGraze: this.game.stats.graze,
        startedAt: this.game.elapsed,
        progress: 0, outT: 0,
        label: o.label
      };
      this.game.fx.blink('#ffd166', 0.18);
      this.game.audio.challenge();
      this.say('DÉFI : ' + o.label, 'Réussite → ' + CFG.BUFFS[o.reward].name + ' · Échec → punition', '#ffd166');
    }
  };

  root.Objectives = Objectives;
})(window);
