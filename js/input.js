/* ==========================================================================
   input.js — clavier (AZERTY + QWERTY + flèches) et gestes tactiles
   ========================================================================== */
(function (root) {
  'use strict';

  const down = Object.create(null);
  const pressed = Object.create(null);   // vidé à chaque frame consommée

  const MAP = {
    up:    ['KeyW', 'KeyZ', 'ArrowUp'],
    down:  ['KeyS', 'ArrowDown'],
    left:  ['KeyA', 'KeyQ', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    dash:  ['Space'],
    focus: ['ShiftLeft', 'ShiftRight'],
    adren: ['KeyE'],
    pause: ['Escape', 'KeyP'],
    retry: ['KeyR']
  };

  // Appuis venant des boutons tactiles : même vocabulaire que les touches,
  // pour que le reste du jeu n'ait pas à savoir d'où vient la commande.
  const vDown = Object.create(null);
  const vPressed = Object.create(null);

  function held(action) {
    if (vDown[action]) return true;
    const codes = MAP[action];
    for (let i = 0; i < codes.length; i++) if (down[codes[i]]) return true;
    return false;
  }

  function tapped(action) {
    if (vPressed[action]) { vPressed[action] = false; return true; }
    const codes = MAP[action];
    for (let i = 0; i < codes.length; i++) {
      if (pressed[codes[i]]) { pressed[codes[i]] = false; return true; }
    }
    return false;
  }

  function vPress(action) { vDown[action] = true; vPressed[action] = true; }
  function vRelease(action) { vDown[action] = false; }

  /** Vecteur de déplacement normalisé (clavier, ou joystick tactile). */
  function axis() {
    let x = 0, y = 0;
    if (held('left')) x -= 1;
    if (held('right')) x += 1;
    if (held('up')) y -= 1;
    if (held('down')) y += 1;
    if (x === 0 && y === 0 && touch.active) { x = touch.dx; y = touch.dy; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  const touch = { active: false, dx: 0, dy: 0, id: null, ox: 0, oy: 0 };
  const STICK_R = 58;            // rayon utile du joystick, en pixels écran

  function clearAll() {
    for (const k in down) down[k] = false;
    for (const k in pressed) pressed[k] = false;
    for (const k in vDown) vDown[k] = false;
    for (const k in vPressed) vPressed[k] = false;
    touch.active = false; touch.dx = 0; touch.dy = 0; touch.id = null;
  }

  function attach(canvas) {
    window.addEventListener('keydown', e => {
      // Évite que Espace / flèches fassent défiler la page.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) pressed[e.code] = true;
      down[e.code] = true;
    }, { passive: false });

    window.addEventListener('keyup', e => { down[e.code] = false; });
    window.addEventListener('blur', clearAll);

    // --- Tactile : joystick virtuel relatif au point de contact ----------
    // Les deux modes écoutent le même canvas ; `enabled` évite qu'un appui
    // destiné au mode LoL pilote aussi le joystick du mode classique.
    canvas.addEventListener('touchstart', e => {
      if (!api.enabled) return;
      const t = e.changedTouches[0];
      touch.id = t.identifier; touch.ox = t.clientX; touch.oy = t.clientY;
      touch.active = true; touch.dx = 0; touch.dy = 0;
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      if (!api.enabled) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== touch.id) continue;
        const dx = t.clientX - touch.ox, dy = t.clientY - touch.oy;
        const l = Math.hypot(dx, dy) || 1;
        const s = Math.min(l, STICK_R) / STICK_R;
        touch.dx = dx / l * s; touch.dy = dy / l * s;
      }
      e.preventDefault();
    }, { passive: false });

    const end = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === touch.id) { touch.active = false; touch.dx = 0; touch.dy = 0; touch.id = null; }
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }

  const api = {
    attach, held, tapped, axis, clearAll,
    vPress, vRelease,
    enabled: true,
    stickRadius: STICK_R,
    /** État du joystick, pour que l'affichage tactile puisse le dessiner. */
    touchState: () => touch
  };
  root.Input = api;
})(window);
