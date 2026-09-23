/* ==========================================================================
   entities.js — dangers. Aucun n'appartient au joueur : il n'attaque pas.
   --------------------------------------------------------------------------
   Contrat commun :
     update(dt, game) -> false pour mourir
     draw(ctx, game)
     hits(px, py, pr) -> bool           (létal maintenant ?)
     edge(px, py)     -> distance à la surface (frôlement ; -1 = non frôlable)
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U;

  /* ====================== BULLET ========================================= */
  function Bullet(o) {
    this.x = o.x; this.y = o.y;
    this.vx = o.vx; this.vy = o.vy;
    this.r = o.r || 7;
    this.c = o.c || '#4de3ff';
    this.life = o.life === undefined ? 9 : o.life;
    this.delay = o.delay || 0;
    this.curve = o.curve || 0;          // rad/s appliqués au vecteur vitesse
    this.accel = o.accel || 0;          // px/s² le long de la vitesse
    this.homing = o.homing || 0;        // rad/s de correction vers le joueur
    this.homingTime = o.homingTime === undefined ? 999 : o.homingTime;
    this.trail = o.trail !== false;
    this.dead = false;
    this.age = 0;
  }

  Bullet.prototype.update = function (dt, game) {
    this.age += dt;
    if (this.delay > 0) { this.delay -= dt; return true; }

    this.life -= dt;
    if (this.life <= 0) return false;

    let a = Math.atan2(this.vy, this.vx);
    let s = Math.hypot(this.vx, this.vy);

    if (this.curve) a += this.curve * dt;
    if (this.homing && this.age < this.homingTime) {
      const want = Math.atan2(game.player.y - this.y, game.player.x - this.x);
      const d = U.angDelta(a, want);
      a += U.clamp(d, -this.homing * dt, this.homing * dt);
    }
    if (this.accel) s = Math.max(20, s + this.accel * dt);

    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;

    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;

    // Les piliers de la carte infinie arrêtent les projectiles : ce sont de
    // vraies couvertures, pas de la décoration.
    const wall = game.arena.blocks(this.x, this.y, nx, ny);
    if (wall) {
      game.fx.burst(this.x, this.y, 5, this.c, 130, 2.4, 0.3);
      return false;
    }

    this.x = nx; this.y = ny;

    if (this.trail && s > 260) game.fx.trail(this.x, this.y, this.c, this.r * 0.35);

    // Purge serrée : hors de l'arène, un projectile n'est plus une information,
    // c'est du bruit. La marge couvre les patterns qui naissent au-delà du bord.
    const lim = game.arena.radius + 240;
    if (U.dist2(this.x, this.y, game.arena.cx, game.arena.cy) > lim * lim) return false;
    return true;
  };

  Bullet.prototype.hits = function (px, py, pr) {
    if (this.delay > 0) return false;
    const rr = this.r + pr;
    return U.dist2(px, py, this.x, this.y) < rr * rr;
  };

  Bullet.prototype.edge = function (px, py) {
    if (this.delay > 0) return -1;
    return U.dist(px, py, this.x, this.y) - this.r;
  };

  Bullet.prototype.draw = function (ctx) {
    if (this.delay > 0) {
      // Point d'apparition : on voit où ça va sortir, une fraction avant.
      ctx.globalAlpha = 0.5 + Math.sin(this.age * 40) * 0.3;
      ctx.fillStyle = this.c;
      ctx.beginPath(); ctx.arc(this.x, this.y, 2.2, 0, U.TAU); ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    U.glow(ctx, this.x, this.y, this.r * 2.6, U.rgba(this.c, 0.34), U.rgba(this.c, 0));
    ctx.fillStyle = this.c;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.42, 0, U.TAU); ctx.fill();
  };

  /* ====================== BLAST (les « grosses boules ») ================== *
   * Trois temps : télégraphe -> détonation -> persistance.                   *
   * La persistance est LE curseur de difficulté demandé : courte en easy,    *
   * interminable en infernal, et elle s'allonge encore avec l'intensité.     */
  function Blast(o) {
    this.x = o.x; this.y = o.y;
    this.r = o.r;
    this.tele = o.tele;
    this.teleMax = o.tele;
    this.linger = o.linger;
    this.lingerMax = o.linger;
    this.secondary = o.secondary || 0;
    this.c = o.c || '#ff8a3d';
    this.state = 'tele';
    this.t = 0;
    this.grow = o.grow || 0;            // le rayon peut enfler pendant l'explosion
    // Plancher d'avertissement de la difficulté, transmis aux répliques : elles
    // naissent ici, hors du directeur, et échappaient sinon au plancher.
    this.floor = o.floor || 0;
  }

  Blast.prototype.update = function (dt, game) {
    this.t += dt;
    if (this.state === 'tele') {
      this.tele -= dt;
      if (this.tele <= 0) {
        this.state = 'boom';
        game.fx.burst(this.x, this.y, 46, this.c, 460, 5, 0.75);
        game.fx.ring(this.x, this.y, 30, this.r * 0.35, '#fff', 520);
        game.fx.kick(this.r * 0.055);
        game.audio.boom();
      }
      return true;
    }
    this.linger -= dt;
    if (this.grow) this.r += this.grow * dt;
    if (this.linger <= 0) {
      if (this.secondary > 0) {
        // Répliques : l'erreur ne se paie pas une fois, elle se paie en chaîne.
        for (let i = 0; i < this.secondary; i++) {
          const a = U.rr(0, U.TAU), d = U.rr(this.r * 0.7, this.r * 1.5);
          game.hazards.push(new Blast({
            x: this.x + Math.cos(a) * d,
            y: this.y + Math.sin(a) * d,
            r: this.r * 0.62,
            // Le minimum de 180 ms passait sous le plancher de 200 ms
            // d'infernal ; le plancher de la difficulté prime désormais.
            tele: Math.max(0.18, this.floor, this.teleMax * 0.55),
            linger: this.lingerMax * 0.6,
            secondary: 0,
            floor: this.floor,
            c: '#ff5a3d'
          }));
        }
      }
      return false;
    }
    return true;
  };

  Blast.prototype.hits = function (px, py, pr) {
    if (this.state !== 'boom') return false;
    const rr = this.r + pr;
    return U.dist2(px, py, this.x, this.y) < rr * rr;
  };

  Blast.prototype.edge = function (px, py) {
    if (this.state !== 'boom') return -1;
    return Math.abs(U.dist(px, py, this.x, this.y) - this.r);
  };

  Blast.prototype.draw = function (ctx) {
    if (this.state === 'tele') {
      const k = 1 - this.tele / this.teleMax;
      const urgent = this.tele < 0.3;
      // Disque d'avertissement + anneau qui se referme : deux lectures,
      // l'une périphérique, l'autre précise.
      U.glow(ctx, this.x, this.y, this.r, U.rgba(this.c, 0.10 + k * 0.16), U.rgba(this.c, 0));
      ctx.lineWidth = 2;
      ctx.strokeStyle = U.rgba(this.c, 0.45);
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.stroke();

      ctx.lineWidth = urgent ? 5 : 3.5;
      ctx.strokeStyle = urgent ? '#fff' : this.c;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * (1 - k * 0.82), 0, U.TAU); ctx.stroke();

      if (urgent) {
        ctx.globalAlpha = 0.25 + Math.sin(this.t * 60) * 0.2;
        ctx.fillStyle = this.c;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      return;
    }

    // Persistance : opacité dégressive MAIS létalité constante jusqu'au bout.
    // Le contour blanc reste net pour qu'on ne se fasse jamais avoir par le fade.
    const k = this.linger / this.lingerMax;
    const a = 0.30 + k * 0.42;
    U.glow(ctx, this.x, this.y, this.r * 1.12, U.rgba('#fff2c0', a * 0.75), U.rgba(this.c, 0));
    ctx.fillStyle = U.rgba(this.c, a * 0.55);
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.stroke();
  };

  /* ====================== LASER ========================================== */
  function Laser(o) {
    this.x = o.x; this.y = o.y;
    this.a = o.a;
    this.len = o.len || 2000;
    this.w = o.w || 16;
    this.tele = o.tele;
    this.teleMax = o.tele;
    this.active = o.active;
    this.activeMax = o.active;
    this.spin = o.spin || 0;
    this.c = o.c || '#ff4d7a';
    this.state = 'tele';
  }

  Laser.prototype.update = function (dt, game) {
    this.a += this.spin * dt;
    if (this.state === 'tele') {
      this.tele -= dt;
      if (this.tele <= 0) { this.state = 'on'; game.fx.kick(2.5); game.audio.zap(); }
      return true;
    }
    this.active -= dt;
    return this.active > 0;
  };

  Laser.prototype._seg = function () {
    return [this.x, this.y, this.x + Math.cos(this.a) * this.len, this.y + Math.sin(this.a) * this.len];
  };

  Laser.prototype.hits = function (px, py, pr) {
    if (this.state !== 'on') return false;
    const s = this._seg();
    return U.distToSeg(px, py, s[0], s[1], s[2], s[3]) < this.w * 0.5 + pr;
  };

  Laser.prototype.edge = function (px, py) {
    if (this.state !== 'on') return -1;
    const s = this._seg();
    return U.distToSeg(px, py, s[0], s[1], s[2], s[3]) - this.w * 0.5;
  };

  Laser.prototype.draw = function (ctx) {
    const s = this._seg();
    ctx.save();
    if (this.state === 'tele') {
      const k = 1 - this.tele / this.teleMax;
      ctx.lineWidth = 1 + k * 3;
      ctx.strokeStyle = U.rgba(this.c, 0.25 + k * 0.5);
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = -performance.now() * 0.04;
    } else {
      const k = this.active / this.activeMax;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = this.w * (0.75 + k * 0.45);
      ctx.strokeStyle = U.rgba(this.c, 0.55);
      ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke();
      ctx.lineWidth = this.w * 0.38;
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
    }
    ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke();
    ctx.restore();
  };

  /* ====================== WALL (mur à brèche) ============================= */
  function Wall(o) {
    this.a = o.a;                       // direction de déplacement (normale)
    this.x = o.x; this.y = o.y;         // point courant sur la normale
    this.speed = o.speed;
    this.half = o.half || 1200;         // demi-longueur du mur
    this.thick = o.thick || 14;
    this.gap = o.gap;                   // position de la brèche le long du mur
    this.gapHalf = o.gapHalf;
    this.c = o.c || '#a78bfa';
    this.tele = o.tele;
    this.teleMax = o.tele;
    this.life = o.life || 7;
    this.drift = o.drift || 0;          // la brèche peut glisser : il faut suivre
  }

  Wall.prototype.update = function (dt) {
    if (this.tele > 0) { this.tele -= dt; return true; }
    this.x += Math.cos(this.a) * this.speed * dt;
    this.y += Math.sin(this.a) * this.speed * dt;
    this.gap += this.drift * dt;
    this.life -= dt;
    return this.life > 0;
  };

  Wall.prototype._parts = function () {
    const tx = -Math.sin(this.a), ty = Math.cos(this.a);   // tangente
    const a1x = this.x + tx * -this.half, a1y = this.y + ty * -this.half;
    const b1x = this.x + tx * (this.gap - this.gapHalf), b1y = this.y + ty * (this.gap - this.gapHalf);
    const a2x = this.x + tx * (this.gap + this.gapHalf), a2y = this.y + ty * (this.gap + this.gapHalf);
    const b2x = this.x + tx * this.half, b2y = this.y + ty * this.half;
    return [a1x, a1y, b1x, b1y, a2x, a2y, b2x, b2y];
  };

  Wall.prototype.hits = function (px, py, pr) {
    if (this.tele > 0) return false;
    const p = this._parts();
    const t = this.thick * 0.5 + pr;
    return U.distToSeg(px, py, p[0], p[1], p[2], p[3]) < t ||
           U.distToSeg(px, py, p[4], p[5], p[6], p[7]) < t;
  };

  Wall.prototype.edge = function (px, py) {
    if (this.tele > 0) return -1;
    const p = this._parts();
    return Math.min(
      U.distToSeg(px, py, p[0], p[1], p[2], p[3]),
      U.distToSeg(px, py, p[4], p[5], p[6], p[7])
    ) - this.thick * 0.5;
  };

  Wall.prototype.draw = function (ctx) {
    const p = this._parts();
    ctx.save();
    if (this.tele > 0) {
      ctx.globalAlpha = 0.35 + (1 - this.tele / this.teleMax) * 0.4;
      ctx.setLineDash([12, 9]);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = this.thick;
    ctx.strokeStyle = U.rgba(this.c, 0.55);
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p[4], p[5]); ctx.lineTo(p[6], p[7]); ctx.stroke();
    ctx.lineWidth = this.thick * 0.42;
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p[4], p[5]); ctx.lineTo(p[6], p[7]); ctx.stroke();
    ctx.restore();
  };

  /* ====================== CHASER (orbe traqueuse) ========================= */
  function Chaser(o) {
    this.x = o.x; this.y = o.y;
    this.a = o.a;
    this.speed = o.speed;
    this.turn = o.turn;
    this.r = o.r || 12;
    this.life = o.life || 9;
    this.c = o.c || '#ff4d7a';
    this.tele = o.tele || 0;
    this.teleMax = this.tele;
  }

  Chaser.prototype.update = function (dt, game) {
    if (this.tele > 0) { this.tele -= dt; return true; }
    this.life -= dt;
    if (this.life <= 0) {
      game.fx.burst(this.x, this.y, 10, this.c, 160, 3, 0.4);
      return false;
    }
    const want = Math.atan2(game.player.y - this.y, game.player.x - this.x);
    this.a += U.clamp(U.angDelta(this.a, want), -this.turn * dt, this.turn * dt);
    this.x += Math.cos(this.a) * this.speed * dt;
    this.y += Math.sin(this.a) * this.speed * dt;
    game.fx.trail(this.x, this.y, this.c, this.r * 0.4);
    return true;
  };

  Chaser.prototype.hits = function (px, py, pr) {
    if (this.tele > 0) return false;
    const rr = this.r + pr;
    return U.dist2(px, py, this.x, this.y) < rr * rr;
  };

  Chaser.prototype.edge = function (px, py) {
    if (this.tele > 0) return -1;
    return U.dist(px, py, this.x, this.y) - this.r;
  };

  Chaser.prototype.draw = function (ctx) {
    if (this.tele > 0) {
      ctx.globalAlpha = 0.4 + Math.sin(this.tele * 30) * 0.3;
      ctx.lineWidth = 2; ctx.strokeStyle = this.c;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 1.8, 0, U.TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    U.glow(ctx, this.x, this.y, this.r * 3, U.rgba(this.c, 0.3), U.rgba(this.c, 0));
    ctx.fillStyle = this.c;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.55, 0, U.TAU); ctx.stroke();
  };

  root.Ent = { Bullet, Blast, Laser, Wall, Chaser };
})(window);
