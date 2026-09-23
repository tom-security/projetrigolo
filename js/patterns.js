/* ==========================================================================
   patterns.js — bibliothèque d'attaques
   --------------------------------------------------------------------------
   Chaque pattern porte des poids : skill / spam / brutal. Le directeur tire
   dedans selon le profil de la difficulté — c'est là que se joue la promesse
   « easy & medium = skill, hard & ultra = skill + spam, infernal = inhumain ».
   tier = palier d'intensité minimum avant d'apparaître (progressivité).
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, E = root.Ent;

  /* --- Helpers de contexte ------------------------------------------------ */
  function edgePoint(c, ang, pad) {
    const R = c.arena.radius + (pad === undefined ? 40 : pad);
    return { x: c.arena.cx + Math.cos(ang) * R, y: c.arena.cy + Math.sin(ang) * R };
  }

  /** Visée à l'avance. err = bruit en radians (0 = parfait, réservé à Infernal). */
  function lead(c, sx, sy, speed, err) {
    const p = c.player;
    let t = U.dist(sx, sy, p.x, p.y) / Math.max(60, speed);
    for (let i = 0; i < 2; i++) {
      const tx = p.x + p.vx * t, ty = p.y + p.vy * t;
      t = U.dist(sx, sy, tx, ty) / Math.max(60, speed);
    }
    const tx = p.x + p.vx * t, ty = p.y + p.vy * t;
    return Math.atan2(ty - sy, tx - sx) + (err ? U.rr(-err, err) : 0);
  }

  function push(c, e) { c.game.hazards.push(e); }

  /** Origine d'un pattern radial, jamais collée au joueur.
      Un anneau qui apparaît sur la tête n'est pas de la difficulté, c'est un
      tirage au sort. On repousse l'origine à minDist du joueur. */
  function safeOrigin(c, minDist, spread) {
    const p = c.player, a = c.arena;
    for (let i = 0; i < 12; i++) {
      const ang = U.rr(0, U.TAU), d = U.rr(0, spread);
      const x = a.cx + Math.cos(ang) * d, y = a.cy + Math.sin(ang) * d;
      if (U.dist(x, y, p.x, p.y) >= minDist) return { x, y };
    }
    // Repli : on part à l'opposé du joueur par rapport au centre.
    const ang = Math.atan2(a.cy - p.y, a.cx - p.x);
    return { x: a.cx + Math.cos(ang) * minDist * 0.8, y: a.cy + Math.sin(ang) * minDist * 0.8 };
  }

  /** Rayon d'apparition des patterns radiaux : le point d'origine reste un
      abri. C'est ce qui rend un anneau lisible plutôt qu'aléatoire. */
  const HUB = 52;

  /* ========================================================================
     TIER 0 — lecture pure
     ===================================================================== */

  /** Anneau qui s'ouvre : il faut choisir sa brèche AVANT qu'elle n'arrive. */
  function ringBurst(c) {
    const n = Math.round(c.cnt(26));
    const gaps = 1 + (c.I > 2 ? 1 : 0);
    const gapAt = [];
    for (let g = 0; g < gaps; g++) gapAt.push(U.rr(0, U.TAU));
    const gapW = U.lerp(0.55, 0.30, U.clamp(c.I / 5, 0, 1));
    const sp = c.spd(155);
    const o = safeOrigin(c, 190, 110);

    for (let i = 0; i < n; i++) {
      const a = (i / n) * U.TAU;
      let skip = false;
      for (const g of gapAt) if (Math.abs(U.angDelta(a, g)) < gapW) { skip = true; break; }
      if (skip) continue;
      push(c, new E.Bullet({
        x: o.x + Math.cos(a) * HUB, y: o.y + Math.sin(a) * HUB,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 7, c: '#4de3ff', delay: c.warn(0.30), life: 8
      }));
    }
  }

  /** Salve visée en éventail : on esquive perpendiculairement, pas en reculant. */
  function aimedVolley(c) {
    const shots = Math.round(c.cnt(4));
    const from = edgePoint(c, U.rr(0, U.TAU));
    const sp = c.spd(240);
    for (let i = 0; i < shots; i++) {
      c.sched(i * (0.22 / Math.max(1, c.I * 0.4)), () => {
        const a = lead(c, from.x, from.y, sp, c.aimError);
        const spread = U.lerp(0.20, 0.06, U.clamp(c.I / 5, 0, 1));
        for (let k = -1; k <= 1; k++) {
          push(c, new E.Bullet({
            x: from.x, y: from.y,
            vx: Math.cos(a + k * spread) * sp, vy: Math.sin(a + k * spread) * sp,
            r: 8, c: '#ffd166', delay: c.warn(0.16)
          }));
        }
      });
    }
  }

  /** LES GROSSES BOULES. Le curseur central de la difficulté. */
  function bombCluster(c) {
    const A = c.diff.aoe;
    const n = U.ri(A.count[0], A.count[1]) + Math.floor(c.I * 0.35);
    const linger = A.linger + A.lingerGrowth * c.I;       // persistance progressive
    const tele = c.warnAoe(A.telegraph);
    const p = c.player;

    for (let i = 0; i < n; i++) {
      c.sched(i * U.rr(0.05, 0.19), () => {
        let x, y;
        if (i === 0) {
          // La première tombe toujours sur la position anticipée : on ne peut
          // pas rester immobile.
          x = p.x + p.vx * tele * 0.75;
          y = p.y + p.vy * tele * 0.75;
        } else {
          const a = U.rr(0, U.TAU), d = U.rr(40, c.arena.radius * 0.85);
          x = c.arena.cx + Math.cos(a) * d;
          y = c.arena.cy + Math.sin(a) * d;
        }
        push(c, new E.Blast({
          floor: c.warnAoe(0),
          x, y, r: A.radius * U.rr(0.85, 1.15),
          tele, linger, secondary: A.secondary,
          c: '#ff8a3d', grow: c.diff.id === 'infernal' ? 22 : 0
        }));
      });
    }
  }

  /* ========================================================================
     TIER 1 — placement et timing
     ===================================================================== */

  /** Balayage laser : lecture de l'angle, on traverse au bon moment. */
  function laserSweep(c) {
    const from = edgePoint(c, U.rr(0, U.TAU), -10);
    const toward = Math.atan2(c.arena.cy - from.y, c.arena.cx - from.x);
    const dir = U.chance(0.5) ? 1 : -1;
    const spin = U.lerp(0.35, 1.25, U.clamp(c.I / 5, 0, 1)) * dir;
    push(c, new E.Laser({
      x: from.x, y: from.y, a: toward - dir * 0.8,
      w: 20, tele: c.warn(0.85), active: U.lerp(1.6, 2.6, U.clamp(c.I / 5, 0, 1)),
      spin, c: '#ff4d7a'
    }));
  }

  /** Étoile de lasers depuis le centre : il y a toujours un secteur sûr. */
  function laserStar(c) {
    const arms = Math.max(3, Math.round(c.cnt(5)));
    const base = U.rr(0, U.TAU);
    const spin = (U.chance(0.5) ? 1 : -1) * U.lerp(0.10, 0.55, U.clamp(c.I / 5, 0, 1));
    for (let i = 0; i < arms; i++) {
      const a = base + (i / arms) * U.TAU;
      // Les bras partent d'un anneau, pas d'un point : le moyeu reste jouable
      // (et le défi « rester au centre » garde un sens).
      push(c, new E.Laser({
        x: c.arena.cx + Math.cos(a) * 58, y: c.arena.cy + Math.sin(a) * 58, a,
        w: 16, tele: c.warn(1.0), active: 1.8, spin, c: '#ff4d7a'
      }));
    }
  }

  /** Mur à brèche : positionnement pur, la brèche dérive. */
  function wallGap(c) {
    const a = U.rr(0, U.TAU);
    const start = edgePoint(c, a + Math.PI, 60);
    const gapHalf = U.lerp(78, 40, U.clamp(c.I / 5, 0, 1));
    push(c, new E.Wall({
      x: start.x, y: start.y, a,
      speed: c.spd(160), half: c.arena.radius + 200,
      gap: U.rr(-c.arena.radius * 0.5, c.arena.radius * 0.5),
      gapHalf, thick: 16, tele: c.warn(0.75),
      gapLimit: c.arena.radius * 0.6,
      life: (c.arena.radius * 2.4) / c.spd(160),
      drift: c.I > 2.5 ? U.rr(-70, 70) : 0
    }));
  }

  /** Orbes traqueuses : on apprend à les faire tourner, pas à les fuir. */
  function chasers(c) {
    const n = Math.max(1, Math.round(c.cnt(2.5)));
    for (let i = 0; i < n; i++) {
      const a = U.rr(0, U.TAU);
      const from = edgePoint(c, a, -30);
      push(c, new E.Chaser({
        x: from.x, y: from.y, a: a + Math.PI,
        speed: c.spd(150), turn: U.lerp(0.9, 2.4, U.clamp(c.I / 5, 0, 1)),
        r: 13, life: U.lerp(6, 11, U.clamp(c.I / 5, 0, 1)),
        tele: c.warn(0.5), c: '#ff4d7a'
      }));
    }
  }

  /* ========================================================================
     TIER 2 — flux continus
     ===================================================================== */

  /** Spirale : lire la rotation, se déplacer à contresens. */
  function spiral(c) {
    const arms = Math.max(2, Math.round(c.cnt(3)));
    const ticks = Math.round(U.lerp(14, 34, U.clamp(c.I / 5, 0, 1)));
    const rot = (U.chance(0.5) ? 1 : -1) * U.rr(0.18, 0.42);
    const sp = c.spd(175);
    const o = safeOrigin(c, 150, 90);
    for (let t = 0; t < ticks; t++) {
      c.sched(t * 0.085, () => {
        for (let k = 0; k < arms; k++) {
          const a = t * rot + (k / arms) * U.TAU;
          push(c, new E.Bullet({
            x: o.x + Math.cos(a) * HUB, y: o.y + Math.sin(a) * HUB,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            r: 6.5, c: '#7b8cff', life: 8,
            // Née à ≥ 98 px du joueur, mais à la vitesse d'infernal le contact
            // tombait à ~199 ms, juste sous le plancher. warn(0) le garantit,
            // et reste nul hors infernal.
            delay: c.warn(0)
          }));
        }
      });
    }
  }

  /** Vortex : trajectoires incurvées, les couloirs bougent tout seuls. */
  function vortex(c) {
    const n = Math.round(c.cnt(22));
    const curve = (U.chance(0.5) ? 1 : -1) * U.rr(0.5, 1.15);
    const sp = c.spd(150);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * U.TAU;
      const from = edgePoint(c, a, -20);
      push(c, new E.Bullet({
        x: from.x, y: from.y,
        vx: Math.cos(a + Math.PI) * sp, vy: Math.sin(a + Math.PI) * sp,
        r: 6.5, c: '#4de3ff', curve, life: 9, delay: c.warn(0.25)
      }));
    }
  }

  /** Pluie : du vrai spam, réservé à Hard et au-dessus. */
  function rain(c) {
    const waves = Math.round(U.lerp(5, 16, U.clamp(c.I / 6, 0, 1)));
    const per = Math.max(2, Math.round(c.cnt(5)));
    for (let w = 0; w < waves; w++) {
      c.sched(w * 0.13, () => {
        for (let i = 0; i < per; i++) {
          const a = U.rr(0, U.TAU);
          const from = edgePoint(c, a, -10);
          const to = U.rr(0, U.TAU), d = U.rr(0, c.arena.radius * 0.8);
          const tx = c.arena.cx + Math.cos(to) * d, ty = c.arena.cy + Math.sin(to) * d;
          const ang = Math.atan2(ty - from.y, tx - from.x);
          const sp = c.spd(U.rr(200, 320));
          push(c, new E.Bullet({
            x: from.x, y: from.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
            r: 5.5, c: '#9aa6ff', delay: c.warn(0.12)
          }));
        }
      });
    }
  }

  /* ========================================================================
     TIER 3 — densité structurée
     ===================================================================== */

  /** Grille mouvante : les trous existent, mais ils se déplacent. */
  function lattice(c) {
    const cols = Math.round(U.lerp(9, 17, U.clamp(c.I / 6, 0, 1)));
    const rows = Math.round(U.lerp(3, 7, U.clamp(c.I / 6, 0, 1)));
    const a = U.rr(0, U.TAU);
    const nx = Math.cos(a), ny = Math.sin(a);
    const tx = -ny, ty = nx;
    const span = c.arena.radius * 2.1;
    const sp = c.spd(215);
    const org = { x: c.arena.cx - nx * (c.arena.radius + 80), y: c.arena.cy - ny * (c.arena.radius + 80) };

    for (let r = 0; r < rows; r++) {
      c.sched(r * 0.42, () => {
        const hole = U.ri(0, cols - 1);
        const hole2 = c.I > 4 ? -1 : U.ri(0, cols - 1);
        for (let i = 0; i < cols; i++) {
          if (i === hole || i === hole2) continue;
          const off = (i / (cols - 1) - 0.5) * span;
          push(c, new E.Bullet({
            x: org.x + tx * off, y: org.y + ty * off,
            vx: nx * sp, vy: ny * sp, r: 6, c: '#b48cff', delay: c.warn(0.18)
          }));
        }
      });
    }
  }

  /** Tenaille : deux murs convergents, une seule fenêtre de sortie. */
  function pincer(c) {
    const a = U.rr(0, U.TAU);
    const gapHalf = U.lerp(70, 38, U.clamp(c.I / 6, 0, 1));
    const gap = U.rr(-120, 120);
    for (const dir of [a, a + Math.PI]) {
      const start = edgePoint(c, dir + Math.PI, 80);
      push(c, new E.Wall({
        x: start.x, y: start.y, a: dir,
        speed: c.spd(145), half: c.arena.radius + 200,
        gap, gapHalf, thick: 16, tele: c.warn(0.7),
        life: (c.arena.radius * 2.2) / c.spd(145), c: '#a78bfa'
      }));
    }
  }

  /** Tapis d'explosions : une ligne de bombes qui balaie l'arène. */
  function carpet(c) {
    const A = c.diff.aoe;
    const steps = Math.round(U.lerp(5, 12, U.clamp(c.I / 6, 0, 1)));
    const a = U.rr(0, U.TAU);
    const nx = Math.cos(a), ny = Math.sin(a);
    const linger = A.linger + A.lingerGrowth * c.I;
    const tele = c.warnAoe(A.telegraph * 0.85);
    for (let i = 0; i < steps; i++) {
      c.sched(i * 0.16, () => {
        const t = (i / (steps - 1) - 0.5) * c.arena.radius * 1.9;
        push(c, new E.Blast({
          floor: c.warnAoe(0),
          x: c.arena.cx + nx * t + U.rr(-40, 40),
          y: c.arena.cy + ny * t + U.rr(-40, 40),
          r: A.radius * 0.8, tele, linger: linger * 0.75,
          secondary: 0, c: '#ff8a3d'
        }));
      });
    }
  }

  /* ========================================================================
     TIER 4-5 — inhumain
     ===================================================================== */

  /** Visée prédictive parfaite, salves rapprochées. Aucun temps de lecture. */
  function predictor(c) {
    const shots = Math.round(U.lerp(6, 16, U.clamp(c.I / 8, 0, 1)));
    const sp = c.spd(340);
    for (let i = 0; i < shots; i++) {
      c.sched(i * 0.09, () => {
        const from = edgePoint(c, U.rr(0, U.TAU), -20);
        const a = lead(c, from.x, from.y, sp, c.aimError);
        push(c, new E.Bullet({
          x: from.x, y: from.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          r: 7, c: '#ff3b6b', delay: c.warn(0.07)
        }));
      });
    }
  }

  /** Floraison : deux couches contrarotatives, les couloirs se referment. */
  function blossom(c) {
    const layers = 3;
    const n = Math.round(c.cnt(30));
    for (let L = 0; L < layers; L++) {
      c.sched(L * 0.22, () => {
        const sp = c.spd(130 + L * 55);
        const off = L * 0.25;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * U.TAU + off;
          push(c, new E.Bullet({
            x: c.arena.cx + Math.cos(a) * HUB, y: c.arena.cy + Math.sin(a) * HUB,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            r: 6, c: L % 2 ? '#ff3b6b' : '#4de3ff',
            curve: (L % 2 ? 1 : -1) * 0.55, life: 9,
            // Ils naissent autour du centre, pas loin du joueur : sans préavis
            // ils pouvaient apparaître sur lui. warn(0) applique le plancher
            // de la difficulté, et reste nul ailleurs qu'en infernal.
            delay: c.warn(0)
          }));
        }
      });
    }
  }

  /** Faisceau traqueur : il faut changer de direction en continu. */
  function hunterBeam(c) {
    const from = edgePoint(c, U.rr(0, U.TAU), -10);
    const l = new E.Laser({
      x: from.x, y: from.y,
      a: Math.atan2(c.player.y - from.y, c.player.x - from.x),
      w: 22, tele: 0.3, active: 4.5, spin: 0, c: '#ff3b6b'
    });
    const g = c.game;
    const base = l.update;
    l.update = function (dt, game) {
      const want = Math.atan2(game.player.y - this.y, game.player.x - this.x);
      this.a += U.clamp(U.angDelta(this.a, want), -2.4 * dt, 2.4 * dt);
      return base.call(this, dt, game);
    };
    g.hazards.push(l);
  }

  /** Singularité : presque toute l'arène explose, quelques îlots survivent. */
  function singularity(c) {
    const A = c.diff.aoe;
    const linger = (A.linger + A.lingerGrowth * c.I) * 1.3;
    const tele = c.warnAoe(A.telegraph * 1.2);
    const R = c.arena.radius;
    const rings = 3;
    for (let ring = 0; ring < rings; ring++) {
      const rad = R * (0.3 + ring * 0.32);
      const n = 5 + ring * 4;
      const off = U.rr(0, U.TAU);
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * U.TAU;
        c.sched(ring * 0.12, () => {
          push(c, new E.Blast({
          floor: c.warnAoe(0),
            x: c.arena.cx + Math.cos(a) * rad,
            y: c.arena.cy + Math.sin(a) * rad,
            r: A.radius * 0.75, tele, linger,
            secondary: 0, c: '#ff3b6b'
          }));
        });
      }
    }
  }

  /* ========================================================================
     Registre
     ===================================================================== */
  const PATTERNS = [
    { id: 'ring',    name: 'Anneau',      tier: 0, w: { skill: 1.0, spam: 0.1, brutal: 0 }, run: ringBurst },
    { id: 'aimed',   name: 'Salve visée', tier: 0, w: { skill: 1.0, spam: 0.2, brutal: 0.2 }, run: aimedVolley },
    { id: 'bomb',    name: 'Grosses boules', tier: 0, w: { skill: 0.9, spam: 0.5, brutal: 0.6 }, run: bombCluster },
    { id: 'sweep',   name: 'Balayage',    tier: 1, w: { skill: 1.0, spam: 0.1, brutal: 0.1 }, run: laserSweep },
    { id: 'star',    name: 'Étoile',      tier: 1, w: { skill: 1.0, spam: 0.2, brutal: 0.1 }, run: laserStar },
    { id: 'wall',    name: 'Mur',         tier: 1, w: { skill: 1.0, spam: 0.1, brutal: 0.1 }, run: wallGap },
    { id: 'chase',   name: 'Traqueuses',  tier: 1, w: { skill: 0.9, spam: 0.3, brutal: 0.3 }, run: chasers },
    { id: 'spiral',  name: 'Spirale',     tier: 2, w: { skill: 0.8, spam: 0.7, brutal: 0.2 }, run: spiral },
    { id: 'vortex',  name: 'Vortex',      tier: 2, w: { skill: 0.9, spam: 0.5, brutal: 0.2 }, run: vortex },
    { id: 'rain',    name: 'Pluie',       tier: 2, w: { skill: 0.1, spam: 1.0, brutal: 0.4 }, run: rain },
    { id: 'lattice', name: 'Grille',      tier: 3, w: { skill: 0.5, spam: 1.0, brutal: 0.5 }, run: lattice },
    { id: 'pincer',  name: 'Tenaille',    tier: 3, w: { skill: 0.9, spam: 0.4, brutal: 0.5 }, run: pincer },
    { id: 'carpet',  name: 'Tapis',       tier: 3, w: { skill: 0.4, spam: 0.9, brutal: 0.8 }, run: carpet },
    { id: 'predict', name: 'Prédicteur',  tier: 4, w: { skill: 0.2, spam: 0.6, brutal: 1.0 }, run: predictor },
    { id: 'blossom', name: 'Floraison',   tier: 4, w: { skill: 0.3, spam: 1.0, brutal: 0.9 }, run: blossom },
    { id: 'hunter',  name: 'Traqueur',    tier: 5, w: { skill: 0.2, spam: 0.3, brutal: 1.0 }, run: hunterBeam },
    { id: 'singu',   name: 'Singularité', tier: 5, w: { skill: 0.1, spam: 0.8, brutal: 1.0 }, run: singularity }
  ];

  root.Patterns = { PATTERNS, lead, edgePoint };
})(window);
