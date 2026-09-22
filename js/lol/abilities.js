/* ==========================================================================
   lol/abilities.js — kits ennemis
   --------------------------------------------------------------------------
   Archétypes de skillshots LoL, avec leurs vraies grandeurs de référence.
   Poids skill / spam / brutal : le directeur tire dedans selon le profil de
   la difficulté, comme dans le mode classique.

   Effets :
     kill     -> mort immédiate
     root     -> immobilisé (le Flash fonctionne encore)
     pull     -> tiré vers le lanceur puis immobilisé
     knockup  -> projeté, aucune action possible
     slow     -> vitesse réduite
   Un CC ne tue pas : il te met en position de mourir du sort suivant.
   C'est ça, mourir en LoL.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, E = root.LolEnt, Units = root.LolUnits;

  /** Sorts sans projectile (cône, rayon) : leur « vitesse » sert uniquement à
      estimer le temps de vol pour la visée prédictive. Elle doit être quasi
      infinie, sinon le lanceur anticipe des secondes de déplacement et vise
      très au-delà de sa propre portée. */
  const INSTANT = 99999;

  function mul(game) { return game.diff.projSpeedMul; }
  function tell(game) {
    return game.diff.tell * (game.player.has('ward') ? 1.9 : 1);
  }

  /** Point visé au moment où le sort partira. */
  function target(caster, game, speed, castTime) {
    return Units.aimPoint(caster, game, speed, castTime);
  }

  function line(caster, game, castTime, o) {
    const speed = o.speed * mul(game);
    const pt = target(caster, game, speed, castTime);
    caster.aim = Math.atan2(pt.y - caster.y, pt.x - caster.x);
    game.hazards.push(new E.LineShot({
      x: caster.x, y: caster.y, a: caster.aim,
      speed, width: o.width, range: o.range,
      cast: castTime, collides: o.collides,
      effect: o.effect, c: o.c, tell: tell(game), caster
    }));
  }

  const ABILITIES = [
    /* ---------------- TIER 0 : les fondamentaux --------------------- */
    {
      id: 'hook', key: 'Q', name: 'Grappin', tier: 0,
      w: { skill: 1.0, spam: 0.1, brutal: 0.2 },
      cast: 0.25, cd: 7, range: 1050, speed: 1800,
      spawn(c, g, ct) {
        line(c, g, ct, {
          speed: 1800, width: 90, range: 1050,
          collides: g.diff.minions > 0,      // en infernal, plus rien ne bloque
          effect: { kind: 'pull', dur: 1.0, from: c }, c: '#ffd166'
        });
      }
    },
    {
      id: 'bind', key: 'Q', name: 'Enchaînement', tier: 0,
      w: { skill: 1.0, spam: 0.1, brutal: 0.3 },
      cast: 0.25, cd: 8, range: 1300, speed: 1200,
      spawn(c, g, ct) {
        line(c, g, ct, {
          speed: 1200, width: 100, range: 1300,
          collides: g.diff.minions > 0,
          effect: { kind: 'root', dur: 1.5 }, c: '#c77dff'
        });
      }
    },
    {
      id: 'poke', key: 'Q', name: 'Trait mystique', tier: 0,
      w: { skill: 1.0, spam: 0.4, brutal: 0.3 },
      cast: 0.25, cd: 4.5, range: 1150, speed: 2000,
      spawn(c, g, ct) {
        line(c, g, ct, {
          speed: 2000, width: 70, range: 1150,
          collides: false,                    // traverse tout
          effect: E.KILL, c: '#4de3ff'
        });
      }
    },
    {
      id: 'bomb', key: 'Q', name: 'Bombe', tier: 0,
      w: { skill: 0.9, spam: 0.5, brutal: 0.5 },
      cast: 0.25, cd: 6, range: 900, speed: 1700,
      spawn(c, g, ct) {
        const A = g.diff.aoe;
        const linger = A.linger + A.lingerGrowth * g.director.I;
        const flight = 0.45;
        const pt = target(c, g, 1700 * mul(g), ct + flight);
        g.hazards.push(new E.Circle({
          x: pt.x, y: pt.y, r: A.radius,
          tele: ct + flight, linger,
          secondary: A.secondary, c: '#ff8a3d'
        }));
      }
    },

    /* ---------------- TIER 1 : zone et contrôle --------------------- */
    {
      id: 'cone', key: 'W', name: 'Souffle', tier: 1,
      w: { skill: 1.0, spam: 0.2, brutal: 0.3 },
      cast: 0.45, cd: 9, range: 760, speed: INSTANT,
      spawn(c, g, ct) {
        const pt = target(c, g, 3000, ct);
        c.aim = Math.atan2(pt.y - c.y, pt.x - c.x);
        g.hazards.push(new E.Cone({
          x: c.x, y: c.y, a: c.aim, half: 0.46, range: 760,
          cast: ct, active: 0.45, effect: E.KILL,
          c: '#c77dff', tell: tell(g), caster: c
        }));
      }
    },
    {
      id: 'zone', key: 'W', name: 'Brasier', tier: 1,
      w: { skill: 0.9, spam: 0.4, brutal: 0.4 },
      cast: 0.35, cd: 10, range: 900, speed: 1400,
      spawn(c, g, ct) {
        const pt = target(c, g, 1400 * mul(g), ct + 0.35);
        g.hazards.push(new E.Zone({
          x: pt.x, y: pt.y, r: 200,
          tele: ct + 0.35, life: 4.2 + g.director.I * 0.35,
          effect: E.KILL, c: '#ff5a3d'
        }));
      }
    },
    {
      id: 'chill', key: 'E', name: 'Morsure', tier: 1,
      w: { skill: 0.8, spam: 0.4, brutal: 0.5 },
      cast: 0.25, cd: 7, range: 1100, speed: 1500,
      spawn(c, g, ct) {
        line(c, g, ct, {
          speed: 1500, width: 80, range: 1100, collides: false,
          effect: { kind: 'slow', dur: 2.4, amount: 0.45 }, c: '#7b8cff'
        });
      }
    },

    /* ---------------- TIER 2 : superposition ------------------------ */
    {
      id: 'fan', key: 'Q', name: 'Salve triple', tier: 2,
      w: { skill: 0.7, spam: 1.0, brutal: 0.4 },
      cast: 0.3, cd: 8, range: 1150, speed: 1750,
      spawn(c, g, ct) {
        const speed = 1750 * mul(g);
        const pt = target(c, g, speed, ct);
        c.aim = Math.atan2(pt.y - c.y, pt.x - c.x);
        const spread = U.lerp(0.22, 0.10, U.clamp(g.director.I / 5, 0, 1));
        for (let k = -1; k <= 1; k++) {
          g.hazards.push(new E.LineShot({
            x: c.x, y: c.y, a: c.aim + k * spread,
            speed, width: 66, range: 1150, cast: ct,
            collides: false, effect: E.KILL, c: '#4de3ff',
            tell: tell(g), caster: k === 0 ? c : null
          }));
        }
      }
    },
    {
      id: 'barrage', key: 'R', name: 'Barrage', tier: 2,
      w: { skill: 0.3, spam: 1.0, brutal: 0.6 },
      cast: 0.5, cd: 13, range: 1300, speed: 1500,
      spawn(c, g, ct) {
        const A = g.diff.aoe;
        const n = U.ri(A.count[0], A.count[1]);
        const linger = A.linger + A.lingerGrowth * g.director.I;
        for (let i = 0; i < n; i++) {
          g.schedule(i * U.rr(0.08, 0.22), () => {
            if (!c.alive) return;
            const pt = i === 0
              ? target(c, g, 1500 * mul(g), ct)
              : (() => { const a = U.rr(0, U.TAU), d = U.rr(120, 700);
                         const b = target(c, g, 1500 * mul(g), ct);
                         return { x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d }; })();
            g.hazards.push(new E.Circle({
              x: pt.x, y: pt.y, r: A.radius * U.rr(0.8, 1.1),
              tele: Math.max(0.18, ct), linger, secondary: 0, c: '#ff8a3d'
            }));
          });
        }
      }
    },

    /* ---------------- TIER 3 : engagement ---------------------------- */
    {
      id: 'engage', key: 'R', name: 'Charge', tier: 3,
      w: { skill: 0.6, spam: 0.4, brutal: 1.0 },
      cast: 0.4, cd: 14, range: 1300, speed: 1400,
      spawn(c, g, ct) {
        const pt = target(c, g, 1400 * mul(g), ct + 0.35);
        g.hazards.push(new E.Circle({
          x: pt.x, y: pt.y, r: 260,
          tele: ct + 0.35, linger: 0.3, secondary: 0,
          effect: { kind: 'knockup', dur: 1.1 }, c: '#ff3b6b'
        }));
        // Le lanceur saute sur le point d'impact : la menace reste sur place.
        g.schedule(ct + 0.35, () => {
          if (!c.alive) return;
          g.fx.burst(c.x, c.y, 18, c.hue, 640, 7, 0.4);
          c.x = pt.x; c.y = pt.y; c.dest = null;
          g.fx.burst(c.x, c.y, 24, c.hue, 760, 8, 0.5);
        });
      }
    },
    {
      id: 'beam', key: 'R', name: 'Rayon', tier: 3,
      w: { skill: 0.9, spam: 0.3, brutal: 0.7 },
      cast: 0.6, cd: 15, range: 3000, speed: INSTANT,
      spawn(c, g, ct) {
        const pt = target(c, g, 4000, ct);
        c.aim = Math.atan2(pt.y - c.y, pt.x - c.x);
        g.hazards.push(new E.Beam({
          x: c.x, y: c.y, a: c.aim, len: 3000, w: 180,
          cast: ct, active: 0.7, effect: E.KILL,
          c: '#ff3b6b', tell: tell(g)
        }));
      }
    },

    /* ---------------- TIER 4-5 : inhumain ---------------------------- */
    {
      id: 'snipe', key: 'R', name: 'Tir de précision', tier: 4,
      w: { skill: 0.2, spam: 0.7, brutal: 1.0 },
      cast: 0.2, cd: 5, range: 2600, speed: 2600,
      spawn(c, g, ct) {
        line(c, g, ct, {
          speed: 2600, width: 74, range: 2600, collides: false,
          effect: E.KILL, c: '#ff3b6b'
        });
      }
    },
    {
      id: 'sweep', key: 'R', name: 'Balayage', tier: 5,
      w: { skill: 0.2, spam: 0.8, brutal: 1.0 },
      cast: 0.45, cd: 12, range: 3000, speed: INSTANT,
      spawn(c, g, ct) {
        const pt = target(c, g, 4000, ct);
        const a0 = Math.atan2(pt.y - c.y, pt.x - c.x);
        const dir = U.chance(0.5) ? 1 : -1;
        g.hazards.push(new E.Beam({
          x: c.x, y: c.y, a: a0 - dir * 0.6, len: 3000, w: 160,
          cast: ct, active: 2.2, spin: dir * 0.62,
          effect: E.KILL, c: '#ff3b6b', tell: tell(g)
        }));
      }
    },
    {
      id: 'lockdown', key: 'Q', name: 'Verrouillage', tier: 5,
      w: { skill: 0.1, spam: 0.6, brutal: 1.0 },
      cast: 0.15, cd: 6, range: 1400, speed: 2400,
      spawn(c, g, ct) {
        line(c, g, ct, {
          speed: 2400, width: 110, range: 1400, collides: false,
          effect: { kind: 'root', dur: 1.6 }, c: '#c77dff'
        });
      }
    }
  ];

  root.LolAbilities = { ABILITIES };
})(window);
