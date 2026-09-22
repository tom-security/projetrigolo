/* ==========================================================================
   game.js — boucle, collisions, états, audio, persistance
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.CFG;

  /* --- Audio minimal (WebAudio, aucun asset) ----------------------------- */
  function makeAudio() {
    let actx = null, master = null, muted = false;
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
    function tone(freq, dur, type, gain, sweepTo) {
      if (muted) return;
      const a = ensure();
      if (!a || a.state === 'suspended') { if (a) a.resume(); if (!a) return; }
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, a.currentTime);
      if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), a.currentTime + dur);
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(gain || 0.5, a.currentTime + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start(); o.stop(a.currentTime + dur + 0.02);
    }
    function noise(dur, gain) {
      if (muted) return;
      const a = ensure(); if (!a) return;
      const n = Math.floor(a.sampleRate * dur);
      const buf = a.createBuffer(1, n, a.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = a.createBufferSource(); src.buffer = buf;
      const g = a.createGain(); g.gain.value = gain || 0.4;
      src.connect(g); g.connect(master);
      src.start();
    }
    return {
      unlock: () => { const a = ensure(); if (a && a.state === 'suspended') a.resume(); },
      boom:      () => { noise(0.34, 0.45); tone(70, 0.4, 'sine', 0.55, 28); },
      zap:       () => tone(880, 0.12, 'sawtooth', 0.22, 300),
      dash:      () => tone(520, 0.09, 'triangle', 0.26, 940),
      graze:     () => tone(1400, 0.05, 'sine', 0.13),
      reward:    () => { tone(660, 0.1, 'triangle', 0.3); setTimeout(() => tone(990, 0.16, 'triangle', 0.3), 90); },
      challenge: () => { tone(440, 0.09, 'square', 0.18); setTimeout(() => tone(560, 0.11, 'square', 0.18), 100); },
      fail:      () => { tone(160, 0.35, 'sawtooth', 0.32, 60); noise(0.2, 0.3); },
      save:      () => { tone(300, 0.2, 'triangle', 0.4, 700); noise(0.15, 0.25); },
      slow:      () => tone(300, 0.5, 'sine', 0.28, 120),
      pickup:    () => tone(1200, 0.08, 'triangle', 0.2, 1800),
      death:     () => { noise(0.6, 0.5); tone(120, 0.7, 'sawtooth', 0.4, 30); }
    };
  }

  /* --- Jeu ---------------------------------------------------------------- */
  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.state = 'menu';
    this.dpr = 1;
    this.w = 0; this.h = 0;

    this.diff = CFG.diff('medium');
    this.arena = new root.Arena(this);
    this.player = new root.Player(this);
    this.fx = new root.Fx();
    this.audio = makeAudio();
    this.hazards = [];
    this.timers = [];
    this.elapsed = 0;
    this.timeScale = 1;
    this.best = 0;
    this.lastPattern = null;
    this.lastPatternT = 0;
    this.stats = { graze: 0, dashes: 0, adrenUses: 0, close: 0 };
    this.deathCause = '';
    this.endless = false;

    this.resize();
    root.addEventListener('resize', () => this.resize());
  }

  Game.prototype.resize = function () {
    this.dpr = Math.min(root.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth || root.innerWidth;
    this.h = this.canvas.clientHeight || root.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
  };

  /* --- Persistance -------------------------------------------------------- */
  Game.prototype.bestKey = function (diffId, endless) {
    return 'dodgetrainer.best.' + diffId + (endless ? '.endless' : '');
  };
  Game.prototype.loadBest = function (diffId, endless) {
    try { return parseFloat(localStorage.getItem(this.bestKey(diffId, endless))) || 0; }
    catch (e) { return 0; }
  };
  Game.prototype.saveBest = function (v) {
    try { localStorage.setItem(this.bestKey(this.diff.id, this.endless), String(v)); }
    catch (e) { /* mode privé : on continue sans record */ }
  };

  /* --- Cycle de vie -------------------------------------------------------- */
  Game.prototype.start = function (diffId, opts) {
    this.diff = CFG.diff(diffId);
    this.endless = !!(opts && opts.endless);
    this.fx.quality = (opts && opts.quality) || 'high';
    this.fx.shakeEnabled = !(opts && opts.shake === false);

    this.arena.init(this.diff, this.endless, (Math.random() * 1e9) | 0);
    this.player.reset();
    this.fx.reset();
    this.hazards.length = 0;
    this.timers.length = 0;
    this.elapsed = 0;
    this.timeScale = 1;
    this.stats = { graze: 0, dashes: 0, adrenUses: 0, close: 0 };
    this.lastPattern = null;
    this.lastPatternT = 0;
    this.deathCause = '';
    this.best = this.loadBest(this.diff.id, this.endless);

    this.director = new root.Director(this);
    this.objectives = new root.Objectives(this);
    this.objectives.say('DIFFICULTÉ ' + this.diff.name, this.diff.sub, this.diff.color);

    this.audio.unlock();
    this.state = 'playing';
    root.Input.clearAll();
  };

  Game.prototype.schedule = function (t, fn) {
    this.timers.push({ t, fn });
  };

  Game.prototype.die = function (cause) {
    if (this.state !== 'playing') return;
    this.player.alive = false;
    this.deathCause = cause;
    this.fx.blink('#ff3b30', 0.75);
    this.fx.kick(26);
    this.fx.burst(this.player.x, this.player.y, 70, '#ff4d7a', 460, 5, 1.1);
    this.fx.ring(this.player.x, this.player.y, 40, 14, '#fff', 560);
    this.audio.death();

    const record = this.elapsed > this.best;
    if (record) { this.best = this.elapsed; this.saveBest(this.elapsed); }
    this.newRecord = record;

    this.state = 'dead';
    if (this.onDeath) this.onDeath();
  };

  /* --- Mise à jour --------------------------------------------------------- */
  Game.prototype.update = function (rawDt) {
    const p = this.player;

    // Ralentissement (adrénaline) : sur le monde, pas sur le joueur.
    const worldScale = p.slowT > 0 ? CFG.PLAYER.adrenalinScale : 1;
    const dt = rawDt;                       // le joueur garde son temps plein
    const wdt = rawDt * worldScale;

    this.elapsed += dt;
    if (this.lastPatternT > 0) this.lastPatternT -= dt;

    // --- Minuteurs différés (patterns étalés dans le temps) ---------------
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= wdt;
      if (t.t <= 0) {
        this.timers.splice(i, 1);
        t.fn();
      }
    }

    p.update(dt, root.Input);

    const collapse = this.arena.update(dt, p, this.elapsed);
    if (collapse) { this.die('Effondrement de la zone — rester dehors tue.'); return; }

    this.director.update(wdt, this.elapsed);
    this.objectives.update(dt, this.elapsed);

    // --- Dangers : update + collision + frôlement -------------------------
    const hb = CFG.PLAYER.hitbox;
    const invuln = p.iframes > 0;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hz = this.hazards[i];
      if (!hz.update(wdt, this)) { this.hazards.splice(i, 1); continue; }
      if (!invuln && hz.hits(p.x, p.y, hb)) {
        if (!p.tryAbsorb()) {
          this.die(deathLabel(hz));
          return;
        }
      } else {
        p.checkGraze(hz, dt);
      }
    }

    // Garde-fou mémoire : au-delà, on purge les plus anciens projectiles.
    if (this.hazards.length > 1400) this.hazards.splice(0, this.hazards.length - 1400);

    this.fx.update(dt);
    this.arena.updateCamera(dt, p, this.w, this.h);
  };

  function deathLabel(hz) {
    if (hz instanceof root.Ent.Blast) return 'Pris dans une explosion — la zone reste létale jusqu\'au bout.';
    if (hz instanceof root.Ent.Laser) return 'Touché par un faisceau.';
    if (hz instanceof root.Ent.Wall) return 'Écrasé par un mur — la brèche était ailleurs.';
    if (hz instanceof root.Ent.Chaser) return 'Rattrapé par une traqueuse.';
    return 'Touché par un projectile.';
  }

  /* --- Rendu --------------------------------------------------------------- */
  Game.prototype.render = function () {
    const ctx = this.ctx, w = this.w, h = this.h;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#07080f';
    ctx.fillRect(0, 0, w, h);

    if (this.state === 'menu') { this.drawIdleBackdrop(ctx, w, h); return; }

    const camX = this.arena.camX + this.fx.shakeX;
    const camY = this.arena.camY + this.fx.shakeY;
    const ox = w / 2 - camX, oy = h / 2 - camY;

    ctx.save();
    ctx.translate(ox, oy);

    const view = { x0: camX - w / 2 - 80, y0: camY - h / 2 - 80, x1: camX + w / 2 + 80, y1: camY + h / 2 + 80 };

    this.arena.drawFloor(ctx, view);
    this.arena.drawBounds(ctx, view, this.elapsed);

    // Les dangers sont découpés sur le cercle jouable : ce qui est dehors est
    // de toute façon mortel, l'afficher ne ferait que masquer les trajectoires
    // qui comptent.
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.arena.cx, this.arena.cy, this.arena.radius + 14, 0, U.TAU);
    ctx.clip();

    // Explosions d'abord (au sol), puis le reste : jamais un projectile caché
    // sous une flaque.
    for (const hz of this.hazards) if (hz instanceof root.Ent.Blast) hz.draw(ctx, this);
    for (const hz of this.hazards) if (!(hz instanceof root.Ent.Blast)) hz.draw(ctx, this);
    ctx.restore();

    // Les particules suivent la même règle que les dangers, avec une marge :
    // la gerbe de mort reste visible même si on meurt juste au-dehors.
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.arena.cx, this.arena.cy, this.arena.radius + 90, 0, U.TAU);
    ctx.clip();
    this.fx.drawParticles(ctx);
    ctx.restore();

    if (this.player.alive) this.player.draw(ctx);
    this.fx.drawTexts(ctx);

    ctx.restore();

    this.fx.drawFlash(ctx, w, h);
    if (this.state === 'playing' || this.state === 'paused') root.HUD.draw(ctx, this, w, h);
  };

  /** Fond animé du menu : quelques orbes, zéro gameplay. */
  Game.prototype.drawIdleBackdrop = function (ctx, w, h) {
    const t = performance.now() * 0.001;
    for (let i = 0; i < 26; i++) {
      const a = t * (0.1 + (i % 5) * 0.035) + i;
      const r = 120 + (i * 37) % 340;
      const x = w / 2 + Math.cos(a) * r * 1.5;
      const y = h / 2 + Math.sin(a * 1.3) * r * 0.75;
      U.glow(ctx, x, y, 34, 'rgba(77,227,255,.10)', 'rgba(77,227,255,0)');
    }
  };

  root.Game = Game;
})(window);
