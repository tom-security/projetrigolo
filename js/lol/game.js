/* ==========================================================================
   lol/game.js — moteur du mode DODGE LoL
   Même interface publique que le mode classique, pour que le menu puisse
   piloter l'un ou l'autre sans rien savoir de leurs différences.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.LOLCFG;

  /* --- Audio ------------------------------------------------------------- */
  function makeAudio() {
    let actx = null, master = null;
    function ensure() {
      if (actx) return actx;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.16;
      master.connect(actx.destination);
      return actx;
    }
    function tone(f, dur, type, gain, to) {
      const a = ensure(); if (!a) return;
      if (a.state === 'suspended') a.resume();
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, a.currentTime);
      if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), a.currentTime + dur);
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(gain || 0.4, a.currentTime + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start(); o.stop(a.currentTime + dur + 0.02);
    }
    function noise(dur, gain) {
      const a = ensure(); if (!a) return;
      const n = Math.floor(a.sampleRate * dur);
      const buf = a.createBuffer(1, n, a.sampleRate);
      const dta = buf.getChannelData(0);
      for (let i = 0; i < n; i++) dta[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = a.createBufferSource(); s.buffer = buf;
      const g = a.createGain(); g.gain.value = gain || 0.35;
      s.connect(g); g.connect(master); s.start();
    }
    return {
      unlock: () => { const a = ensure(); if (a && a.state === 'suspended') a.resume(); },
      cast:      () => tone(300, 0.14, 'square', 0.14, 460),
      zap:       () => tone(900, 0.11, 'sawtooth', 0.20, 340),
      boom:      () => { noise(0.34, 0.45); tone(70, 0.4, 'sine', 0.55, 28); },
      flash:     () => { tone(1500, 0.14, 'triangle', 0.3, 420); noise(0.1, 0.2); },
      dash:      () => tone(520, 0.09, 'triangle', 0.26, 940),
      cc:        () => { tone(150, 0.3, 'square', 0.3, 70); noise(0.14, 0.24); },
      cleanse:   () => { tone(700, 0.12, 'triangle', 0.28); setTimeout(() => tone(1100, 0.16, 'triangle', 0.26), 80); },
      zhonya:    () => tone(420, 0.45, 'sine', 0.3, 900),
      block:     () => tone(260, 0.1, 'square', 0.22, 160),
      reward:    () => { tone(660, 0.1, 'triangle', 0.3); setTimeout(() => tone(990, 0.16, 'triangle', 0.3), 90); },
      challenge: () => { tone(440, 0.09, 'square', 0.18); setTimeout(() => tone(560, 0.11, 'square', 0.18), 100); },
      fail:      () => { tone(160, 0.35, 'sawtooth', 0.32, 60); noise(0.2, 0.3); },
      pickup:    () => tone(1200, 0.08, 'triangle', 0.2, 1800),
      death:     () => { noise(0.6, 0.5); tone(120, 0.7, 'sawtooth', 0.4, 30); }
    };
  }

  /* --- Jeu ---------------------------------------------------------------- */
  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.state = 'menu';
    this.dpr = 1; this.w = 0; this.h = 0; this.zoom = 1;

    this.diff = CFG.diff('medium');
    this.arena = new root.LolArena(this);
    this.player = new root.LolPlayer(this);
    this.fx = new root.Fx();
    this.audio = makeAudio();

    this.hazards = [];
    this.casters = [];
    this.minions = [];
    this.timers = [];

    this.elapsed = 0;
    this.best = 0;
    this.newRecord = false;
    this.deathCause = '';
    this.lastAbility = null;
    this.lastAbilityT = 0;
    this.stats = { jukes: 0, ccTaken: 0, flashes: 0, dashes: 0, blocked: 0, orders: 0 };

    this.resize();
    root.addEventListener('resize', () => this.resize());
  }

  Game.prototype.resize = function () {
    this.dpr = Math.min(root.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth || root.innerWidth;
    this.h = this.canvas.clientHeight || root.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    // Cadrage LoL : on montre toujours la même largeur en unités de jeu…
    const framed = Math.min(this.w / CFG.VIEW.unitsWide, this.h / CFG.VIEW.unitsHigh);
    // …mais sur écran étroit ou en portrait, ce calcul tombait à 0,19 et le
    // champion ne faisait plus que 10 px. On garantit une échelle jouable,
    // quitte à voir une portion plus petite de l'arène.
    this.zoom = Math.max(framed, Math.min(this.w, this.h) / 1500);
  };

  Game.prototype.screenToWorld = function (sx, sy) {
    return {
      x: (sx - this.w / 2) / this.zoom + this.arena.camX,
      y: (sy - this.h / 2) / this.zoom + this.arena.camY
    };
  };

  /* --- Persistance ---------------------------------------------------------- */
  Game.prototype.bestKey = function (id) { return 'dodgetrainer.lol.best.' + id; };
  Game.prototype.loadBest = function (id) {
    try { return parseFloat(localStorage.getItem(this.bestKey(id))) || 0; } catch (e) { return 0; }
  };
  Game.prototype.saveBest = function (v) {
    try { localStorage.setItem(this.bestKey(this.diff.id), String(v)); } catch (e) { /* mode privé */ }
  };

  Game.prototype.schedule = function (t, fn) { this.timers.push({ t, fn }); };

  /* --- Cycle de vie ---------------------------------------------------------- */
  Game.prototype.start = function (diffId, opts) {
    this.diff = CFG.diff(diffId);
    this.fx.quality = (opts && opts.quality) || 'high';
    this.fx.shakeEnabled = !(opts && opts.shake === false);

    this.arena.init(this.diff);
    this.player.reset();
    this.fx.reset();
    this.hazards.length = 0;
    this.casters.length = 0;
    this.minions.length = 0;
    this.timers.length = 0;
    this.elapsed = 0;
    this.lastAbility = null;
    this.lastAbilityT = 0;
    this.deathCause = '';
    this.newRecord = false;
    this.stats = { jukes: 0, ccTaken: 0, flashes: 0, dashes: 0, blocked: 0, orders: 0 };
    this.best = this.loadBest(this.diff.id);

    this.director = new root.LolDirector(this);
    this.objectives = new root.LolObjectives(this);

    for (let i = 0; i < this.diff.minions; i++) {
      const a = U.rr(0, U.TAU), d = U.rr(300, 700);
      this.minions.push(new root.LolUnits.Minion(this, this.player.x + Math.cos(a) * d,
                                                       this.player.y + Math.sin(a) * d));
    }

    this.objectives.say('DODGE LoL · ' + this.diff.name, 'Clic droit pour te déplacer. Re-clique pendant leur incantation.', this.diff.color);
    this.audio.unlock();
    this.state = 'playing';
    root.LolInput.clearAll();
  };

  Game.prototype.die = function (cause) {
    if (this.state !== 'playing') return;
    this.player.alive = false;
    this.deathCause = cause;
    this.fx.blink('#ff3b30', 0.75);
    this.fx.kick(26);
    this.fx.burst(this.player.x, this.player.y, 70, '#ff4d7a', 900, 11, 1.1);
    this.fx.ring(this.player.x, this.player.y, 40, 40, '#fff', 1100);
    this.audio.death();

    this.newRecord = this.elapsed > this.best;
    if (this.newRecord) { this.best = this.elapsed; this.saveBest(this.elapsed); }
    this.state = 'dead';
    if (this.onDeath) this.onDeath();
  };

  function deathLabel(hz) {
    switch (hz.type) {
      case 'line':   return 'Touché par un skillshot — il visait où tu allais.';
      case 'circle': return 'Pris dans la zone — elle reste létale jusqu\'au bout.';
      case 'cone':   return 'Pris dans le cône — trop près du lanceur.';
      case 'zone':   return 'Resté dans la zone au sol.';
      case 'beam':   return 'Traversé par le rayon.';
      default:       return 'Éliminé.';
    }
  }

  /* --- Mise à jour ------------------------------------------------------------ */
  Game.prototype.update = function (dt) {
    const p = this.player;
    this.elapsed += dt;
    if (this.lastAbilityT > 0) this.lastAbilityT -= dt;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }

    const cursor = this.screenToWorld(root.LolInput.mouse.sx, root.LolInput.mouse.sy);
    p.update(dt, root.LolInput, cursor);

    if (this.arena.update(dt, p, this.elapsed) === 'collapse') {
      this.die('Effondrement de la zone — rester dehors tue.');
      return;
    }

    this.director.update(dt, this.elapsed);
    this.objectives.update(dt, this.elapsed);

    for (const c of this.casters) c.update(dt, this);
    for (const m of this.minions) m.update(dt, this);

    // --- Skillshots : déplacement, collision, comptage des jukes ------------
    const hb = CFG.PLAYER.hitbox;
    const jw = CFG.PLAYER.jukeWindow;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hz = this.hazards[i];
      if (!hz.update(dt, this)) { this.hazards.splice(i, 1); continue; }

      if (hz.hits(p.x, p.y, hb)) {
        if (p.invulnerable()) continue;
        if (p.shieldUp) {                       // le bouclier absorbe un sort entier
          p.shieldUp = false;
          p.shieldCd = CFG.PLAYER.shieldRecharge;
          p.iframes = Math.max(p.iframes, 0.25);
          this.fx.ring(p.x, p.y, 22, 70, '#b4dcff', 900);
          this.fx.text(p.x, p.y - 100, 'BLOQUÉ', '#b4dcff', 26, 70);
          this.audio.block();
          this.hazards.splice(i, 1);
          continue;
        }
        if (hz._applied) continue;                 // un sort ne contrôle qu'une fois
        if (p.applyEffect(hz.effect, hz) === 'die') { this.die(deathLabel(hz)); return; }
        // Une zone persistante reste en jeu après avoir touché : sans ce
        // marqueur elle ré-appliquait son contrôle à chaque frame (36 fois
        // pour une seule projection), gonflant le compteur et la bande-son.
        hz._applied = true;
        if (hz.type === 'line') this.hazards.splice(i, 1);   // un hook ne traverse pas
        continue;
      }

      // Esquive « de justesse » : le sort te frôle au plus près puis s'éloigne.
      if (hz.threat) {
        const d = hz.edge(p.x, p.y);
        if (d >= 0 && d < jw) {
          if (hz._prev !== undefined && d > hz._prev && !hz.grazed) {
            hz.grazed = true;
            this.stats.jukes++;
            this.fx.text(p.x, p.y - 70, 'ESQUIVÉ', '#4ade80', 20, 60);
            this.fx.spawn(p.x, p.y, U.rr(-60, 60), U.rr(-160, -60), 0.5, 5, '#4ade80', 2, false);
          }
          hz._prev = d;
        }
      }
    }

    if (this.hazards.length > 900) this.hazards.splice(0, this.hazards.length - 900);

    this.fx.update(dt);
    this.arena.updateCamera(dt, p);
  };

  /* --- Rendu ------------------------------------------------------------------ */
  Game.prototype.render = function () {
    const ctx = this.ctx, w = this.w, h = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#07080f';
    ctx.fillRect(0, 0, w, h);
    if (this.state === 'menu') return;

    const z = this.zoom;
    const camX = this.arena.camX + this.fx.shakeX / z;
    const camY = this.arena.camY + this.fx.shakeY / z;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(z, z);
    ctx.translate(-camX, -camY);

    const hw = (w / 2) / z + 200, hh = (h / 2) / z + 200;
    const view = { x0: camX - hw, y0: camY - hh, x1: camX + hw, y1: camY + hh };

    this.arena.drawFloor(ctx, view);
    this.arena.drawBounds(ctx, view, this.elapsed);

    // Au sol d'abord, en vol ensuite : jamais un skillshot caché sous une zone.
    for (const hz of this.hazards) if (hz.type === 'zone' || hz.type === 'circle') hz.draw(ctx);
    for (const m of this.minions) m.draw(ctx);
    for (const c of this.casters) c.draw(ctx);
    for (const hz of this.hazards) if (hz.type !== 'zone' && hz.type !== 'circle') hz.draw(ctx);

    this.fx.drawParticles(ctx);
    if (this.player.alive) this.player.draw(ctx);
    this.fx.drawTexts(ctx);

    ctx.restore();

    this.fx.drawFlash(ctx, w, h);
    if (this.state === 'playing' || this.state === 'paused') root.LolHUD.draw(ctx, this, w, h);
  };

  root.LolGame = Game;
})(window);
