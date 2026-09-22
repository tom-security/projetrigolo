/* ==========================================================================
   touch.js — commandes tactiles
   --------------------------------------------------------------------------
   Sur un écran tactile il manque deux choses : de quoi déclencher les sorts,
   et un repère visuel pour le joystick. Les boutons sont des éléments DOM
   posés par-dessus le canvas — ils captent donc leurs propres appuis, ce qui
   laisse le canvas libre pour le déplacement et rend le multi-touch naturel
   (on garde le pouce sur le stick pendant qu'on appuie de l'autre main).

   Les boutons ne font que traduire un appui en nom d'action : le jeu ne sait
   pas si la commande vient du clavier ou d'un doigt.
   ========================================================================== */
(function (root) {
  'use strict';

  // Chaque bouton : [action, libellé, touche équivalente, buff requis, maintenu]
  const SETS = {
    classic: [
      ['dash',  'DASH',  'ESP',  'dash',      false],
      ['focus', 'FOCUS', 'MAJ',  'focus',     true],
      ['adren', 'ADRÉ',  'E',    'adrenalin', false]
    ],
    lol: [
      ['flash',   'FLASH', 'F',   'flash',   false],
      ['dash',    'RUÉE',  'ESP', 'dash',    false],
      ['cleanse', 'PURGE', 'A',   'cleanse', false],
      ['zhonya',  'STASE', 'E',   'zhonya',  false]
    ]
  };

  const T = {
    available: false,
    mode: null,
    el: null, stick: null, knob: null, actions: null,
    buttons: [],
    _sig: ''
  };

  /** Un pointeur grossier ou un écran tactile suffit à justifier les boutons. */
  function detect() {
    return ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0) ||
           (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  function makeButton(spec, input) {
    const [action, label, key, , holdable] = spec;
    const b = document.createElement('button');
    b.className = 'tbtn';
    b.dataset.action = action;
    b.innerHTML = '<span class="tlab">' + label + '</span><span class="tkey">' + key + '</span>';

    const press = e => {
      e.preventDefault(); e.stopPropagation();
      if (b.classList.contains('locked')) return;
      input().vPress(action);
      b.classList.add('down');
    };
    const release = e => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (holdable) input().vRelease(action);
      b.classList.remove('down');
    };
    // Un appui maintenu (focus) doit rester actif ; un appui simple se relâche
    // tout de suite pour ne pas bloquer la touche virtuelle.
    b.addEventListener('touchstart', e => { press(e); if (!holdable) input().vRelease(action); }, { passive: false });
    b.addEventListener('touchend', release, { passive: false });
    b.addEventListener('touchcancel', release, { passive: false });
    b.addEventListener('mousedown', press);
    b.addEventListener('mouseup', release);
    b.addEventListener('mouseleave', release);
    b.addEventListener('contextmenu', e => e.preventDefault());
    return b;
  }

  T.init = function (onPause) {
    T.available = detect();
    T.el = document.getElementById('touch-ui');
    T.stick = document.getElementById('touch-stick');
    T.knob = T.stick ? T.stick.querySelector('.tstick-knob') : null;
    T.actions = document.getElementById('touch-actions');
    const pause = document.getElementById('touch-pause');
    if (pause) {
      pause.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); onPause(); }, { passive: false });
      pause.addEventListener('click', e => { e.preventDefault(); onPause(); });
    }
    if (!T.available && T.el) T.el.classList.add('hidden');
  };

  /** Construit le jeu de boutons du mode donné (une seule fois par mode). */
  T.setMode = function (mode) {
    if (!T.available || !T.actions || T.mode === mode) return;
    T.mode = mode;
    T.actions.innerHTML = '';
    T.buttons.length = 0;
    const input = () => (mode === 'lol' ? root.LolInput : root.Input);
    for (const spec of SETS[mode] || []) {
      const b = makeButton(spec, input);
      T.actions.appendChild(b);
      T.buttons.push({ el: b, buff: spec[3] });
    }
    // Le stick n'a de sens qu'au clavier : en mode LoL on se déplace au clic.
    if (T.stick) T.stick.style.display = mode === 'lol' ? 'none' : '';
  };

  T.show = function () { if (T.available && T.el) T.el.classList.remove('hidden'); };
  T.hide = function () { if (T.el) T.el.classList.add('hidden'); };

  /** Vrai quand les boutons occupent l'écran : le HUD doit leur laisser
      le coin bas-droit, sinon ses statistiques passent dessous. */
  T.isActive = function () {
    return !!(T.available && T.el && !T.el.classList.contains('hidden'));
  };

  /** Grise les sorts pas encore débloqués et suit le joystick. */
  T.sync = function (game) {
    if (!T.available || !T.el || T.el.classList.contains('hidden')) return;

    const p = game.player;
    let sig = '';
    for (const b of T.buttons) {
      const has = !!(p && p.buffs && p.buffs[b.buff]);
      sig += has ? '1' : '0';
    }
    if (sig !== T._sig) {                       // on ne touche au DOM que si ça change
      T._sig = sig;
      T.buttons.forEach((b, i) => b.el.classList.toggle('locked', sig[i] === '0'));
    }

    if (T.stick && T.mode !== 'lol') {
      const st = root.Input.touchState();
      if (st.active) {
        const r = root.Input.stickRadius;
        T.stick.style.display = '';
        T.stick.style.left = st.ox + 'px';
        T.stick.style.top = st.oy + 'px';
        T.knob.style.transform = 'translate(' + (st.dx * r) + 'px,' + (st.dy * r) + 'px)';
        T.stick.classList.add('on');
      } else {
        T.stick.classList.remove('on');
      }
    }
  };

  root.Touch = T;
})(window);
