import { describe, expect, it } from 'vitest';
import { createConfig, DEFAULT_CONFIG, validateOptions } from './config';
import { GameSimulation, segmentCircleHit, type Projectile, type Ship } from './simulation';

function ticks(sim: GameSimulation, seconds: number) {
  for (let i = 0; i < Math.round(seconds / sim.config.physics.timestep); i++) sim.step();
}
function quiet() {
  const config = structuredClone(DEFAULT_CONFIG);
  config.spawnInterval = 1000;
  config.islands = [];
  config.player.startAngle = 0;
  return new GameSimulation(config, 7);
}
function enemy(id: number, kind: 'chaser' | 'shooter', x: number, y: number): Ship {
  const tuning = DEFAULT_CONFIG[kind];
  return { id, kind, x, y, radius: tuning.radius, hp: tuning.hp, maxHp: tuning.hp, angle: Math.PI, cooldowns: { front: 0, port: 0, starboard: 0 }, flash: 0 };
}
function shot(id: number, x: number, y: number, vx = 480): Projectile {
  return { id, x, y, previousX: x, previousY: y, vx, vy: 0, radius: 5, damage: 20, life: 2, owner: 'player' };
}

describe('configuration and deterministic clock', () => {
  it('validates all exposed option boundaries', () => {
    expect(validateOptions(60, 1)).toBeNull();
    expect(validateOptions(180, 15)).toBeNull();
    for (const duration of [NaN, 59, 181, Infinity]) expect(validateOptions(duration, 3)).not.toBeNull();
    for (const spawn of [0, -1, 16, NaN]) expect(validateOptions(120, spawn)).not.toBeNull();
    expect(() => createConfig(1, 3)).toThrow();
  });
  it('captures a frozen independent configuration snapshot', () => {
    const config = createConfig();
    const sim = new GameSimulation(config);
    config.player.hp = 1;
    config.islands[0].radius = 1;
    expect(sim.config.player.hp).toBe(100);
    expect(sim.config.islands[0].radius).toBe(90);
    expect(Object.isFrozen(sim.config.player)).toBe(true);
    expect(Object.isFrozen(sim.config.spawn.sequence)).toBe(true);
  });
  it('produces the same simulation at 30, 60 and 120 FPS', () => {
    const states = [30, 60, 120].map(fps => {
      const sim = new GameSimulation(DEFAULT_CONFIG, 42);
      sim.input.forward = true;
      sim.input.right = true;
      sim.input.front = true;
      for (let i = 0; i < fps * 10; i++) sim.advance(1 / fps);
      return sim.snapshot();
    });
    expect(states[0]).toEqual(states[1]);
    expect(states[1]).toEqual(states[2]);
  });
  it('limits frame catch-up and ignores invalid deltas', () => {
    const sim = quiet();
    sim.advance(100);
    expect(sim.state.time).toBeCloseTo(0.25);
    const before = sim.snapshot();
    sim.advance(NaN); sim.advance(-1); sim.advance(Infinity);
    expect(sim.snapshot()).toEqual(before);
  });
  it('pauses time, cooldowns and entities and clears held input', () => {
    const sim = quiet();
    sim.input.forward = true; sim.input.front = true;
    ticks(sim, 0.1);
    sim.pause();
    const before = sim.snapshot();
    ticks(sim, 5); sim.advance(5);
    expect(sim.snapshot()).toEqual(before);
    expect(Object.values(sim.input).every(value => !value)).toBe(true);
    sim.input.front = true;
    sim.resume();
    expect(sim.input.front).toBe(false);
    ticks(sim, 0.1);
    expect(sim.state.player.x).toBe(before.player.x);
    expect(sim.state.time).toBeCloseTo(before.time + 0.1);
  });
  it('disposes a session idempotently and permanently stops updates', () => {
    const sim = quiet();
    sim.input.front = true; sim.input.forward = true; sim.step();
    sim.state.enemies.push(enemy(99, 'shooter', 100, 100));
    expect(sim.state.projectiles.length).toBeGreaterThan(0);
    sim.dispose();
    expect(sim.state.status).toBe('disposed');
    expect(sim.state.enemies).toHaveLength(0);
    expect(sim.state.projectiles).toHaveLength(0);
    expect(sim.state.effects).toHaveLength(0);
    expect(Object.values(sim.input).every(value => !value)).toBe(true);
    const before = sim.snapshot();
    sim.dispose(); sim.pause(); sim.resume(); sim.step(); sim.advance(0.25);
    expect(sim.snapshot()).toEqual(before);
  });
  it('preserves finished result data when disposing its transient resources', () => {
    const sim = quiet();
    ticks(sim, sim.config.duration);
    const result = { time: sim.state.time, score: sim.state.score, reason: sim.state.reason };
    sim.dispose();
    expect({ time: sim.state.time, score: sim.state.score, reason: sim.state.reason }).toEqual(result);
  });
});

describe('movement and collision geometry', () => {
  it('moves forward and rotates simultaneously using time', () => {
    const sim = quiet();
    sim.input.forward = true;
    ticks(sim, 1);
    expect(sim.state.player.x).toBeCloseTo(790);
    sim.input.right = true;
    ticks(sim, 0.5);
    expect(sim.state.player.angle).toBeCloseTo(1.3);
    expect(sim.state.player.y).toBeGreaterThan(360);
  });
  it('keeps the full ship inside arena boundaries', () => {
    const sim = quiet(); sim.input.forward = true;
    ticks(sim, 10);
    expect(sim.state.player.x).toBe(1200 - sim.state.player.radius);
  });
  it('blocks ships at islands even with extremely fast movement', () => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.player.startX = 100; config.player.startY = 230; config.player.startAngle = 0;
    config.player.speed = 30000;
    const sim = new GameSimulation(config); sim.input.forward = true; sim.step();
    expect(sim.state.player.x).toBeLessThanOrEqual(325 - 90 - 24);
    expect(sim.state.player.x).toBeGreaterThan(210);
  });
  it('computes swept-circle contact and ignores clear segments', () => {
    expect(segmentCircleHit(0, 0, 100, 0, { x: 50, y: 0, radius: 10 })).toBeCloseTo(0.4);
    expect(segmentCircleHit(50, 0, 50, 0, { x: 50, y: 0, radius: 10 })).toBe(0);
    expect(segmentCircleHit(0, 0, 100, 0, { x: 50, y: 20, radius: 10 })).toBeNull();
  });
});

describe('weapons and projectiles', () => {
  it('fires a front shot and two independent parallel triple broadsides', () => {
    const sim = quiet();
    sim.input.front = true; sim.input.port = true; sim.input.starboard = true;
    sim.step();
    expect(sim.state.projectiles).toHaveLength(7);
    const port = sim.state.projectiles.filter(p => p.vy < -400);
    const starboard = sim.state.projectiles.filter(p => p.vy > 400);
    expect(port).toHaveLength(3); expect(starboard).toHaveLength(3);
    expect(new Set(port.map(p => p.x)).size).toBe(3);
    expect(new Set(port.map(p => p.vy)).size).toBe(1);
    sim.step(); expect(sim.state.projectiles).toHaveLength(7);
    ticks(sim, 0.4);
    expect(sim.state.projectiles.filter(p => p.vx > 400)).toHaveLength(2);
  });
  it('kills only once even when several shots arrive together', () => {
    const sim = quiet();
    const target = enemy(50, 'shooter', 680, 360); target.hp = 20;
    sim.state.enemies.push(target);
    sim.state.projectiles.push(shot(90, 650, 360), shot(91, 650, 360));
    sim.step();
    expect(sim.state.score).toBe(1);
    expect(sim.state.enemies).toHaveLength(0);
    expect(sim.state.projectiles.filter(p => p.owner === 'enemy')).toHaveLength(0);
    ticks(sim, 1); expect(sim.state.score).toBe(1);
  });
  it('removes a projectile after exactly one hit on the nearest target', () => {
    const sim = quiet();
    sim.state.enemies.push(enemy(50, 'shooter', 680, 360), enemy(51, 'shooter', 720, 360));
    sim.state.projectiles.push(shot(90, 650, 360, 6000));
    sim.step();
    expect(sim.state.enemies[0].hp).toBe(40);
    expect(sim.state.enemies[1].hp).toBe(60);
    expect(sim.state.projectiles.filter(p => p.owner === 'player')).toHaveLength(0);
  });
  it('islands intercept shots before targets behind them', () => {
    const sim = new GameSimulation(DEFAULT_CONFIG);
    sim.state.enemies.push(enemy(50, 'shooter', 450, 230));
    sim.state.projectiles.push(shot(90, 210, 230, 30000));
    sim.step();
    expect(sim.state.enemies[0].hp).toBe(60);
    expect(sim.state.projectiles.filter(p => p.owner === 'player')).toHaveLength(0);
  });
  it('removes expired and out-of-arena projectiles', () => {
    const sim = quiet();
    const expired = shot(90, 600, 100); expired.life = 0.001;
    sim.state.projectiles.push(expired, shot(91, 1199, 100));
    sim.step(); expect(sim.state.projectiles).toHaveLength(0);
  });
  it('enemy shots damage only the player', () => {
    const sim = quiet();
    const p = shot(90, 560, 360, 3000); p.owner = 'enemy';
    sim.state.projectiles.push(p);
    sim.step(); expect(sim.state.player.hp).toBe(80);
    expect(sim.state.projectiles).toHaveLength(0);
  });
});

describe('enemy behavior and match lifecycle', () => {
  it('spawns both types at configured intervals with deterministic safe positions', () => {
    const sim = new GameSimulation(DEFAULT_CONFIG, 2);
    ticks(sim, 2.9); expect(sim.state.enemies).toHaveLength(0);
    ticks(sim, 0.1); expect(sim.state.enemies).toHaveLength(1);
    const chaser = sim.state.enemies[0];
    expect(chaser.kind).toBe('chaser');
    expect(Math.hypot(chaser.x - sim.state.player.x, chaser.y - sim.state.player.y)).toBeGreaterThanOrEqual(sim.config.spawn.minDistance);
    ticks(sim, 3); expect(sim.state.enemies.some(e => e.kind === 'shooter')).toBe(true);
  });
  it('chasers explode on contact without awarding points', () => {
    const sim = quiet(); sim.state.enemies.push(enemy(50, 'chaser', 640, 360));
    sim.step();
    expect(sim.state.player.hp).toBe(78);
    expect(sim.state.enemies).toHaveLength(0);
    expect(sim.state.score).toBe(0);
    expect(sim.state.effects.some(e => e.kind === 'explosion')).toBe(true);
  });
  it('shooters approach and only fire in range and when aligned', () => {
    const sim = quiet(); const shooter = enemy(50, 'shooter', 1100, 360);
    sim.state.enemies.push(shooter);
    ticks(sim, 1); expect(shooter.x).toBeCloseTo(1025);
    expect(sim.state.projectiles).toHaveLength(0);
    ticks(sim, 1); expect(sim.state.projectiles.some(p => p.owner === 'enemy')).toBe(true);
  });
  it('enemy pursuit never penetrates islands', () => {
    const config = structuredClone(DEFAULT_CONFIG); config.spawnInterval = 1000;
    config.player.startX = 600; config.player.startY = 230;
    const sim = new GameSimulation(config); sim.state.enemies.push(enemy(50, 'chaser', 100, 230));
    for (let i = 0; i < 300; i++) {
      sim.step();
      for (const enemy of sim.state.enemies) for (const island of config.islands) expect(Math.hypot(enemy.x - island.x, enemy.y - island.y)).toBeGreaterThanOrEqual(enemy.radius + island.radius - 0.001);
    }
  });
  it('ends exactly at configured duration and freezes all simulation', () => {
    const sim = quiet(); sim.input.forward = true; sim.input.front = true;
    ticks(sim, 120);
    expect(sim.state.time).toBe(120); expect(sim.state.reason).toBe('time');
    const before = sim.snapshot(); ticks(sim, 1); sim.resume(); sim.advance(1);
    expect(sim.snapshot()).toEqual(before);
  });
  it('ends on death and starts a separate match cleanly', () => {
    const sim = quiet(); sim.state.player.hp = 1;
    sim.state.enemies.push(enemy(50, 'chaser', 640, 360)); sim.step();
    expect(sim.state.reason).toBe('death'); expect(sim.state.status).toBe('ended');
    const before = sim.snapshot(); ticks(sim, 1); expect(sim.snapshot()).toEqual(before);
    const fresh = new GameSimulation(sim.config);
    expect(fresh.state.player.hp).toBe(100); expect(fresh.state.time).toBe(0);
    expect(fresh.state.enemies).toHaveLength(0); expect(fresh.state.score).toBe(0);
  });
});
