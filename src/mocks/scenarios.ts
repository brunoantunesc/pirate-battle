import { DATA_EVENT, readStorage, STORAGE_KEYS, writeStorage } from '../api/storage';

export const SCENARIOS = [
  ['success', 'Success'], ['empty', 'Empty lists'], ['pages', 'Multiple pages'],
  ['slow', 'Slow response'], ['variable', 'Variable latency'], ['out-of-order', 'Out-of-order responses'],
  ['timeout', 'Timeout'], ['connection', 'Connection failure'], ['http-400', 'HTTP 400'],
  ['http-500', 'HTTP 500'], ['ranking-failure', 'Ranking query failure'],
  ['history-failure', 'History query failure'], ['timeout-after-save', 'Timeout after successful persistence'],
  ['unavailable', 'Unavailable during match completion'],
] as const;
export type Scenario = typeof SCENARIOS[number][0];
export interface NetworkSettings { scenario: Scenario; seed: number; latency: number }
export const DEFAULT_NETWORK: NetworkSettings = { scenario: 'success', seed: 42, latency: 200 };
let requestSequence = 0;
let resetGeneration = 0;
export function getResetGeneration(): number { return resetGeneration; }
export function getNetworkSettings(): NetworkSettings {
  try {
    const parsed: unknown = JSON.parse(readStorage(STORAGE_KEYS.scenario) ?? 'null');
    if (parsed && typeof parsed === 'object') {
      const value = parsed as Record<string, unknown>;
      if (SCENARIOS.some(([id]) => id === value.scenario)) {
        return { scenario: value.scenario as Scenario, seed: typeof value.seed === 'number' && Number.isFinite(value.seed) ? value.seed : 42, latency: typeof value.latency === 'number' && Number.isFinite(value.latency) ? Math.max(0, value.latency) : 200 };
      }
    }
  } catch { /* A damaged preference falls back to normal networking. */ }
  return DEFAULT_NETWORK;
}
export function setNetworkSettings(settings: NetworkSettings): void {
  requestSequence = 0;
  writeStorage(STORAGE_KEYS.scenario, JSON.stringify(settings));
}
export function nextLatency(settings: NetworkSettings): number {
  const sequence = ++requestSequence;
  if (settings.scenario === 'slow') return 1800;
  if (settings.scenario === 'out-of-order') return sequence % 2 ? 1800 : 50;
  if (settings.scenario === 'variable') return (Math.imul(sequence + settings.seed, 16807) >>> 0) % 1700 + 50;
  return settings.latency;
}
export function resetMockData(): void {
  resetGeneration++;
  for (const key of Object.values(STORAGE_KEYS)) localStorage.removeItem(key);
  requestSequence = 0;
  window.dispatchEvent(new Event(DATA_EVENT));
}
