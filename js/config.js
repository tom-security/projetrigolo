/* ==========================================================================
   config.js — difficultés, buffs, objectifs
   --------------------------------------------------------------------------
   Philosophie :
     EASY / MEDIUM  -> lecture, placement, timing. Peu de projectiles, très
                       télégraphiés. On meurt parce qu'on a mal lu, pas parce
                       qu'il y en avait trop.
     HARD / ULTRA   -> skill + spam. Les patterns lisibles restent, mais ils
                       se superposent à de la densité.
     INFERNAL       -> volontairement hors de portée humaine : fenêtres de
                       réaction < 120 ms, visée prédictive parfaite, dash sans
                       invincibilité. C'est un banc de test, pas un niveau.
   ========================================================================== */
(function (root) {
  'use strict';

  /* --- Buffs (récompenses d'objectifs) ----------------------------------- */
  const BUFFS = {
    dash:      { name: 'Dash',            icon: '»',  desc: 'Espace — ruée courte, invincible pendant l\'élan.' },
    dash2:     { name: 'Double charge',   icon: '»»', desc: 'Une seconde charge de dash.' },
    dash3:     { name: 'Triple charge',   icon: '»»»',desc: 'Une troisième charge de dash.' },
    focus:     { name: 'Focus',           icon: '◎',  desc: 'Maj — déplacement lent et précis, hitbox visible.' },
    adrenalin: { name: 'Adrénaline',      icon: '⌁',  desc: 'E — consomme la jauge de frôlement pour ralentir le temps.' },
    phase:     { name: 'Phase',           icon: '∅',  desc: 'Fenêtre d\'invincibilité du dash nettement allongée.' },
    sonar:     { name: 'Sonar',           icon: '◉',  desc: 'Les télégraphes d\'explosion durent 35 % plus longtemps.' },
    magnet:    { name: 'Aimant',          icon: '◈',  desc: 'Rayon de frôlement élargi : la jauge monte plus vite.' },
    wind:      { name: 'Second souffle',  icon: '✚',  desc: 'Encaisse un coup — au prix d\'une vague de punition.' },
    swift:     { name: 'Célérité',        icon: '▲',  desc: '+12 % de vitesse de déplacement.' }
  };

  /* --- Objectifs ---------------------------------------------------------
     type 'survive'   : atteindre t secondes -> récompense automatique.
     type 'challenge' : fenêtre [start, start+duration] avec une condition.
                        Réussite -> récompense. Échec -> vague de punition +
                        jauge d'adrénaline vidée.
     Conditions de challenge :
       graze   : frôler N fois pendant la fenêtre
       nodash  : ne pas utiliser le dash
       inner   : rester dans le cercle intérieur de l'arène
       nohit   : (implicite partout) ne pas être touché
     ---------------------------------------------------------------------- */
  function obj(list) { return list; }

  const DIFFICULTIES = [
    /* ------------------------------------------------------------------ */
    {
      id: 'easy',
      name: 'EASY',
      color: '#4ade80',
      sub: 'Lecture pure. Peu de balles, gros télégraphes.',
      blurb: 'Apprendre à lire un pattern et à se placer. Chaque attaque est annoncée, aucune ne demande de réflexe pur.',
      bullets: [
        'Patterns 100 % skill, jamais de spam',
        'Télégraphe d\'explosion : 1,60 s',
        'Explosion qui persiste : 0,35 s',
        '1 à 2 grosses boules par salve',
        'Sortie d\'arène : 1,6 s avant la mort'
      ],
      // -- moteur --
      intensityRate: 0.045,     // croissance de l'intensité par seconde
      intensityCap: 3.2,
      spawnBase: 3.9,           // secondes entre deux patterns à intensité 1
      spawnFloor: 1.60,         // plancher (intensité max)
      speedMul: 0.80,           // vitesse des projectiles
      countMul: 0.48,           // densité des patterns
      telegraphMul: 1.55,       // durée des avertissements
      tagWeights: { skill: 1.0, spam: 0.0, brutal: 0.0 },
      maxTier: 1,
      // -- joueur --
      playerSpeed: 268,
      dashIFrames: 0.30,
      dashCooldown: 0.70,
      // -- arène --
      arenaRadius: 430,
      shrinkTo: 0.78,
      shrinkPeriod: 55,
      outOfBoundsGrace: 1.6,
      // -- zones d'effet ("grosses boules") --
      aoe: {
        count: [1, 2], telegraph: 1.60, linger: 0.35, radius: 92,
        lingerGrowth: 0.10,     // +s de persistance par point d'intensité
        secondary: 0            // nombre d'explosions secondaires
      },
      objectives: obj([
        { t: 30,  type: 'survive', reward: 'dash',   label: 'Tenir 30 s' },
        { t: 60,  type: 'survive', reward: 'focus',  label: 'Tenir 60 s' },
        { t: 95,  type: 'challenge', cond: 'graze', target: 8, duration: 20, reward: 'adrenalin', label: 'Frôler 8 fois en 20 s' },
        { t: 135, type: 'survive', reward: 'dash2',  label: 'Tenir 2:15' },
        { t: 175, type: 'challenge', cond: 'nodash', duration: 20, reward: 'wind', label: 'Survivre 20 s sans dash' },
        { t: 220, type: 'survive', reward: 'swift',  label: 'Tenir 3:40' }
      ])
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'medium',
      name: 'MEDIUM',
      color: '#4de3ff',
      sub: 'Superposition de patterns lisibles. Toujours zéro spam.',
      blurb: 'Deux patterns peuvent se croiser. Il faut lire deux choses à la fois et choisir son couloir à l\'avance.',
      bullets: [
        'Patterns skill superposés',
        'Télégraphe d\'explosion : 1,15 s',
        'Explosion qui persiste : 0,60 s',
        '2 à 3 grosses boules par salve',
        'Sortie d\'arène : 1,1 s avant la mort'
      ],
      intensityRate: 0.075,
      intensityCap: 4.2,
      spawnBase: 2.9,
      spawnFloor: 0.95,
      speedMul: 0.95,
      countMul: 0.78,
      telegraphMul: 1.18,
      tagWeights: { skill: 1.0, spam: 0.12, brutal: 0.0 },
      maxTier: 2,
      playerSpeed: 262,
      dashIFrames: 0.26,
      dashCooldown: 0.80,
      arenaRadius: 400,
      shrinkTo: 0.70,
      shrinkPeriod: 48,
      outOfBoundsGrace: 1.1,
      aoe: {
        count: [2, 3], telegraph: 1.15, linger: 0.60, radius: 104,
        lingerGrowth: 0.14, secondary: 0
      },
      objectives: obj([
        { t: 25,  type: 'survive', reward: 'dash',   label: 'Tenir 25 s' },
        { t: 50,  type: 'survive', reward: 'focus',  label: 'Tenir 50 s' },
        { t: 75,  type: 'challenge', cond: 'graze', target: 12, duration: 18, reward: 'adrenalin', label: 'Frôler 12 fois en 18 s' },
        { t: 110, type: 'survive', reward: 'dash2',  label: 'Tenir 1:50' },
        { t: 145, type: 'challenge', cond: 'inner', duration: 16, reward: 'magnet', label: 'Rester au centre 16 s' },
        { t: 180, type: 'challenge', cond: 'nodash', duration: 18, reward: 'wind', label: 'Survivre 18 s sans dash' },
        { t: 225, type: 'survive', reward: 'phase',  label: 'Tenir 3:45' }
      ])
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'hard',
      name: 'HARD',
      color: '#ffd166',
      sub: 'Skill + densité. Le spam commence.',
      blurb: 'Les patterns lisibles restent, mais le fond d\'écran se remplit. Il faut exécuter proprement sous pression.',
      bullets: [
        'Skill et spam mélangés',
        'Télégraphe d\'explosion : 0,80 s',
        'Explosion qui persiste : 0,95 s',
        '3 à 5 grosses boules par salve',
        'Sortie d\'arène : 0,75 s avant la mort'
      ],
      intensityRate: 0.10,
      intensityCap: 5.6,
      spawnBase: 2.4,
      spawnFloor: 0.70,
      speedMul: 1.12,
      countMul: 1.0,
      telegraphMul: 0.92,
      tagWeights: { skill: 1.0, spam: 0.85, brutal: 0.15 },
      maxTier: 3,
      playerSpeed: 258,
      dashIFrames: 0.20,
      dashCooldown: 0.95,
      arenaRadius: 375,
      shrinkTo: 0.62,
      shrinkPeriod: 42,
      outOfBoundsGrace: 0.75,
      aoe: {
        count: [3, 5], telegraph: 0.80, linger: 0.95, radius: 114,
        lingerGrowth: 0.18, secondary: 1
      },
      objectives: obj([
        { t: 20,  type: 'survive', reward: 'dash',   label: 'Tenir 20 s' },
        { t: 42,  type: 'survive', reward: 'focus',  label: 'Tenir 42 s' },
        { t: 62,  type: 'challenge', cond: 'graze', target: 16, duration: 16, reward: 'adrenalin', label: 'Frôler 16 fois en 16 s' },
        { t: 90,  type: 'survive', reward: 'dash2',  label: 'Tenir 1:30' },
        { t: 120, type: 'challenge', cond: 'inner', duration: 14, reward: 'magnet', label: 'Rester au centre 14 s' },
        { t: 150, type: 'challenge', cond: 'nodash', duration: 15, reward: 'phase', label: 'Survivre 15 s sans dash' },
        { t: 190, type: 'survive', reward: 'swift',  label: 'Tenir 3:10' },
        { t: 240, type: 'survive', reward: 'dash3',  label: 'Tenir 4:00' }
      ])
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'ultra',
      name: 'ULTRA HARD',
      color: '#ff8a3d',
      sub: 'Spam permanent. Le skill n\'est plus une option.',
      blurb: 'La densité ne redescend jamais. Les explosions s\'enchaînent et laissent des flaques de mort qui se superposent.',
      bullets: [
        'Spam continu + patterns experts',
        'Télégraphe d\'explosion : 0,55 s',
        'Explosion qui persiste : 1,40 s',
        '5 à 8 grosses boules par salve',
        'Sortie d\'arène : 0,5 s avant la mort'
      ],
      intensityRate: 0.14,
      intensityCap: 7.5,
      spawnBase: 1.9,
      spawnFloor: 0.48,
      speedMul: 1.30,
      countMul: 1.35,
      telegraphMul: 0.72,
      tagWeights: { skill: 1.0, spam: 1.15, brutal: 0.65 },
      maxTier: 4,
      playerSpeed: 254,
      dashIFrames: 0.14,
      dashCooldown: 1.15,
      arenaRadius: 350,
      shrinkTo: 0.55,
      shrinkPeriod: 36,
      outOfBoundsGrace: 0.5,
      aoe: {
        count: [5, 8], telegraph: 0.55, linger: 1.40, radius: 122,
        lingerGrowth: 0.24, secondary: 2
      },
      objectives: obj([
        { t: 15,  type: 'survive', reward: 'dash',   label: 'Tenir 15 s' },
        { t: 32,  type: 'survive', reward: 'focus',  label: 'Tenir 32 s' },
        { t: 50,  type: 'challenge', cond: 'graze', target: 22, duration: 14, reward: 'adrenalin', label: 'Frôler 22 fois en 14 s' },
        { t: 72,  type: 'survive', reward: 'dash2',  label: 'Tenir 1:12' },
        { t: 95,  type: 'challenge', cond: 'inner', duration: 12, reward: 'phase', label: 'Rester au centre 12 s' },
        { t: 125, type: 'challenge', cond: 'nodash', duration: 12, reward: 'magnet', label: 'Survivre 12 s sans dash' },
        { t: 160, type: 'survive', reward: 'dash3',  label: 'Tenir 2:40' },
        { t: 210, type: 'survive', reward: 'swift',  label: 'Tenir 3:30' }
      ])
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'infernal',
      name: 'INFERNAL',
      color: '#ff3b6b',
      sub: 'Non jouable à la main. Banc de test pour bot.',
      blurb: 'Visée prédictive sans erreur, fenêtres de réaction sous 120 ms, dash sans invincibilité. Conçu pour qu\'un humain non assisté ne passe pas. Le record est là pour mesurer, pas pour gagner.',
      bullets: [
        'Réaction exigée < 120 ms',
        'Télégraphe d\'explosion : 0,28 s',
        'Explosion qui persiste : 2,20 s',
        '8 à 14 grosses boules par salve',
        'Dash SANS invincibilité',
        'Sortie d\'arène : 0,25 s avant la mort'
      ],
      intensityRate: 0.30,
      intensityCap: 12,
      spawnBase: 1.15,
      spawnFloor: 0.22,
      speedMul: 1.62,
      countMul: 1.95,
      telegraphMul: 0.45,
      tagWeights: { skill: 1.0, spam: 1.6, brutal: 1.9 },
      maxTier: 5,
      playerSpeed: 250,
      dashIFrames: 0.0,          // aucune invincibilité
      dashCooldown: 1.40,
      arenaRadius: 320,
      shrinkTo: 0.46,
      shrinkPeriod: 28,
      outOfBoundsGrace: 0.25,
      impossible: true,
      aoe: {
        count: [8, 14], telegraph: 0.28, linger: 2.20, radius: 132,
        lingerGrowth: 0.32, secondary: 3
      },
      objectives: obj([
        { t: 10,  type: 'survive', reward: 'dash',   label: 'Tenir 10 s' },
        { t: 20,  type: 'survive', reward: 'focus',  label: 'Tenir 20 s' },
        { t: 30,  type: 'survive', reward: 'dash2',  label: 'Tenir 30 s' },
        { t: 45,  type: 'challenge', cond: 'graze', target: 30, duration: 12, reward: 'adrenalin', label: 'Frôler 30 fois en 12 s' },
        { t: 60,  type: 'survive', reward: 'phase',  label: 'Tenir 1:00' },
        { t: 90,  type: 'survive', reward: 'dash3',  label: 'Tenir 1:30' },
        { t: 120, type: 'survive', reward: 'swift',  label: 'Tenir 2:00' }
      ])
    }
  ];

  const byId = {};
  for (const d of DIFFICULTIES) byId[d.id] = d;

  root.CFG = {
    BUFFS,
    DIFFICULTIES,
    diff: id => byId[id] || byId.medium,

    /* --- Joueur ---------------------------------------------------------- */
    PLAYER: {
      hitbox: 4.6,
      visual: 9,
      accel: 2600,
      friction: 1900,
      focusMul: 0.42,
      dashSpeed: 1180,
      dashTime: 0.135,
      grazeRadius: 34,
      grazeRadiusMagnet: 52,
      grazeCooldown: 0.22,       // par entité : évite de farmer une seule balle
      adrenalinCost: 1.0,
      adrenalinDuration: 2.2,
      adrenalinScale: 0.45
    },

    /* --- Carte infinie --------------------------------------------------- */
    ENDLESS: {
      sector: 520,               // taille d'un secteur procédural (densité du terrain)
      chaseSpeedRatio: 0.52,     // vitesse du champ d'effondrement / vitesse joueur
      radiusMul: 0.92,
      pillarR: [34, 66],
      sludgeR: [52, 96]          // volontairement plus petites que les explosions
    }
  };
})(window);
