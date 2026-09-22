/* ==========================================================================
   lol/config.js — mode DODGE LoL   [échelle en unités LoL]
   --------------------------------------------------------------------------
   Repères réels servant de base à l'équilibrage :
     · vitesse de déplacement champion .. 335 (base) → 400+ (bottes)
     · rayon de hitbox champion ......... ~65
     · portée Flash ..................... 400
     · Blitz Q  : portée 1050, vitesse 1800, incantation 0,25 s, largeur 70
     · Morgana Q: portée 1300, vitesse 1200, incantation 0,25 s, largeur 80
     · Ezreal Q : portée 1150, vitesse 2000, incantation 0,25 s, largeur 60

   La fenêtre d'esquive réelle = incantation + temps de vol. Un skillshot à
   1000 de portée à 1800 u/s donne 0,25 + 0,55 = 0,80 s. C'est ce nombre que
   la difficulté fait varier, pas une densité de projectiles.
   ========================================================================== */
(function (root) {
  'use strict';

  /* --- Récompenses (sorts d'invocateur et objets) ------------------------ */
  const BUFFS = {
    flash:    { name: 'Flash',        icon: 'F',  desc: 'F — clignement de 400 unités vers le curseur. Marche même enraciné.' },
    dash:     { name: 'Ruée',         icon: '»',  desc: 'Espace — ruée de 500 unités vers le curseur, invulnérable pendant le trajet.' },
    dash2:    { name: 'Double ruée',  icon: '»»', desc: 'Une seconde charge de ruée.' },
    cleanse:  { name: 'Purge',        icon: '✦',  desc: 'A — annule racine, ralentissement et projection.' },
    boots:    { name: 'Bottes',       icon: '▲',  desc: '+45 de vitesse de déplacement.' },
    boots2:   { name: 'Bottes T2',    icon: '▲▲', desc: '+45 de vitesse supplémentaires.' },
    shield:   { name: 'Bouclier de sorts', icon: '◇', desc: 'Bloque le prochain skillshot, puis se recharge.' },
    ward:     { name: 'Vision',       icon: '◉',  desc: 'Les indicateurs d\'incantation ennemis sont bien plus lisibles.' },
    tenacity: { name: 'Ténacité',     icon: '✚',  desc: 'Durée des CC subis réduite de 40 %.' },
    zhonya:   { name: 'Stase',        icon: '⊘',  desc: 'E — 1,8 s d\'invulnérabilité totale, mais immobile.' }
  };

  const DIFFICULTIES = [
    {
      id: 'easy', name: 'EASY', color: '#4ade80',
      sub: 'Un ennemi, incantations lentes, visée sur ta position.',
      blurb: 'Le geste de base : voir l\'incantation, cliquer perpendiculairement à la ligne. L\'ennemi vise où tu ES, pas où tu vas — avancer suffit à esquiver.',
      bullets: [
        '1 à 2 ennemis casters',
        'Incantation ×2,0 · fenêtre totale ~1,3 s',
        'Visée prédictive : 0 %',
        'Skillshots lents ×0,70',
        '5 sbires pour bloquer les hooks'
      ],
      intensityRate: 0.045, intensityCap: 3.2,
      casters: [1, 2], castEvery: 3.2, castFloor: 1.5,
      castTimeMul: 2.0, projSpeedMul: 0.70,
      predict: 0.0, predictNoise: 190,
      maxTier: 1, tagWeights: { skill: 1.0, spam: 0.0, brutal: 0.0 },
      ms: 355, flashCd: 55, dashCd: 6, ccMul: 0.65, minions: 5, tell: 1.0,
      arenaRadius: 1250, shrinkTo: 0.80, shrinkPeriod: 55, outOfBoundsGrace: 1.6,
      aoe: { count: [1, 2], telegraph: 1.20, linger: 0.35, radius: 150, lingerGrowth: 0.10, secondary: 0 },
      objectives: [
        { t: 30,  type: 'survive',   reward: 'flash',   label: 'Tenir 30 s' },
        { t: 60,  type: 'survive',   reward: 'boots',   label: 'Tenir 60 s' },
        { t: 95,  type: 'challenge', cond: 'juke',    target: 4,  duration: 25, reward: 'dash',    label: 'Esquiver 4 skillshots de justesse' },
        { t: 135, type: 'survive',   reward: 'cleanse', label: 'Tenir 2:15' },
        { t: 175, type: 'challenge', cond: 'noflash', duration: 25, reward: 'shield',  label: 'Survivre 25 s sans Flash' },
        { t: 220, type: 'survive',   reward: 'boots2',  label: 'Tenir 3:40' }
      ]
    },
    {
      id: 'medium', name: 'MEDIUM', color: '#4de3ff',
      sub: 'Ils commencent à viser où tu vas.',
      blurb: 'L\'ennemi lit ton ordre de déplacement et tire devant toi. Marcher en ligne droite ne marche plus : il faut re-cliquer pendant l\'incantation.',
      bullets: [
        '2 à 3 ennemis casters',
        'Incantation ×1,4 · fenêtre totale ~0,95 s',
        'Visée prédictive : 45 %',
        'Skillshots ×0,90',
        'Premiers enchaînements racine → sort létal'
      ],
      intensityRate: 0.070, intensityCap: 4.2,
      casters: [2, 3], castEvery: 2.6, castFloor: 1.05,
      castTimeMul: 1.40, projSpeedMul: 0.90,
      predict: 0.45, predictNoise: 115,
      maxTier: 2, tagWeights: { skill: 1.0, spam: 0.12, brutal: 0.0 },
      ms: 350, flashCd: 65, dashCd: 8, ccMul: 0.85, minions: 4, tell: 0.85,
      arenaRadius: 1180, shrinkTo: 0.72, shrinkPeriod: 48, outOfBoundsGrace: 1.1,
      aoe: { count: [2, 3], telegraph: 0.95, linger: 0.60, radius: 165, lingerGrowth: 0.14, secondary: 0 },
      objectives: [
        { t: 25,  type: 'survive',   reward: 'flash',   label: 'Tenir 25 s' },
        { t: 50,  type: 'survive',   reward: 'boots',   label: 'Tenir 50 s' },
        { t: 75,  type: 'challenge', cond: 'juke',    target: 10, duration: 22, reward: 'dash',     label: 'Esquiver 10 skillshots de justesse' },
        { t: 110, type: 'survive',   reward: 'cleanse', label: 'Tenir 1:50' },
        { t: 145, type: 'challenge', cond: 'nocc',    duration: 20, reward: 'tenacity', label: 'Aucun CC subi pendant 20 s' },
        { t: 180, type: 'challenge', cond: 'noflash', duration: 22, reward: 'shield',   label: 'Survivre 22 s sans Flash' },
        { t: 225, type: 'survive',   reward: 'zhonya',  label: 'Tenir 3:45' }
      ]
    },
    {
      id: 'hard', name: 'HARD', color: '#ffd166',
      sub: 'Prédiction fiable et skillshots superposés.',
      blurb: 'Fenêtre sous la seconde, visée qui anticipe vraiment, plusieurs sorts en vol en même temps. Le juke simple ne suffit plus : il faut choisir la bonne direction du premier coup.',
      bullets: [
        '3 à 4 ennemis casters',
        'Incantation ×0,9 · fenêtre totale ~0,70 s',
        'Visée prédictive : 75 %',
        'Skillshots rapides ×1,15',
        'Zones persistantes qui coupent les couloirs'
      ],
      intensityRate: 0.10, intensityCap: 5.6,
      casters: [3, 4], castEvery: 2.1, castFloor: 0.78,
      castTimeMul: 0.90, projSpeedMul: 1.15,
      predict: 0.75, predictNoise: 62,
      maxTier: 3, tagWeights: { skill: 1.0, spam: 0.85, brutal: 0.15 },
      ms: 345, flashCd: 75, dashCd: 10, ccMul: 1.0, minions: 3, tell: 0.7,
      arenaRadius: 1100, shrinkTo: 0.64, shrinkPeriod: 42, outOfBoundsGrace: 0.75,
      aoe: { count: [3, 5], telegraph: 0.70, linger: 0.95, radius: 180, lingerGrowth: 0.18, secondary: 1 },
      objectives: [
        { t: 20,  type: 'survive',   reward: 'flash',   label: 'Tenir 20 s' },
        { t: 42,  type: 'survive',   reward: 'boots',   label: 'Tenir 42 s' },
        { t: 62,  type: 'challenge', cond: 'juke',    target: 9, duration: 20, reward: 'dash',     label: 'Esquiver 9 skillshots de justesse' },
        { t: 90,  type: 'survive',   reward: 'cleanse', label: 'Tenir 1:30' },
        { t: 120, type: 'challenge', cond: 'nocc',    duration: 18, reward: 'tenacity', label: 'Aucun CC subi pendant 18 s' },
        { t: 150, type: 'challenge', cond: 'noflash', duration: 18, reward: 'zhonya',   label: 'Survivre 18 s sans Flash' },
        { t: 190, type: 'survive',   reward: 'shield',  label: 'Tenir 3:10' },
        { t: 240, type: 'survive',   reward: 'dash2',   label: 'Tenir 4:00' }
      ]
    },
    {
      id: 'ultra', name: 'ULTRA HARD', color: '#ff8a3d',
      sub: 'Prédiction quasi parfaite, aucun temps mort.',
      blurb: 'Des casters qui ne laissent jamais l\'écran vide, des hooks qui traversent les sbires, des zones qui ferment l\'arène. Le juke doit être immédiat et dans la bonne direction.',
      bullets: [
        '5 à 7 ennemis casters',
        'Incantation ×0,55 · fenêtre totale ~0,50 s',
        'Visée prédictive : 92 %',
        'Skillshots très rapides ×1,50',
        'Chaînes racine → projection → mort'
      ],
      intensityRate: 0.14, intensityCap: 7.5,
      casters: [5, 7], castEvery: 1.32, castFloor: 0.42,
      castTimeMul: 0.55, projSpeedMul: 1.50,
      predict: 0.92, predictNoise: 30,
      maxTier: 4, tagWeights: { skill: 1.0, spam: 1.15, brutal: 0.65 },
      ms: 342, flashCd: 85, dashCd: 12, ccMul: 1.15, minions: 2, tell: 0.55,
      arenaRadius: 1020, shrinkTo: 0.56, shrinkPeriod: 36, outOfBoundsGrace: 0.5,
      aoe: { count: [5, 8], telegraph: 0.50, linger: 1.40, radius: 195, lingerGrowth: 0.24, secondary: 2 },
      objectives: [
        { t: 15,  type: 'survive',   reward: 'flash',   label: 'Tenir 15 s' },
        { t: 32,  type: 'survive',   reward: 'boots',   label: 'Tenir 32 s' },
        { t: 50,  type: 'challenge', cond: 'juke',    target: 18, duration: 18, reward: 'dash',    label: 'Esquiver 18 skillshots de justesse' },
        { t: 72,  type: 'survive',   reward: 'cleanse', label: 'Tenir 1:12' },
        { t: 95,  type: 'challenge', cond: 'nocc',    duration: 15, reward: 'zhonya',  label: 'Aucun CC subi pendant 15 s' },
        { t: 125, type: 'challenge', cond: 'noflash', duration: 15, reward: 'tenacity',label: 'Survivre 15 s sans Flash' },
        { t: 160, type: 'survive',   reward: 'dash2',   label: 'Tenir 2:40' },
        { t: 210, type: 'survive',   reward: 'boots2',  label: 'Tenir 3:30' }
      ]
    },
    {
      id: 'infernal', name: 'INFERNAL', color: '#ff3b6b',
      sub: 'Prédiction parfaite. Injouable à la souris.',
      blurb: 'Visée sans aucune erreur sur ton ordre de déplacement, incantations sous 100 ms, hooks non bloquables, aucun sbire. Le seul contre serait de re-cliquer plus vite qu\'un temps de réaction humain.',
      bullets: [
        '6 à 9 ennemis casters',
        'Incantation ×0,30 · fenêtre totale ~0,25 s',
        'Visée prédictive : 100 %, erreur nulle',
        'Skillshots ×1,85',
        'Hooks non bloquables, zéro sbire'
      ],
      intensityRate: 0.30, intensityCap: 12,
      casters: [6, 9], castEvery: 1.0, castFloor: 0.24,
      castTimeMul: 0.30, projSpeedMul: 1.85,
      predict: 1.0, predictNoise: 0,
      maxTier: 5, tagWeights: { skill: 1.0, spam: 1.6, brutal: 1.9 },
      ms: 340, flashCd: 110, dashCd: 14, ccMul: 1.4, minions: 0, tell: 0.35,
      impossible: true,
      arenaRadius: 950, shrinkTo: 0.48, shrinkPeriod: 28, outOfBoundsGrace: 0.25,
      aoe: { count: [8, 14], telegraph: 0.26, linger: 2.20, radius: 210, lingerGrowth: 0.32, secondary: 3 },
      objectives: [
        { t: 10,  type: 'survive',   reward: 'flash',  label: 'Tenir 10 s' },
        { t: 20,  type: 'survive',   reward: 'boots',  label: 'Tenir 20 s' },
        { t: 30,  type: 'survive',   reward: 'dash',   label: 'Tenir 30 s' },
        { t: 45,  type: 'challenge', cond: 'juke',   target: 25, duration: 15, reward: 'cleanse', label: 'Esquiver 25 skillshots de justesse' },
        { t: 60,  type: 'survive',   reward: 'zhonya', label: 'Tenir 1:00' },
        { t: 90,  type: 'survive',   reward: 'dash2',  label: 'Tenir 1:30' },
        { t: 120, type: 'survive',   reward: 'shield', label: 'Tenir 2:00' }
      ]
    }
  ];

  const byId = {};
  for (const d of DIFFICULTIES) byId[d.id] = d;

  root.LOLCFG = {
    BUFFS, DIFFICULTIES,
    diff: id => byId[id] || byId.medium,

    /* Cadrage caméra : ~2050 unités de large, comme la vue LoL par défaut. */
    VIEW: { unitsWide: 2050, unitsHigh: 1230 },

    PLAYER: {
      hitbox: 55, visual: 60, stopDist: 14,
      flashRange: 400, dashRange: 500, dashTime: 0.22,
      zhonyaDur: 1.8, zhonyaCd: 22, cleanseCd: 18, shieldRecharge: 16,
      jukeWindow: 150            // esquive « de justesse » : passage à moins de 150 u
    },

    MINION: { r: 46, speed: 55, respawn: 9 },

    CASTER: {
      r: 60, keepRange: [720, 1150], speed: 250,
      repositionEvery: [1.4, 3.2]
    }
  };
})(window);
