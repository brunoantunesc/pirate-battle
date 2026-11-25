import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { DEFAULT_CONFIG } from '../game/config';
import { handlers } from '../mocks/handlers';
import { getNetworkSettings, nextLatency, resetMockData, setNetworkSettings } from '../mocks/scenarios';
import { api, enqueueMatch, registerMatch, registrationStatus } from './client';
import { configurationKey, PLAYER_ID, type MatchRecord, type PageResult } from './contracts';
import { acknowledgedIds, getLastMatch, parseRecords, readRecords, STORAGE_KEYS } from './storage';

const memory = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, value); },
  removeItem: (key: string) => { memory.delete(key); },
  clear: () => memory.clear(),
};
const server = setupServer(...handlers);
const makeRecord = (id = 'test-match'): MatchRecord => ({
  id, playerId: PLAYER_ID, playerName: 'Captain', finishedAt: '2026-11-24T12:00:00.000Z',
  score: 12, duration: 60, reason: 'time', config: structuredClone(DEFAULT_CONFIG),
});
beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', localStorageMock);
  vi.stubGlobal('window', new EventTarget());
  api.defaults.baseURL = 'http://localhost/api';
  api.defaults.timeout = 2500;
  setNetworkSettings({ scenario: 'success', seed: 42, latency: 0 });
});
afterEach(() => { server.resetHandlers(); vi.unstubAllGlobals(); });
afterAll(() => { server.close(); });

describe('REST persistence and ranking contracts', () => {
  it('keeps one record across concurrent registration and retry', async () => {
    const record = makeRecord();
    await Promise.all([registerMatch(record), registerMatch(record)]);
    await registerMatch(record);
    expect(readRecords(STORAGE_KEYS.confirmed)).toHaveLength(1);
    expect(readRecords(STORAGE_KEYS.pending)).toHaveLength(0);
    expect(getLastMatch()).toEqual(record);
    expect(registrationStatus(record.id)).toBe('confirmed');
    const history = await api.get<PageResult<MatchRecord>>('/history', { params: { playerId: PLAYER_ID } });
    expect(history.data.total).toBe(1);
  });
  it('preserves the outbox on failure and recovers after restoring success', async () => {
    const record = makeRecord();
    setNetworkSettings({ scenario: 'http-500', seed: 42, latency: 0 });
    await expect(registerMatch(record)).rejects.toThrow();
    expect(readRecords(STORAGE_KEYS.pending)).toEqual([record]);
    expect(getLastMatch()).toEqual(record);
    setNetworkSettings({ scenario: 'success', seed: 42, latency: 0 });
    await registerMatch(readRecords(STORAGE_KEYS.pending)[0]);
    expect(registrationStatus(record.id)).toBe('confirmed');
  });
  it('recovers a server-persisted timeout without duplicate records', async () => {
    const record = makeRecord();
    api.defaults.timeout = 60;
    setNetworkSettings({ scenario: 'timeout-after-save', seed: 42, latency: 0 });
    await expect(registerMatch(record)).rejects.toThrow();
    expect(readRecords(STORAGE_KEYS.confirmed)).toHaveLength(1);
    expect(registrationStatus(record.id)).toBe('pending');
    await registerMatch(record);
    expect(readRecords(STORAGE_KEYS.confirmed)).toHaveLength(1);
    expect(registrationStatus(record.id)).toBe('confirmed');
  });
  it('filters ranking by complete configuration and returns deterministic pages', async () => {
    await registerMatch(makeRecord('same-config'));
    await registerMatch({ ...makeRecord('other-config'), config: { ...DEFAULT_CONFIG, duration: 180 } });
    const params = { config: configurationKey(DEFAULT_CONFIG), page: 1 };
    const first = (await api.get<PageResult<MatchRecord>>('/ranking', { params })).data;
    const second = (await api.get<PageResult<MatchRecord>>('/ranking', { params: { ...params, page: 2 } })).data;
    expect(first.total).toBe(19);
    expect(first.items).toHaveLength(5);
    expect(first.items[0].score).toBeGreaterThanOrEqual(second.items[0].score);
    expect(first.items.some(item => second.items.some(other => item.id === other.id))).toBe(false);
  });
  it('provides empty and multiple-page scenarios and resets persisted data', async () => {
    enqueueMatch(makeRecord());
    setNetworkSettings({ scenario: 'empty', seed: 42, latency: 0 });
    expect((await api.get<PageResult<MatchRecord>>('/ranking')).data.total).toBe(0);
    setNetworkSettings({ scenario: 'pages', seed: 42, latency: 0 });
    expect((await api.get<PageResult<MatchRecord>>('/history')).data.total).toBe(18);
    resetMockData();
    expect(readRecords(STORAGE_KEYS.pending)).toHaveLength(0);
    expect(getLastMatch()).toBeNull();
  });
  it('canonicalizes nested config keys independently of insertion order', () => {
    expect(configurationKey({ b: 2, a: { d: 4, c: 3 } })).toBe(configurationKey({ a: { c: 3, d: 4 }, b: 2 }));
  });
  it('never infers HTTP acknowledgement from mock server storage', () => {
    memory.set(STORAGE_KEYS.confirmed, JSON.stringify([makeRecord()]));
    expect(registrationStatus('test-match')).toBe('unknown');
    expect(acknowledgedIds()).toEqual([]);
  });
  it('discards malformed saved records and configurations safely', () => {
    expect(parseRecords('{broken')).toEqual([]);
    expect(parseRecords(JSON.stringify([{ ...makeRecord(), config: {} }]))).toEqual([]);
    expect(parseRecords(JSON.stringify([{ ...makeRecord(), config: { ...DEFAULT_CONFIG, physics: { ...DEFAULT_CONFIG.physics, timestep: 0 } } }]))).toEqual([]);
    memory.set(STORAGE_KEYS.last, JSON.stringify({ ...makeRecord(), config: { duration: 120 } }));
    expect(getLastMatch()).toBeNull();
    memory.set(STORAGE_KEYS.acknowledged, '{broken');
    expect(registrationStatus('test-match')).toBe('unknown');
  });
  it('retrying an old pending match preserves the latest completed result', async () => {
    const old = makeRecord('old');
    const recent = { ...makeRecord('recent'), finishedAt: '2026-11-24T13:00:00.000Z' };
    enqueueMatch(old); enqueueMatch(recent);
    await registerMatch(old);
    expect(getLastMatch()?.id).toBe('recent');
  });
  it.each(['http-400', 'http-500', 'connection', 'unavailable'] as const)('keeps pending records under %s failures', async scenario => {
    setNetworkSettings({ scenario, seed: 42, latency: 0 });
    await expect(registerMatch(makeRecord())).rejects.toThrow();
    expect(registrationStatus('test-match')).toBe('pending');
    expect(acknowledgedIds()).toEqual([]);
  });
  it.each([['ranking-failure', '/ranking', '/history'], ['history-failure', '/history', '/ranking']] as const)('isolates %s to its query endpoint', async (scenario, failing, working) => {
    setNetworkSettings({ scenario, seed: 42, latency: 0 });
    await expect(api.get(failing)).rejects.toThrow();
    await expect(api.get(working)).resolves.toHaveProperty('status', 200);
  });
  it('uses seeded latency and alternating delay for out-of-order responses', () => {
    const settings = { scenario: 'variable', seed: 17, latency: 0 } as const;
    setNetworkSettings(settings);
    const first = [nextLatency(settings), nextLatency(settings)];
    setNetworkSettings(settings);
    expect([nextLatency(settings), nextLatency(settings)]).toEqual(first);
    setNetworkSettings({ ...settings, scenario: 'out-of-order' });
    expect(nextLatency(getNetworkSettings())).toBeGreaterThan(nextLatency(getNetworkSettings()));
  });
  it('keeps timeout requests pending without pretending to persist them', async () => {
    api.defaults.timeout = 60;
    setNetworkSettings({ scenario: 'timeout', seed: 42, latency: 0 });
    await expect(registerMatch(makeRecord())).rejects.toThrow();
    expect(readRecords(STORAGE_KEYS.confirmed)).toEqual([]);
    expect(registrationStatus('test-match')).toBe('pending');
  });
  it('shares multiple-page history fixtures with the ranking', async () => {
    setNetworkSettings({ scenario: 'pages', seed: 42, latency: 0 });
    const history = (await api.get<PageResult<MatchRecord>>('/history')).data;
    const ranking = (await api.get<PageResult<MatchRecord>>('/ranking')).data;
    expect(history.total).toBe(18);
    expect(ranking.total).toBe(46);
    expect(ranking.items.some(record => record.playerId === PLAYER_ID)).toBe(true);
  });
  it('returns independent HTTP pages even when they arrive out of order', async () => {
    setNetworkSettings({ scenario: 'out-of-order', seed: 42, latency: 0 });
    const arrival: number[] = [];
    const results = await Promise.all([1, 2].map(async page => {
      const response = await api.get<PageResult<MatchRecord>>('/ranking', { params: { page } });
      arrival.push(response.data.page);
      return response.data;
    }));
    expect(arrival).toEqual([2, 1]);
    expect(results[0].page).toBe(1);
    expect(results[1].page).toBe(2);
    expect(results[0].items.some(record => results[1].items.some(other => other.id === record.id))).toBe(false);
  });
});
