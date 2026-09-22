/* ==========================================================================
   lol/entities.js — skillshots. Le joueur n'en lance aucun.
   --------------------------------------------------------------------------
   Chaque sort suit le rythme LoL : INCANTATION (indicateur au sol, le lanceur
   corrige encore sa visée) puis VOL (temps de trajet). La fenêtre d'esquive
   réelle est la somme des deux, et c'est pendant ces deux phases qu'on juke.

   Contrat : update(dt, game) -> false pour mourir · draw(ctx)
             hits(px,py,pr) -> bool · edge(px,py) -> distance (-1 = inactif)
             effect -> ce qui est appliqué au joueur au contact
   ========================================================================== */
(function (root) {
  'use strict';
  const U = root.U;

  const KILL = { kind: 'kill' };

  /* ====================== LINE SHOT ======================================
     Blitzcrank Q, Morgana Q, Ezreal Q, Thresh Q…
     `collides` : s'arrête sur le premier sbire. C'est ce qui fait du
     placement derrière un sbire une esquive à part entière.                */
  function LineShot(o) {
    this.type = 'line';
    this.x = o.x; this.y = o.y;
    this.ox = o.x; this.oy = o.y;
    this.px = o.x; this.py = o.y;
    this.a = o.a;
    this.speed = o.speed;
    this.width = o.width;
    this.range = o.range;
    this.cast = o.cast; this.castMax = o.cast;
    this.collides = o.collides !== false;
    this.effect = o.effect || KILL;
    this.c = o.c || '#ff4d7a';
    this.tell = o.tell === undefined ? 1 : o.tell;
    this.caster = o.caster || null;
    this.state = 'cast';
    this.travelled = 0;
    this.threat = true;          // compte pour les esquives « de justesse »
    this.grazed = false;
  }

  LineShot.prototype.update = function (dt, game) {
    if (this.state === 'cast') {
      this.cast -= dt;
      // Pendant l'incantation le sort suit encore la visée du lanceur : bouger
      // maintenant change là où il partira. C'est le cœur du jeu.
      if (this.caster && this.caster.alive) {
        this.ox = this.x = this.caster.x;
        this.oy = this.y = this.caster.y;
        this.a = this.caster.aim;
      }
      if (this.cast <= 0) {
        this.state = 'fly';
        this.px = this.x; this.py = this.y;
        game.audio.zap();
      }
      return true;
    }

    this.px = this.x; this.py = this.y;
    const step = this.speed * dt;
    this.x += Math.cos(this.a) * step;
    this.y += Math.sin(this.a) * step;
    this.travelled += step;

    if (this.collides) {
      const r = this.width * 0.5;
      for (const m of game.minions) {
        if (!m.alive) continue;
        if (U.distToSeg(m.x, m.y, this.px, this.py, this.x, this.y) < r + m.r) {
          m.absorb(game);
          game.fx.burst(this.x, this.y, 14, this.c, 420, 6, 0.35);
          return false;
        }
      }
    }

    if (this.travelled >= this.range) {
      game.fx.burst(this.x, this.y, 6, this.c, 200, 4, 0.25);
      return false;
    }
    return true;
  };

  LineShot.prototype.hits = function (px, py, pr) {
    if (this.state !== 'fly') return false;
    return U.distToSeg(px, py, this.px, this.py, this.x, this.y) < this.width * 0.5 + pr;
  };

  LineShot.prototype.edge = function (px, py) {
    if (this.state !== 'fly') return -1;
    return U.distToSeg(px, py, this.px, this.py, this.x, this.y) - this.width * 0.5;
  };

  LineShot.prototype.draw = function (ctx) {
    if (this.state === 'cast') {
      const k = 1 - this.cast / this.castMax;
      const a = (0.10 + k * 0.32) * this.tell;
      const ex = this.ox + Math.cos(this.a) * this.range;
      const ey = this.oy + Math.sin(this.a) * this.range;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineWidth = this.width;
      ctx.strokeStyle = U.rgba(this.c, a * 0.45);
      ctx.beginPath(); ctx.moveTo(this.ox, this.oy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.lineWidth = 5;
      ctx.strokeStyle = U.rgba(this.c, Math.min(1, a * 1.9));
      ctx.setLineDash([28, 20]);
      ctx.lineDashOffset = -performance.now() * 0.05;
      ctx.beginPath(); ctx.moveTo(this.ox, this.oy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const tx = this.x - Math.cos(this.a) * this.width * 1.7;
    const ty = this.y - Math.sin(this.a) * this.width * 1.7;
    ctx.lineWidth = this.width;
    ctx.strokeStyle = U.rgba(this.c, 0.5);
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(this.x, this.y); ctx.stroke();
    ctx.restore();

    U.glow(ctx, this.x, this.y, this.width * 1.6, U.rgba(this.c, 0.45), U.rgba(this.c, 0));
    ctx.fillStyle = this.c;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.width * 0.5, 0, U.TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.width * 0.24, 0, U.TAU); ctx.fill();

    // Un sort de contrôle doit se lire autrement qu'un sort létal.
    if (this.effect.kind !== 'kill') {
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.width * 0.72, 0, U.TAU); ctx.stroke();
    }
  };

  /* ====================== CIRCLE (zone qui atterrit) =====================
     Ziggs Q, Karthus Q, Lux E, Xerath R…                                   */
  function Circle(o) {
    this.type = 'circle';
    this.x = o.x; this.y = o.y;
    this.r = o.r;
    this.tele = o.tele; this.teleMax = o.tele;
    this.linger = o.linger; this.lingerMax = o.linger;
    this.secondary = o.secondary || 0;
    this.c = o.c || '#ff8a3d';
    this.effect = o.effect || KILL;
    this.grow = o.grow || 0;
    this.state = 'tele';
    this.threat = false;
    this.grazed = false;
  }

  Circle.prototype.update = function (dt, game) {
    if (this.state === 'tele') {
      this.tele -= dt;
      if (this.tele <= 0) {
        this.state = 'boom';
        game.fx.burst(this.x, this.y, 46, this.c, 900, 11, 0.75);
        game.fx.ring(this.x, this.y, 30, this.r * 0.35, '#fff', 1100);
        game.fx.kick(this.r * 0.020);
        game.audio.boom();
      }
      return true;
    }
    this.linger -= dt;
    if (this.grow) this.r += this.grow * dt;
    if (this.linger <= 0) {
      for (let i = 0; i < this.secondary; i++) {
        const a = U.rr(0, U.TAU), d = U.rr(this.r * 0.7, this.r * 1.5);
        game.hazards.push(new Circle({
          x: this.x + Math.cos(a) * d, y: this.y + Math.sin(a) * d,
          r: this.r * 0.62, tele: Math.max(0.16, this.teleMax * 0.55),
          linger: this.lingerMax * 0.6, secondary: 0, c: '#ff5a3d'
        }));
      }
      return false;
    }
    return true;
  };

  Circle.prototype.hits = function (px, py, pr) {
    if (this.state !== 'boom') return false;
    const rr = this.r + pr;
    return U.dist2(px, py, this.x, this.y) < rr * rr;
  };

  Circle.prototype.edge = function (px, py) {
    if (this.state !== 'boom') return -1;
    return Math.abs(U.dist(px, py, this.x, this.y) - this.r);
  };

  Circle.prototype.draw = function (ctx) {
    if (this.state === 'tele') {
      const k = 1 - this.tele / this.teleMax;
      const urgent = this.tele < 0.28;
      U.glow(ctx, this.x, this.y, this.r, U.rgba(this.c, 0.10 + k * 0.16), U.rgba(this.c, 0));
      ctx.lineWidth = 5;
      ctx.strokeStyle = U.rgba(this.c, 0.5);
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.stroke();
      ctx.lineWidth = urgent ? 11 : 8;
      ctx.strokeStyle = urgent ? '#fff' : this.c;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * (1 - k * 0.82), 0, U.TAU); ctx.stroke();
      return;
    }
    // La transparence baisse, la létalité non : le liseré blanc reste franc.
    const k = this.linger / this.lingerMax;
    const a = 0.30 + k * 0.42;
    U.glow(ctx, this.x, this.y, this.r * 1.12, U.rgba('#fff2c0', a * 0.75), U.rgba(this.c, 0));
    ctx.fillStyle = U.rgba(this.c, a * 0.55);
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.stroke();
  };

  /* ====================== CONE ===========================================
     Annie W, Cassiopeia R…                                                 */
  function Cone(o) {
    this.type = 'cone';
    this.x = o.x; this.y = o.y;
    this.a = o.a; this.half = o.half; this.range = o.range;
    this.cast = o.cast; this.castMax = o.cast;
    this.active = o.active; this.activeMax = o.active;
    this.effect = o.effect || KILL;
    this.c = o.c || '#c77dff';
    this.tell = o.tell === undefined ? 1 : o.tell;
    this.caster = o.caster || null;
    this.state = 'cast';
    // Pas comptabilisé comme « esquive de justesse » : edge() ne renvoie pas
    // une distance mais dedans/dehors, donc il n'y a pas de frôlement à
    // mesurer. Un cône s'évite par le placement, pas par le juke.
    this.threat = false;
    this.grazed = false;
  }

  Cone.prototype.update = function (dt, game) {
    if (this.state === 'cast') {
      this.cast -= dt;
      if (this.caster && this.caster.alive) {
        this.x = this.caster.x; this.y = this.caster.y; this.a = this.caster.aim;
      }
      if (this.cast <= 0) { this.state = 'on'; game.fx.kick(5); game.audio.zap(); }
      return true;
    }
    this.active -= dt;
    return this.active > 0;
  };

  Cone.prototype._in = function (px, py, pr) {
    const d = U.dist(px, py, this.x, this.y);
    if (d > this.range + pr) return false;
    if (d <= pr) return true;
    const ang = Math.atan2(py - this.y, px - this.x);
    const slack = Math.asin(U.clamp(pr / d, 0, 1));
    return Math.abs(U.angDelta(this.a, ang)) < this.half + slack;
  };

  Cone.prototype.hits = function (px, py, pr) { return this.state === 'on' && this._in(px, py, pr); };
  Cone.prototype.edge = function (px, py) {
    if (this.state !== 'on') return -1;
    return this._in(px, py, 0) ? 0 : 9999;
  };

  Cone.prototype.draw = function (ctx) {
    const casting = this.state === 'cast';
    const k = casting ? 1 - this.cast / this.castMax : this.active / this.activeMax;
    const a = casting ? (0.12 + k * 0.28) * this.tell : 0.30 + k * 0.40;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.arc(this.x, this.y, this.range, this.a - this.half, this.a + this.half);
    ctx.closePath();
    ctx.fillStyle = U.rgba(this.c, a * 0.5);
    ctx.fill();
    ctx.lineWidth = casting ? 4 : 7;
    ctx.strokeStyle = casting ? U.rgba(this.c, Math.min(1, a * 1.8)) : 'rgba(255,255,255,.85)';
    ctx.stroke();
    ctx.restore();
  };

  /* ====================== ZONE (sol persistant) ==========================
     Brand W, Zyra E, Rumble R — ça ne bouge pas, ça reste.                 */
  function Zone(o) {
    this.type = 'zone';
    this.x = o.x; this.y = o.y; this.r = o.r;
    this.tele = o.tele; this.teleMax = o.tele;
    this.life = o.life; this.lifeMax = o.life;
    this.effect = o.effect || KILL;
    this.c = o.c || '#ff5a3d';
    this.state = 'tele';
    this.threat = false;
    this.grazed = false;
  }

  Zone.prototype.update = function (dt) {
    if (this.state === 'tele') {
      this.tele -= dt;
      if (this.tele <= 0) this.state = 'on';
      return true;
    }
    this.life -= dt;
    return this.life > 0;
  };

  Zone.prototype.hits = function (px, py, pr) {
    if (this.state !== 'on') return false;
    const rr = this.r + pr;
    return U.dist2(px, py, this.x, this.y) < rr * rr;
  };

  Zone.prototype.edge = function (px, py) {
    if (this.state !== 'on') return -1;
    return U.dist(px, py, this.x, this.y) - this.r;
  };

  Zone.prototype.draw = function (ctx) {
    if (this.state === 'tele') {
      const k = 1 - this.tele / this.teleMax;
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = U.rgba(this.c, 0.25 + k * 0.4);
      ctx.setLineDash([18, 14]);
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.stroke();
      ctx.restore();
      return;
    }
    const k = this.life / this.lifeMax;
    const pulse = 0.72 + Math.sin(performance.now() * 0.006) * 0.12;
    U.glow(ctx, this.x, this.y, this.r, U.rgba(this.c, 0.24 * pulse), U.rgba(this.c, 0));
    ctx.fillStyle = U.rgba(this.c, 0.20 * pulse);
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = U.rgba('#ffd166', 0.4 + k * 0.4);
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.stroke();
  };

  /* ====================== BEAM (canalisé) ================================
     Lux R, Vel'Koz R : longue annonce, longue activation.                  */
  function Beam(o) {
    this.type = 'beam';
    this.x = o.x; this.y = o.y; this.a = o.a;
    this.len = o.len; this.w = o.w;
    this.cast = o.cast; this.castMax = o.cast;
    this.active = o.active; this.activeMax = o.active;
    this.spin = o.spin || 0;
    this.effect = o.effect || KILL;
    this.c = o.c || '#ff3b6b';
    this.tell = o.tell === undefined ? 1 : o.tell;
    this.state = 'cast';
    this.threat = false;
    this.grazed = false;
  }

  Beam.prototype.update = function (dt, game) {
    this.a += this.spin * dt;
    if (this.state === 'cast') {
      this.cast -= dt;
      if (this.cast <= 0) { this.state = 'on'; game.fx.kick(6); game.audio.zap(); }
      return true;
    }
    this.active -= dt;
    return this.active > 0;
  };

  Beam.prototype._seg = function () {
    return [this.x, this.y, this.x + Math.cos(this.a) * this.len, this.y + Math.sin(this.a) * this.len];
  };

  Beam.prototype.hits = function (px, py, pr) {
    if (this.state !== 'on') return false;
    const s = this._seg();
    return U.distToSeg(px, py, s[0], s[1], s[2], s[3]) < this.w * 0.5 + pr;
  };

  Beam.prototype.edge = function (px, py) {
    if (this.state !== 'on') return -1;
    const s = this._seg();
    return U.distToSeg(px, py, s[0], s[1], s[2], s[3]) - this.w * 0.5;
  };

  Beam.prototype.draw = function (ctx) {
    const s = this._seg();
    ctx.save();
    ctx.lineCap = 'round';
    if (this.state === 'cast') {
      const k = 1 - this.cast / this.castMax;
      ctx.lineWidth = this.w * (0.22 + k * 0.5);
      ctx.strokeStyle = U.rgba(this.c, (0.2 + k * 0.5) * this.tell);
      ctx.setLineDash([26, 20]);
      ctx.lineDashOffset = -performance.now() * 0.05;
    } else {
      const k = this.active / this.activeMax;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = this.w * (0.78 + k * 0.4);
      ctx.strokeStyle = U.rgba(this.c, 0.55);
      ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke();
      ctx.lineWidth = this.w * 0.36;
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
    }
    ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke();
    ctx.restore();
  };

  root.LolEnt = { LineShot, Circle, Cone, Zone, Beam, KILL };
})(window);
