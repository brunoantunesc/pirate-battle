import { isMatchRecord, type MatchRecord } from './contracts';

export const STORAGE_KEYS = {
  confirmed: 'pirate-battle.confirmed.v1',
  acknowledged: 'pirate-battle.acknowledged.v1',
  pending: 'pirate-battle.pending.v1',
  last: 'pirate-battle.last.v1',
  scenario: 'pirate-battle.network.v1',
} as const;
export const DATA_EVENT = 'pirate-battle:data';

export function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function writeStorage(key: string, value: string): void {
  localStorage.setItem(key, value);
  window.dispatchEvent(new Event(DATA_EVENT));
}
export function readRecords(key: string): MatchRecord[] {
  return parseRecords(readStorage(key) ?? '[]');
}
export function parseRecords(serialized: string): MatchRecord[] {
  try {
    const value: unknown = JSON.parse(serialized);
    return Array.isArray(value) ? value.filter(isMatchRecord) : [];
  } catch { return []; }
}
export function acknowledgedIds(): string[] {
  try {
    const value: unknown = JSON.parse(readStorage(STORAGE_KEYS.acknowledged) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
  } catch { return []; }
}
export function acknowledgeMatch(id: string): void {
  writeStorage(STORAGE_KEYS.acknowledged, JSON.stringify([...new Set([...acknowledgedIds(), id])]));
}
export function upsertRecord(key: string, record: MatchRecord): MatchRecord {
  const records = readRecords(key);
  const existing = records.find(item => item.id === record.id);
  if (existing) return existing;
  writeStorage(key, JSON.stringify([...records, record]));
  return record;
}
export function removePending(id: string): void {
  writeStorage(STORAGE_KEYS.pending, JSON.stringify(readRecords(STORAGE_KEYS.pending).filter(record => record.id !== id)));
}
export function saveLastMatch(record: MatchRecord): void {
  const current = getLastMatch();
  if (current && current.finishedAt > record.finishedAt) return;
  writeStorage(STORAGE_KEYS.last, JSON.stringify(record));
}
export function getLastMatch(): MatchRecord | null {
  try {
    const value: unknown = JSON.parse(readStorage(STORAGE_KEYS.last) ?? 'null');
    return isMatchRecord(value) ? value : null;
  } catch { return null; }
}
export function subscribeData(listener: () => void): () => void {
  window.addEventListener(DATA_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(DATA_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
