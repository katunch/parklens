/** Storage access that never throws (private mode, disabled storage, SSR). */

function wrap(get: () => Storage | undefined) {
  return {
    get(key: string): string | null {
      try {
        return get()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key: string, value: string): void {
      try {
        get()?.setItem(key, value);
      } catch {
        /* ignore */
      }
    },
    remove(key: string): void {
      try {
        get()?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
    getJson<T>(key: string, fallback: T): T {
      const raw = this.get(key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    setJson(key: string, value: unknown): void {
      this.set(key, JSON.stringify(value));
    },
  };
}

export const storage = {
  local: wrap(() => (typeof window === 'undefined' ? undefined : window.localStorage)),
  session: wrap(() => (typeof window === 'undefined' ? undefined : window.sessionStorage)),
};

export const STORAGE_KEYS = {
  token: 'parklens.token',
  alarmSound: 'parklens.alarmSound',
  simGate: 'parklens.simGate',
  dismissedAlarms: 'parklens.dismissedAlarms',
  simResults: 'parklens.simResults',
  recentPlates: 'parklens.recentPlates',
  autopilot: 'parklens.autopilot',
  wall: 'parklens.wall',
} as const;
