import { DEFAULT_CONFIG, OPTION_LIMITS, type GameConfig } from '../game/config';

export const PLAYER_ID = 'local-captain';
export interface MatchRecord {
  id: string;
  playerId: string;
  playerName: string;
  finishedAt: string;
  score: number;
  duration: number;
  reason: 'time' | 'death';
  config: GameConfig;
}
export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
export const PAGE_SIZE = 5;

function matchesShape(value: unknown, template: unknown): boolean {
  if (typeof template === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (typeof template === 'string') return typeof value === 'string';
  if (Array.isArray(template)) return Array.isArray(value) && value.every(item => matchesShape(item, template[0]));
  if (!template || typeof template !== 'object' || !value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record: Record<string, unknown> = value as Record<string, unknown>;
  return Object.entries(template).every(([key, expected]) => matchesShape(record[key], expected));
}
function hasGameConfigShape(value: unknown): value is GameConfig {
  return matchesShape(value, DEFAULT_CONFIG);
}
export function isGameConfig(value: unknown): value is GameConfig {
  if (!hasGameConfigShape(value)) return false;
  return value.duration >= OPTION_LIMITS.duration.min && value.duration <= OPTION_LIMITS.duration.max &&
    value.spawnInterval >= OPTION_LIMITS.spawnInterval.min && value.spawnInterval <= OPTION_LIMITS.spawnInterval.max &&
    value.arena.width > 0 && value.arena.height > 0 && value.islands.length > 0 &&
    value.islands.every(island => island.radius > 0) &&
    [value.player, value.chaser, value.shooter].every(ship => ship.hp > 0 && ship.radius > 0 && ship.speed >= 0 && ship.turnSpeed >= 0) &&
    value.projectile.life > 0 && value.projectile.radius > 0 &&
    value.weapons.frontCooldown > 0 && value.weapons.sideCooldown > 0 && value.shooter.cooldown > 0 &&
    value.physics.timestep > 0 && value.physics.maxFrameTime >= value.physics.timestep &&
    value.spawn.sequence.length > 0 && value.spawn.sequence.every(kind => kind === 'chaser' || kind === 'shooter') &&
    Number.isInteger(value.spawn.attempts) && value.spawn.attempts > 0 &&
    Number.isInteger(value.spawn.maxEnemies) && value.spawn.maxEnemies > 0;
}

/** Object key order must not split otherwise equivalent configurations. */
export function configurationKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(configurationKey).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${configurationKey(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function isMatchRecord(value: unknown): value is MatchRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && record.id.length > 0 &&
    typeof record.playerId === 'string' && typeof record.playerName === 'string' &&
    typeof record.finishedAt === 'string' && Number.isFinite(Date.parse(record.finishedAt)) &&
    typeof record.score === 'number' && Number.isInteger(record.score) && record.score >= 0 &&
    typeof record.duration === 'number' && Number.isFinite(record.duration) && record.duration >= 0 &&
    (record.reason === 'time' || record.reason === 'death') &&
    isGameConfig(record.config);
}

export function compareRanking(a: MatchRecord, b: MatchRecord): number {
  return b.score - a.score || a.finishedAt.localeCompare(b.finishedAt) || a.id.localeCompare(b.id);
}
