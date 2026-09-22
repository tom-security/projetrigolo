/* ==========================================================================
   bot.js — pilote automatique du mode BULLET-HELL
   --------------------------------------------------------------------------
   Il expose exactement la même interface que `Input` (axis / held / tapped),
   donc le joueur ne sait pas qu'il est piloté : game.js lui passe le bot à la
   place du clavier, et rien d'autre ne change.

   Méthode : à chaque décision on échantillonne des directions, on simule la
   position du joueur à plusieurs horizons, et on estime la distance au danger
   le plus proche À CE MOMENT-LÀ — pas maintenant. Esquiver un projectile
   demande de savoir où il sera, pas où il est.

   Ce bot ne fonctionne PAS en mode LoL : là-bas on ne se déplace pas par
   direction mais par ordre de clic, et la visée ennemie réagit à cet ordre.
   C'est une autre mécanique, qui demanderait un autre pilote.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.CFG;

  const DIRS = 24;                  // directions testées
  const HORIZONS = [0.10, 0.26, 0.46, 0.72];
  const DECIDE_HZ = 60;             // fréquence de décision (le jeu tourne à 120)
  const SCAN_RADIUS = 520;          // au-delà, un danger ne concerne pas la frame
  const SAFE = 26;                  // marge visée au-delà du hitbox, en pixels

  const bot = {
    enabled: false,
    ax: 0, ay: 0,
    wantDash: false,
    wantAdren: false,
    wantFocus: false,
    acc: 0,
    danger: 0,                      // 0..1, sert au HUD
    // Marge sous laquelle le bot dashe. Valeur choisie par comparaison sur
    // 5 runs par réglage : dasher tôt bat largement dasher acculé
    // (hard : 8,6 s → 15,1 s de survie moyenne). Réglable à chaud.
    dashAt: SAFE * 0.85,
    near: [],
    reset() {
      this.ax = this.ay = 0;
      this.wantDash = this.wantAdren = this.wantFocus = false;
      this.acc = 0; this.danger = 0; this.near.length = 0;
    }
  };

  /* --- Interface identique à celle du clavier ---------------------------- */
  bot.axis = function () { return { x: this.ax, y: this.ay }; };
  bot.held = function (a) { return a === 'focus' ? this.wantFocus : false; };
  bot.tapped = function (a) {
    if (a === 'dash' && this.wantDash) { this.wantDash = false; return true; }
    if (a === 'adren' && this.wantAdren) { this.wantAdren = false; return true; }
    return false;
  };

  /* ======================================================================
     Distance au danger `hz` depuis (x, y), tel qu'il sera dans `t` secondes.
     Renvoie une distance à la surface ; négatif = touché.
     ====================================================================== */
  function clearance(hz, x, y, t, game) {
    const E = root.Ent;

    // --- Projectile : extrapolation linéaire -----------------------------
    if (hz instanceof E.Bullet) {
      if (hz.delay > t) return 1e6;                 // pas encore apparu
      const bx = hz.x + hz.vx * t, by = hz.y + hz.vy * t;
      // Une trajectoire courbe ou traquante s'écarte de la droite : on
      // élargit le projectile plutôt que de simuler, c'est moins cher et
      // ça penche du bon côté (prudence).
      const drift = (Math.abs(hz.curve) + hz.homing) * t * 60;
      return Math.hypot(x - bx, y - by) - hz.r - drift;
    }

    // --- Explosion : dangereuse du télégraphe à la fin de la persistance --
    if (hz instanceof E.Blast) {
      const d = Math.hypot(x - hz.x, y - hz.y) - hz.r;
      if (hz.state === 'boom') return d;
      // En télégraphe : létale un peu avant la détonation, pour avoir le
      // temps d'en sortir plutôt que d'y être encore au moment du boum.
      return (t >= hz.tele - 0.18) ? d : Math.max(d, 0.001);
    }

    // --- Laser : le faisceau tourne, on projette son angle ---------------
    if (hz instanceof E.Laser) {
      const a = hz.a + hz.spin * t;
      if (hz.state === 'tele' && t < hz.tele - 0.12) return 1e6;
      const ex = hz.x + Math.cos(a) * hz.len, ey = hz.y + Math.sin(a) * hz.len;
      return U.distToSeg(x, y, hz.x, hz.y, ex, ey) - hz.w * 0.5;
    }

    // --- Mur : il avance, et sa brèche peut dériver ----------------------
    if (hz instanceof E.Wall) {
      if (hz.tele > t) return 1e6;
      const px = hz.x + Math.cos(hz.a) * hz.speed * t;
      const py = hz.y + Math.sin(hz.a) * hz.speed * t;
      const tx = -Math.sin(hz.a), ty = Math.cos(hz.a);
      const gap = hz.gap + hz.drift * t;
      const a1x = px + tx * -hz.half, a1y = py + ty * -hz.half;
      const b1x = px + tx * (gap - hz.gapHalf), b1y = py + ty * (gap - hz.gapHalf);
      const a2x = px + tx * (gap + hz.gapHalf), a2y = py + ty * (gap + hz.gapHalf);
      const b2x = px + tx * hz.half, b2y = py + ty * hz.half;
      return Math.min(U.distToSeg(x, y, a1x, a1y, b1x, b1y),
                      U.distToSeg(x, y, a2x, a2y, b2x, b2y)) - hz.thick * 0.5;
    }

    // --- Traqueuse : elle vient vers nous, on la fait avancer vers nous ---
    if (hz instanceof E.Chaser) {
      if (hz.tele > t) return 1e6;
      const a = Math.atan2(y - hz.y, x - hz.x);     // au pire elle vise juste
      const cx = hz.x + Math.cos(a) * hz.speed * t;
      const cy = hz.y + Math.sin(a) * hz.speed * t;
      return Math.hypot(x - cx, y - cy) - hz.r;
    }

    const d = hz.edge ? hz.edge(x, y) : 1e6;
    return d < 0 ? 1e6 : d;                          // inconnu et inactif
  }

  /* ======================================================================
     Décision
     ====================================================================== */
  bot.think = function (game, dt) {
    this.acc += dt;
    if (this.acc < 1 / DECIDE_HZ) return;
    this.acc = 0;

    const p = game.player, A = game.arena;
    const hb = CFG.PLAYER.hitbox;
    const speed = game.diff.playerSpeed * p.speedMul;

    // --- On ne raisonne que sur ce qui peut nous atteindre --------------
    const near = this.near;
    near.length = 0;
    const R2 = SCAN_RADIUS * SCAN_RADIUS;
    for (let i = 0; i < game.hazards.length; i++) {
      const hz = game.hazards[i];
      const dx = (hz.x !== undefined ? hz.x : p.x) - p.x;
      const dy = (hz.y !== undefined ? hz.y : p.y) - p.y;
      // Lasers et murs sont longs : leur origine peut être loin sans qu'ils
      // cessent de nous menacer. On ne les filtre pas sur la distance.
      if (hz instanceof root.Ent.Laser || hz instanceof root.Ent.Wall ||
          dx * dx + dy * dy < R2) near.push(hz);
    }

    // --- Contraintes venant du défi en cours ----------------------------
    const ch = game.objectives && game.objectives.activeChallenge;
    const noDash = !!(ch && ch.cond === 'nodash');
    const keepInner = !!(ch && ch.cond === 'inner');
    const wantGraze = !!(ch && ch.cond === 'graze');
    const innerR = A.innerRadius ? A.innerRadius() : A.radius * 0.42;

    let bestA = null, bestScore = -Infinity, bestClear = -1e6;
    let stayScore = -Infinity, stayClear = -1e6;

    for (let i = 0; i <= DIRS; i++) {
      // i === DIRS teste l'immobilité : parfois c'est la bonne réponse.
      const moving = i < DIRS;
      const ang = moving ? (i / DIRS) * U.TAU : 0;
      const cx = moving ? Math.cos(ang) : 0, cy = moving ? Math.sin(ang) : 0;

      let score = 0, minClear = 1e6;

      for (let h = 0; h < HORIZONS.length; h++) {
        const t = HORIZONS[h];
        const px = p.x + cx * speed * t;
        const py = p.y + cy * speed * t;
        const weight = 1.5 - h * 0.28;   // l'incertitude croît avec l'horizon

        // Sortir de l'arène tue. Pénalité forte mais CONTINUE : quand tout
        // est mauvais, il faut encore pouvoir classer les options.
        const dc = Math.hypot(px - A.cx, py - A.cy);
        const over = dc - (A.radius - hb - 18);
        if (over > 0) score -= 4000 + over * 40;
        // Légère préférence pour le centre : plus d'échappatoires ensuite.
        score -= dc * 0.35;
        if (keepInner) score -= Math.max(0, dc - innerR * 0.88) * 8;

        let c = 1e6;
        for (let k = 0; k < near.length; k++) {
          const d = clearance(near[k], px, py, t, game);
          if (d < c) c = d;
        }
        c -= hb;
        if (c < minClear) minClear = c;

        // Le cœur du classement. Sous la marge de sécurité, la pénalité
        // croît au carré : frôler coûte un peu, se faire toucher coûte tout,
        // et entre les deux l'ordre reste exploitable.
        if (c < SAFE) {
          const deficit = SAFE - c;
          score -= deficit * deficit * 2.2 * weight;
        }
        score += Math.min(Math.max(c, 0), 240) * weight;
      }

      // Frôler charge l'adrénaline, mais c'est un mauvais échange hors du
      // défi : mesuré, l'incitation permanente faisait chuter la survie en
      // easy de 56 s à 30 s de moyenne pour un gain nul ailleurs. Le bot ne
      // s'approche donc que lorsque l'objectif l'exige.
      if (wantGraze && minClear > SAFE) {
        score -= Math.abs(minClear - (SAFE + 16)) * 1.6;
      }

      if (!moving) { stayScore = score; stayClear = minClear; }
      if (score > bestScore) { bestScore = score; bestA = ang; bestClear = minClear; }
    }

    // « Piégé » = même la meilleure option laisse passer sous la marge.
    const trapped = bestClear < 4;

    // --- Sortie de décision ---------------------------------------------
    // L'immobilité ne gagne que si elle est au moins aussi sûre : à score
    // égal, bouger garde l'initiative.
    if (bestA === null || (stayScore >= bestScore && stayClear >= bestClear)) {
      this.ax = this.ay = 0;
    } else {
      this.ax = Math.cos(bestA); this.ay = Math.sin(bestA);
    }

    this.danger = U.clamp(1 - bestClear / 160, 0, 1);

    // --- Dash : l'invincibilité doit partir AVANT l'impact ---------------
    // Attendre d'être acculé, c'est dasher une frame trop tard. On part dès
    // que la meilleure trajectoire passe sous la marge de sécurité.
    this.wantDash = !noDash && p.has('dash') && p.dashCharges > 0 &&
                    bestClear < this.dashAt;
    if (this.wantDash && bestA !== null) { this.ax = Math.cos(bestA); this.ay = Math.sin(bestA); }

    // --- Adrénaline : ralentir le monde dès que ça se tend ---------------
    // La jauge se recharge en frôlant : la garder pleine ne rapporte rien,
    // la dépenser tôt évite la situation sans issue.
    this.wantAdren = p.has('adrenalin') && p.adrenalin >= 1 &&
                     p.slowT <= 0 && (trapped || this.danger > 0.45);

    // --- Focus : uniquement pour frôler proprement -----------------------
    this.wantFocus = wantGraze && p.has('focus') && !trapped && this.danger < 0.5;
  };

  root.Bot = bot;
})(window);
