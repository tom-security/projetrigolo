/* ==========================================================================
   lol/hud.js — interface du mode LoL (espace écran)
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.LOLCFG;

  function bar(ctx, x, y, w, h, k, col, bg) {
    ctx.fillStyle = bg || 'rgba(255,255,255,.10)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w * U.clamp(k, 0, 1), h);
  }

  function label(ctx, x, y, t, s, c, a) {
    ctx.font = '700 ' + s + 'px Segoe UI, Inter, sans-serif';
    ctx.textAlign = a || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = c;
    ctx.fillText(t, x, y);
  }

  /** Case de sort : touche, nom, recharge. */
  function slot(ctx, x, y, key, name, ready, cd, cdMax, color) {
    const s = 46;
    ctx.fillStyle = ready ? 'rgba(255,209,102,.16)' : 'rgba(255,255,255,.05)';
    ctx.fillRect(x, y, s, s);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ready ? color : 'rgba(255,255,255,.14)';
    ctx.strokeRect(x, y, s, s);
    if (!ready && cdMax > 0) {
      const k = U.clamp(cd / cdMax, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.62)';
      ctx.fillRect(x, y, s, s * k);
      label(ctx, x + s / 2, y + s / 2 + 6, Math.ceil(cd) + '', 17, '#fff', 'center');
    }
    label(ctx, x + s / 2, y + s - 6, key, 12, ready ? color : 'rgba(255,255,255,.35)', 'center');
    label(ctx, x + s / 2, y - 6, name, 10, 'rgba(200,210,240,.6)', 'center');
  }

  function draw(ctx, g, w, h) {
    const p = g.player, d = g.diff, o = g.objectives;
    ctx.save();

    /* ---- Chrono, difficulté, intensité --------------------------------- */
    label(ctx, 22, 50, U.fmtTime(g.elapsed), 38, '#fff');
    label(ctx, 22, 70, 'DODGE LoL · ' + d.name, 11.5, d.color);
    bar(ctx, 22, 80, 168, 5, U.inv(1, d.intensityCap, g.director.I), d.color);
    label(ctx, 196, 85, 'INTENSITÉ ×' + g.director.I.toFixed(2), 10.5, 'rgba(200,210,240,.72)');
    label(ctx, 22, 104, 'PRÉDICTION ENNEMIE ' + Math.round(d.predict * 100) + '%  ·  ' +
      g.casters.length + ' ennemi' + (g.casters.length > 1 ? 's' : ''), 10.5, 'rgba(200,210,240,.5)');

    /* ---- Record --------------------------------------------------------- */
    if (g.best > 0) {
      label(ctx, w - 22, 36, 'RECORD', 10.5, 'rgba(200,210,240,.55)', 'right');
      const beat = g.elapsed > g.best;
      label(ctx, w - 22, 60, U.fmtTime(g.best), 22, beat ? '#4ade80' : '#ffd166', 'right');
      if (beat) label(ctx, w - 22, 78, 'NOUVEAU RECORD', 10.5, '#4ade80', 'right');
    }

    /* ---- Objectif ------------------------------------------------------- */
    const ch = o.activeChallenge;
    if (ch) {
      const bw = 320;
      ctx.fillStyle = 'rgba(8,10,20,.72)';
      ctx.fillRect(w / 2 - bw / 2, 16, bw, 46);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,209,102,.6)';
      ctx.strokeRect(w / 2 - bw / 2, 16, bw, 46);
      label(ctx, w / 2, 36, 'DÉFI · ' + ch.label, 12.5, '#ffd166', 'center');
      const k = ch.left / ch.max;
      bar(ctx, w / 2 - bw / 2 + 12, 44, bw - 24, 6, k, k < 0.3 ? '#ff3b30' : '#ffd166');
      label(ctx, w / 2, 58,
        ch.cond === 'juke' ? ch.progress + ' / ' + ch.target + ' esquives de justesse'
                           : ch.left.toFixed(1) + ' s restantes',
        11, '#fff', 'center');
    } else {
      const nx = o.next();
      if (nx) {
        label(ctx, w / 2, 32, 'PROCHAIN OBJECTIF · ' + nx.label, 12, 'rgba(200,210,240,.75)', 'center');
        label(ctx, w / 2, 50, 'dans ' + Math.max(0, nx.t - g.elapsed).toFixed(1) + 's  →  ' +
          CFG.BUFFS[nx.reward].name, 11, d.color, 'center');
      } else {
        label(ctx, w / 2, 36, 'TOUS LES OBJECTIFS VALIDÉS · SURVIE PURE', 12, '#4ade80', 'center');
      }
    }

    /* ---- Bannière -------------------------------------------------------- */
    if (o.bannerT > 0 && o.banner) {
      ctx.globalAlpha = U.clamp(o.bannerT / 0.5, 0, 1);
      label(ctx, w / 2, h * 0.28, o.banner.text, 30, o.banner.color, 'center');
      if (o.banner.sub) label(ctx, w / 2, h * 0.28 + 24, o.banner.sub, 13, 'rgba(230,236,255,.8)', 'center');
      ctx.globalAlpha = 1;
    }

    /* ---- Barre de sorts -------------------------------------------------- */
    const slots = [];
    if (p.has('flash'))   slots.push(['F', 'Flash',  p.flashCd <= 0, p.flashCd, d.flashCd, '#ffd166']);
    if (p.has('dash'))    slots.push(['ESP', 'Ruée', p.dashCharges > 0, p.dashCd, d.dashCd, '#4de3ff']);
    if (p.has('cleanse')) slots.push(['A', 'Purge',  p.cleanseCd <= 0, p.cleanseCd, CFG.PLAYER.cleanseCd, '#4ade80']);
    if (p.has('zhonya'))  slots.push(['E', 'Stase',  p.zhonyaCd <= 0, p.zhonyaCd, CFG.PLAYER.zhonyaCd, '#ffd166']);
    const sw = 46, gap = 9;
    let sx = w / 2 - (slots.length * sw + (slots.length - 1) * gap) / 2;
    for (const s of slots) {
      slot(ctx, sx, h - 70, s[0], s[1], s[2], s[3], s[4], s[5]);
      sx += sw + gap;
    }
    if (p.has('dash') && p.dashMax > 1) {
      label(ctx, w / 2, h - 78, 'CHARGES ' + p.dashCharges + '/' + p.dashMax, 10, 'rgba(200,210,240,.6)', 'center');
    }

    /* ---- Objets obtenus (bas gauche) ------------------------------------- */
    let bx = 22;
    for (const id in p.buffs) {
      const b = CFG.BUFFS[id];
      ctx.fillStyle = 'rgba(255,209,102,.14)';
      ctx.fillRect(bx, h - 46, 26, 24);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,209,102,.45)';
      ctx.strokeRect(bx, h - 46, 26, 24);
      label(ctx, bx + 13, h - 29, b.icon, 13, '#ffd166', 'center');
      bx += 31;
    }
    if (p.shieldUp) label(ctx, 22, h - 54, '◇ BOUCLIER DE SORTS PRÊT', 11, '#b4dcff');

    /* ---- Statistiques ----------------------------------------------------- */
    label(ctx, w - 22, h - 62, 'ESQUIVES DE JUSTESSE ' + g.stats.jukes, 11, 'rgba(200,210,240,.5)', 'right');
    label(ctx, w - 22, h - 46, 'CC SUBIS ' + g.stats.ccTaken + '  ·  BLOQUÉS PAR SBIRE ' + g.stats.blocked,
      11, 'rgba(200,210,240,.5)', 'right');
    if (g.lastAbilityT > 0 && g.lastAbility) {
      ctx.globalAlpha = U.clamp(g.lastAbilityT / 0.6, 0, 1) * 0.75;
      label(ctx, w - 22, h - 26, g.lastAbility.toUpperCase(), 12, 'rgba(200,210,240,.9)', 'right');
      ctx.globalAlpha = 1;
    }

    /* ---- État de contrôle ------------------------------------------------- */
    if (p.knockT > 0 || p.rootT > 0 || p.slowT > 0) {
      const txt = p.knockT > 0 ? 'PROJETÉ' : (p.rootT > 0 ? 'ENRACINÉ' : 'RALENTI');
      const col = p.knockT > 0 ? '#ff3b6b' : (p.rootT > 0 ? '#c77dff' : '#7b8cff');
      const t = Math.max(p.knockT, p.rootT, p.slowT);
      label(ctx, w / 2, h * 0.63, txt, 26, col, 'center');
      bar(ctx, w / 2 - 90, h * 0.63 + 12, 180, 7, t / 2, col);
      if (p.has('cleanse') && p.cleanseCd <= 0 && (p.rootT > 0 || p.knockT > 0)) {
        label(ctx, w / 2, h * 0.63 + 36, 'A — PURGER', 13, '#4ade80', 'center');
      }
    }

    /* ---- Hors zone --------------------------------------------------------- */
    if (p.outRatio > 0.02) {
      const k = p.outRatio;
      ctx.save();
      ctx.globalAlpha = k * 0.55;
      const gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.62);
      gr.addColorStop(0, 'rgba(255,59,48,0)');
      gr.addColorStop(1, 'rgba(255,59,48,1)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      if (p.outOfBounds) {
        label(ctx, w / 2, h * 0.16, 'HORS ZONE — ' + ((1 - k) * d.outOfBoundsGrace).toFixed(2) + 's',
          26, '#ff3b30', 'center');
      }
    }

    ctx.restore();
  }

  root.LolHUD = { draw };
})(window);
