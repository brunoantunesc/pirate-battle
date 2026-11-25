/** Coordinates and radii use logical arena pixels, independent of device density. */
export interface Circle { x: number; y: number; radius: number }
/** Health is hit points; speed is pixels/second; turnSpeed is radians/second. */
export interface ShipTuning { hp: number; speed: number; turnSpeed: number; radius: number }
/**
 * All durations, lifetimes and cooldowns are seconds of active simulation time.
 * All distances/ranges are logical pixels; angles/tolerances are radians.
 * Projectile range is speed × life (1104 player / 644 enemy pixels by default).
 * Counts (attempts, maxEnemies) are integers; damage uses hit points.
 */
export interface GameConfig {
  duration: number;
  spawnInterval: number;
  arena: { width: number; height: number };
  islands: Circle[];
  player: ShipTuning & { startX: number; startY: number; startAngle: number };
  chaser: ShipTuning & { damage: number };
  shooter: ShipTuning & { range: number; stopRange: number; cooldown: number; aimTolerance: number };
  projectile: { speed: number; enemySpeed: number; damage: number; enemyDamage: number; radius: number; life: number };
  weapons: { frontCooldown: number; sideCooldown: number; broadsideSpacing: number; muzzleGap: number };
  spawn: { sequence: ('chaser' | 'shooter')[]; minDistance: number; attempts: number; edgeInset: number; maxEnemies: number };
  physics: { timestep: number; maxFrameTime: number; avoidanceDistance: number; avoidanceMargin: number; avoidanceAngle: number };
  effects: { shotLife: number; hitLife: number; explosionLife: number; flashLife: number };
}

export const OPTION_LIMITS = { duration: { min: 60, max: 180 }, spawnInterval: { min: 1, max: 15 } } as const;

export const DEFAULT_CONFIG: GameConfig = {
  duration: 120,
  spawnInterval: 3,
  arena: { width: 1200, height: 720 },
  islands: [ { x: 325, y: 230, radius: 90 }, { x: 865, y: 480, radius: 100 } ],
  player: { hp: 100, speed: 190, turnSpeed: 2.6, radius: 24, startX: 600, startY: 360, startAngle: -Math.PI / 2 },
  chaser: { hp: 40, speed: 95, turnSpeed: 1.7, radius: 22, damage: 22 },
  shooter: { hp: 60, speed: 75, turnSpeed: 1.4, radius: 24, range: 390, stopRange: 230, cooldown: 1.9, aimTolerance: 0.18 },
  projectile: { speed: 480, enemySpeed: 280, damage: 20, enemyDamage: 12, radius: 5, life: 2.3 },
  weapons: { frontCooldown: 0.38, sideCooldown: 1.1, broadsideSpacing: 17, muzzleGap: 8 },
  spawn: { sequence: ['chaser', 'shooter'], minDistance: 310, attempts: 40, edgeInset: 36, maxEnemies: 36 },
  physics: { timestep: 1 / 60, maxFrameTime: 0.25, avoidanceDistance: 100, avoidanceMargin: 16, avoidanceAngle: 0.15 },
  effects: { shotLife: 0.15, hitLife: 0.24, explosionLife: 0.65, flashLife: 0.15 },
};

export function validateOptions(duration: number, spawnInterval: number): string | null {
  if (!Number.isFinite(duration) || duration < OPTION_LIMITS.duration.min || duration > OPTION_LIMITS.duration.max) return 'Game session time must be between 60 and 180 seconds.';
  if (!Number.isFinite(spawnInterval) || spawnInterval < OPTION_LIMITS.spawnInterval.min || spawnInterval > OPTION_LIMITS.spawnInterval.max) return 'Enemy spawn time must be between 1 and 15 seconds.';
  return null;
}

export function createConfig(duration = DEFAULT_CONFIG.duration, spawnInterval = DEFAULT_CONFIG.spawnInterval): GameConfig {
  const error = validateOptions(duration, spawnInterval);
  if (error) throw new Error(error);
  return { ...structuredClone(DEFAULT_CONFIG), duration, spawnInterval };
}
