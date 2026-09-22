/* ==========================================================================
   lol/objectives.js — boucle punition / récompense du mode LoL
   Conditions : juke (esquives de justesse), noflash, nocc, inner.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.LOLCFG;

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

  Objectives.prototype.next = function () { return this.list[this.index] || null; };

  Objectives.prototype.award = function (o) {
    const p = this.game.player, b = CFG.BUFFS[o.reward];
    p.grant(o.reward);
    o.done = true;
    this.completed++;
    this.game.fx.blink('#4de3ff', 0.22);
    this.game.fx.text(p.x, p.y - 110, '+ ' + b.name, '#ffd166', 30, 80);
    this.game.fx.burst(p.x, p.y, 34, '#ffd166', 700, 8, 0.8);
    this.game.audio.reward();
    this.say(b.name.toUpperCase() + ' DÉBLOQUÉ', b.desc, '#ffd166');
  };

  Objectives.prototype.failChallenge = function (o, why) {
    o.failed = true;
    this.failed++;
    const p = this.game.player;
    this.game.fx.text(p.x, p.y - 110, 'ÉCHEC', '#ff3b30', 32, 80);
    this.say('OBJECTIF RATÉ', why + ' — vague de punition.', '#ff3b30');
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
          if (ch.outT > 0.35) {
            this.activeChallenge = null;
            this.failChallenge(ch.src, 'Sorti du cercle intérieur');
            this.index++; return;
          }
        } else ch.outT = 0;
      }

      if (ch.cond === 'noflash' && this.game.stats.flashes > ch.baseFlash) {
        this.activeChallenge = null;
        this.failChallenge(ch.src, 'Flash utilisé');
        this.index++; return;
      }

      if (ch.cond === 'nocc' && this.game.stats.ccTaken > ch.baseCc) {
        this.activeChallenge = null;
        this.failChallenge(ch.src, 'Contrôle subi');
        this.index++; return;
      }

      if (ch.cond === 'juke') {
        ch.progress = this.game.stats.jukes - ch.baseJuke;
        if (ch.progress >= ch.target) {
          this.activeChallenge = null;
          this.award(ch.src);
          this.index++; return;
        }
      }

      if (ch.left <= 0) {
        this.activeChallenge = null;
        if (ch.cond === 'juke') {
          this.failChallenge(ch.src, 'Esquives insuffisantes (' + ch.progress + '/' + ch.target + ')');
        } else {
          this.award(ch.src);
        }
        this.index++; return;
      }
      return;
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
        baseJuke: this.game.stats.jukes,
        baseFlash: this.game.stats.flashes,
        baseCc: this.game.stats.ccTaken,
        progress: 0, outT: 0, label: o.label
      };
      this.game.fx.blink('#ffd166', 0.18);
      this.game.audio.challenge();
      this.say('DÉFI : ' + o.label, 'Réussite → ' + CFG.BUFFS[o.reward].name + ' · Échec → punition', '#ffd166');
    }
  };

  root.LolObjectives = Objectives;
})(window);
