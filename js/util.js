/* ==========================================================================
   util.js — maths, aléatoire déterministe, helpers de rendu
   ========================================================================== */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function inv(a, b, v) { return b === a ? 0 : (v - a) / (b - a); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function approach(cur, target, delta) {
    return cur < target ? Math.min(cur + delta, target) : Math.max(cur - delta, target);
  }

  function len(x, y) { return Math.hypot(x, y); }
  function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
  function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }

  /** Différence d'angle la plus courte, dans ]-PI, PI]. */
  function angDelta(from, to) {
    let d = (to - from) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  /** Distance d'un point au segment AB. */
  function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  // ---- Aléatoire ----------------------------------------------------------
  /** PRNG mulberry32 : rapide, déterministe, suffisant pour du gameplay. */
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Hash 2D -> [0,1[ : sert à générer les secteurs de la carte infinie. */
  function hash2(x, y, salt) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* Aléatoire du GAMEPLAY : un mulberry32 dont on peut lire et remettre
     l'état. C'est ce qui permet au bot de rejouer l'avenir exact d'une
     partie (voir forecast.js) : cloner l'état du monde ne suffit pas si le
     prochain tirage, lui, ne se clone pas. */
  let rngState = ((Math.random() * 4294967296) >>> 0) || 1;
  function rnd() {
    rngState = (rngState + 0x6D2B79F5) | 0;
    let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rngGet() { return rngState; }
  function rngSet(s) { rngState = s | 0; }
  /** Aléatoire VISUEL (particules, tremblement) : jamais le générateur du
      gameplay, sinon l'affichage décalerait les tirages et l'avenir prévu
      par le bot ne serait plus celui qui arrive. */
  function vrr(a, b) { return a + Math.random() * (b - a); }

  function rr(a, b) { return a + rnd() * (b - a); }
  function ri(a, b) { return Math.floor(a + rnd() * (b - a + 1)); }
  function pick(arr) { return arr[(rnd() * arr.length) | 0]; }
  function chance(p) { return rnd() < p; }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  /** Tirage pondéré : items = [{w:number, ...}]. */
  function weighted(items, weightOf) {
    let total = 0;
    for (const it of items) total += Math.max(0, weightOf(it));
    if (total <= 0) return items[0];
    let r = rnd() * total;
    for (const it of items) {
      r -= Math.max(0, weightOf(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  // ---- Formatage ----------------------------------------------------------
  function fmtTime(s) {
    if (s < 0) s = 0;
    const m = Math.floor(s / 60);
    const rest = s - m * 60;
    return m > 0
      ? m + ':' + (rest < 10 ? '0' : '') + rest.toFixed(2)
      : rest.toFixed(2) + 's';
  }

  // ---- Rendu --------------------------------------------------------------
  /** Halo radial peu coûteux (remplace shadowBlur dans les boucles chaudes). */
  function glow(ctx, x, y, r, inner, outer) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  root.U = {
    TAU, clamp, lerp, inv, smooth, approach,
    len, dist, dist2, angDelta, distToSeg,
    makeRng, hash2, rr, ri, pick, chance, shuffle, weighted,
    rngGet, rngSet, vrr,
    fmtTime, glow, rgba
  };
})(window);
