/* ==========================================================================
   bot.js — pilote automatique du mode BULLET-HELL
   --------------------------------------------------------------------------
   Il expose exactement la même interface que `Input` (axis / held / tapped),
   donc le joueur ne sait pas qu'il est piloté : game.js lui passe le bot à la
   place du clavier, et rien d'autre ne change.

   DEUX ÉTAGES.

   1. L'ORACLE (forecast.js). Plusieurs fois par seconde, le bot clone la
      partie et la fait tourner 2,5 s en avance avec le vrai moteur, en
      suivant son dernier plan. Il relève, image par image, tout ce qui sera
      létal : position exacte des projectiles, angle des lasers, brèche des
      murs, rayon des explosions qui enflent, répliques, patterns pas encore
      apparus, rayon de l'arène. Plus aucune formule approchée.
      Mesuré avant ce changement : en easy, le bot mourait vers 55 s, tué
      surtout par des balayages laser qu'il voyait à 0,88 s alors qu'ils se
      jouent sur plusieurs secondes.

   2. LE PLANIFICATEUR. Une recherche en faisceau sur des suites de
      directions, avec le modèle de déplacement du joueur (accélération
      comprise), évaluée contre la prévision. Horizon 2,4 s : court devant,
      grossier derrière. On ne joue que le premier pas, puis on replanifie.

   Sans forecast.js (ou au-delà de sa prévision), le bot retombe sur un
   modèle analytique des dangers.

   Ce bot ne fonctionne PAS en mode LoL : là-bas on ne se déplace pas par
   direction mais par ordre de clic, et la visée ennemie réagit à cet ordre.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.CFG;

  /* --- Réglages de recherche -------------------------------------------- */
  // Segments du plan : fins au début (réaction), larges ensuite (stratégie).
  const SEGS = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2];
  const SUBS = SEGS.map(s => (s > 0.15 ? 3 : 2));   // points évalués par segment
  const BEAM = 12;                  // largeur du faisceau
  const DECIDE_HZ = 30;             // replanification par seconde
  const SCAN_RADIUS = 620;
  const SAFE = 26;                  // marge visée au-delà du hitbox, en pixels

  /* --- Réglages de l'oracle ---------------------------------------------- */
  const F_H = 2.5;                  // horizon de prévision, s
  const F_DT = 1 / 120;             // pas du moteur : celui du jeu, pour coller au réel
  const FMAX = Math.ceil(F_H / F_DT) + 8;
  const F_REFRESH = 1 / 20;         // prévision refaite au moins 20 fois par seconde
  const LOOK = [0.45];              // regard en avant depuis chaque point du plan, s
  const LOOK_W = [1.4];             // poids de ces menaces à venir
  const LOOK_DEPTH = 8;             // seulement sur la partie fine du plan
  const MAP_W = 20000;              // points par seconde de survie manquante
  const ROLL_K = 6;                 // plans du faisceau rejoués dans le vrai moteur
  const ROLL_DASH = 4;              // … dont les meilleurs, aussi avec un dash
  const ROLL_FLEE = 6;              // fuites en ligne droite essayées en plus
  const ROLL_H = 2.0;               // durée de chaque rejeu, s
  const CALM_MARGIN = 14;           // marge (px) au-delà de laquelle on ne vérifie pas

  // Directions candidates : 12 autour + l'immobilité.
  const BRANCH = [];
  for (let i = 0; i < 12; i++) BRANCH.push([Math.cos(i / 12 * U.TAU), Math.sin(i / 12 * U.TAU)]);
  BRANCH.push([0, 0]);

  /* --- Types de danger, figés une fois par décision ----------------------
     `instanceof` dans la boucle chaude coûte cher : on étiquette une fois. */
  const K_BULLET = 0, K_BLAST = 1, K_LASER = 2, K_WALL = 3, K_CHASER = 4, K_OTHER = 5;

  function tagOf(hz) {
    const E = root.Ent;
    if (hz instanceof E.Bullet) return K_BULLET;
    if (hz instanceof E.Blast) return K_BLAST;
    if (hz instanceof E.Laser) return K_LASER;
    if (hz instanceof E.Wall) return K_WALL;
    if (hz instanceof E.Chaser) return K_CHASER;
    return K_OTHER;
  }

  /* ======================================================================
     Distance au danger `h`, depuis (x, y), tel qu'il sera dans `t` secondes.
     Négatif = touché. `h` porte son étiquette de type dans h.__k.
     ====================================================================== */
  function clearance(h, x, y, t) {
    switch (h.__k) {

      case K_BULLET: {
        if (h.delay > t) return 1e6;
        const bx = h.x + h.vx * t, by = h.y + h.vy * t;
        // Trajectoire courbe ou traquante : on élargit le projectile plutôt
        // que de la simuler — moins cher, et l'erreur penche vers la prudence.
        const drift = h.__drift * t;
        return Math.hypot(x - bx, y - by) - h.r - drift;
      }

      case K_BLAST: {
        // Une zone télégraphiée compte dès son apparition, sans masquage.
        //
        // Les versions précédentes la rendaient invisible tant que la
        // détonation n'approchait pas. Le faisceau élaguait alors les
        // trajectoires de fuite AVANT que le danger ne devienne visible : à
        // la profondeur où l'explosion apparaissait enfin, tous les nœuds
        // survivants étaient déjà engagés à rester dedans. D'où des morts au
        // même instant à chaque partie, sur la première salve.
        //
        // Y rester n'est jamais bon de toute façon : la vraie distance suffit.
        const since = h.state === 'tele' ? Math.max(0, t - h.tele) : t;
        return Math.hypot(x - h.x, y - h.y) - h.r - (h.grow || 0) * since;
      }

      case K_LASER: {
        if (h.state === 'tele' && t < h.tele - 0.12) return 1e6;
        const a = h.a + h.spin * t;
        return U.distToSeg(x, y, h.x, h.y,
          h.x + Math.cos(a) * h.len, h.y + Math.sin(a) * h.len) - h.w * 0.5;
      }

      case K_WALL: {
        if (h.tele > t) return 1e6;
        const px = h.x + h.__cx * h.speed * t, py = h.y + h.__cy * h.speed * t;
        const tx = -h.__cy, ty = h.__cx;
        const gap = h.gap + h.drift * t;
        return Math.min(
          U.distToSeg(x, y, px + tx * -h.half, py + ty * -h.half,
                            px + tx * (gap - h.gapHalf), py + ty * (gap - h.gapHalf)),
          U.distToSeg(x, y, px + tx * (gap + h.gapHalf), py + ty * (gap + h.gapHalf),
                            px + tx * h.half, py + ty * h.half)
        ) - h.thick * 0.5;
      }

      case K_CHASER: {
        if (h.tele > t) return 1e6;
        const a = Math.atan2(y - h.y, x - h.x);   // au pire elle vise juste
        return Math.hypot(x - (h.x + Math.cos(a) * h.speed * t),
                          y - (h.y + Math.sin(a) * h.speed * t)) - h.r;
      }

      default: {
        const d = h.edge ? h.edge(x, y) : 1e6;
        return d < 0 ? 1e6 : d;
      }
    }
  }

  /** Distance au danger le plus proche, tous dangers confondus. */
  function minClear(near, x, y, t) {
    let c = 1e6;
    for (let i = 0; i < near.length; i++) {
      const d = clearance(near[i], x, y, t);
      if (d < c) { c = d; if (c < -40) break; }   // déjà largement touché
    }
    return c;
  }

  /* ======================================================================
     Prévision : relevé de ce qui est létal, image par image
     ----------------------------------------------------------------------
     Chaque image stocke des disques (x, y, r) et des segments épais
     (x1, y1, x2, y2, demi-épaisseur), plus le cercle de l'arène. On ne garde
     que ce que le joueur pourrait atteindre d'ici là : inutile de mesurer la
     distance à une balle qui est à l'autre bout de l'arène.
     ====================================================================== */
  const fc = {
    ok: false, n: 0, age: 0,
    circ: new Float32Array(3 * 8192), cOff: new Int32Array(FMAX), cLen: new Int32Array(FMAX),
    segs: new Float32Array(5 * 2048), sOff: new Int32Array(FMAX), sLen: new Int32Array(FMAX),
    arena: new Float32Array(3 * FMAX),
    count: new Int32Array(FMAX),      // nombre de dangers, pour détecter une divergence
    dead: -1
  };

  function capture(g, k, t, px, py, reach0, speed) {
    const E = root.Ent;
    if (k >= FMAX) return;
    const reach = reach0 + speed * t;
    let ci = k === 0 ? 0 : fc.cOff[k - 1] + fc.cLen[k - 1];
    let si = k === 0 ? 0 : fc.sOff[k - 1] + fc.sLen[k - 1];
    fc.cOff[k] = ci; fc.sOff[k] = si;
    const H = g.hazards;
    for (let i = 0; i < H.length; i++) {
      const h = H[i];
      if (h instanceof E.Bullet) {
        if (h.delay > 0) continue;
        addCirc(h.x, h.y, h.r);
      } else if (h instanceof E.Blast) {
        if (h.state !== 'boom') continue;
        addCirc(h.x, h.y, h.r);
      } else if (h instanceof E.Chaser) {
        if (h.tele > 0) continue;
        addCirc(h.x, h.y, h.r);
      } else if (h instanceof E.Laser) {
        if (h.state !== 'on') continue;
        const s = h._seg();
        addSeg(s[0], s[1], s[2], s[3], h.w * 0.5);
      } else if (h instanceof E.Wall) {
        if (h.tele > 0) continue;
        const p = h._parts();
        addSeg(p[0], p[1], p[2], p[3], h.thick * 0.5);
        addSeg(p[4], p[5], p[6], p[7], h.thick * 0.5);
      }
    }
    fc.cLen[k] = ci - fc.cOff[k];
    fc.sLen[k] = si - fc.sOff[k];
    fc.arena[k * 3] = g.arena.cx; fc.arena[k * 3 + 1] = g.arena.cy; fc.arena[k * 3 + 2] = g.arena.radius;
    fc.count[k] = H.length;
    fc.n = k + 1;

    function addCirc(x, y, r) {
      if (Math.hypot(x - px, y - py) - r > reach) return;
      if ((ci + 1) * 3 > fc.circ.length) grow('circ');
      fc.circ[ci * 3] = x; fc.circ[ci * 3 + 1] = y; fc.circ[ci * 3 + 2] = r; ci++;
    }
    function addSeg(x1, y1, x2, y2, hw) {
      if (U.distToSeg(px, py, x1, y1, x2, y2) - hw > reach) return;
      if ((si + 1) * 5 > fc.segs.length) grow('segs');
      const o = si * 5;
      fc.segs[o] = x1; fc.segs[o + 1] = y1; fc.segs[o + 2] = x2; fc.segs[o + 3] = y2; fc.segs[o + 4] = hw; si++;
    }
  }
  function grow(key) { const a = new Float32Array(fc[key].length * 2); a.set(fc[key]); fc[key] = a; }

  /** Image de la prévision correspondant à l'instant t du plan. */
  function frameAt(t) {
    const k = Math.round((t + fc.age) / F_DT) - 1;
    return k < 0 ? 0 : (k >= fc.n ? -1 : k);
  }

  /** Distance au danger le plus proche à l'image k (négatif = touché). */
  function fClear(k, x, y) {
    let c = 1e6;
    const C = fc.circ;
    for (let i = fc.cOff[k], e = i + fc.cLen[k]; i < e; i++) {
      const o = i * 3;
      const d = Math.hypot(x - C[o], y - C[o + 1]) - C[o + 2];
      if (d < c) c = d;
    }
    const S = fc.segs;
    for (let i = fc.sOff[k], e = i + fc.sLen[k]; i < e; i++) {
      const o = i * 5;
      const d = U.distToSeg(x, y, S[o], S[o + 1], S[o + 2], S[o + 3]) - S[o + 4];
      if (d < c) c = d;
    }
    return c;
  }

  /* ======================================================================
     Carte de survie espace-temps
     ----------------------------------------------------------------------
     Le faisceau ne garde que quelques plans : il lui arrive d'élaguer la
     seule fuite avant d'avoir vu pourquoi elle comptait. On calcule donc,
     sur la prévision exacte et pour CHAQUE case de l'arène, jusqu'à quand on
     peut survivre en partant de là à chaque instant (induction arrière :
     une case sûre vaut la meilleure de ses voisines atteignables à l'instant
     suivant). Exhaustif, donc rien ne peut être élagué ; le faisceau s'en
     sert comme boussole et garde, lui, la physique exacte du joueur.
     ====================================================================== */
  const MC = 16;                    // maille, px
  const MF = 6;                     // une couche toutes les MF images de prévision
  const mp = { n: 0, L: 0, ox: 0, oy: 0, V: null, free: null, ok: false, step: 0 };

  function buildMap(speed, hb) {
    const L = Math.floor(fc.n / MF);
    if (L < 2) { mp.ok = false; return; }
    // Emprise : l'arène au début de la prévision, marge comprise.
    const acx = fc.arena[0], acy = fc.arena[1], ar = fc.arena[2] + MC;
    const n = Math.ceil(2 * ar / MC), N = n * n;
    if (mp.n !== n || mp.L < L) {
      mp.V = new Float32Array(L * N);
      mp.free = new Uint8Array(L * N);
    }
    mp.n = n; mp.L = L; mp.ox = acx - ar; mp.oy = acy - ar; mp.step = MF * F_DT;
    const ox = mp.ox, oy = mp.oy, free = mp.free, V = mp.V;
    const pad = hb + 3;

    for (let l = 0; l < L; l++) {
      const k = (l + 1) * MF - 1, base = l * N;
      const cx = fc.arena[k * 3], cy = fc.arena[k * 3 + 1], rad = fc.arena[k * 3 + 2] - hb - 2;
      const r2 = rad * rad;
      for (let j = 0; j < n; j++) {
        const py = oy + (j + 0.5) * MC - cy;
        for (let i = 0; i < n; i++) {
          const px = ox + (i + 0.5) * MC - cx;
          free[base + j * n + i] = px * px + py * py < r2 ? 1 : 0;
        }
      }
      // Disques : rastérisés sur leur boîte englobante.
      const C = fc.circ;
      for (let q = fc.cOff[k], e = q + fc.cLen[k]; q < e; q++) {
        const x = C[q * 3], y = C[q * 3 + 1], rr = C[q * 3 + 2] + pad, rr2 = rr * rr;
        const i0 = Math.max(0, Math.floor((x - rr - ox) / MC)), i1 = Math.min(n - 1, Math.floor((x + rr - ox) / MC));
        const j0 = Math.max(0, Math.floor((y - rr - oy) / MC)), j1 = Math.min(n - 1, Math.floor((y + rr - oy) / MC));
        for (let j = j0; j <= j1; j++) {
          const dy = oy + (j + 0.5) * MC - y;
          for (let i = i0; i <= i1; i++) {
            const dx = ox + (i + 0.5) * MC - x;
            if (dx * dx + dy * dy < rr2) free[base + j * n + i] = 0;
          }
        }
      }
      // Segments épais (lasers, murs) : on les parcourt par petits pas, en
      // ne testant que les cases voisines de chaque pas. Les tester contre
      // toute la grille coûtait l'essentiel du calcul de la carte.
      const S = fc.segs, gx1 = ox + n * MC, gy1 = oy + n * MC;
      for (let q = fc.sOff[k], e = q + fc.sLen[k]; q < e; q++) {
        const o = q * 5, hw = S[o + 4] + pad;
        const cl = clipSeg(S[o], S[o + 1], S[o + 2], S[o + 3], ox - hw, oy - hw, gx1 + hw, gy1 + hw);
        if (!cl) continue;
        const len = Math.hypot(cl[2] - cl[0], cl[3] - cl[1]);
        const steps = Math.max(1, Math.ceil(len / (MC * 0.5)));
        const rc = Math.ceil(hw / MC) + 1;
        for (let st = 0; st <= steps; st++) {
          const sx = cl[0] + (cl[2] - cl[0]) * st / steps, sy = cl[1] + (cl[3] - cl[1]) * st / steps;
          const ci = Math.floor((sx - ox) / MC), cj = Math.floor((sy - oy) / MC);
          for (let j = Math.max(0, cj - rc); j <= Math.min(n - 1, cj + rc); j++) {
            const py = oy + (j + 0.5) * MC;
            for (let i = Math.max(0, ci - rc); i <= Math.min(n - 1, ci + rc); i++) {
              const c = base + j * n + i;
              if (!free[c]) continue;
              if (U.distToSeg(ox + (i + 0.5) * MC, py, S[o], S[o + 1], S[o + 2], S[o + 3]) < hw) free[c] = 0;
            }
          }
        }
      }
    }

    // Induction arrière. On n'élargit d'une case que lorsque le joueur a
    // réellement pu la parcourir (budget de distance), voisinage 8.
    const H = L * mp.step;
    let b = (L - 1) * N;
    for (let c = 0; c < N; c++) V[b + c] = free[b + c] ? H : (L - 1) * mp.step;
    const move = speed * mp.step;
    let budget = 0;
    const dil = new Uint8Array(L);
    for (let l = 0; l < L; l++) { budget += move; if (budget >= MC) { budget -= MC; dil[l] = 1; } }
    for (let l = L - 2; l >= 0; l--) {
      const cur = l * N, nx = (l + 1) * N, tl = l * mp.step, grow = dil[l + 1];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const c = j * n + i;
        if (!free[cur + c]) { V[cur + c] = tl; continue; }
        let best = V[nx + c];
        if (grow) {
          for (let dj = -1; dj <= 1; dj++) {
            const jj = j + dj; if (jj < 0 || jj >= n) continue;
            for (let di = -1; di <= 1; di++) {
              const ii = i + di; if (ii < 0 || ii >= n) continue;
              const v = V[nx + jj * n + ii]; if (v > best) best = v;
            }
          }
        }
        V[cur + c] = best;
      }
    }
    mp.ok = true;
  }

  /** Découpe le segment à la boîte [x0,x1]×[y0,y1] (Liang–Barsky), ou null. */
  function clipSeg(ax, ay, bx, by, x0, y0, x1, y1) {
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    const P = [-dx, dx, -dy, dy], Q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
    for (let i = 0; i < 4; i++) {
      if (P[i] === 0) { if (Q[i] < 0) return null; continue; }
      const r = Q[i] / P[i];
      if (P[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [ax + dx * t0, ay + dy * t0, ax + dx * t1, ay + dy * t1];
  }

  /** Déficit de survie (s) en (x, y) à l'instant t du plan : 0 = on tient
      jusqu'au bout de la prévision, sinon le temps qui manque. */
  function mapDeficit(x, y, t) {
    if (!mp.ok) return 0;
    const n = mp.n;
    const i = Math.floor((x - mp.ox) / MC), j = Math.floor((y - mp.oy) / MC);
    const H = mp.L * mp.step;
    if (i < 0 || j < 0 || i >= n || j >= n) return H;
    let l = Math.round((t + fc.age) / mp.step) - 1;
    if (l < 0) l = 0;
    if (l >= mp.L) return 0;
    // Meilleure des cases voisines : le joueur peut être à cheval sur deux.
    let v = 0;
    for (let dj = -1; dj <= 1; dj++) {
      const jj = j + dj; if (jj < 0 || jj >= n) continue;
      for (let di = -1; di <= 1; di++) {
        const ii = i + di; if (ii < 0 || ii >= n) continue;
        const w = mp.V[l * n * n + jj * n + ii]; if (w > v) v = w;
      }
    }
    return H - v;
  }

  /* ======================================================================
     Vérification par le vrai moteur
     ----------------------------------------------------------------------
     Le faisceau PROPOSE ses meilleurs plans ; chacun est ensuite rejoué
     dans le vrai jeu (forecast.js), avec et sans dash, et le bot garde celui
     qui survit le plus longtemps puis avec la plus grande marge. Ce qui
     dépend du joueur — tirs visés, bombe posée sur sa trajectoire, dash,
     sursis hors de l'arène — y est exact par construction.
     ====================================================================== */
  /** Distance du point (x, y) au danger létal le plus proche, maintenant. */
  function lethalDist(g, x, y) {
    const E = root.Ent, H = g.hazards;
    let c = 1e6;
    for (let i = 0; i < H.length; i++) {
      const h = H[i];
      let d = 1e6;
      if (h instanceof E.Bullet) { if (h.delay <= 0) d = Math.hypot(x - h.x, y - h.y) - h.r; }
      else if (h instanceof E.Blast) { if (h.state === 'boom') d = Math.hypot(x - h.x, y - h.y) - h.r; }
      else if (h instanceof E.Chaser) { if (h.tele <= 0) d = Math.hypot(x - h.x, y - h.y) - h.r; }
      else if (h.edge) { const e = h.edge(x, y); if (e >= 0 || (h.hits && h.hits(x, y, 0))) d = e; }
      if (d < c) c = d;
    }
    return c;
  }

  const rollPilot = {
    plan: null, start: 0, g: null, dash: false,
    think() {}, reset() {},
    axis: pilotAxis,
    held() { return false; },
    tapped(a) { if (a === 'dash' && this.dash) { this.dash = false; return true; } return false; }
  };

  /** Rejoue `plan` (avec un dash immédiat si `dash`) : survie et marge. */
  function rollout(game, plan, dash, hb) {
    rollPilot.plan = plan; rollPilot.start = game.elapsed; rollPilot.g = game; rollPilot.dash = dash;
    let minC = 1e6, minEarly = 1e6, endOut = 0, over = 0, gone = false;
    const last = Math.ceil(ROLL_H / F_DT) - 1;
    const dead = root.Forecast.run(game, rollPilot, ROLL_H, F_DT, (k, t, g) => {
      const p = g.player;
      // Distance hors de l'arène, figée à la mort : sert de départage quand
      // tous les plans sont condamnés (sinon le plus « loin des dangers »
      // gagnait, et dehors il n'y en a plus : le bot s'enfonçait).
      if (!gone) {
        const A = g.arena;
        over = Math.max(0, Math.hypot(p.x - A.cx, p.y - A.cy) - A.radius);
        if (g.__simDead) gone = true;
      }
      if (k === last) {
        // État final : être dehors, c'est une mort différée que l'horizon
        // ne voit pas. On la compte en secondes de survie perdues.
        const A = g.arena, over = Math.hypot(p.x - A.cx, p.y - A.cy) - A.radius;
        const sp = g.diff.playerSpeed * p.speedMul;
        endOut = (A.outTimer > 0 ? A.outTimer * 1.5 : 0) + (over > 0 ? over / sp + 0.3 : 0);
      }
      if (k & 1) return;
      if (p.iframes > 0) return;               // invincible : la marge ne compte pas
      const c = lethalDist(g, p.x, p.y) - hb;
      if (c < minC) minC = c;
      if (t < 0.5 && c < minEarly) minEarly = c;
    });
    return { dead, minC, minEarly, over, surv: (dead < 0 ? ROLL_H : dead) - (dead < 0 ? endOut : 0) };
  }

  /* --- Pilote de la prévision : il rejoue le dernier plan du bot --------- */
  function pilotAxis() {
    const t = this.g.elapsed - this.start;
    let acc = 0;
    for (let i = 0; i < this.plan.length; i++) {
      acc += this.plan[i][2];
      if (t < acc) return { x: this.plan[i][0], y: this.plan[i][1] };
    }
    return { x: 0, y: 0 };
  }
  const prof = { fc: 0, map: 0, beam: 0, roll: 0 };
  const pilot = {
    plan: [], start: 0, g: null,
    think() {}, reset() {},
    axis: pilotAxis,
    held() { return false; },
    tapped() { return false; }
  };

  const bot = {
    enabled: false,
    ax: 0, ay: 0,
    wantDash: false, wantAdren: false, wantFocus: false,
    acc: 0,
    danger: 0,
    dashAt: SAFE * 0.85,
    near: [],                       // dangers mobiles (modèle analytique de repli)
    stat: [],                       // explosions posées (idem)
    plan: [],                       // meilleur plan courant : [dx, dy, durée]
    planCost: 0,                    // ms de la dernière décision, pour diagnostic
    forecasts: 0,                   // prévisions calculées depuis le début
    rollouts: 0,                    // plans rejoués dans le vrai moteur
    prevPlan: null,
    lastSurv: 0,
    reset() {
      this.ax = this.ay = 0;
      this.wantDash = this.wantAdren = this.wantFocus = false;
      this.acc = 0; this.danger = 0; this.planCost = 0; this.forecasts = 0;
      this.near.length = 0; this.stat.length = 0;
      this.plan = []; this.prevPlan = null; this.rollouts = 0;
      fc.ok = false; fc.n = 0; fc.age = 0;
    }
  };

  bot.axis = function () { return { x: this.ax, y: this.ay }; };
  bot.held = function (a) { return a === 'focus' ? this.wantFocus : false; };
  bot.tapped = function (a) {
    if (a === 'dash' && this.wantDash) { this.wantDash = false; return true; }
    if (a === 'adren' && this.wantAdren) { this.wantAdren = false; return true; }
    return false;
  };

  /** Le même plan, amputé de ses `dt` premières secondes. */
  function shiftPlan(plan, dt) {
    const out = [];
    let skip = dt;
    for (const s of plan) {
      if (skip >= s[2]) { skip -= s[2]; continue; }
      out.push([s[0], s[1], s[2] - skip]);
      skip = 0;
    }
    return out;
  }

  /** Refait la prévision si elle est trop vieille ou si le réel a divergé. */
  function refreshForecast(game, speed) {
    const F = root.Forecast;
    if (!F) { fc.ok = false; return; }
    let stale = !fc.ok || fc.age >= F_REFRESH;
    if (!stale) {
      // Le réel a-t-il pris un autre chemin ? (un tir visé autrement, un
      // pattern tiré plus tôt…) Le nombre de dangers suffit à le trahir.
      const k = Math.round(fc.age / F_DT) - 1;
      if (k >= 0 && k < fc.n && fc.count[k] !== game.hazards.length) stale = true;
    }
    if (!stale) return;
    const p = game.player;
    pilot.g = game;
    pilot.start = game.elapsed;
    pilot.plan = bot.plan;
    fc.n = 0; fc.age = 0;
    const px = p.x, py = p.y;
    const q0 = performance.now();
    fc.dead = F.run(game, pilot, F_H, F_DT, (k, t, g) => capture(g, k, t, px, py, 90, speed));
    fc.ok = fc.n > 0;
    bot.forecasts++;
    const q1 = performance.now();
    if (fc.ok) buildMap(speed, CFG.PLAYER.hitbox); else mp.ok = false;
    prof.fc += q1 - q0; prof.map += performance.now() - q1;
  }

  /* ======================================================================
     Décision
     ====================================================================== */
  bot.think = function (game, dt) {
    this.acc += dt;
    fc.age += dt;
    if (this.acc < 1 / DECIDE_HZ - 1e-9) return;
    this.acc = 0;
    const t0 = performance.now();

    const p = game.player, A = game.arena;
    const hb = CFG.PLAYER.hitbox;
    const speed = game.diff.playerSpeed * p.speedMul;
    const accel = CFG.PLAYER.accel, friction = CFG.PLAYER.friction;

    refreshForecast(game, speed);

    /* --- Repli analytique : dangers pertinents, étiquetés une fois ------- */
    const near = this.near, stat = this.stat;
    near.length = 0; stat.length = 0;
    if (!fc.ok) {
      const R2 = SCAN_RADIUS * SCAN_RADIUS;
      for (let i = 0; i < game.hazards.length; i++) {
        const h = game.hazards[i];
        const k = tagOf(h);
        if (k !== K_LASER && k !== K_WALL) {
          const dx = (h.x !== undefined ? h.x : p.x) - p.x;
          const dy = (h.y !== undefined ? h.y : p.y) - p.y;
          if (dx * dx + dy * dy > R2) continue;
        }
        h.__k = k;
        if (k === K_BULLET) h.__drift = (Math.abs(h.curve) + h.homing) * 60;
        if (k === K_WALL) { h.__cx = Math.cos(h.a); h.__cy = Math.sin(h.a); }
        (k === K_BLAST ? stat : near).push(h);
      }
    }

    /* --- Contraintes du défi en cours ------------------------------------ */
    const ch = game.objectives && game.objectives.activeChallenge;
    const noDash = !!(ch && ch.cond === 'nodash');
    const keepInner = !!(ch && ch.cond === 'inner');
    const wantGraze = !!(ch && ch.cond === 'graze');
    const innerR = A.innerRadius ? A.innerRadius() : A.radius * 0.42;
    const grace = game.diff.outOfBoundsGrace || 1e9;

    /* --- Évaluation d'un point du plan ----------------------------------- */
    // Renvoie le score du point et, via ev.c, sa marge au danger le plus proche.
    const ev = { s: 0, c: 0, out: false };
    function evalPoint(x, y, t, weight, look) {
      let s = 0, c, acx = A.cx, acy = A.cy, ar = A.radius;
      const k = fc.ok ? frameAt(t) : -1;
      if (k >= 0) {
        acx = fc.arena[k * 3]; acy = fc.arena[k * 3 + 1]; ar = fc.arena[k * 3 + 2];
        c = fClear(k, x, y) - hb;
      } else {
        const cm = minClear(near, x, y, t), cs = minClear(stat, x, y, t);
        c = (cm < cs ? cm : cs) - hb;
      }
      const dc = Math.hypot(x - acx, y - acy);
      const over = dc - (ar - hb - 18);
      if (over > 0) s -= 4000 + over * 40;         // pénalité forte mais continue
      s -= dc * 0.35;                              // le centre garde des issues
      if (keepInner) s -= Math.max(0, dc - innerR * 0.88) * 8;

      if (c < SAFE) { const d = SAFE - c; s -= d * d * 2.2; }   // frôler coûte, toucher coûte tout

      // Regard en avant : cet endroit va-t-il devenir mortel ? Sans ça, le
      // faisceau élague les fuites AVANT que la détonation n'entre dans son
      // horizon (rester sous une bombe annoncée paraît confortable tant
      // qu'elle n'a pas explosé), et à l'explosion il ne reste plus que des
      // plans qui restent dessous. Mesuré : c'était la première cause de
      // mort en easy avec la prévision.
      if (k >= 0 && look) {
        for (let j = 0; j < LOOK.length; j++) {
          const kf = frameAt(t + LOOK[j]);
          if (kf < 0) break;
          const cf = fClear(kf, x, y) - hb;
          if (cf < SAFE) { const d = SAFE - cf; s -= d * d * LOOK_W[j]; }
        }
      }
      s += Math.min(Math.max(c, 0), 240) * weight;
      if (wantGraze && c > SAFE) s -= Math.abs(c - (SAFE + 16)) * 1.6 * weight;
      ev.s = s; ev.c = c; ev.out = dc > ar;
      return ev;
    }

    /* --- Recherche en faisceau -------------------------------------------- */
    const tb0 = performance.now();
    let beam = [{
      x: p.x, y: p.y, vx: p.vx, vy: p.vy,
      score: 0, worst: 1e6, early: 1e6, out: A.outTimer || 0, dir: null
    }];
    let tBase = 0;

    for (let d = 0; d < SEGS.length; d++) {
      const seg = SEGS[d], nsub = SUBS[d], sub = seg / nsub;
      const weight = 1.8 * Math.pow(0.8, d);       // le proche pèse plus que le lointain
      // Être touché dans la prévision, c'est la mort si rien ne change : la
      // sanction ne s'efface qu'avec l'incertitude de la visée.
      const lethal = 30000 * Math.pow(0.88, d);
      const kids = [];

      for (let bi = 0; bi < beam.length; bi++) {
        const node = beam[bi];
        for (let di = 0; di < BRANCH.length; di++) {
          const dirX = BRANCH[di][0], dirY = BRANCH[di][1];
          const moving = dirX !== 0 || dirY !== 0;
          const acc = moving ? accel : friction;

          // Intégration identique à celle du joueur : sans elle, le plan
          // viserait des positions que le champion n'atteint pas à temps.
          let x = node.x, y = node.y, vx = node.vx, vy = node.vy;
          let score = node.score, worst = node.worst, early = node.early, out = node.out;

          for (let k = 0; k < nsub; k++) {
            vx = U.approach(vx, dirX * speed, acc * sub);
            vy = U.approach(vy, dirY * speed, acc * sub);
            x += vx * sub; y += vy * sub;
            const t = tBase + (k + 1) * sub;
            const e = evalPoint(x, y, t, weight, d < LOOK_DEPTH);
            score += e.s;
            if (e.c < worst) worst = e.c;
            if (e.c < 0) score -= lethal;
            // Sursis hors limites : le jeu cumule le temps passé dehors et le
            // rend 2,2 fois plus vite dedans. Au-delà, l'arène tue.
            if (e.out) out += sub; else out = Math.max(0, out - sub * 2.2);
            if (out >= grace - 0.04) score -= lethal * 2;
            // Marge du court terme, gardée à part : c'est elle qui décide du
            // dash. Le pire de tout le plan est bien trop pessimiste pour ça.
            if (d < 2) {
              if (e.c < early) early = e.c;
              // Veto : aucune promesse lointaine ne rachète un frôlement
              // mortel maintenant.
              if (e.c < 6) score -= 50000;
            }
          }

          kids.push({
            x, y, vx, vy, score, worst, early, out,
            first: node.dir === null ? di : node.first,
            dir: di, parent: node
          });
        }
      }

      // Boussole : le temps de survie qui manque depuis la fin du segment.
      // Au classement seulement, pour ne pas le cumuler de couche en couche.
      for (let q = 0; q < kids.length; q++) {
        const kq = kids[q];
        kq.rank = kq.score - MAP_W * mapDeficit(kq.x, kq.y, tBase + seg);
      }
      kids.sort((a, b) => b.rank - a.rank);

      // Diversité : sans quota, les meilleurs descendants viennent tous du
      // même parent et le faisceau ne compare plus qu'une seule ouverture.
      const perFirst = new Int8Array(BRANCH.length);
      const kept = [];
      for (let i = 0; i < kids.length && kept.length < BEAM; i++) {
        const f = kids[i].first;
        if (perFirst[f] >= 2) continue;
        perFirst[f]++;
        kept.push(kids[i]);
      }
      beam = kept;
      tBase += seg;
    }

    beam.sort((a, b) => b.rank - a.rank);
    if (this.debug) this.debug(beam);
    // Plan complet, remonté depuis la feuille.
    const planOf = leaf => {
      const plan = [];
      for (let n = leaf, d = SEGS.length - 1; n && n.dir !== null; n = n.parent, d--) {
        plan.unshift([BRANCH[n.dir][0], BRANCH[n.dir][1], SEGS[d]]);
      }
      return plan;
    };

    let best = beam[0], plan = planOf(best), dashNow = false;
    // Calme : la prévision (qui suit déjà le plan courant) ne voit aucune
    // mort, et le meilleur plan garde de la marge partout. Inutile alors de
    // payer les rejeux, qui sont l'essentiel du calcul.
    const calm = fc.ok && fc.dead < 0 && best.worst > CALM_MARGIN && this.prevPlan;
    this.lastCalm = !!calm;
    if (fc.ok && !calm) {
      // Candidats : les meilleurs plans, un par première direction, plus le
      // plan précédent (stabilité), plus leurs variantes avec dash.
      const cands = [], seenFirst = new Set();
      for (const nd of beam) {
        if (seenFirst.has(nd.first)) continue;
        seenFirst.add(nd.first);
        cands.push({ plan: planOf(nd), node: nd, dash: false });
        if (cands.length >= ROLL_K) break;
      }
      if (this.prevPlan && this.prevPlan.length) cands.push({ plan: this.prevPlan, node: null, dash: false });
      // Fuites franches : une direction tenue, puis l'arrêt. Le faisceau les
      // élague parfois alors qu'elles sont la seule issue.
      for (let i = 0; i < 12; i += 12 / ROLL_FLEE) {
        cands.push({ plan: [[BRANCH[i][0], BRANCH[i][1], 0.7], [0, 0, 1.5]], node: null, dash: false });
      }
      // Pendant le défi « sans dash », le dash reste un dernier recours :
      // rater le défi coûte une vague de punition, mourir coûte la run.
      const canDash = p.has('dash') && p.dashCharges > 0;
      if (canDash) {
        const n0 = cands.length;
        for (let i = 0; i < Math.min(ROLL_DASH, n0); i++) cands.push({ plan: cands[i].plan, node: cands[i].node, dash: true });
      }
      let pick = null;
      const r0 = performance.now();
      prof.beam += r0 - tb0;
      for (const c of cands) {
        c.r = rollout(game, c.plan, c.dash, hb);
        // Survie d'abord ; à survie égale (à 50 ms près), la marge, et on
        // n'use un dash que s'il rapporte vraiment quelque chose.
        c.key = Math.round(c.r.surv / 0.05) * 1e6 - Math.min(c.r.over, 400) * 1000 +
                Math.min(c.r.minC, 200) * 100 + Math.min(c.r.minEarly, 200) -
                (c.dash ? (noDash ? 2e7 : 600) : 0);          // sans dash : il doit gagner 1 s de survie
        if (!pick || c.key > pick.key) pick = c;
      }
      this.rollouts += cands.length;
      prof.roll += performance.now() - r0;
      plan = pick.plan; dashNow = pick.dash;
      if (pick.node) best = pick.node;
      this.lastSurv = pick.r.surv;
    }
    // Le plan retenu, décalé d'un pas : c'est lui que la prochaine prévision
    // fera suivre au joueur.
    this.plan = plan;
    this.prevPlan = shiftPlan(plan, 1 / DECIDE_HZ);
    this.ax = plan[0][0]; this.ay = plan[0][1];

    this.lastWorst = best.worst;
    const bestClear = best.early;
    const trapped = bestClear < 4;
    this.danger = U.clamp(1 - bestClear / 160, 0, 1);

    /* --- Sorts -------------------------------------------------------------- */
    // Le dash part AVANT l'impact : attendre d'être acculé, c'est dasher une
    // frame trop tard (mesuré : survie moyenne 8,6 s → 15,1 s en hard).
    this.wantDash = fc.ok ? dashNow
      : !noDash && p.has('dash') && p.dashCharges > 0 && bestClear < this.dashAt;

    // L'adrénaline se recharge en frôlant : la garder pleine ne rapporte rien.
    this.wantAdren = p.has('adrenalin') && p.adrenalin >= 1 && p.slowT <= 0 &&
                     (trapped || this.danger > 0.45);

    this.wantFocus = wantGraze && p.has('focus') && !trapped && this.danger < 0.5;

    this.planCost = performance.now() - t0;
  };

  bot._fc = fc; bot._mp = mp; bot._prof = prof;       // accès de diagnostic
  root.Bot = bot;
})(window);
