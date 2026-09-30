import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS, storage } from './storage';

/** Alarm ids hidden from the banner in this browser session (UX §4.2), shared with the takeover. */
let ids: string[] = storage.session.getJson<string[]>(STORAGE_KEYS.dismissedAlarms, []);
const listeners = new Set<() => void>();

export function dismissAlarm(id: string): void {
  if (ids.includes(id)) return;
  ids = [...ids, id].slice(-200);
  storage.session.setJson(STORAGE_KEYS.dismissedAlarms, ids);
  listeners.forEach((l) => l());
}

/** Re-read after logout (sessionStorage cleared). */
export function resetDismissed(): void {
  ids = [];
  listeners.forEach((l) => l());
}

export function useDismissedAlarms(): string[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => ids,
    () => ids,
  );
}
