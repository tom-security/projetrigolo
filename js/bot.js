/* ==========================================================================
   bot.js — pilote automatique du mode BULLET-HELL
   --------------------------------------------------------------------------
   Il expose exactement la même interface que `Input` (axis / held / tapped),
   donc le joueur ne sait pas qu'il est piloté : game.js lui passe le bot à la
   place du clavier, et rien d'autre ne change.

   MÉTHODE — recherche en faisceau sur des séquences d'actions.
   Une version antérieure choisissait gloutonnement la meilleure direction
   pour l'instant suivant. Mesuré contre un oracle (propagation de toutes les
   positions atteignables), ce glouton mourait à 1,8 s en infernal là où une
   trajectoire survivante existait jusqu'à 8,5 s : le problème n'était pas la
   réaction mais l'absence de plan. On déroule donc des suites de décisions,
   on garde les meilleures, et on ne joue que le premier pas.

   Le modèle de déplacement reproduit celui du joueur, accélération comprise :
   planifier avec une vitesse instantanée ferait viser des positions que le
   champion n'atteint pas.

   Ce bot ne fonctionne PAS en mode LoL : là-bas on ne se déplace pas par
   direction mais par ordre de clic, et la visée ennemie réagit à cet ordre.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.CFG;

  /* --- Réglages de recherche -------------------------------------------- */
  const SEG = 0.11;                 // durée d'une décision dans le plan
  const DEPTH = 8;                  // profondeur → horizon 0.88 s
  const BEAM = 14;                  // largeur du faisceau
  const SUBSTEPS = 2;               // intégrations par segment (anti-tunnel)
  const DECIDE_HZ = 60;             // replanification par seconde
  const SCAN_RADIUS = 620;
  const SAFE = 26;                  // marge visée au-delà du hitbox, en pixels

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

  const bot = {
    enabled: false,
    ax: 0, ay: 0,
    wantDash: false, wantAdren: false, wantFocus: false,
    acc: 0,
    danger: 0,
    dashAt: SAFE * 0.85,
    near: [],                       // dangers mobiles (extrapolés)
    stat: [],                       // explosions posées (géométrie certaine)
    planCost: 0,                    // ms de la dernière décision, pour diagnostic
    reset() {
      this.ax = this.ay = 0;
      this.wantDash = this.wantAdren = this.wantFocus = false;
      this.acc = 0; this.danger = 0; this.planCost = 0;
      this.near.length = 0; this.stat.length = 0;
    }
  };

  bot.axis = function () { return { x: this.ax, y: this.ay }; };
  bot.held = function (a) { return a === 'focus' ? this.wantFocus : false; };
  bot.tapped = function (a) {
    if (a === 'dash' && this.wantDash) { this.wantDash = false; return true; }
    if (a === 'adren' && this.wantAdren) { this.wantAdren = false; return true; }
    return false;
  };

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
        return Math.hypot(x - h.x, y - h.y) - h.r;
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
     Décision
     ====================================================================== */
  bot.think = function (game, dt) {
    this.acc += dt;
    if (this.acc < 1 / DECIDE_HZ) return;
    this.acc = 0;
    const t0 = performance.now();

    const p = game.player, A = game.arena;
    const hb = CFG.PLAYER.hitbox;
    const speed = game.diff.playerSpeed * p.speedMul;
    const accel = CFG.PLAYER.accel, friction = CFG.PLAYER.friction;

    /* --- Dangers pertinents, étiquetés une fois --------------------------
       On sépare le MOBILE du CERTAIN. Le poids qui décroît avec l'horizon
       modélise l'incertitude de prédiction : légitime pour un projectile
       qu'on extrapole, absurde pour une explosion déjà posée au sol dont on
       connaît le centre, le rayon et l'instant exact. Les mélanger rendait le
       bot aveugle aux salves atterrissant vers 0,7 s — sa première cause de
       mort. */
    const near = this.near;
    const stat = this.stat;
    near.length = 0; stat.length = 0;
    const R2 = SCAN_RADIUS * SCAN_RADIUS;
    for (let i = 0; i < game.hazards.length; i++) {
      const h = game.hazards[i];
      const k = tagOf(h);
      // Lasers et murs sont longs : leur origine peut être loin sans qu'ils
      // cessent de menacer. On ne les filtre pas sur la distance.
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

    /* --- Contraintes du défi en cours ------------------------------------ */
    const ch = game.objectives && game.objectives.activeChallenge;
    const noDash = !!(ch && ch.cond === 'nodash');
    const keepInner = !!(ch && ch.cond === 'inner');
    const wantGraze = !!(ch && ch.cond === 'graze');
    const innerR = A.innerRadius ? A.innerRadius() : A.radius * 0.42;
    const edgeR = A.radius - hb - 18;

    /* --- Évaluation d'un point du plan ----------------------------------- */
    function evalPoint(x, y, t, weight) {
      let s = 0;
      const dc = Math.hypot(x - A.cx, y - A.cy);
      const over = dc - edgeR;
      if (over > 0) s -= 4000 + over * 40;        // pénalité forte mais continue
      s -= dc * 0.35;                              // le centre garde des issues
      if (keepInner) s -= Math.max(0, dc - innerR * 0.88) * 8;

      // Mobile : extrapolé, donc escompté avec l'horizon.
      const cm = minClear(near, x, y, t) - hb;
      if (cm < SAFE) {
        const d = SAFE - cm;
        s -= d * d * 2.2 * weight;                 // frôler coûte, toucher coûte tout
      }
      s += Math.min(Math.max(cm, 0), 240) * weight;

      // Certain : géométrie et instant connus, aucun escompte.
      const cs = minClear(stat, x, y, t) - hb;
      if (cs < SAFE) {
        const d = SAFE - cs;
        s -= d * d * 2.2;
      }
      s += Math.min(Math.max(cs, 0), 240);

      const c = cm < cs ? cm : cs;
      if (wantGraze && c > SAFE) s -= Math.abs(c - (SAFE + 16)) * 1.6 * weight;
      return { s, c };
    }

    /* --- Recherche en faisceau -------------------------------------------- */
    let beam = [{
      x: p.x, y: p.y, vx: p.vx, vy: p.vy,
      score: 0, worst: 1e6, early: 1e6,
      firstI: -1, firstX: 0, firstY: 0
    }];
    const sub = SEG / SUBSTEPS;

    for (let d = 0; d < DEPTH; d++) {
      const weight = 1.8 * Math.pow(0.72, d);      // le proche pèse plus que le lointain
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
          let score = node.score, worst = node.worst, early = node.early;

          for (let k = 0; k < SUBSTEPS; k++) {
            vx = U.approach(vx, dirX * speed, acc * sub);
            vy = U.approach(vy, dirY * speed, acc * sub);
            x += vx * sub; y += vy * sub;
            const t = d * SEG + (k + 1) * sub;
            const e = evalPoint(x, y, t, weight);
            score += e.s;
            if (e.c < worst) worst = e.c;
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
            x, y, vx, vy, score, worst, early,
            firstI: node.firstI < 0 ? di : node.firstI,
            firstX: node.firstI < 0 ? dirX : node.firstX,
            firstY: node.firstI < 0 ? dirY : node.firstY
          });
        }
      }

      kids.sort((a, b) => b.score - a.score);

      // Diversité : sans quota, les meilleurs descendants viennent tous du
      // même parent et le faisceau ne compare plus qu'une seule ouverture.
      const perFirst = new Int8Array(BRANCH.length);
      const kept = [];
      for (let i = 0; i < kids.length && kept.length < BEAM; i++) {
        const f = kids[i].firstI;
        if (perFirst[f] >= 2) continue;
        perFirst[f]++;
        kept.push(kids[i]);
      }
      beam = kept;
    }

    const best = beam[0];
    this.ax = best.firstX; this.ay = best.firstY;
    const bestClear = best.early;
    const trapped = bestClear < 4;
    this.danger = U.clamp(1 - bestClear / 160, 0, 1);

    /* --- Sorts -------------------------------------------------------------- */
    // Le dash part AVANT l'impact : attendre d'être acculé, c'est dasher une
    // frame trop tard (mesuré : survie moyenne 8,6 s → 15,1 s en hard).
    this.wantDash = !noDash && p.has('dash') && p.dashCharges > 0 && bestClear < this.dashAt;

    // L'adrénaline se recharge en frôlant : la garder pleine ne rapporte rien.
    this.wantAdren = p.has('adrenalin') && p.adrenalin >= 1 && p.slowT <= 0 &&
                     (trapped || this.danger > 0.45);

    this.wantFocus = wantGraze && p.has('focus') && !trapped && this.danger < 0.5;

    this.planCost = performance.now() - t0;
  };

  root.Bot = bot;
})(window);
