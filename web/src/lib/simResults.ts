import { useSyncExternalStore } from 'react';
import type { CheckInResult, CheckOutResult } from '../api/types';
import { markFresh } from './fresh';
import { STORAGE_KEYS, storage } from './storage';

/** Simulator result cards, shared by the simulator page and the autopilot (UX §5.11, §12). */
export type SimResult =
  | { id: string; kind: 'in'; at: string; gate: string | null; res: CheckInResult; autopilot?: boolean }
  | { id: string; kind: 'out'; at: string; gate: string | null; res: CheckOutResult; autopilot?: boolean };

const MAX_RESULTS = 20;
let results: SimResult[] = storage.session.getJson<SimResult[]>(STORAGE_KEYS.simResults, []);
const listeners = new Set<() => void>();

function emit() {
  storage.session.setJson(STORAGE_KEYS.simResults, results);
  listeners.forEach((l) => l());
}

export function addSimResult(r: SimResult): void {
  markFresh(r.id);
  results = [r, ...results.filter((x) => x.id !== r.id)].slice(0, MAX_RESULTS);
  emit();
}

export function clearSimResults(): void {
  results = [];
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSimResults(): SimResult[] {
  return useSyncExternalStore(
    subscribe,
    () => results,
    () => results,
  );
}
