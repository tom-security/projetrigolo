/* ==========================================================================
   main.js — menus, sélection du mode et de la difficulté, boucle principale
   --------------------------------------------------------------------------
   Deux modes cohabitent, chacun avec son propre moteur :
     · classic : bullet-hell au clavier          (CFG    / Game)
     · lol     : dodge LoL au clic droit         (LOLCFG / LolGame)
   Les deux exposent la même interface publique, donc ce fichier ne sait rien
   de leurs différences — il se contente de router.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.CFG, LOLCFG = root.LOLCFG;

  const canvas = document.getElementById('game');

  const game = new root.Game(canvas);          // mode classique, inchangé
  const lolGame = new root.LolGame(canvas);    // mode LoL
  root.Input.attach(canvas);
  root.LolInput.attach(canvas);

  // Exposés pour le débogage et pour brancher un bot externe.
  root.DODGE = game;
  root.DODGE_LOL = lolGame;

  const el = {
    menu: document.getElementById('menu'),
    pause: document.getElementById('pause'),
    dead: document.getElementById('dead'),
    modeList: document.getElementById('mode-list'),
    botRow: document.getElementById('bot-row'),
    botHint: document.getElementById('bot-hint'),
    list: document.getElementById('difficulty-list'),
    details: document.getElementById('diff-details'),
    terrainRow: document.getElementById('terrain-row'),
    terrainHint: document.getElementById('terrain-hint'),
    controls: document.getElementById('controls'),
    start: document.getElementById('start-btn'),
    resume: document.getElementById('resume-btn'),
    quit: document.getElementById('quit-btn'),
    retry: document.getElementById('retry-btn'),
    toMenu: document.getElementById('menu-btn'),
    cause: document.getElementById('death-cause'),
    stats: document.getElementById('run-stats'),
    verdict: document.getElementById('run-verdict')
  };

  /* --- Modes --------------------------------------------------------------- */
  const MODES = [
    {
      id: 'classic', name: 'BULLET-HELL', color: '#4de3ff',
      tag: 'Clavier · ZQSD',
      desc: 'Esquive de rideaux de projectiles, déplacement libre au clavier. Frôlement, dash, adrénaline.',
      controls: [
        ['ZQSD / WASD / ↑←↓→', 'bouger'],
        ['Espace', 'dash <em>(à débloquer)</em>'],
        ['Maj', 'focus <em>(à débloquer)</em>'],
        ['E', 'adrénaline <em>(à débloquer)</em>'],
        ['Échap', 'pause · <b>R</b> relancer']
      ]
    },
    {
      id: 'lol', name: 'DODGE LoL', color: '#ffd166',
      tag: 'Souris · clic droit',
      desc: 'Déplacement au clic droit. Les ennemis incantent en visant où ton ordre de déplacement t\'emmène : on esquive en re-cliquant.',
      controls: [
        ['Clic droit', 'se déplacer'],
        ['S', 'stopper'],
        ['F', 'Flash <em>(à débloquer)</em>'],
        ['Espace', 'ruée <em>(à débloquer)</em>'],
        ['A', 'purge · <b>E</b> stase'],
        ['Échap', 'pause · <b>R</b> relancer']
      ]
    }
  ];

  function mode() { return prefs.mode === 'lol' ? MODES[1] : MODES[0]; }
  function isLol() { return prefs.mode === 'lol'; }
  function C() { return isLol() ? LOLCFG : CFG; }
  function G() { return isLol() ? lolGame : game; }

  /* --- Préférences persistées ----------------------------------------------- */
  const PREF_KEY = 'dodgetrainer.prefs';
  const prefs = Object.assign(
    { mode: 'classic', diff: 'medium', lolDiff: 'medium', endless: false,
      quality: 'high', shake: true, bot: false },
    (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } })()
  );
  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  }

  /** Chaque mode retient sa propre difficulté. */
  function curDiff() { return isLol() ? prefs.lolDiff : prefs.diff; }
  function setDiff(id) {
    if (isLol()) prefs.lolDiff = id; else prefs.diff = id;
  }

  function bestOf(d) {
    return isLol() ? lolGame.loadBest(d.id) : game.loadBest(d.id, prefs.endless);
  }

  /* --- Construction du menu -------------------------------------------------- */
  function buildModes() {
    el.modeList.innerHTML = '';
    for (const m of MODES) {
      const b = document.createElement('button');
      b.className = 'mode-card' + (m.id === prefs.mode ? ' active' : '');
      b.style.setProperty('--c', m.color);
      b.innerHTML =
        '<div class="mname">' + m.name + '</div>' +
        '<div class="mtag">' + m.tag + '</div>' +
        '<div class="mdesc">' + m.desc + '</div>';
      b.addEventListener('click', () => { prefs.mode = m.id; savePrefs(); buildMenu(); });
      el.modeList.appendChild(b);
    }
  }

  function buildMenu() {
    buildModes();
    el.list.innerHTML = '';
    for (const d of C().DIFFICULTIES) {
      const best = bestOf(d);
      const card = document.createElement('button');
      card.className = 'diff-card' + (d.id === curDiff() ? ' active' : '');
      card.style.setProperty('--c', d.color);
      card.innerHTML =
        '<div class="dname">' + d.name + '</div>' +
        '<div class="dsub">' + d.sub + '</div>' +
        '<div class="dbest">' + (best > 0 ? 'Record ' + U.fmtTime(best) : 'Jamais tenté') + '</div>';
      card.addEventListener('click', () => { setDiff(d.id); savePrefs(); buildMenu(); });
      el.list.appendChild(card);
    }
    renderDetails();
    renderToggles();
    renderControls();
  }

  function renderDetails() {
    const cfg = C();
    const d = cfg.diff(curDiff());
    el.details.style.setProperty('--c', d.color);
    el.details.innerHTML =
      '<h3>' + d.name + '</h3>' +
      '<p>' + d.blurb + '</p>' +
      '<ul>' + d.bullets.map(b => '<li>' + b + '</li>').join('') + '</ul>' +
      '<p style="margin-top:10px;color:#8a92b8">Premier objectif : <b style="color:' + d.color + '">' +
        d.objectives[0].label + '</b> → ' + cfg.BUFFS[d.objectives[0].reward].name + '</p>' +
      (d.impossible
        ? '<p class="warn">⚠ Ce mode n\'est pas équilibré pour un joueur humain. Il existe pour mesurer un plafond, ou pour tester un bot.</p>'
        : '');
  }

  function renderToggles() {
    // Le terrain procédural n'existe que dans le mode classique.
    el.terrainRow.style.display = isLol() ? 'none' : '';

    // Le pilote automatique aussi : en mode LoL on ne se déplace pas par
    // direction mais par ordre de clic, et la visée ennemie réagit à cet
    // ordre. Piloter ça demanderait un tout autre bot, donc l'option
    // disparaît au lieu d'exister sans rien faire.
    el.botRow.style.display = isLol() ? 'none' : '';
    if (isLol() && prefs.bot) { prefs.bot = false; savePrefs(); }

    document.querySelectorAll('.toggle').forEach(btn => {
      const opt = btn.dataset.opt;
      const val = btn.dataset.val === 'true' ? true : (btn.dataset.val === 'false' ? false : btn.dataset.val);
      btn.classList.toggle('on', prefs[opt] === val);
      btn.onclick = () => {
        prefs[opt] = val;
        savePrefs();
        if (opt === 'endless') buildMenu(); else renderToggles();
      };
    });

    el.terrainHint.textContent = prefs.endless
      ? 'Secteurs générés à l\'infini : piliers qui bloquent les tirs, flaques qui ralentissent, plaques qui rechargent le dash. Le champ d\'effondrement te poursuit à 52 % de ta vitesse — fuir marche, mais chaque seconde passée à courir est une seconde sans frôlement, donc sans adrénaline.'
      : 'Arène fermée qui rétrécit par paliers. Le terrain de référence : rien à fuir, tout à lire. C\'est ici que les records comptent.';

    el.botHint.textContent = prefs.bot
      ? 'Le bot anticipe la position de chaque danger à quatre horizons et choisit la direction la plus sûre. Il dashe quand aucune n\'est sûre, déclenche l\'adrénaline quand ça se resserre, et respecte le défi en cours. Sa partie n\'enregistre aucun record.'
      : 'Tu peux laisser le bot jouer à ta place pour voir une difficulté de haut, ou comparer sa lecture à la tienne. Indisponible en mode LoL.';
  }

  function renderControls() {
    el.controls.innerHTML = mode().controls
      .map(c => '<span><b>' + c[0] + '</b> ' + c[1] + '</span>').join('');
  }

  /* --- Transitions d'écran ---------------------------------------------------- */
  function show(n) { n.classList.remove('hidden'); }
  function hide(n) { n.classList.add('hidden'); }

  function toMenu() {
    game.state = 'menu';
    lolGame.state = 'menu';
    hide(el.pause); hide(el.dead); show(el.menu);
    root.Touch.hide();
    buildMenu();
  }

  function startRun() {
    hide(el.menu); hide(el.dead); hide(el.pause);
    // L'autre moteur est mis au repos : un seul tourne à la fois.
    (isLol() ? game : lolGame).state = 'menu';
    // Un seul système d'entrée écoute le canvas à la fois, sinon un appui
    // tactile piloterait les deux modes.
    root.Input.enabled = !isLol();
    root.LolInput.enabled = isLol();
    root.Touch.setMode(isLol() ? 'lol' : 'classic');
    root.Touch.show();
    G().start(curDiff(), {
      endless: prefs.endless, quality: prefs.quality, shake: prefs.shake,
      bot: !isLol() && prefs.bot
    });
  }

  /* --- Écran de mort ----------------------------------------------------------- */
  function stat(k, v, record) {
    return '<div class="stat' + (record ? ' record' : '') + '"><div class="k">' + k +
           '</div><div class="v">' + v + '</div></div>';
  }

  game.onDeath = function () {
    const d = game.diff, nx = game.objectives.next();
    el.cause.textContent = game.deathCause;
    el.stats.innerHTML =
      stat('Temps tenu', U.fmtTime(game.elapsed), game.newRecord) +
      stat('Record', U.fmtTime(game.best), game.newRecord) +
      stat('Objectifs', game.objectives.completed + ' / ' + d.objectives.length) +
      stat('Frôlements', String(game.stats.graze)) +
      stat('Intensité atteinte', '×' + game.director.I.toFixed(2)) +
      stat('Dashs utilisés', String(game.stats.dashes));

    let v = game.botActive
      ? '<b>Partie jouée par le bot</b> — aucun record enregistré, ce serait le score de la machine. '
      : (game.newRecord
          ? '<b>Nouveau record.</b> '
          : 'Il manquait <b>' + (game.best - game.elapsed).toFixed(2) + 's</b> pour battre ton record. ');
    v += nx
      ? 'Prochain objectif raté de <b>' + Math.max(0, nx.t - game.elapsed).toFixed(1) + 's</b> : ' +
        nx.label + ' (' + CFG.BUFFS[nx.reward].name + ').'
      : 'Tous les objectifs étaient validés — il ne restait que la survie.';
    if (game.objectives.failed > 0) {
      v += ' <b>' + game.objectives.failed + '</b> défi(s) raté(s) : autant de vagues de punition subies.';
    }
    if (!game.botActive && game.stats.graze < game.elapsed * 0.5 && !d.impossible) {
      v += ' Tu joues loin des balles — le frôlement est la seule source d\'adrénaline.';
    }
    el.verdict.innerHTML = v;
    root.Touch.hide();
    show(el.dead);
  };

  lolGame.onDeath = function () {
    const d = lolGame.diff, s = lolGame.stats, nx = lolGame.objectives.next();
    el.cause.textContent = lolGame.deathCause;
    el.stats.innerHTML =
      stat('Temps tenu', U.fmtTime(lolGame.elapsed), lolGame.newRecord) +
      stat('Record', U.fmtTime(lolGame.best), lolGame.newRecord) +
      stat('Objectifs', lolGame.objectives.completed + ' / ' + d.objectives.length) +
      stat('Esquives de justesse', String(s.jukes)) +
      stat('CC subis', String(s.ccTaken)) +
      stat('Bloqués par un sbire', String(s.blocked));

    let v = lolGame.newRecord
      ? '<b>Nouveau record.</b> '
      : 'Il manquait <b>' + (lolGame.best - lolGame.elapsed).toFixed(2) + 's</b> pour battre ton record. ';
    v += nx
      ? 'Prochain objectif raté de <b>' + Math.max(0, nx.t - lolGame.elapsed).toFixed(1) + 's</b> : ' +
        nx.label + ' (' + LOLCFG.BUFFS[nx.reward].name + ').'
      : 'Tous les objectifs étaient validés — il ne restait que la survie.';
    if (lolGame.objectives.failed > 0) {
      v += ' <b>' + lolGame.objectives.failed + '</b> défi(s) raté(s).';
    }
    // Diagnostic propre au dodge LoL : le nombre d'ordres donnés dit tout.
    const ordersPerSec = s.orders / Math.max(1, lolGame.elapsed);
    if (ordersPerSec < 0.55 && !d.impossible) {
      v += ' <b>Tu cliques trop peu</b> (' + ordersPerSec.toFixed(2) + ' ordre/s) : ils visent ton ordre de déplacement, ' +
           'donc marcher en ligne droite revient à leur offrir la cible. Re-clique pendant leur incantation.';
    } else if (s.ccTaken > 0 && s.ccTaken >= lolGame.elapsed / 12) {
      v += ' Tu manges beaucoup de CC : un enracinement ne tue pas, c\'est le sort suivant qui tue. Garde la Purge pour ça.';
    }
    el.verdict.innerHTML = v;
    root.Touch.hide();
    show(el.dead);
  };

  /* --- Contrôles globaux -------------------------------------------------------- */
  el.start.addEventListener('click', startRun);
  el.retry.addEventListener('click', startRun);
  /** Bascule pause : partagée par la touche Échap et le bouton tactile. */
  function togglePause() {
    const g = G();
    if (g.state === 'playing') {
      g.state = 'paused'; show(el.pause); root.Touch.hide();
      root.Input.clearAll(); root.LolInput.clearAll();
    } else if (g.state === 'paused') {
      g.state = 'playing'; hide(el.pause); root.Touch.show();
      root.Input.clearAll(); root.LolInput.clearAll();
    }
  }

  el.resume.addEventListener('click', togglePause);
  el.quit.addEventListener('click', toMenu);
  el.toMenu.addEventListener('click', toMenu);

  root.addEventListener('keydown', e => {
    const g = G();
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    if (e.code === 'KeyR' && (g.state === 'dead' || g.state === 'paused')) startRun();
    if (e.code === 'Enter' && g.state === 'menu') startRun();
  });

  /* --- Boucle principale ---------------------------------------------------------- */
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 120;          // pas fixe : les collisions ne sautent rien

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;

    const g = G();
    if (g.state === 'playing') {
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard++ < 8) {
        acc -= STEP;
        g.update(STEP);
        if (g.state !== 'playing') { acc = 0; break; }
      }
    } else if (g.state === 'dead') {
      g.fx.update(dt);
    }
    g.render();
    if (g.state === 'playing') root.Touch.sync(g);
  }

  // Commandes tactiles : le bouton pause du HUD mobile partage la bascule
  // du clavier, pour qu'il n'y ait qu'un seul chemin de code.
  root.Touch.init(togglePause);

  buildMenu();
  requestAnimationFrame(frame);
})(window);
