import { useSyncExternalStore } from 'react';

/**
 * "Fresh paint" (UX §4.4): ids that just arrived live get `.is-fresh` for a few seconds.
 * A tiny module-level store so SSE handlers, mutations and lists share it.
 */

const HOLD_MS = 4_000;
const fresh = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function markFresh(...ids: Array<string | null | undefined>): void {
  let changed = false;
  for (const id of ids) {
    if (!id) continue;
    fresh.set(id, Date.now());
    changed = true;
    window.setTimeout(() => {
      const at = fresh.get(id);
      if (at !== undefined && Date.now() - at >= HOLD_MS - 50) {
        fresh.delete(id);
        emit();
      }
    }, HOLD_MS);
  }
  if (changed) emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Re-renders when the fresh set changes; returns a membership test. */
export function useFresh(): (id: string | null | undefined) => boolean {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
  return (id) => (id ? fresh.has(id) : false);
}
