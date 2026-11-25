import { delay, http, HttpResponse } from 'msw';
import { compareRanking, configurationKey, isGameConfig, isMatchRecord, PAGE_SIZE, PLAYER_ID, type MatchRecord, type PageResult } from '../api/contracts';
import { readRecords, STORAGE_KEYS, upsertRecord } from '../api/storage';
import { DEFAULT_CONFIG, type GameConfig } from '../game/config';
import { fixtures } from './fixtures';
import { getNetworkSettings, getResetGeneration, nextLatency, type NetworkSettings } from './scenarios';

async function failure(settings: NetworkSettings, resource: 'ranking' | 'history' | 'register'): Promise<Response | null> {
  if (settings.scenario === 'timeout') { await delay(5000); return HttpResponse.json({ error: 'Request timed out' }, { status: 504 }); }
  await delay(nextLatency(settings));
  if (settings.scenario === 'connection') return HttpResponse.error();
  if (settings.scenario === 'http-400') return HttpResponse.json({ error: 'The request was rejected (demo)' }, { status: 400 });
  if (settings.scenario === 'http-500' || settings.scenario === 'unavailable' ||
      (settings.scenario === 'ranking-failure' && resource === 'ranking') ||
      (settings.scenario === 'history-failure' && resource === 'history')) {
    return HttpResponse.json({ error: 'Service unavailable (demo)' }, { status: 503 });
  }
  return null;
}
function paginate(records: MatchRecord[], url: URL): PageResult<MatchRecord> {
  const page = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1));
  return { items: records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pageSize: PAGE_SIZE, total: records.length };
}
function requestConfig(url: URL): GameConfig {
  try {
    const value: unknown = JSON.parse(url.searchParams.get('config') ?? 'null');
    if (isGameConfig(value)) return value;
  } catch { /* An omitted configuration uses the default demo league. */ }
  return DEFAULT_CONFIG;
}
export const handlers = [
  http.get('*/api/ranking', async ({ request }) => {
    const settings = getNetworkSettings();
    const error = await failure(settings, 'ranking');
    if (error) return error;
    const url = new URL(request.url);
    const config = requestConfig(url);
    const records = settings.scenario === 'empty' ? [] : [
      ...fixtures(config, settings.scenario === 'pages' ? 28 : 18),
      ...(settings.scenario === 'pages' ? fixtures(config, 18, PLAYER_ID) : []),
      ...readRecords(STORAGE_KEYS.confirmed).filter(record => configurationKey(record.config) === configurationKey(config)),
    ].sort(compareRanking);
    return HttpResponse.json(paginate(records, url));
  }),
  http.get('*/api/history', async ({ request }) => {
    const settings = getNetworkSettings();
    const error = await failure(settings, 'history');
    if (error) return error;
    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId') ?? PLAYER_ID;
    const records = settings.scenario === 'empty' ? [] : [
      ...readRecords(STORAGE_KEYS.confirmed).filter(record => record.playerId === playerId),
      ...(settings.scenario === 'pages' ? fixtures(requestConfig(url), 18, playerId) : []),
    ].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt) || a.id.localeCompare(b.id));
    return HttpResponse.json(paginate(records, url));
  }),
  http.post('*/api/history', async ({ request }) => {
    const generation = getResetGeneration();
    let body: unknown;
    try { body = await request.json(); } catch { return HttpResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    if (!isMatchRecord(body)) return HttpResponse.json({ error: 'Invalid match record' }, { status: 400 });
    const settings = getNetworkSettings();
    const error = await failure(settings, 'register');
    if (error) return error;
    if (generation !== getResetGeneration() || request.signal.aborted) return HttpResponse.json({ error: 'Registration cancelled by demo reset' }, { status: 409 });
    const existing = readRecords(STORAGE_KEYS.confirmed).find(record => record.id === body.id);
    if (existing) return HttpResponse.json(existing);
    try {
      const saved = upsertRecord(STORAGE_KEYS.confirmed, body);
      if (settings.scenario === 'timeout-after-save') await delay(5000);
      return HttpResponse.json(saved, { status: 201 });
    } catch {
      return HttpResponse.json({ error: 'Local demo storage is unavailable' }, { status: 507 });
    }
  }),
];
