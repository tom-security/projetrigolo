/* =========================================================================
 *  LoL MECHANICS TRAINER
 *  Moteur 2D Canvas — ES6+ strictement orienté objet.
 *
 *  Sommaire :
 *    0. Utilitaires mathématiques (vecteurs / trigonométrie)
 *    1. InputHandler   — souris (clic droit = move), clavier
 *    2. Entity         — base commune
 *    3. ParticleEffect / FloatingText / MoveIndicator — feedback visuel
 *    4. Champion       — le joueur (déplacement, sorts, auto-attaques)
 *    5. AutoAttack     — petit projectile à tête chercheuse
 *    6. Skillshot      — projectile linéaire (joueur ou ennemi)
 *    7. DangerZone     — indication de ciblage (telegraph 0.6s)
 *    8. Minion         — sbire farmable
 *    9. HUD            — barre de sorts, cooldowns, stats (DOM)
 *   10. Game           — boucle rAF + deltaTime, spawns, collisions
 * ========================================================================= */

'use strict';

/* ------------------------------------------------------------------ *
 * 0. UTILITAIRES MATHÉMATIQUES
 * ------------------------------------------------------------------ */

const TAU = Math.PI * 2;

const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Vecteur 2D minimaliste et mutable-free (chaque opération renvoie un nouveau
 * Vec2) : la lisibilité prime, les allocations restent négligeables ici
 * (quelques centaines d'objets par frame au pire).
 */
class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }

  static from(o) { return new Vec2(o.x, o.y); }

  add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
  scale(s) { return new Vec2(this.x * s, this.y * s); }

  /** Longueur euclidienne : sqrt(x² + y²). */
  len() { return Math.hypot(this.x, this.y); }
  lenSq() { return this.x * this.x + this.y * this.y; }

  /**
   * Normalisation : ramène le vecteur à une longueur de 1 afin de pouvoir le
   * multiplier par une vitesse (px/s) puis par le deltaTime (s).
   */
  norm() {
    const l = Math.hypot(this.x, this.y);
    return l < 1e-6 ? new Vec2(0, 0) : new Vec2(this.x / l, this.y / l);
  }

  /** Angle du vecteur en radians (atan2 : y en premier). */
  angle() { return Math.atan2(this.y, this.x); }

  /** Construit un vecteur unitaire à partir d'un angle : (cos θ, sin θ). */
  static fromAngle(a, length = 1) {
    return new Vec2(Math.cos(a) * length, Math.sin(a) * length);
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const distSq = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
};

/* ------------------------------------------------------------------ *
 * 1. INPUT HANDLER
 * ------------------------------------------------------------------ */

/**
 * Centralise clavier + souris. Le canvas ayant une résolution interne fixe
 * (1280x720) mais une taille CSS élastique, toutes les coordonnées souris sont
 * reprojetées dans l'espace « monde » via le ratio largeur interne / largeur CSS.
 */
class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouse = new Vec2(canvas.width / 2, canvas.height / 2);
    this.keys = new Set();          // touches actuellement enfoncées
    this.pressedThisFrame = new Set(); // fronts montants consommés par frame

    this.onRightClick = () => {};
    this.onLeftClick = () => {};
    this.onKeyPress = () => {};

    this._bind();
  }

  _toWorld(evt) {
    const r = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / r.width;
    const sy = this.canvas.height / r.height;
    return new Vec2((evt.clientX - r.left) * sx, (evt.clientY - r.top) * sy);
  }

  _bind() {
    // Le menu contextuel du navigateur doit disparaître : le clic droit est
    // notre commande de déplacement.
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('mousemove', (e) => {
      this.mouse = this._toWorld(e);
    });

    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const p = this._toWorld(e);
      this.mouse = p;
      if (e.button === 2) this.onRightClick(p);
      else if (e.button === 0) this.onLeftClick(p);
    });

    window.addEventListener('keydown', (e) => {
      // e.key : indépendant de la disposition clavier (AZERTY/QWERTY).
      const k = e.key.toLowerCase();
      if (['a', 'z', 'e', 'f', 'q', ' '].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) this.onKeyPress(k);
      this.keys.add(k);
    });

    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }
}

/* ------------------------------------------------------------------ *
 * 2. ENTITÉ DE BASE
 * ------------------------------------------------------------------ */

class Entity {
  constructor(x, y, radius) {
    this.pos = new Vec2(x, y);
    this.radius = radius;
    this.dead = false;
  }
  update(/* dt, game */) {}
  draw(/* ctx */) {}
  /** Collision cercle/cercle — test au carré pour éviter un sqrt. */
  collides(other) {
    const r = this.radius + other.radius;
    return distSq(this.pos, other.pos) <= r * r;
  }
}

/* ------------------------------------------------------------------ *
 * 3. FEEDBACK VISUEL
 * ------------------------------------------------------------------ */

/**
 * Une instance = une gerbe de particules (impact, mort de sbire, flash...).
 * Les particules sont stockées dans des tableaux plats pour limiter le GC.
 */
class ParticleEffect {
  /**
   * @param {number} x @param {number} y
   * @param {object} opt { count, color, speed, life, size, spread, angle, gravity }
   */
  constructor(x, y, opt = {}) {
    const count = opt.count ?? 14;
    this.color = opt.color ?? '#c8aa6e';
    this.gravity = opt.gravity ?? 0;
    this.life = opt.life ?? 0.5;
    this.dead = false;

    this.px = new Float32Array(count);
    this.py = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.pl = new Float32Array(count); // durée de vie restante
    this.pm = new Float32Array(count); // durée de vie max
    this.ps = new Float32Array(count); // taille

    const baseAngle = opt.angle ?? 0;
    const spread = opt.spread ?? TAU;
    const speed = opt.speed ?? 140;

    for (let i = 0; i < count; i++) {
      // Direction aléatoire dans un cône : angle de base ± spread/2.
      const a = baseAngle + rand(-spread / 2, spread / 2);
      const s = speed * rand(0.35, 1);
      this.px[i] = x; this.py[i] = y;
      this.vx[i] = Math.cos(a) * s;
      this.vy[i] = Math.sin(a) * s;
      const l = this.life * rand(0.6, 1);
      this.pl[i] = l; this.pm[i] = l;
      this.ps[i] = (opt.size ?? 3) * rand(0.6, 1.3);
    }
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.pl.length; i++) {
      if (this.pl[i] <= 0) continue;
      this.pl[i] -= dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.vy[i] += this.gravity * dt;
      this.vx[i] *= 1 - 1.8 * dt; // frottement
      this.vy[i] *= 1 - 1.8 * dt;
      alive++;
    }
    if (alive === 0) this.dead = true;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    for (let i = 0; i < this.pl.length; i++) {
      if (this.pl[i] <= 0) continue;
      const t = this.pl[i] / this.pm[i];
      ctx.globalAlpha = t;
      const s = this.ps[i] * t;
      ctx.fillRect(this.px[i] - s / 2, this.py[i] - s / 2, s, s);
    }
    ctx.restore();
  }
}

/** Texte flottant type « -50 » qui monte et s'efface. */
class FloatingText {
  constructor(x, y, text, color = '#f0e6d2', size = 18) {
    this.pos = new Vec2(x, y);
    this.text = text;
    this.color = color;
    this.size = size;
    this.life = 0.9;
    this.maxLife = 0.9;
    this.vy = -46;
    this.vx = rand(-16, 16);
    this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    this.pos.x += this.vx * dt;
    this.pos.y += this.vy * dt;
    this.vy += 34 * dt; // légère décélération vers le haut
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    const t = clamp(this.life / this.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = t;
    ctx.font = `bold ${this.size}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(this.text, this.pos.x, this.pos.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.pos.x, this.pos.y);
    ctx.restore();
  }
}

/**
 * Indicateur de clic droit : quatre chevrons verts convergents qui se
 * resserrent puis disparaissent — reproduction du curseur de déplacement LoL.
 */
class MoveIndicator {
  constructor(x, y, hostile = false) {
    this.pos = new Vec2(x, y);
    this.life = 0.45;
    this.maxLife = 0.45;
    this.color = hostile ? '#e2495a' : '#39e07b';
    this.dead = false;
  }
  update(dt) { if ((this.life -= dt) <= 0) this.dead = true; }
  draw(ctx) {
    const t = clamp(this.life / this.maxLife, 0, 1);
    // Les chevrons partent de 22px et convergent vers 8px du centre.
    const offset = lerp(8, 22, t);
    ctx.save();
    ctx.globalAlpha = t;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      // Quatre directions cardinales : 0, 90, 180, 270 degrés.
      const a = (i * TAU) / 4;
      const dir = Vec2.fromAngle(a);
      const tip = this.pos.add(dir.scale(offset));
      // Perpendiculaire (-y, x) pour tracer les deux branches du chevron.
      const perp = new Vec2(-dir.y, dir.x).scale(6);
      const back = tip.add(dir.scale(7));
      ctx.beginPath();
      ctx.moveTo(back.x + perp.x, back.y + perp.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(back.x - perp.x, back.y - perp.y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ *
 * 4. CHAMPION (JOUEUR)
 * ------------------------------------------------------------------ */

/** Définition statique des sorts : coût, cooldown, libellé HUD. */
const SPELLS = {
  A: { key: 'a', label: 'A', name: 'Éclat de Lumière', cd: 3.0, cost: 30, icon: '✦' },
  Z: { key: 'z', label: 'Z', name: 'Égide', cd: 8.0, cost: 35, icon: '⛨' },
  E: { key: 'e', label: 'E', name: 'Élan', cd: 6.0, cost: 25, icon: '»' },
  F: { key: 'f', label: 'F', name: 'Flash', cd: 20.0, cost: 0, icon: '⚡' },
};

class Champion extends Entity {
  constructor(x, y, game) {
    super(x, y, 16);                 // hitbox : rayon fixe de 16px
    this.game = game;

    this.maxHp = 100; this.hp = 100;
    this.maxMana = 100; this.mana = 100;
    this.hpRegen = 1.6;              // PV/s
    this.manaRegen = 6.5;            // mana/s

    this.moveSpeed = 340;            // px/s
    this.attackRange = 175;          // portée d'auto-attaque
    this.attackDamage = 22;
    this.attacksPerSecond = 1.15;
    this.attackWindup = 0.18;        // délai d'animation avant le tir

    // --- ordres ---
    this.destination = null;         // Vec2 ciblée par le clic droit
    this.target = null;              // Minion ciblé
    this.attackMoveArmed = false;    // Q pressé : le prochain clic G attaque
    this.attackMovePoint = null;     // destination d'un attack-move

    // --- timers ---
    this.attackCooldown = 0;
    this.windupTimer = 0;
    this.shieldTime = 0;
    this.shieldAmount = 0;
    this.dashTime = 0;
    this.dashDir = new Vec2();
    this.dashSpeed = 0;
    this.facing = 0;                 // angle de rendu

    this.cooldowns = { a: 0, z: 0, e: 0, f: 0 };
    this.invulnBlink = 0;
  }

  /* ---------------- ordres ---------------- */

  /** Clic droit sur le sol : pathfinding direct (ligne droite). */
  moveTo(point) {
    this.destination = Vec2.from(point);
    this.target = null;
    this.attackMovePoint = null;
    this.windupTimer = 0;
  }

  /** Clic droit sur un sbire : on le prend pour cible et on le poursuit. */
  attackTarget(minion) {
    this.target = minion;
    this.destination = null;
    this.attackMovePoint = null;
  }

  /** Attack-move (Q + clic gauche) : avance en frappant ce qui passe à portée. */
  attackMove(point) {
    this.attackMovePoint = Vec2.from(point);
    this.destination = Vec2.from(point);
    this.target = null;
    this.attackMoveArmed = false;
  }

  stop() {
    this.destination = null;
    this.attackMovePoint = null;
  }

  /* ---------------- sorts ---------------- */

  canCast(spell) {
    return this.cooldowns[spell.key] <= 0 && this.mana >= spell.cost && !this.dead;
  }

  cast(keyName) {
    const spell = SPELLS[keyName.toUpperCase()];
    if (!spell) return;
    if (!this.canCast(spell)) {
      if (this.cooldowns[spell.key] > 0) this.game.notify('Sort en recharge', '#c0392b');
      else this.game.notify('Mana insuffisante', '#1e9de3');
      return;
    }

    this.mana -= spell.cost;
    this.cooldowns[spell.key] = spell.cd;

    const toMouse = this.game.input.mouse.sub(this.pos);
    const dir = toMouse.norm();
    if (dir.lenSq() > 0) this.facing = dir.angle();

    switch (spell.key) {
      case 'a': this._castSkillshot(dir); break;
      case 'z': this._castShield(); break;
      case 'e': this._castDash(dir); break;
      case 'f': this._castFlash(dir); break;
    }
  }

  /** [A] Skillshot : projectile rapide dans la direction du curseur. */
  _castSkillshot(dir) {
    const spawn = this.pos.add(dir.scale(this.radius + 6));
    this.game.addSkillshot(new Skillshot({
      x: spawn.x, y: spawn.y,
      dir,
      speed: 1150,
      radius: 11,
      range: 720,
      damage: 50,
      owner: 'player',
      color: '#7ee0ff',
      trail: '#2aa9e0',
    }));
    this.game.addEffect(new ParticleEffect(spawn.x, spawn.y, {
      count: 10, color: '#7ee0ff', speed: 180, life: 0.25,
      angle: dir.angle(), spread: Math.PI / 2.4, size: 3,
    }));
  }

  /** [Z] Bouclier : absorbe les dégâts pendant 1,5 s. */
  _castShield() {
    this.shieldTime = 1.5;
    this.shieldAmount = 90;
    this.game.addFloatingText(this.pos.x, this.pos.y - 34, 'BOUCLIER', '#c8aa6e', 15);
  }

  /** [E] Dash : déplacement rapide mais non instantané (260px en 0.18s). */
  _castDash(dir) {
    const d = dir.lenSq() > 0 ? dir : Vec2.fromAngle(this.facing);
    const distance = 260;
    this.dashTime = 0.18;
    this.dashSpeed = distance / this.dashTime;
    this.dashDir = d;
    this.stop();
    this.game.addEffect(new ParticleEffect(this.pos.x, this.pos.y, {
      count: 18, color: '#c8aa6e', speed: 200, life: 0.35,
      angle: d.angle() + Math.PI, spread: Math.PI / 2, size: 3,
    }));
  }

  /**
   * [F] Flash : téléportation instantanée de 150px vers le curseur.
   * Si le curseur est plus proche que 150px, on flashe exactement dessus
   * (comportement identique à LoL).
   */
  _castFlash(dir) {
    const toMouse = this.game.input.mouse.sub(this.pos);
    const range = Math.min(150, toMouse.len());
    const d = dir.lenSq() > 0 ? dir : Vec2.fromAngle(this.facing);
    const from = Vec2.from(this.pos);
    // pos + (cos θ, sin θ) * range
    const dest = this.pos.add(d.scale(range));
    this.pos = new Vec2(
      clamp(dest.x, this.radius, this.game.width - this.radius),
      clamp(dest.y, this.radius, this.game.height - this.radius),
    );
    this.stop();
    this.game.addEffect(new ParticleEffect(from.x, from.y, {
      count: 20, color: '#f0e6d2', speed: 230, life: 0.4, size: 3,
    }));
    this.game.addEffect(new ParticleEffect(this.pos.x, this.pos.y, {
      count: 24, color: '#ffd98a', speed: 260, life: 0.45, size: 3,
    }));
    this.game.addFloatingText(this.pos.x, this.pos.y - 40, 'FLASH', '#ffd98a', 15);
  }

  /* ---------------- dégâts ---------------- */

  takeDamage(amount, source = null) {
    if (this.dead) return 0;
    let dealt = amount;

    // Le bouclier absorbe en priorité.
    if (this.shieldTime > 0 && this.shieldAmount > 0) {
      const absorbed = Math.min(this.shieldAmount, dealt);
      this.shieldAmount -= absorbed;
      dealt -= absorbed;
      this.game.addFloatingText(this.pos.x, this.pos.y - 30, `-${Math.round(absorbed)}`, '#8ab4ff', 16);
      if (this.shieldAmount <= 0) this.shieldTime = 0;
    }

    if (dealt > 0) {
      this.hp = Math.max(0, this.hp - dealt);
      this.invulnBlink = 0.2;
      this.game.addFloatingText(this.pos.x, this.pos.y - 34, `-${Math.round(dealt)}`, '#ff5b5b', 20);
      this.game.addEffect(new ParticleEffect(this.pos.x, this.pos.y, {
        count: 12, color: '#ff5b5b', speed: 160, life: 0.3, size: 3,
      }));
      if (this.hp <= 0) this.dead = true;
    }
    return dealt;
  }

  /* ---------------- boucle ---------------- */

  update(dt, game) {
    if (this.dead) return;

    // Régénérations.
    this.hp = Math.min(this.maxHp, this.hp + this.hpRegen * dt);
    this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * dt);

    // Cooldowns (jamais négatifs).
    for (const k of Object.keys(this.cooldowns)) {
      if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
    if (this.shieldTime > 0) this.shieldTime = Math.max(0, this.shieldTime - dt);
    if (this.invulnBlink > 0) this.invulnBlink -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    // --- dash : priorité absolue sur les autres déplacements ---
    if (this.dashTime > 0) {
      const step = Math.min(dt, this.dashTime);
      this.pos = this.pos.add(this.dashDir.scale(this.dashSpeed * step));
      this.dashTime -= dt;
      this._clampToArena();
      return;
    }

    // --- ciblage automatique en attack-move ---
    if (this.attackMovePoint && !this.target) {
      const m = game.nearestMinion(this.pos, this.attackRange);
      if (m) this.target = m;
    }
    if (this.target && (this.target.dead || this.target.hp <= 0)) {
      this.target = null;
      this.windupTimer = 0;
      // Après un kill en attack-move, on reprend la marche vers le point visé.
      if (this.attackMovePoint) this.destination = Vec2.from(this.attackMovePoint);
    }

    if (this.target) this._updateCombat(dt, game);
    else this._updateMove(dt);

    this._clampToArena();
  }

  _updateCombat(dt, game) {
    const toTarget = this.target.pos.sub(this.pos);
    const d = toTarget.len();
    const reach = this.attackRange + this.target.radius;

    if (d > reach) {
      // Hors de portée : on avance en ligne droite vers la cible.
      this.windupTimer = 0;
      const dir = toTarget.norm();
      this.facing = dir.angle();
      this.pos = this.pos.add(dir.scale(this.moveSpeed * dt));
      return;
    }

    // À portée : le champion s'immobilise pour lancer son auto-attaque.
    this.facing = toTarget.angle();
    if (this.windupTimer > 0) {
      this.windupTimer -= dt;
      if (this.windupTimer <= 0) {
        this._fireAutoAttack(game);
        this.attackCooldown = 1 / this.attacksPerSecond;
      }
    } else if (this.attackCooldown <= 0) {
      this.windupTimer = this.attackWindup;
    }
  }

  _fireAutoAttack(game) {
    if (!this.target || this.target.dead) return;
    const dir = this.target.pos.sub(this.pos).norm();
    const spawn = this.pos.add(dir.scale(this.radius + 4));
    game.addAutoAttack(new AutoAttack(spawn.x, spawn.y, this.target, this.attackDamage));
  }

  _updateMove(dt) {
    if (!this.destination) return;
    const toDest = this.destination.sub(this.pos);
    const d = toDest.len();
    const step = this.moveSpeed * dt;

    if (d <= step) {
      // Arrivé : on se cale pile sur la destination pour éviter le jitter.
      this.pos = Vec2.from(this.destination);
      this.destination = null;
      if (this.attackMovePoint && dist(this.pos, this.attackMovePoint) < 1) {
        this.attackMovePoint = null;
      }
      return;
    }
    // Déplacement = direction unitaire × vitesse × deltaTime.
    const dir = toDest.norm();
    this.facing = dir.angle();
    this.pos = this.pos.add(dir.scale(step));
  }

  _clampToArena() {
    this.pos.x = clamp(this.pos.x, this.radius, this.game.width - this.radius);
    this.pos.y = clamp(this.pos.y, this.radius, this.game.height - this.radius);
  }

  /* ---------------- rendu ---------------- */

  draw(ctx) {
    const { x, y } = this.pos;

    // Indicateur de portée d'attaque (subtil).
    ctx.save();
    ctx.strokeStyle = this.target ? 'rgba(200,170,110,0.32)' : 'rgba(200,170,110,0.14)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(x, y, this.attackRange, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // Ombre / socle.
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + this.radius * 0.75, this.radius * 1.05, this.radius * 0.45, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Cercle du champion.
    ctx.save();
    const grad = ctx.createRadialGradient(x - 5, y - 6, 2, x, y, this.radius);
    grad.addColorStop(0, '#ffe9bd');
    grad.addColorStop(1, this.invulnBlink > 0 ? '#ff7b7b' : '#c8aa6e');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, this.radius, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f0e6d2';
    ctx.stroke();

    // Petit repère d'orientation.
    const nose = this.pos.add(Vec2.fromAngle(this.facing, this.radius + 7));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(nose.x, nose.y);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f0e6d2';
    ctx.stroke();
    ctx.restore();

    // Bouclier actif.
    if (this.shieldTime > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(performance.now() / 70);
      ctx.strokeStyle = '#8ab4ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, this.radius + 6, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // Animation de windup d'auto-attaque.
    if (this.windupTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#ffd98a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, this.radius + 3, this.facing - 0.6, this.facing + 0.6);
      ctx.stroke();
      ctx.restore();
    }

    this._drawBars(ctx);
  }

  _drawBars(ctx) {
    const w = 54, h = 6;
    const bx = this.pos.x - w / 2;
    const by = this.pos.y - this.radius - 20;

    // PV
    ctx.fillStyle = '#0a0f14';
    ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
    ctx.fillStyle = '#24b24c';
    ctx.fillRect(bx, by, w * (this.hp / this.maxHp), h);
    // Bouclier affiché par-dessus la barre de vie.
    if (this.shieldTime > 0 && this.shieldAmount > 0) {
      ctx.fillStyle = 'rgba(138,180,255,0.85)';
      ctx.fillRect(bx, by, w * Math.min(1, this.shieldAmount / this.maxHp), h);
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 0.5, by - 0.5, w + 1, h + 1);

    // Mana
    const my = by + h + 2;
    ctx.fillStyle = '#0a0f14';
    ctx.fillRect(bx - 1, my - 1, w + 2, h + 2);
    ctx.fillStyle = '#1e9de3';
    ctx.fillRect(bx, my, w * (this.mana / this.maxMana), h);
    ctx.strokeRect(bx - 0.5, my - 0.5, w + 1, h + 1);
  }
}

/* ------------------------------------------------------------------ *
 * 5. AUTO-ATTAQUE (projectile à tête chercheuse)
 * ------------------------------------------------------------------ */

class AutoAttack extends Entity {
  constructor(x, y, target, damage) {
    super(x, y, 5);
    this.target = target;
    this.damage = damage;
    this.speed = 900;
    this.life = 2;
  }
  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0 || !this.target || this.target.dead) { this.dead = true; return; }
    const to = this.target.pos.sub(this.pos);
    const d = to.len();
    const step = this.speed * dt;
    if (d <= step + this.target.radius) {
      this.target.takeDamage(this.damage, game);
      game.addEffect(new ParticleEffect(this.target.pos.x, this.target.pos.y, {
        count: 8, color: '#ffd98a', speed: 130, life: 0.25, size: 2.5,
      }));
      this.dead = true;
      return;
    }
    this.pos = this.pos.add(to.norm().scale(step));
  }
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = '#ffd98a';
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ *
 * 6. SKILLSHOT (projectile linéaire)
 * ------------------------------------------------------------------ */

class Skillshot extends Entity {
  /**
   * @param {object} o { x, y, dir:Vec2, speed, radius, range, damage, owner, color, trail }
   */
  constructor(o) {
    super(o.x, o.y, o.radius ?? 10);
    this.origin = new Vec2(o.x, o.y);
    this.dir = o.dir.norm();          // direction unitaire (cos θ, sin θ)
    this.speed = o.speed ?? 700;
    this.range = o.range ?? 900;
    this.damage = o.damage ?? 40;
    this.owner = o.owner ?? 'enemy';  // 'player' | 'enemy'
    this.color = o.color ?? '#ff6b6b';
    this.trailColor = o.trail ?? '#c0392b';
    this.travelled = 0;
    this.hitSomething = false;
    this.angle = this.dir.angle();
    this.trail = [];                  // positions récentes pour la traînée
  }

  update(dt, game) {
    const step = this.speed * dt;
    // Intégration : pos += dir * vitesse * dt.
    this.pos = this.pos.add(this.dir.scale(step));
    this.travelled += step;

    this.trail.push(new Vec2(this.pos.x, this.pos.y));
    if (this.trail.length > 8) this.trail.shift();

    const out =
      this.pos.x < -60 || this.pos.x > game.width + 60 ||
      this.pos.y < -60 || this.pos.y > game.height + 60;

    if (this.travelled >= this.range || out) {
      this.dead = true;
      // Un skillshot ennemi qui expire sans toucher = une esquive réussie.
      if (this.owner === 'enemy' && !this.hitSomething) game.registerDodge();
    }
  }

  draw(ctx) {
    // Traînée.
    ctx.save();
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      ctx.globalAlpha = (i / this.trail.length) * 0.45;
      ctx.fillStyle = this.trailColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.radius * (0.4 + 0.6 * (i / this.trail.length)), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Corps du projectile : ellipse orientée selon l'angle de déplacement.
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);
    const g = ctx.createLinearGradient(-this.radius * 2, 0, this.radius * 2, 0);
    g.addColorStop(0, this.trailColor);
    g.addColorStop(1, this.color);
    ctx.fillStyle = g;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius * 1.8, this.radius, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ *
 * 7. ZONE D'AVERTISSEMENT (indication de ciblage)
 * ------------------------------------------------------------------ */

/**
 * Deux formes :
 *  - 'line'   : rectangle orienté annonçant un skillshot linéaire ;
 *  - 'circle' : zone circulaire (type cage de Morgana) qui détone à la fin.
 * Durée par défaut : 0.6 s, exactement comme demandé.
 */
class DangerZone {
  constructor(opt) {
    this.type = opt.type;                  // 'line' | 'circle'
    this.duration = opt.duration ?? 0.6;
    this.time = 0;
    this.dead = false;
    this.onExpire = opt.onExpire ?? (() => {});

    if (this.type === 'line') {
      this.from = Vec2.from(opt.from);
      this.to = Vec2.from(opt.to);
      this.width = opt.width ?? 26;
      this.angle = this.to.sub(this.from).angle();
      this.length = this.to.sub(this.from).len();
    } else {
      this.center = Vec2.from(opt.center);
      this.radius = opt.radius ?? 70;
      this.damage = opt.damage ?? 35;
    }
  }

  update(dt) {
    this.time += dt;
    if (this.time >= this.duration) {
      this.dead = true;
      this.onExpire(this);
    }
  }

  draw(ctx) {
    const t = clamp(this.time / this.duration, 0, 1);
    // Pulsation rouge qui s'intensifie à l'approche du déclenchement.
    const alpha = 0.18 + 0.22 * t + 0.08 * Math.sin(this.time * 26);

    ctx.save();
    ctx.globalAlpha = 1;
    if (this.type === 'line') {
      ctx.translate(this.from.x, this.from.y);
      ctx.rotate(this.angle);
      ctx.fillStyle = `rgba(200, 50, 50, ${alpha})`;
      ctx.fillRect(0, -this.width / 2, this.length, this.width);
      // Remplissage progressif indiquant le temps restant.
      ctx.fillStyle = `rgba(255, 90, 90, ${0.25 + 0.25 * t})`;
      ctx.fillRect(0, -this.width / 2, this.length * t, this.width);
      ctx.strokeStyle = `rgba(255, 110, 110, ${0.55 + 0.35 * t})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(0, -this.width / 2, this.length, this.width);
    } else {
      ctx.fillStyle = `rgba(200, 50, 50, ${alpha})`;
      ctx.beginPath();
      ctx.arc(this.center.x, this.center.y, this.radius, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 110, 110, ${0.6 + 0.3 * t})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Cercle interne qui se referme : compte à rebours visuel.
      ctx.beginPath();
      ctx.arc(this.center.x, this.center.y, this.radius * (1 - t), 0, TAU);
      ctx.strokeStyle = `rgba(255, 170, 170, ${0.7})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Explosion d'une zone circulaire : inflige les dégâts au moment du boom. */
class Detonation {
  constructor(center, radius, damage) {
    this.center = Vec2.from(center);
    this.radius = radius;
    this.damage = damage;
    this.life = 0.28;
    this.maxLife = 0.28;
    this.applied = false;
    this.dead = false;
  }
  update(dt, game) {
    if (!this.applied) {
      this.applied = true;
      const champ = game.champion;
      if (!champ.dead && dist(champ.pos, this.center) <= this.radius + champ.radius) {
        champ.takeDamage(this.damage, game);
      } else {
        game.registerDodge();
      }
      game.addEffect(new ParticleEffect(this.center.x, this.center.y, {
        count: 30, color: '#ff8b5b', speed: 280, life: 0.45, size: 4,
      }));
    }
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    const t = clamp(this.life / this.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = t;
    ctx.strokeStyle = '#ffb45b';
    ctx.lineWidth = 6 * t;
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, this.radius * (1.1 - 0.15 * t), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ *
 * 8. SBIRE
 * ------------------------------------------------------------------ */

class Minion extends Entity {
  constructor(x, y) {
    super(x, y, 13);
    this.maxHp = 60;
    this.hp = 60;
    this.speed = 42;
    // Déplacement de patrouille : direction aléatoire réévaluée régulièrement.
    this.dir = Vec2.fromAngle(rand(0, TAU));
    this.changeIn = rand(1.2, 2.6);
    this.hitFlash = 0;
    this.bob = rand(0, TAU);
  }

  takeDamage(amount, game) {
    this.hp -= amount;
    this.hitFlash = 0.12;
    game.addFloatingText(this.pos.x, this.pos.y - this.radius - 8, `-${amount}`, '#f0e6d2', 16);
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      game.onMinionKilled(this);
    }
  }

  update(dt, game) {
    this.bob += dt * 6;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.changeIn -= dt;
    if (this.changeIn <= 0) {
      this.dir = Vec2.fromAngle(rand(0, TAU));
      this.changeIn = rand(1.2, 2.6);
    }
    this.pos = this.pos.add(this.dir.scale(this.speed * dt));

    // Rebond sur les bords de l'arène.
    if (this.pos.x < this.radius || this.pos.x > game.width - this.radius) {
      this.dir = new Vec2(-this.dir.x, this.dir.y);
    }
    if (this.pos.y < this.radius || this.pos.y > game.height - this.radius) {
      this.dir = new Vec2(this.dir.x, -this.dir.y);
    }
    this.pos.x = clamp(this.pos.x, this.radius, game.width - this.radius);
    this.pos.y = clamp(this.pos.y, this.radius, game.height - this.radius);
  }

  draw(ctx) {
    const y = this.pos.y + Math.sin(this.bob) * 1.5;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(this.pos.x, this.pos.y + this.radius * 0.7, this.radius * 0.9, this.radius * 0.35, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#7b4ea8';
    ctx.strokeStyle = '#d5b8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.pos.x, y, this.radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Barre de vie du sbire.
    const w = 30, h = 4;
    const bx = this.pos.x - w / 2, by = y - this.radius - 10;
    ctx.fillStyle = '#0a0f14';
    ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
    ctx.fillStyle = '#d64545';
    ctx.fillRect(bx, by, w * clamp(this.hp / this.maxHp, 0, 1), h);
  }
}

/* ------------------------------------------------------------------ *
 * 9. HUD (DOM)
 * ------------------------------------------------------------------ */

class HUD {
  constructor(game) {
    this.game = game;
    this.slots = new Map();

    const bar = document.getElementById('skillbar');
    bar.innerHTML = '';
    for (const name of ['A', 'Z', 'E', 'F']) {
      const s = SPELLS[name];
      const el = document.createElement('div');
      el.className = 'slot ready';
      el.title = `${s.name} — ${s.cd}s`;
      el.innerHTML =
        `<span class="icon">${s.icon}</span>` +
        `<span class="key">${s.label}</span>` +
        (s.cost ? `<span class="cost">${s.cost}</span>` : '') +
        `<span class="cd-mask">0</span>`;
      bar.appendChild(el);
      this.slots.set(s.key, { el, mask: el.querySelector('.cd-mask'), spell: s });
    }

    this.hpBar = document.getElementById('hud-hp');
    this.mpBar = document.getElementById('hud-mp');
    this.hpText = document.getElementById('hud-hp-text');
    this.mpText = document.getElementById('hud-mp-text');
    this.timeEl = document.getElementById('stat-time');
    this.csEl = document.getElementById('stat-cs');
    this.dodgeEl = document.getElementById('stat-dodges');
  }

  update() {
    const c = this.game.champion;

    for (const [key, slot] of this.slots) {
      const cd = c.cooldowns[key];
      if (cd > 0) {
        slot.el.classList.remove('ready');
        slot.mask.textContent = `${cd.toFixed(1)}s`;
      } else {
        const affordable = c.mana >= slot.spell.cost;
        slot.el.classList.add('ready');
        slot.el.style.opacity = affordable ? '1' : '0.55';
      }
    }

    const hpPct = clamp(c.hp / c.maxHp, 0, 1) * 100;
    const mpPct = clamp(c.mana / c.maxMana, 0, 1) * 100;
    this.hpBar.style.width = `${hpPct}%`;
    this.mpBar.style.width = `${mpPct}%`;
    this.hpText.textContent = `${Math.ceil(c.hp)} / ${c.maxHp}`;
    this.mpText.textContent = `${Math.ceil(c.mana)} / ${c.maxMana}`;

    this.timeEl.textContent = `${this.game.survivalTime.toFixed(1)}s`;
    this.csEl.textContent = String(this.game.cs);
    this.dodgeEl.textContent = String(this.game.dodges);
  }
}

/* ------------------------------------------------------------------ *
 * 10. GAME — boucle principale
 * ------------------------------------------------------------------ */

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = canvas.width;
    this.height = canvas.height;

    this.input = new InputHandler(canvas);
    this.hud = null;

    this.overlay = document.getElementById('overlay');
    this.overlayTitle = document.getElementById('overlay-title');
    this.overlayText = document.getElementById('overlay-text');
    this.startBtn = document.getElementById('start-btn');

    this.state = 'menu'; // 'menu' | 'playing' | 'paused' | 'gameover'
    this.lastTime = 0;
    this.accumFps = 0;
    this.frames = 0;
    this.fps = 60;

    this._wireInput();
    this.startBtn.addEventListener('click', () => this.start());
    this.reset();
    this.hud = new HUD(this);

    // La boucle tourne en permanence : elle dessine aussi le menu.
    this.loop = this.loop.bind(this);
    requestAnimationFrame((t) => { this.lastTime = t; requestAnimationFrame(this.loop); });
  }

  /* ---------------- cycle de vie ---------------- */

  reset() {
    this.champion = new Champion(this.width / 2, this.height / 2, this);
    this.minions = [];
    this.skillshots = [];
    this.autoAttacks = [];
    this.zones = [];
    this.detonations = [];
    this.effects = [];
    this.texts = [];
    this.indicators = [];
    this.toasts = [];

    this.survivalTime = 0;
    this.cs = 0;
    this.dodges = 0;

    this.skillshotTimer = 1.6;
    this.minionTimer = 0.4;
    this.difficulty = 1;
  }

  start() {
    this.reset();
    this.state = 'playing';
    this.overlay.classList.remove('visible');
    this.canvas.focus();
  }

  gameOver() {
    this.state = 'gameover';
    this.overlayTitle.textContent = 'Défaite';
    this.overlayText.innerHTML =
      `Survie : <b>${this.survivalTime.toFixed(1)}s</b> — ` +
      `CS : <b>${this.cs}</b> — Esquives : <b>${this.dodges}</b>`;
    this.startBtn.textContent = 'Rejouer';
    this.overlay.classList.add('visible');
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.overlayTitle.textContent = 'Pause';
      this.overlayText.textContent = 'Appuie sur Espace ou clique pour reprendre.';
      this.startBtn.textContent = 'Reprendre';
      this.overlay.classList.add('visible');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.overlay.classList.remove('visible');
    }
  }

  /* ---------------- entrées ---------------- */

  _wireInput() {
    this.input.onRightClick = (p) => {
      if (this.state !== 'playing') return;
      const m = this.minionAt(p);
      if (m) {
        this.champion.attackTarget(m);
        this.indicators.push(new MoveIndicator(m.pos.x, m.pos.y, true));
      } else {
        this.champion.moveTo(p);
        this.indicators.push(new MoveIndicator(p.x, p.y, false));
      }
    };

    this.input.onLeftClick = (p) => {
      if (this.state !== 'playing') return;
      if (this.champion.attackMoveArmed) {
        // Attack-move : on avance vers le point en frappant ce qui entre à portée.
        const m = this.minionAt(p);
        if (m) this.champion.attackTarget(m);
        else this.champion.attackMove(p);
        this.champion.attackMoveArmed = false;
        this.indicators.push(new MoveIndicator(p.x, p.y, true));
      }
    };

    this.input.onKeyPress = (k) => {
      if (k === ' ') { this.togglePause(); return; }
      if (this.state === 'menu' || this.state === 'gameover') {
        if (k === 'enter') this.start();
        return;
      }
      if (this.state !== 'playing') return;

      if (k === 'q') {
        this.champion.attackMoveArmed = true;
        this.notify('Attack Move armé — clic gauche', '#c8aa6e');
        return;
      }
      if (['a', 'z', 'e', 'f'].includes(k)) this.champion.cast(k);
    };
  }

  /* ---------------- helpers ---------------- */

  addSkillshot(s) { this.skillshots.push(s); }
  addAutoAttack(a) { this.autoAttacks.push(a); }
  addEffect(e) { this.effects.push(e); }
  addFloatingText(x, y, text, color, size) {
    this.texts.push(new FloatingText(x, y, text, color, size));
  }
  notify(msg, color = '#c8aa6e') {
    this.toasts.push({ msg, color, life: 1.2, maxLife: 1.2 });
    if (this.toasts.length > 4) this.toasts.shift();
  }
  registerDodge() { this.dodges++; }

  minionAt(point) {
    // Tolérance de 8px pour un clic confortable.
    let best = null, bestD = Infinity;
    for (const m of this.minions) {
      if (m.dead) continue;
      const d = dist(m.pos, point);
      if (d <= m.radius + 8 && d < bestD) { best = m; bestD = d; }
    }
    return best;
  }

  nearestMinion(from, maxRange) {
    let best = null, bestD = maxRange * maxRange;
    for (const m of this.minions) {
      if (m.dead) continue;
      const d = distSq(m.pos, from);
      if (d <= bestD) { best = m; bestD = d; }
    }
    return best;
  }

  onMinionKilled(minion) {
    this.cs++;
    this.addFloatingText(minion.pos.x, minion.pos.y - 24, '+1 CS', '#c8aa6e', 17);
    this.addEffect(new ParticleEffect(minion.pos.x, minion.pos.y, {
      count: 22, color: '#b98aff', speed: 220, life: 0.45, size: 3.5,
    }));
    // Un CS rend un peu de mana : récompense l'orbwalking.
    this.champion.mana = Math.min(this.champion.maxMana, this.champion.mana + 6);
  }

  /* ---------------- spawns ---------------- */

  _spawnMinion() {
    const margin = 80;
    // On évite de faire apparaître un sbire sur le joueur.
    let x, y, tries = 0;
    do {
      x = rand(margin, this.width - margin);
      y = rand(margin, this.height - margin);
      tries++;
    } while (dist(new Vec2(x, y), this.champion.pos) < 140 && tries < 20);
    this.minions.push(new Minion(x, y));
  }

  /**
   * Skillshot ennemi : on choisit un point de départ sur un bord, on vise la
   * position actuelle du joueur (avec une légère prédiction), puis on affiche
   * l'indication de ciblage pendant 0.6s avant de lancer le projectile.
   */
  _spawnEnemySkillshot() {
    const circular = Math.random() < 0.33;
    if (circular) {
      // Cage de Morgana : zone circulaire posée près du joueur.
      const offset = Vec2.fromAngle(rand(0, TAU), rand(0, 110));
      const center = new Vec2(
        clamp(this.champion.pos.x + offset.x, 70, this.width - 70),
        clamp(this.champion.pos.y + offset.y, 70, this.height - 70),
      );
      const radius = rand(62, 92);
      const damage = Math.round(26 + 6 * this.difficulty);
      this.zones.push(new DangerZone({
        type: 'circle', center, radius, damage, duration: 0.6,
        onExpire: (z) => this.detonations.push(new Detonation(z.center, z.radius, damage)),
      }));
      return;
    }

    // Flèche d'Ashe : tir linéaire depuis un bord de l'écran.
    const edge = randInt(0, 3);
    let from;
    if (edge === 0) from = new Vec2(rand(0, this.width), -30);
    else if (edge === 1) from = new Vec2(this.width + 30, rand(0, this.height));
    else if (edge === 2) from = new Vec2(rand(0, this.width), this.height + 30);
    else from = new Vec2(-30, rand(0, this.height));

    const speed = rand(520, 760) + this.difficulty * 18;
    // Prédiction simple : on vise légèrement devant le joueur s'il se déplace.
    const aim = Vec2.from(this.champion.pos);
    const dir = aim.sub(from).norm();
    const to = from.add(dir.scale(1700)); // segment d'affichage de la zone

    const damage = Math.round(22 + 5 * this.difficulty);
    const width = rand(22, 34);

    this.zones.push(new DangerZone({
      type: 'line', from, to, width, duration: 0.6,
      onExpire: () => {
        this.addSkillshot(new Skillshot({
          x: from.x, y: from.y, dir,
          speed, radius: width / 2, range: 1800,
          damage, owner: 'enemy',
          color: '#ff9b6b', trail: '#c0392b',
        }));
      },
    }));
  }

  /* ---------------- update ---------------- */

  update(dt) {
    if (this.state !== 'playing') return;

    this.survivalTime += dt;
    // Montée en difficulté : +1 palier toutes les 15 secondes.
    this.difficulty = 1 + this.survivalTime / 15;

    this.champion.update(dt, this);

    // --- spawns ---
    this.skillshotTimer -= dt;
    if (this.skillshotTimer <= 0) {
      this._spawnEnemySkillshot();
      const base = clamp(1.5 - this.survivalTime * 0.015, 0.42, 1.5);
      this.skillshotTimer = rand(base * 0.75, base * 1.35);
    }

    this.minionTimer -= dt;
    if (this.minionTimer <= 0 && this.minions.length < 7) {
      this._spawnMinion();
      this.minionTimer = rand(2.2, 4.0);
    }

    // --- entités ---
    for (const m of this.minions) m.update(dt, this);
    for (const s of this.skillshots) s.update(dt, this);
    for (const a of this.autoAttacks) a.update(dt, this);
    for (const z of this.zones) z.update(dt, this);
    for (const d of this.detonations) d.update(dt, this);
    for (const e of this.effects) e.update(dt, this);
    for (const t of this.texts) t.update(dt, this);
    for (const i of this.indicators) i.update(dt, this);

    this._resolveCollisions();
    this._cleanup(dt);

    if (this.champion.dead) this.gameOver();
  }

  _resolveCollisions() {
    const champ = this.champion;
    for (const s of this.skillshots) {
      if (s.dead) continue;
      if (s.owner === 'enemy') {
        if (!champ.dead && s.collides(champ)) {
          s.hitSomething = true;
          s.dead = true;
          champ.takeDamage(s.damage, this);
          this.addEffect(new ParticleEffect(s.pos.x, s.pos.y, {
            count: 16, color: '#ff8b5b', speed: 210, life: 0.35,
            angle: s.angle + Math.PI, spread: Math.PI, size: 3,
          }));
        }
      } else {
        // Skillshot du joueur : premier sbire touché.
        for (const m of this.minions) {
          if (m.dead) continue;
          if (s.collides(m)) {
            s.hitSomething = true;
            s.dead = true;
            m.takeDamage(s.damage, this);
            this.addEffect(new ParticleEffect(s.pos.x, s.pos.y, {
              count: 16, color: '#7ee0ff', speed: 220, life: 0.35, size: 3,
            }));
            break;
          }
        }
      }
    }
  }

  _cleanup(dt) {
    const alive = (arr) => {
      let w = 0;
      for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[w++] = arr[i];
      arr.length = w;
      return arr;
    };
    alive(this.minions);
    alive(this.skillshots);
    alive(this.autoAttacks);
    alive(this.zones);
    alive(this.detonations);
    alive(this.effects);
    alive(this.texts);
    alive(this.indicators);

    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter((t) => t.life > 0);
  }

  /* ---------------- rendu ---------------- */

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this._drawGround(ctx);

    // Ordre de rendu : sol → zones → sbires → projectiles → champion → UI.
    for (const z of this.zones) z.draw(ctx);
    for (const d of this.detonations) d.draw(ctx);
    for (const i of this.indicators) i.draw(ctx);
    for (const m of this.minions) m.draw(ctx);
    for (const a of this.autoAttacks) a.draw(ctx);
    for (const s of this.skillshots) s.draw(ctx);
    this.champion.draw(ctx);
    for (const e of this.effects) e.draw(ctx);
    for (const t of this.texts) t.draw(ctx);

    this._drawCursor(ctx);
    this._drawToasts(ctx);
    this._drawFps(ctx);
  }

  _drawGround(ctx) {
    // Fond dégradé + grille discrète façon Faille de l'invocateur.
    const g = ctx.createRadialGradient(
      this.width / 2, this.height / 2, 80,
      this.width / 2, this.height / 2, this.width * 0.7,
    );
    g.addColorStop(0, '#12263a');
    g.addColorStop(1, '#050d16');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.strokeStyle = 'rgba(200,170,110,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= this.width; x += 64) { ctx.moveTo(x, 0); ctx.lineTo(x, this.height); }
    for (let y = 0; y <= this.height; y += 64) { ctx.moveTo(0, y); ctx.lineTo(this.width, y); }
    ctx.stroke();
    ctx.restore();
  }

  _drawCursor(ctx) {
    if (this.state !== 'playing') return;
    const m = this.input.mouse;
    ctx.save();
    ctx.strokeStyle = this.champion.attackMoveArmed ? '#e2495a' : 'rgba(240,230,210,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 9, 0, TAU);
    ctx.moveTo(m.x - 14, m.y); ctx.lineTo(m.x - 4, m.y);
    ctx.moveTo(m.x + 4, m.y); ctx.lineTo(m.x + 14, m.y);
    ctx.moveTo(m.x, m.y - 14); ctx.lineTo(m.x, m.y - 4);
    ctx.moveTo(m.x, m.y + 4); ctx.lineTo(m.x, m.y + 14);
    ctx.stroke();
    ctx.restore();
  }

  _drawToasts(ctx) {
    ctx.save();
    ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    let y = this.height - 40;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      ctx.globalAlpha = clamp(t.life / t.maxLife, 0, 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.msg, this.width / 2, y);
      y -= 22;
    }
    ctx.restore();
  }

  _drawFps(ctx) {
    ctx.save();
    ctx.font = '12px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(160,155,140,0.7)';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(this.fps)} FPS`, this.width - 10, 18);
    ctx.restore();
  }

  /* ---------------- boucle rAF ---------------- */

  loop(timestamp) {
    // deltaTime en secondes, borné à 50ms pour éviter les « tunnels » de
    // collision après un changement d'onglet ou un freeze.
    let dt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);

    // Compteur de FPS lissé sur 0.5s.
    this.frames++;
    this.accumFps += dt;
    if (this.accumFps >= 0.5) {
      this.fps = this.frames / this.accumFps;
      this.frames = 0;
      this.accumFps = 0;
    }

    this.update(dt);
    this.draw();
    this.hud.update();

    requestAnimationFrame(this.loop);
  }
}

/* ------------------------------------------------------------------ *
 * BOOT
 * ------------------------------------------------------------------ */

const game = new Game(document.getElementById('game'));
// Exposé pour l'inspection en console (debug), sans effet sur le jeu.
window.__trainer = game;
