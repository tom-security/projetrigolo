/* ==========================================================================
   forecast.js — l'oracle du bot : faire tourner le VRAI jeu en avance
   --------------------------------------------------------------------------
   Le bot ne devine plus où seront les dangers avec des formules : il clone
   la partie, la fait avancer de quelques secondes avec le moteur du jeu
   lui-même, relève tout ce qui est létal image par image, puis remet la
   partie exactement dans l'état où il l'a trouvée.

   Ce qu'il voit ainsi est exact : lasers qui pivotent, murs qui dérivent,
   explosions qui enflent, répliques, rétrécissement de l'arène… et même les
   patterns qui ne sont pas encore apparus, puisque le générateur aléatoire
   du gameplay est cloné avec le reste (voir U.rngGet / U.rngSet).

   La seule incertitude : les tirs visés dépendent de là où sera le joueur.
   La prévision le fait suivre le dernier plan du bot, et elle est refaite
   plusieurs fois par seconde.

   Contrat : snapshot(game) → état ; restore(game, état) ; run(game, pilote,
   durée, pas, àChaqueImage). run() restaure toujours, même sur exception.
   Pendant run(), game.__forecasting vaut true et game.__simDead passe à
   true dès que le joueur simulé meurt.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U;
  const has = Object.prototype.hasOwnProperty;
  function noop() {}

  /** Copie à plat des propriétés propres ; les tableaux sont dupliqués. */
  function copy(o) {
    const c = {};
    for (const k in o) {
      if (!has.call(o, k)) continue;
      const v = o[k];
      c[k] = Array.isArray(v) ? v.slice() : v;
    }
    return c;
  }
  function put(o, c) { for (const k in c) o[k] = Array.isArray(c[k]) ? c[k].slice() : c[k]; }

  /** Doublure muette d'un objet (effets, son) : mêmes méthodes, sans effet. */
  const stubs = new WeakMap();
  function stubOf(obj) {
    let s = stubs.get(obj);
    if (s) return s;
    s = {};
    for (const k in obj) s[k] = typeof obj[k] === 'function' ? noop : obj[k];
    let proto = Object.getPrototypeOf(obj);
    while (proto && proto !== Object.prototype) {
      for (const k of Object.getOwnPropertyNames(proto)) {
        if (k !== 'constructor' && typeof proto[k] === 'function') s[k] = noop;
      }
      proto = Object.getPrototypeOf(proto);
    }
    stubs.set(obj, s);
    return s;
  }

  function snapshot(g) {
    const p = g.player, o = g.objectives;
    const pc = copy(p);
    pc.buffs = Object.assign(Object.create(null), p.buffs);
    return {
      rng: U.rngGet(),
      g: {
        elapsed: g.elapsed, timeScale: g.timeScale, lastPattern: g.lastPattern,
        lastPatternT: g.lastPatternT, deathCause: g.deathCause, state: g.state,
        stats: Object.assign({}, g.stats)
      },
      hazards: g.hazards.map(h => [h, copy(h)]),
      timers: g.timers.map(t => [t, t.t]),
      player: pc,
      arena: copy(g.arena),
      director: copy(g.director),
      obj: {
        fields: { index: o.index, completed: o.completed, failed: o.failed, banner: o.banner, bannerT: o.bannerT },
        list: o.list.map(x => [x, copy(x)]),
        active: o.activeChallenge ? [o.activeChallenge, copy(o.activeChallenge)] : null
      }
    };
  }

  function restore(g, s) {
    U.rngSet(s.rng);
    Object.assign(g, s.g);
    g.stats = Object.assign({}, s.g.stats);
    g.hazards.length = 0;
    for (const [h, c] of s.hazards) { put(h, c); g.hazards.push(h); }
    g.timers.length = 0;
    for (const [t, v] of s.timers) { t.t = v; g.timers.push(t); }
    put(g.player, s.player);
    g.player.buffs = Object.assign(Object.create(null), s.player.buffs);
    put(g.arena, s.arena);
    put(g.director, s.director);
    const o = g.objectives;
    Object.assign(o, s.obj.fields);
    for (const [x, c] of s.obj.list) put(x, c);
    if (s.obj.active) { put(s.obj.active[0], s.obj.active[1]); o.activeChallenge = s.obj.active[0]; }
    else o.activeChallenge = null;
  }

  /**
   * Fait avancer la partie de `duration` secondes par pas de `dt`, le joueur
   * étant piloté par `pilot` (interface d'Input). `onFrame(k, t, game)` est
   * appelé après chaque pas ; la partie est ensuite restaurée à l'identique.
   * Renvoie l'instant de mort simulé, ou −1.
   */
  function run(g, pilot, duration, dt, onFrame) {
    const snap = snapshot(g);
    const fx = g.fx, audio = g.audio, bot = root.Bot, botActive = g.botActive, p = g.player;
    let dead = -1, t = 0;
    // Surcharges déjà posées sur l'instance (outils de mesure) : on les rend
    // telles quelles au lieu de retomber sur la méthode du prototype.
    const ownDie = has.call(g, 'die') ? g.die : null;
    const ownGraze = has.call(p, 'checkGraze') ? p.checkGraze : null;
    g.fx = stubOf(fx);
    g.audio = stubOf(audio);
    g.die = function () { if (dead < 0) dead = t; g.__simDead = true; };
    g.__simDead = false;
    p.checkGraze = noop;               // le frôlement écrit dans une WeakMap : pas d'écho dans le réel
    root.Bot = pilot;
    g.botActive = true;
    g.__forecasting = true;
    try {
      const n = Math.ceil(duration / dt);
      for (let k = 0; k < n; k++) {
        t = (k + 1) * dt;
        g.update(dt);
        if (onFrame) onFrame(k, t, g);
      }
    } finally {
      if (ownDie) g.die = ownDie; else delete g.die;
      if (ownGraze) p.checkGraze = ownGraze; else delete p.checkGraze;
      delete g.__forecasting;
      delete g.__simDead;
      g.fx = fx; g.audio = audio;
      root.Bot = bot;
      g.botActive = botActive;
      restore(g, snap);
    }
    return dead;
  }

  root.Forecast = { snapshot, restore, run };
})(window);
