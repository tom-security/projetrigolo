/* ==========================================================================
   main.js — menus, sélection de difficulté, boucle principale
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.CFG;

  const canvas = document.getElementById('game');
  const game = new root.Game(canvas);
  root.Input.attach(canvas);

  // Exposé pour le débogage et pour brancher un bot externe (mode Infernal).
  root.DODGE = game;

  const el = {
    menu: document.getElementById('menu'),
    pause: document.getElementById('pause'),
    dead: document.getElementById('dead'),
    list: document.getElementById('difficulty-list'),
    details: document.getElementById('diff-details'),
    terrainHint: document.getElementById('terrain-hint'),
    start: document.getElementById('start-btn'),
    resume: document.getElementById('resume-btn'),
    quit: document.getElementById('quit-btn'),
    retry: document.getElementById('retry-btn'),
    toMenu: document.getElementById('menu-btn'),
    cause: document.getElementById('death-cause'),
    stats: document.getElementById('run-stats'),
    verdict: document.getElementById('run-verdict')
  };

  /* --- Préférences persistées -------------------------------------------- */
  const PREF_KEY = 'dodgetrainer.prefs';
  const prefs = Object.assign(
    { diff: 'medium', endless: false, quality: 'high', shake: true },
    (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } })()
  );
  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  }

  /* --- Construction du menu ----------------------------------------------- */
  function buildMenu() {
    el.list.innerHTML = '';
    for (const d of CFG.DIFFICULTIES) {
      const best = game.loadBest(d.id, prefs.endless);
      const card = document.createElement('button');
      card.className = 'diff-card' + (d.id === prefs.diff ? ' active' : '');
      card.style.setProperty('--c', d.color);
      card.innerHTML =
        '<div class="dname">' + d.name + '</div>' +
        '<div class="dsub">' + d.sub + '</div>' +
        '<div class="dbest">' + (best > 0 ? 'Record ' + U.fmtTime(best) : 'Jamais tenté') + '</div>';
      card.addEventListener('click', () => { prefs.diff = d.id; savePrefs(); buildMenu(); });
      el.list.appendChild(card);
    }
    renderDetails();
    renderToggles();
  }

  function renderDetails() {
    const d = CFG.diff(prefs.diff);
    el.details.style.setProperty('--c', d.color);
    el.details.innerHTML =
      '<h3>' + d.name + '</h3>' +
      '<p>' + d.blurb + '</p>' +
      '<ul>' + d.bullets.map(b => '<li>' + b + '</li>').join('') + '</ul>' +
      '<p style="margin-top:10px;color:#8a92b8">Premier objectif : <b style="color:' + d.color + '">' +
        d.objectives[0].label + '</b> → ' + CFG.BUFFS[d.objectives[0].reward].name + '</p>' +
      (d.impossible
        ? '<p class="warn">⚠ Ce mode n\'est pas équilibré pour un joueur humain. Il existe pour mesurer un plafond, ou pour tester un bot.</p>'
        : '');
  }

  function renderToggles() {
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
  }

  /* --- Transitions d'écran ------------------------------------------------ */
  function show(node) { node.classList.remove('hidden'); }
  function hide(node) { node.classList.add('hidden'); }

  function toMenu() {
    game.state = 'menu';
    hide(el.pause); hide(el.dead); show(el.menu);
    buildMenu();
  }

  function startRun() {
    hide(el.menu); hide(el.dead); hide(el.pause);
    game.start(prefs.diff, { endless: prefs.endless, quality: prefs.quality, shake: prefs.shake });
  }

  /* --- Écran de mort ------------------------------------------------------- */
  game.onDeath = function () {
    el.cause.textContent = game.deathCause;

    const d = game.diff;
    const objDone = game.objectives.completed;
    const objTotal = d.objectives.length;
    const nx = game.objectives.next();

    el.stats.innerHTML =
      stat('Temps tenu', U.fmtTime(game.elapsed), game.newRecord) +
      stat('Record', U.fmtTime(game.best), game.newRecord) +
      stat('Objectifs', objDone + ' / ' + objTotal) +
      stat('Frôlements', String(game.stats.graze)) +
      stat('Intensité atteinte', '×' + game.director.I.toFixed(2)) +
      stat('Dashs utilisés', String(game.stats.dashes));

    let v;
    if (game.newRecord) {
      v = '<b>Nouveau record.</b> ';
    } else {
      const gap = game.best - game.elapsed;
      v = 'Il manquait <b>' + gap.toFixed(2) + 's</b> pour battre ton record. ';
    }
    if (nx) {
      v += 'Prochain objectif raté de <b>' + Math.max(0, nx.t - game.elapsed).toFixed(1) + 's</b> : ' +
           nx.label + ' (' + CFG.BUFFS[nx.reward].name + ').';
    } else {
      v += 'Tous les objectifs étaient validés — il ne restait que la survie.';
    }
    if (game.objectives.failed > 0) {
      v += ' <b>' + game.objectives.failed + '</b> défi(s) raté(s) : autant de vagues de punition subies.';
    }
    if (game.stats.graze < game.elapsed * 0.5 && !d.impossible) {
      v += ' Tu joues loin des balles — le frôlement est la seule source d\'adrénaline.';
    }
    el.verdict.innerHTML = v;

    show(el.dead);
  };

  function stat(k, v, record) {
    return '<div class="stat' + (record ? ' record' : '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
  }

  /* --- Contrôles globaux --------------------------------------------------- */
  el.start.addEventListener('click', startRun);
  el.retry.addEventListener('click', startRun);
  el.resume.addEventListener('click', () => { game.state = 'playing'; hide(el.pause); root.Input.clearAll(); });
  el.quit.addEventListener('click', toMenu);
  el.toMenu.addEventListener('click', toMenu);

  root.addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (game.state === 'playing') { game.state = 'paused'; show(el.pause); }
      else if (game.state === 'paused') { game.state = 'playing'; hide(el.pause); root.Input.clearAll(); }
    }
    if (e.code === 'KeyR' && (game.state === 'dead' || game.state === 'paused')) startRun();
    if (e.code === 'Enter' && game.state === 'menu') startRun();
  });

  /* --- Boucle principale --------------------------------------------------- */
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 120;          // pas fixe : les collisions ne sautent pas de balle

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;    // reprise d'onglet : on ne rattrape pas 10s

    if (game.state === 'playing') {
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard++ < 8) {
        acc -= STEP;
        game.update(STEP);
        if (game.state !== 'playing') { acc = 0; break; }
      }
    } else if (game.state === 'dead') {
      game.fx.update(dt);        // l'explosion finale continue de vivre
    }

    game.render();
  }

  buildMenu();
  requestAnimationFrame(frame);
})(window);
