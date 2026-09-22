/* ==========================================================================
   hud.js — interface en jeu (dessinée en espace écran)
   Lisibilité d'abord : rien ne doit masquer une trajectoire.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.CFG;

  function bar(ctx, x, y, w, h, k, col, bg) {
    ctx.fillStyle = bg || 'rgba(255,255,255,.10)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w * U.clamp(k, 0, 1), h);
  }

  function label(ctx, x, y, text, size, col, align) {
    ctx.font = '700 ' + size + 'px Segoe UI, Inter, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = col;
    ctx.fillText(text, x, y);
  }

  function draw(ctx, g, w, h) {
    const p = g.player, d = g.diff, o = g.objectives;
    ctx.save();

    /* ---- Chrono + difficulté (haut gauche) ---------------------------- */
    label(ctx, 22, 50, U.fmtTime(g.elapsed), 38, '#fff');
    label(ctx, 22, 70, 'BULLET-HELL · ' + d.name + (g.arena.endless ? ' · CARTE INFINIE' : ''), 11.5, d.color);

    // Intensité : montre que la difficulté monte en permanence.
    const ik = U.inv(1, d.intensityCap, g.director.I);
    bar(ctx, 22, 80, 168, 5, ik, d.color);
    label(ctx, 196, 85, 'INTENSITÉ ×' + g.director.I.toFixed(2), 10.5, 'rgba(200,210,240,.72)');

    /* ---- Record (haut droite) ------------------------------------------ */
    if (g.best > 0) {
      label(ctx, w - 22, 36, 'RECORD', 10.5, 'rgba(200,210,240,.55)', 'right');
      const beating = g.elapsed > g.best;
      label(ctx, w - 22, 60, U.fmtTime(g.best), 22, beating ? '#4ade80' : '#ffd166', 'right');
      if (beating) label(ctx, w - 22, 78, 'NOUVEAU RECORD', 10.5, '#4ade80', 'right');
    }

    /* ---- Objectif courant (haut centre) -------------------------------- */
    const ch = o.activeChallenge;
    if (ch) {
      const k = ch.left / ch.max;
      const bw = 300;
      ctx.fillStyle = 'rgba(8,10,20,.72)';
      ctx.fillRect(w / 2 - bw / 2, 16, bw, 46);
      ctx.strokeStyle = 'rgba(255,209,102,.6)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w / 2 - bw / 2, 16, bw, 46);
      label(ctx, w / 2, 36, 'DÉFI · ' + ch.label, 12.5, '#ffd166', 'center');
      bar(ctx, w / 2 - bw / 2 + 12, 44, bw - 24, 6, k, k < 0.3 ? '#ff3b30' : '#ffd166');
      if (ch.cond === 'graze') {
        label(ctx, w / 2, 58, ch.progress + ' / ' + ch.target + ' frôlements', 11, '#fff', 'center');
      } else {
        label(ctx, w / 2, 58, ch.left.toFixed(1) + ' s restantes', 11, '#fff', 'center');
      }
    } else {
      const nx = o.next();
      if (nx) {
        const remain = Math.max(0, nx.t - g.elapsed);
        label(ctx, w / 2, 32, 'PROCHAIN OBJECTIF · ' + nx.label, 12, 'rgba(200,210,240,.75)', 'center');
        label(ctx, w / 2, 50, 'dans ' + remain.toFixed(1) + 's  →  ' + CFG.BUFFS[nx.reward].name,
          11, d.color, 'center');
      } else {
        label(ctx, w / 2, 36, 'TOUS LES OBJECTIFS VALIDÉS · SURVIE PURE', 12, '#4ade80', 'center');
      }
    }

    /* ---- Bannière d'annonce -------------------------------------------- */
    if (o.bannerT > 0 && o.banner) {
      const a = U.clamp(o.bannerT / 0.5, 0, 1);
      ctx.globalAlpha = a;
      label(ctx, w / 2, h * 0.30, o.banner.text, 30, o.banner.color, 'center');
      if (o.banner.sub) label(ctx, w / 2, h * 0.30 + 24, o.banner.sub, 13, 'rgba(230,236,255,.8)', 'center');
      ctx.globalAlpha = 1;
    }

    /* ---- Pattern en cours (info d'apprentissage) ----------------------- */
    if (g.lastPatternT > 0 && g.lastPattern) {
      ctx.globalAlpha = U.clamp(g.lastPatternT / 0.6, 0, 1) * 0.75;
      label(ctx, w - 22, h - 26, g.lastPattern.toUpperCase(), 12, 'rgba(200,210,240,.9)', 'right');
      ctx.globalAlpha = 1;
    }

    /* ---- Dash / adrénaline (bas centre) -------------------------------- */
    const cy = h - 34;
    if (p.has('dash')) {
      const n = p.dashMax;
      const sw = 34, gap = 7;
      const total = n * sw + (n - 1) * gap;
      for (let i = 0; i < n; i++) {
        const x = w / 2 - total / 2 + i * (sw + gap);
        const full = i < p.dashCharges;
        ctx.fillStyle = full ? '#4de3ff' : 'rgba(255,255,255,.12)';
        ctx.fillRect(x, cy, sw, 7);
        if (!full && i === p.dashCharges && p.dashCd > 0) {
          const k = 1 - p.dashCd / d.dashCooldown;
          ctx.fillStyle = 'rgba(77,227,255,.45)';
          ctx.fillRect(x, cy, sw * k, 7);
        }
      }
      label(ctx, w / 2, cy - 8, 'DASH', 10, 'rgba(200,210,240,.6)', 'center');
    }

    if (p.has('adrenalin')) {
      const bw2 = 190;
      const ready = p.adrenalin >= 1;
      bar(ctx, w / 2 - bw2 / 2, cy + 14, bw2, 6, p.adrenalin, ready ? '#ffd166' : '#7b8cff');
      label(ctx, w / 2, cy + 34,
        ready ? 'ADRÉNALINE PRÊTE — [E]' : 'ADRÉNALINE ' + Math.round(p.adrenalin * 100) + '%',
        10.5, ready ? '#ffd166' : 'rgba(200,210,240,.6)', 'center');
    }

    /* ---- Buffs obtenus (bas gauche) ------------------------------------ */
    let bx = 22;
    const by = h - 30;
    for (const id in p.buffs) {
      const b = CFG.BUFFS[id];
      ctx.fillStyle = 'rgba(255,209,102,.14)';
      ctx.fillRect(bx, by - 16, 26, 24);
      ctx.strokeStyle = 'rgba(255,209,102,.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by - 16, 26, 24);
      label(ctx, bx + 13, by + 1, b.icon, 13, '#ffd166', 'center');
      bx += 31;
    }
    if (p.wind > 0) {
      label(ctx, 22, by - 24, '✚ SECOND SOUFFLE ×' + p.wind, 11, '#4ade80');
    }

    /* ---- Statistiques discrètes (bas droite) --------------------------- */
    label(ctx, w - 22, h - 46, 'FRÔLEMENTS ' + g.stats.graze, 11, 'rgba(200,210,240,.5)', 'right');

    /* ---- Alerte hors limites ------------------------------------------- */
    if (p.outRatio > 0.02) {
      const k = p.outRatio;
      ctx.save();
      ctx.globalAlpha = k * 0.55;
      const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.62);
      grad.addColorStop(0, 'rgba(255,59,48,0)');
      grad.addColorStop(1, 'rgba(255,59,48,1)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      if (p.outOfBounds) {
        label(ctx, w / 2, h * 0.16, 'HORS ZONE — ' + ((1 - k) * d.outOfBoundsGrace).toFixed(2) + 's',
          26, '#ff3b30', 'center');
      }
    }

    /* ---- Ralentissement actif ------------------------------------------ */
    if (p.slowT > 0) {
      ctx.strokeStyle = 'rgba(77,227,255,' + U.clamp(p.slowT, 0, 1) * 0.5 + ')';
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      label(ctx, w / 2, h * 0.11, 'ADRÉNALINE', 16, '#4de3ff', 'center');
    }

    ctx.restore();
  }

  root.HUD = { draw };
})(window);
