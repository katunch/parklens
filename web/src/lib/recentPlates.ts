import { normalizePlate } from './plate';
import { STORAGE_KEYS, storage } from './storage';

const MAX = 5;

/** Recently opened plates for the command palette (UX §8: max 5 normalized plates). */
export function getRecentPlates(): string[] {
  return storage.local.getJson<string[]>(STORAGE_KEYS.recentPlates, []).filter((p) => typeof p === 'string').slice(0, MAX);
}

export function addRecentPlate(plate: string): void {
  const n = normalizePlate(plate);
  if (!n) return;
  storage.local.setJson(STORAGE_KEYS.recentPlates, [n, ...getRecentPlates().filter((p) => p !== n)].slice(0, MAX));
}
