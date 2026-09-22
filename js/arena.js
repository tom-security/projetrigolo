/* ==========================================================================
   arena.js — terrain, champ d'effondrement, caméra
   --------------------------------------------------------------------------
   Deux modes :
     · closed  : arène circulaire fixe qui rétrécit par paliers. Le terrain
                 d'entraînement classique — rien à fuir, tout à esquiver.
     · endless : carte procédurale infinie (secteurs générés par hash) avec
                 piliers bloquants, flaques ralentissantes et plaques de
                 recharge. Le champ d'effondrement poursuit le joueur MOINS
                 vite qu'il ne court : fuir gagne du temps mais coûte de la
                 jauge, et le champ finit toujours par refermer.
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U, CFG = root.CFG;

  function Arena(game) {
    this.game = game;
    this.endless = false;
    this.cx = 0; this.cy = 0;
    this.radius = 400;
    this.baseRadius = 400;
    this.targetRadius = 400;
    this.phase = 0;
    this.seed = 1;
    this.sectors = new Map();
    this.nearby = [];           // features du secteur courant + voisins
    this.outTimer = 0;
    this.travelled = 0;
    this.camX = 0; this.camY = 0;
  }

  Arena.prototype.init = function (diff, endless, seed) {
    this.endless = !!endless;
    this.diff = diff;
    this.seed = seed >>> 0;
    this.baseRadius = diff.arenaRadius * (endless ? CFG.ENDLESS.radiusMul : 1);
    this.radius = this.baseRadius;
    this.targetRadius = this.baseRadius;
    this.cx = 0; this.cy = 0;
    this.camX = 0; this.camY = 0;
    this.phase = 0;
    this.outTimer = 0;
    this.travelled = 0;
    this.sectors.clear();
    this.nearby.length = 0;
  };

  /* --- Génération procédurale -------------------------------------------- */
  Arena.prototype.sectorAt = function (sx, sy) {
    const key = sx + ',' + sy;
    let s = this.sectors.get(key);
    if (s) return s;

    const S = CFG.ENDLESS.sector;
    const feats = [];
    const n = 2 + Math.floor(U.hash2(sx, sy, this.seed) * 3);   // 2..4 éléments
    for (let i = 0; i < n; i++) {
      const hx = U.hash2(sx * 31 + i, sy * 17, this.seed + 7);
      const hy = U.hash2(sx * 13, sy * 29 + i, this.seed + 91);
      const ht = U.hash2(sx + i * 101, sy - i * 57, this.seed + 404);
      const hr = U.hash2(sx - i * 7, sy + i * 3, this.seed + 1337);
      const x = sx * S + hx * S;
      const y = sy * S + hy * S;
      let kind, r;
      if (ht < 0.46) { kind = 'pillar'; r = U.lerp(CFG.ENDLESS.pillarR[0], CFG.ENDLESS.pillarR[1], hr); }
      else if (ht < 0.84) { kind = 'sludge'; r = U.lerp(CFG.ENDLESS.sludgeR[0], CFG.ENDLESS.sludgeR[1], hr); }
      else { kind = 'charge'; r = 30; }
      feats.push({ kind, x, y, r, used: 0 });
    }
    s = { feats };
    this.sectors.set(key, s);
    if (this.sectors.size > 400) {                 // purge : mémoire bornée
      const first = this.sectors.keys().next().value;
      this.sectors.delete(first);
    }
    return s;
  };

  Arena.prototype.refreshNearby = function (px, py) {
    const S = CFG.ENDLESS.sector;
    const sx = Math.floor(px / S), sy = Math.floor(py / S);
    this.nearby.length = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const s = this.sectorAt(sx + dx, sy + dy);
        for (const f of s.feats) this.nearby.push(f);
      }
    }
  };

  /** Un pilier coupe-t-il le segment AB ? (les projectiles s'y écrasent) */
  Arena.prototype.blocks = function (ax, ay, bx, by) {
    if (!this.endless) return null;
    for (const f of this.nearby) {
      if (f.kind !== 'pillar') continue;
      if (U.distToSeg(f.x, f.y, ax, ay, bx, by) < f.r) return f;
    }
    return null;
  };

  Arena.prototype.featureAt = function (x, y, kind) {
    for (const f of this.nearby) {
      if (f.kind !== kind) continue;
      if (U.dist2(x, y, f.x, f.y) < f.r * f.r) return f;
    }
    return null;
  };

  /* --- Mise à jour -------------------------------------------------------- */
  Arena.prototype.update = function (dt, player, elapsed) {
    const d = this.diff;

    // Rétrécissement par paliers : la pression monte, puis respire un peu.
    const phase = Math.floor(elapsed / d.shrinkPeriod);
    const k = (elapsed % d.shrinkPeriod) / d.shrinkPeriod;
    const floor = U.lerp(1, d.shrinkTo, U.clamp(phase / 4, 0, 1));
    this.targetRadius = this.baseRadius * U.lerp(floor, floor * 0.88, U.smooth(k));
    this.radius = U.approach(this.radius, this.targetRadius, 42 * dt);

    if (this.endless) {
      // Le champ poursuit le joueur, plus lentement que lui.
      const chase = d.playerSpeed * CFG.ENDLESS.chaseSpeedRatio;
      const dx = player.x - this.cx, dy = player.y - this.cy;
      const l = Math.hypot(dx, dy);
      if (l > 1) {
        const step = Math.min(chase * dt, l);
        this.cx += dx / l * step;
        this.cy += dy / l * step;
      }
      this.refreshNearby(player.x, player.y);
      this.travelled += Math.hypot(player.vx, player.vy) * dt;
    }

    // Hors limites : compte à rebours, puis mort. Le sursis dépend de la difficulté.
    const out = U.dist(player.x, player.y, this.cx, this.cy) - this.radius;
    if (out > 0) {
      this.outTimer += dt;
      player.outOfBounds = true;
      player.outRatio = U.clamp(this.outTimer / d.outOfBoundsGrace, 0, 1);
      if (this.outTimer >= d.outOfBoundsGrace) return 'collapse';
    } else {
      this.outTimer = Math.max(0, this.outTimer - dt * 2.2);
      player.outOfBounds = false;
      player.outRatio = this.outTimer / d.outOfBoundsGrace;
    }
    return null;
  };

  /** Caméra : centrée sur l'arène en mode fermé, suivi souple sinon. */
  Arena.prototype.updateCamera = function (dt, player, w, h) {
    let tx, ty;
    if (this.endless) {
      tx = player.x + player.vx * 0.16;
      ty = player.y + player.vy * 0.16;
    } else {
      tx = this.cx + (player.x - this.cx) * 0.12;
      ty = this.cy + (player.y - this.cy) * 0.12;
    }
    const s = 1 - Math.pow(0.0015, dt);
    this.camX += (tx - this.camX) * s;
    this.camY += (ty - this.camY) * s;
  };

  /* --- Rendu -------------------------------------------------------------- */
  Arena.prototype.drawFloor = function (ctx, view) {
    const { x0, y0, x1, y1 } = view;

    // Grille de fond : repère de mouvement, indispensable pour lire sa vitesse.
    const g = 62;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(90,110,190,.075)';
    ctx.beginPath();
    for (let x = Math.floor(x0 / g) * g; x < x1; x += g) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = Math.floor(y0 / g) * g; y < y1; y += g) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();

    if (this.endless) this.drawFeatures(ctx);
  };

  Arena.prototype.drawFeatures = function (ctx) {
    for (const f of this.nearby) {
      if (f.kind === 'pillar') {
        // Couverture solide : doit se lire d'un coup d'œil, on s'abrite derrière.
        ctx.fillStyle = 'rgba(26,34,66,.99)';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, U.TAU); ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(150,180,255,.85)';
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(150,180,255,.30)';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.62, 0, U.TAU); ctx.stroke();
      } else if (f.kind === 'sludge') {
        // Flaque ralentissante : traversable, mais elle se paie.
        ctx.fillStyle = 'rgba(126,44,176,.22)';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, U.TAU); ctx.fill();
        U.glow(ctx, f.x, f.y, f.r, 'rgba(180,80,230,.26)', 'rgba(150,60,200,0)');
        ctx.save();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(210,140,255,.75)';
        ctx.setLineDash([9, 7]);
        ctx.lineDashOffset = -performance.now() * 0.012;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, U.TAU); ctx.stroke();
        ctx.restore();
      } else {
        const pulse = 0.6 + Math.sin(performance.now() * 0.005 + f.x) * 0.4;
        const alpha = f.used > 0 ? 0.12 : 0.55;
        U.glow(ctx, f.x, f.y, f.r * (1 + pulse * 0.25),
          'rgba(255,209,102,' + (alpha * 0.6) + ')', 'rgba(255,209,102,0)');
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,209,102,' + alpha + ')';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, U.TAU); ctx.stroke();
      }
    }
  };

  /** Bord de l'arène + voile rouge sur la zone létale. */
  Arena.prototype.drawBounds = function (ctx, view, elapsed) {
    const r = this.radius;
    const danger = this.outTimer > 0;

    ctx.save();
    // Assombrit tout ce qui est hors du cercle.
    ctx.beginPath();
    ctx.rect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    ctx.arc(this.cx, this.cy, r, 0, U.TAU, true);
    ctx.fillStyle = danger ? 'rgba(120,10,25,.42)' : 'rgba(80,10,30,.26)';
    ctx.fill();
    ctx.restore();

    // Anneau : pointillés qui tournent, plus vifs quand ça rétrécit.
    const shrinking = this.radius - this.targetRadius > 1.2;
    ctx.save();
    ctx.lineWidth = shrinking ? 4 : 2.5;
    ctx.strokeStyle = danger ? '#ff3b30' : (shrinking ? '#ff8a3d' : 'rgba(120,150,255,.55)');
    ctx.setLineDash([16, 12]);
    ctx.lineDashOffset = -elapsed * 26;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, r, 0, U.TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Cercle intérieur : cible du challenge « rester au centre ».
    const ch = this.game.objectives && this.game.objectives.activeChallenge;
    if (ch && ch.cond === 'inner') {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,209,102,.55)';
      ctx.setLineDash([8, 10]);
      ctx.lineDashOffset = elapsed * 40;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r * 0.42, 0, U.TAU);
      ctx.stroke();
      ctx.restore();
    }
  };

  Arena.prototype.innerRadius = function () { return this.radius * 0.42; };

  root.Arena = Arena;
})(window);
