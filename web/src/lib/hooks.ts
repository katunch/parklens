import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/** `window.matchMedia` as React state. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsWide = () => useMediaQuery('(min-width: 720px)');
export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');

/** Debounced copy of a value. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return v;
}

// ---- one shared ticker for relative times and live durations ---------------

const TICK_MS = 30_000;
let now = Date.now();
const tickListeners = new Set<() => void>();
let tickTimer: number | undefined;

function subscribeTick(cb: () => void) {
  tickListeners.add(cb);
  if (tickTimer === undefined) {
    now = Date.now();
    tickTimer = window.setInterval(() => {
      now = Date.now();
      tickListeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    tickListeners.delete(cb);
    if (tickListeners.size === 0 && tickTimer !== undefined) {
      window.clearInterval(tickTimer);
      tickTimer = undefined;
    }
  };
}

/** Current time, re-rendering every 30 s (one timer for the whole app). */
export function useNow(): Date {
  useSyncExternalStore(
    subscribeTick,
    () => now,
    () => now,
  );
  return new Date();
}

/** True once `active` has been true for `delayMs` (skeletons only after 300 ms). */
export function useDelayedFlag(active: boolean, delayMs = 300): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const id = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(id);
  }, [active, delayMs]);
  return active && shown;
}

/** Set the document title while mounted. */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}
