/* ==========================================================================
   lol/input.js — souris façon LoL. Namespace séparé : ne touche pas Input.
   --------------------------------------------------------------------------
   Les coordonnées restent en ESPACE ÉCRAN ; seul le jeu connaît la caméra et
   le zoom, donc c'est lui qui convertit en unités monde.
   ========================================================================== */
(function (root) {
  'use strict';

  const down = Object.create(null);
  const pressed = Object.create(null);

  const MAP = {
    flash:   ['KeyF'],
    dash:    ['Space'],
    cleanse: ['KeyA'],
    zhonya:  ['KeyE'],
    stop:    ['KeyS']            // comme LoL : annule l'ordre de déplacement
  };

  const mouse = { sx: 0, sy: 0, inside: false };
  let moveOrder = null;
  let holdMove = false;          // clic droit maintenu = ordre régénéré en continu
  let attached = false;

  function held(a) {
    const c = MAP[a];
    if (!c) return false;
    for (let i = 0; i < c.length; i++) if (down[c[i]]) return true;
    return false;
  }

  function tapped(a) {
    const c = MAP[a];
    if (!c) return false;
    for (let i = 0; i < c.length; i++) {
      if (pressed[c[i]]) { pressed[c[i]] = false; return true; }
    }
    return false;
  }

  /** Ordre de déplacement en attente, ou null. */
  function takeMoveOrder() {
    if (moveOrder) { const m = moveOrder; moveOrder = null; return m; }
    if (holdMove && mouse.inside) return { sx: mouse.sx, sy: mouse.sy, held: true };
    return null;
  }

  function clearAll() {
    for (const k in down) down[k] = false;
    for (const k in pressed) pressed[k] = false;
    moveOrder = null;
    holdMove = false;
  }

  function attach(canvas) {
    if (attached) return;
    attached = true;

    root.addEventListener('keydown', e => {
      if (e.code === 'Space') e.preventDefault();
      if (!e.repeat) pressed[e.code] = true;
      down[e.code] = true;
    }, { passive: false });
    root.addEventListener('keyup', e => { down[e.code] = false; });
    root.addEventListener('blur', clearAll);

    // Le clic droit est une commande de jeu : pas de menu contextuel.
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      mouse.sx = e.clientX - r.left;
      mouse.sy = e.clientY - r.top;
      mouse.inside = true;
    }

    canvas.addEventListener('mousemove', pos);
    canvas.addEventListener('mouseleave', () => { mouse.inside = false; holdMove = false; });

    canvas.addEventListener('mousedown', e => {
      pos(e);
      if (e.button === 2) {
        moveOrder = { sx: mouse.sx, sy: mouse.sy };
        holdMove = true;
        e.preventDefault();
      }
    });
    root.addEventListener('mouseup', e => { if (e.button === 2) holdMove = false; });

    // Tactile : un appui vaut un clic droit.
    canvas.addEventListener('touchstart', e => {
      const t = e.changedTouches[0], r = canvas.getBoundingClientRect();
      mouse.sx = t.clientX - r.left; mouse.sy = t.clientY - r.top; mouse.inside = true;
      moveOrder = { sx: mouse.sx, sy: mouse.sy };
      holdMove = true;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      const t = e.changedTouches[0], r = canvas.getBoundingClientRect();
      mouse.sx = t.clientX - r.left; mouse.sy = t.clientY - r.top;
      e.preventDefault();
    }, { passive: false });
    const end = () => { holdMove = false; };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }

  root.LolInput = { attach, held, tapped, takeMoveOrder, clearAll, mouse };
})(window);
