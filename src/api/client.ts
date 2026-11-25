import { useMemo, useSyncExternalStore } from 'react';
import axios from 'axios';
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import type { GameConfig } from '../game/config';
import { configurationKey, isMatchRecord, PLAYER_ID, type MatchRecord, type PageResult } from './contracts';
import { acknowledgeMatch, acknowledgedIds, parseRecords, readRecords, readStorage, removePending, saveLastMatch, STORAGE_KEYS, subscribeData, upsertRecord } from './storage';

export { getLastMatch, saveLastMatch } from './storage';
export const api = axios.create({ baseURL: '/api', timeout: 2500 });
function retryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && (!axios.isAxiosError(error) || !error.response || error.response.status >= 500);
}
export const queryClient = new QueryClient({ defaultOptions: {
  queries: { staleTime: 0, retry: retryQuery, retryDelay: 400, refetchOnWindowFocus: true, refetchOnMount: 'always' },
  mutations: { retry: false },
} });

export function enqueueMatch(record: MatchRecord): void {
  // Queue before starting HTTP: refresh cannot lose an unacknowledged match.
  upsertRecord(STORAGE_KEYS.pending, record);
  saveLastMatch(record);
}
const inFlight = new Map<string, Promise<MatchRecord>>();
const registrationControllers = new Map<string, AbortController>();
export function cancelRegistrations(): void {
  for (const controller of registrationControllers.values()) controller.abort();
}
export async function registerMatch(record: MatchRecord): Promise<MatchRecord> {
  const existing = inFlight.get(record.id);
  if (existing) return existing;
  enqueueMatch(record);
  const controller = new AbortController();
  registrationControllers.set(record.id, controller);
  const task = api.post<MatchRecord>('/history', record, { headers: { 'Idempotency-Key': record.id }, signal: controller.signal })
    .then(response => {
      if (!isMatchRecord(response.data) || response.data.id !== record.id) throw new Error('The service returned an invalid registration acknowledgement. Please retry.');
      acknowledgeMatch(record.id);
      removePending(record.id);
      return response.data;
    }).finally(() => { inFlight.delete(record.id); registrationControllers.delete(record.id); });
  inFlight.set(record.id, task);
  return task;
}
export async function refreshRecords(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['ranking'] }),
    queryClient.invalidateQueries({ queryKey: ['history'] }),
  ]);
}
export function useRegisterMatch() {
  return useMutation({ mutationFn: registerMatch, onSuccess: refreshRecords });
}
export function usePendingMatches(): MatchRecord[] {
  const serialized = useSyncExternalStore(subscribeData, () => readStorage(STORAGE_KEYS.pending) ?? '[]', () => '[]');
  return useMemo(() => parseRecords(serialized), [serialized]);
}
export function registrationStatus(id: string): 'pending' | 'confirmed' | 'unknown' {
  // Only a successful HTTP acknowledgement confirms registration to the client.
  if (readRecords(STORAGE_KEYS.pending).some(record => record.id === id)) return 'pending';
  return acknowledgedIds().includes(id) ? 'confirmed' : 'unknown';
}
export function useRegistrationStatus(id: string): 'pending' | 'confirmed' | 'unknown' {
  return useSyncExternalStore(subscribeData, () => registrationStatus(id), () => 'unknown');
}
export function useRetryPending() {
  return useMutation({ mutationFn: async () => {
    const results = await Promise.allSettled(readRecords(STORAGE_KEYS.pending).map(registerMatch));
    const failed = results.filter(result => result.status === 'rejected').length;
    await refreshRecords();
    if (failed) throw new Error(`${failed} match${failed === 1 ? '' : 'es'} still pending. Restore the connection and retry.`);
    return results.length;
  } });
}
export function useRecords(kind: 'ranking' | 'history', page: number, config: GameConfig) {
  return useQuery({
    queryKey: [kind, page, configurationKey(config), PLAYER_ID],
    queryFn: async ({ signal }) => (await api.get<PageResult<MatchRecord>>(`/${kind}`, {
      params: { page, playerId: PLAYER_ID, config: configurationKey(config) }, signal,
    })).data,
  });
}
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return 'The service took too long to respond. Your pending match is safe; try again.';
    if (error.response) return `The service returned HTTP ${error.response.status}. Please try again.`;
    return 'Could not reach the service. Please check the network scenario and try again.';
  }
  return error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.';
}
