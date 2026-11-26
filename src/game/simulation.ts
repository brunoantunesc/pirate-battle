import { DEFAULT_CONFIG, type Circle, type GameConfig } from './config';

export type ShipKind = 'player' | 'chaser' | 'shooter';
export type Weapon = 'front' | 'port' | 'starboard';
/** Position uses logical pixels; angle is radians with zero pointing right. */
export interface Ship extends Circle {
  id: number;
  kind: ShipKind;
  angle: number;
  hp: number;
  maxHp: number;
  cooldowns: Record<Weapon, number>;
  flash: number;
}
export interface Projectile extends Circle {
  id: number; previousX: number; previousY: number; vx: number; vy: number;
  damage: number; life: number; owner: 'player' | 'enemy';
}
export interface Effect { id: number; x: number; y: number; kind: 'shot' | 'hit' | 'explosion'; life: number; maxLife: number }
export interface InputState { forward: boolean; left: boolean; right: boolean; front: boolean; port: boolean; starboard: boolean }
export interface GameState {
  player: Ship; enemies: Ship[]; projectiles: Projectile[]; effects: Effect[];
  time: number; score: number; status: 'running' | 'paused' | 'ended' | 'disposed'; reason: 'time' | 'death' | null;
}

const distance = (a: {x: number; y: number}, b: {x: number; y: number}) => Math.hypot(a.x - b.x, a.y - b.y);
const normalizeAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** First contact along a segment, including when the segment starts inside. */
export function segmentCircleHit(x: number, y: number, endX: number, endY: number, circle: Circle): number | null {
  const dx = endX - x, dy = endY - y, ox = x - circle.x, oy = y - circle.y;
  const c = ox * ox + oy * oy - circle.radius * circle.radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = 2 * (ox * dx + oy * dy), discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

function freezeConfig(config: GameConfig): GameConfig {
  const copy = structuredClone(config);
  for (const value of Object.values(copy)) {
    if (typeof value === 'object') {
      for (const nested of Object.values(value)) if (typeof nested === 'object' && nested !== null) Object.freeze(nested);
      Object.freeze(value);
    }
  }
  return Object.freeze(copy);
}

/** Pure simulation: no rendering, browser, persistence or React dependencies. */
export class GameSimulation {
  readonly config: GameConfig;
  readonly input: InputState = { forward: false, left: false, right: false, front: false, port: false, starboard: false };
  readonly state: GameState;
  private accumulator = 0;
  private randomState: number;
  private nextId = 1;
  private spawnClock = 0;
  private spawnIndex = 0;
  private pendingSpawns = 0;

  constructor(config: GameConfig = DEFAULT_CONFIG, seed = 1) {
    this.config = freezeConfig(config);
    this.randomState = seed >>> 0;
    const { player } = this.config;
    this.state = { player: this.makeShip('player', player.startX, player.startY, player.startAngle), enemies: [], projectiles: [], effects: [], time: 0, score: 0, status: 'running', reason: null };
  }

  clearInput() { for (const key of Object.keys(this.input) as (keyof InputState)[]) this.input[key] = false; }
  pause() { if (this.state.status === 'running') this.state.status = 'paused'; this.clearInput(); this.accumulator = 0; }
  resume() { if (this.state.status === 'paused') this.state.status = 'running'; this.clearInput(); this.accumulator = 0; }
  /** Terminal ownership release. Do not call during a reusable view's StrictMode cleanup. */
  dispose() {
    this.clearInput();
    this.accumulator = 0;
    this.spawnClock = 0;
    this.pendingSpawns = 0;
    this.state.status = 'disposed';
    this.state.enemies = [];
    this.state.projectiles = [];
    this.state.effects = [];
  }
  snapshot(): GameState { return structuredClone(this.state); }

  /** Real frame deltas are capped to prevent catch-up spirals after stalls. */
  advance(seconds: number) {
    if (this.state.status !== 'running' || !Number.isFinite(seconds) || seconds <= 0) return;
    this.accumulator += Math.min(seconds, this.config.physics.maxFrameTime);
    while (this.accumulator + Number.EPSILON >= this.config.physics.timestep && this.state.status === 'running') {
      this.accumulator -= this.config.physics.timestep;
      this.step();
    }
  }

  /** One deterministic fixed tick; test clocks repeat this without changing rules. */
  step() {
    const s = this.state, c = this.config;
    if (s.status !== 'running') return;
    const dt = Math.min(c.physics.timestep, c.duration - s.time);
    if (dt <= 1e-9) { this.end('time'); return; }
    s.time = Math.min(c.duration, s.time + dt);
    for (const ship of [s.player, ...s.enemies]) {
      ship.flash = Math.max(0, ship.flash - dt);
      for (const weapon of ['front', 'port', 'starboard'] as const) ship.cooldowns[weapon] = Math.max(0, ship.cooldowns[weapon] - dt);
    }
    s.effects = s.effects.filter(effect => { effect.life -= dt; return effect.life > 0; });
    s.player.angle = normalizeAngle(s.player.angle + (Number(this.input.right) - Number(this.input.left)) * c.player.turnSpeed * dt);
    if (this.input.forward) this.move(s.player, c.player.speed * dt);
    for (const weapon of ['front', 'port', 'starboard'] as const) if (this.input[weapon]) this.fire(s.player, weapon);

    // Resolve player shots before enemy behavior, so destroyed enemies cannot act.
    this.updateProjectiles(dt);
    if (s.player.hp <= 0) { this.end('death'); return; }
    s.enemies = s.enemies.filter(enemy => enemy.hp > 0);
    for (const enemy of s.enemies) {
      this.updateEnemy(enemy, dt);
      if (s.player.hp <= 0) { this.end('death'); return; }
    }
    s.enemies = s.enemies.filter(enemy => enemy.hp > 0);
    this.spawnClock += dt;
    if (s.time + 1e-9 >= c.duration) { s.time = c.duration; this.end('time'); return; }
    while (this.spawnClock + 1e-9 >= c.spawnInterval) {
      this.spawnClock -= c.spawnInterval;
      this.pendingSpawns++;
      // Preserve due arrivals if every safe position is temporarily occupied.
      // Retry on the next interval, avoiding a full arena search on every frame.
      while (this.pendingSpawns > 0 && this.spawnEnemy()) this.pendingSpawns--;
    }
  }

  private random() {
    this.randomState = (this.randomState + 0x6d2b79f5) >>> 0;
    let t = this.randomState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private makeShip(kind: ShipKind, x: number, y: number, angle: number): Ship {
    const tuning = this.config[kind];
    return { id: this.nextId++, kind, x, y, angle, radius: tuning.radius, hp: tuning.hp, maxHp: tuning.hp, cooldowns: { front: 0, port: 0, starboard: 0 }, flash: 0 };
  }

  private end(reason: 'time' | 'death') { this.state.status = 'ended'; this.state.reason = reason; this.clearInput(); this.accumulator = 0; }

  private move(ship: Ship, amount: number) {
    const targetX = clamp(ship.x + Math.cos(ship.angle) * amount, ship.radius, this.config.arena.width - ship.radius);
    const targetY = clamp(ship.y + Math.sin(ship.angle) * amount, ship.radius, this.config.arena.height - ship.radius);
    let contact = 1;
    for (const island of this.config.islands) {
      const t = segmentCircleHit(ship.x, ship.y, targetX, targetY, { ...island, radius: island.radius + ship.radius });
      if (t !== null) contact = Math.min(contact, Math.max(0, t - 1e-5));
    }
    ship.x += (targetX - ship.x) * contact;
    ship.y += (targetY - ship.y) * contact;
  }

  private fire(ship: Ship, weapon: Weapon) {
    if (ship.hp <= 0 || ship.cooldowns[weapon] > 1e-9) return;
    const c = this.config, player = ship.kind === 'player';
    ship.cooldowns[weapon] = player ? (weapon === 'front' ? c.weapons.frontCooldown : c.weapons.sideCooldown) : c.shooter.cooldown;
    const angle = ship.angle + (weapon === 'port' ? -Math.PI / 2 : weapon === 'starboard' ? Math.PI / 2 : 0);
    const offsets = weapon === 'front' ? [0] : [-c.weapons.broadsideSpacing, 0, c.weapons.broadsideSpacing];
    for (const offset of offsets) {
      const x = ship.x + Math.cos(angle) * (ship.radius + c.weapons.muzzleGap) + Math.cos(ship.angle) * offset;
      const y = ship.y + Math.sin(angle) * (ship.radius + c.weapons.muzzleGap) + Math.sin(ship.angle) * offset;
      const speed = player ? c.projectile.speed : c.projectile.enemySpeed;
      this.state.projectiles.push({ id: this.nextId++, x, y, previousX: x, previousY: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: c.projectile.radius, damage: player ? c.projectile.damage : c.projectile.enemyDamage, life: c.projectile.life, owner: player ? 'player' : 'enemy' });
      this.effect(x, y, 'shot');
    }
  }

  private effect(x: number, y: number, kind: Effect['kind']) {
    const maxLife = kind === 'shot' ? this.config.effects.shotLife : kind === 'hit' ? this.config.effects.hitLife : this.config.effects.explosionLife;
    this.state.effects.push({ id: this.nextId++, x, y, kind, life: maxLife, maxLife });
  }

  private damage(ship: Ship, amount: number, score: boolean) {
    if (ship.hp <= 0) return;
    ship.hp = Math.max(0, ship.hp - amount);
    ship.flash = this.config.effects.flashLife;
    this.effect(ship.x, ship.y, ship.hp <= 0 ? 'explosion' : 'hit');
    if (ship.hp <= 0 && ship.kind !== 'player' && score) this.state.score++;
  }

  private updateProjectiles(dt: number) {
    const survivors: Projectile[] = [];
    for (const shot of this.state.projectiles) {
      if (this.state.player.hp <= 0) { survivors.push(shot); continue; }
      const stepTime = Math.min(dt, shot.life);
      const endX = shot.x + shot.vx * stepTime, endY = shot.y + shot.vy * stepTime;
      let first = Infinity;
      let target: Ship | null = null;
      for (const island of this.config.islands) {
        const t = segmentCircleHit(shot.x, shot.y, endX, endY, { ...island, radius: island.radius + shot.radius });
        if (t !== null && t < first) first = t;
      }
      const targets = shot.owner === 'player' ? this.state.enemies : [this.state.player];
      for (const ship of targets) {
        if (ship.hp <= 0) continue;
        const t = segmentCircleHit(shot.x, shot.y, endX, endY, { ...ship, radius: ship.radius + shot.radius });
        if (t !== null && t < first) { first = t; target = ship; }
      }
      if (first !== Infinity) {
        if (target) this.damage(target, shot.damage, shot.owner === 'player');
        else this.effect(shot.x + (endX - shot.x) * first, shot.y + (endY - shot.y) * first, 'hit');
        continue;
      }
      shot.previousX = shot.x; shot.previousY = shot.y;
      shot.x = endX; shot.y = endY; shot.life -= dt;
      if (shot.life > 0 && shot.x >= 0 && shot.y >= 0 && shot.x <= this.config.arena.width && shot.y <= this.config.arena.height) survivors.push(shot);
    }
    this.state.projectiles = survivors;
  }

  private updateEnemy(enemy: Ship, dt: number) {
    if (enemy.hp <= 0) return;
    const c = this.config, player = this.state.player;
    const directAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    let desired = directAngle;
    // Steer towards a tangent around the first obstacle in the pursuit corridor.
    for (const island of c.islands) {
      const clearance = island.radius + enemy.radius + c.physics.avoidanceMargin;
      const look = Math.min(distance(enemy, player), c.physics.avoidanceDistance + clearance);
      if (segmentCircleHit(enemy.x, enemy.y, enemy.x + Math.cos(directAngle) * look, enemy.y + Math.sin(directAngle) * look, { ...island, radius: clearance }) !== null) {
        const towardIsland = Math.atan2(island.y - enemy.y, island.x - enemy.x);
        const side = normalizeAngle(directAngle - towardIsland) >= 0 ? 1 : -1;
        const tangent = Math.asin(Math.min(1, clearance / Math.max(clearance, distance(enemy, island))));
        desired = towardIsland + side * (tangent + c.physics.avoidanceAngle);
        break;
      }
    }
    const tuning = c[enemy.kind];
    enemy.angle = normalizeAngle(enemy.angle + clamp(normalizeAngle(desired - enemy.angle), -tuning.turnSpeed * dt, tuning.turnSpeed * dt));
    const separation = distance(enemy, player);
    if (enemy.kind === 'chaser' || separation > c.shooter.stopRange) this.move(enemy, tuning.speed * dt);
    if (enemy.kind === 'chaser' && distance(enemy, player) <= enemy.radius + player.radius) {
      enemy.hp = 0;
      this.effect(enemy.x, enemy.y, 'explosion');
      this.damage(player, c.chaser.damage, false);
    } else if (enemy.kind === 'shooter' && separation <= c.shooter.range && Math.abs(normalizeAngle(directAngle - enemy.angle)) <= c.shooter.aimTolerance) this.fire(enemy, 'front');
  }

  private spawnEnemy(): boolean {
    const c = this.config;
    if (c.spawn.sequence.length === 0) return false;
    const kind = c.spawn.sequence[this.spawnIndex % c.spawn.sequence.length];
    const radius = c[kind].radius;
    const inset = Math.max(c.spawn.edgeInset, radius);
    const maxX = c.arena.width - inset, maxY = c.arena.height - inset;
    const place = (x: number, y: number): boolean => {
      const point = { x, y };
      if (distance(point, this.state.player) < c.spawn.minDistance) return false;
      if (c.islands.some(island => distance(point, island) <= island.radius + radius)) return false;
      if (this.state.enemies.some(enemy => distance(point, enemy) <= enemy.radius + radius)) return false;
      this.state.enemies.push(this.makeShip(kind, x, y, Math.atan2(this.state.player.y - y, this.state.player.x - x)));
      this.spawnIndex++;
      return true;
    };
    for (let attempt = 0; attempt < c.spawn.attempts; attempt++) {
      const edge = Math.floor(this.random() * 4);
      const x = edge === 0 ? inset : edge === 1 ? maxX : inset + this.random() * (c.arena.width - inset * 2);
      const y = edge === 2 ? inset : edge === 3 ? maxY : inset + this.random() * (c.arena.height - inset * 2);
      if (place(x, y)) return true;
    }
    // Seeded edge sampling remains the usual path. A deterministic half-radius-spaced
    // search prevents unlucky random attempts or crowded edges dropping arrivals.
    // Arena and match duration bound the work; no arbitrary live-enemy cap applies.
    const searchStep = radius / 2;
    for (let x = inset; x <= maxX; x += searchStep) {
      if (place(x, inset) || place(x, maxY)) return true;
    }
    for (let y = inset; y <= maxY; y += searchStep) {
      if (place(inset, y) || place(maxX, y)) return true;
    }
    for (let y = inset + searchStep; y < maxY; y += searchStep) {
      for (let x = inset + radius; x < maxX; x += searchStep) {
        if (place(x, y)) return true;
      }
    }
    return false;
  }
}
