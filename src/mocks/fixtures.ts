import type { GameConfig } from '../game/config';
import type { MatchRecord } from '../api/contracts';

const CAPTAINS = ['Anne Bonny', 'Blackbeard', 'Mary Read', 'Calico Jack', 'Sea Wolf', 'Silver Finch', 'Red Morgan', 'Captain Flint'];
export function fixtures(config: GameConfig, count = 18, playerId?: string): MatchRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `fixture-${playerId ?? 'rival'}-${index.toString().padStart(3, '0')}`,
    playerId: playerId ?? `rival-${index}`,
    playerName: playerId ? 'Captain (demo)' : CAPTAINS[index % CAPTAINS.length],
    finishedAt: new Date(Date.UTC(2026, 0, 1, 12, index)).toISOString(),
    score: 30 - index,
    duration: index % 3 === 0 ? Math.min(config.duration, 60 + index) : config.duration,
    reason: index % 3 === 0 ? 'death' : 'time',
    config,
  }));
}
