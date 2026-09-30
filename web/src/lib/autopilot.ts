import { formatPlate, normalizePlate } from './plate';

/**
 * Simulator autopilot planning (UX §12). Pure: every random choice goes through `rand`.
 */

export type Pace = 'calm' | 'busy';

export interface AutopilotPermit {
  plate: string;
  plateDisplay?: string;
}

export interface AutopilotParked {
  plate: string;
  authorized: boolean;
  enteredAt: string;
}

export interface AutopilotGate {
  gateId: string | null;
  eventsToday: number;
}

export interface PlanInput {
  permitted: AutopilotPermit[];
  parked: AutopilotParked[];
  capacity: number;
  now: number;
  lastUnknownAt: number | null;
  gates: AutopilotGate[];
}

export interface Plan {
  kind: 'in' | 'out';
  /** Plate as sent to the gate endpoint (display form). */
  plate: string;
  gateId: string;
  unknown: boolean;
}

export const UNKNOWN_PROBABILITY = 1 / 12;
export const UNKNOWN_MIN_GAP_MS = 60_000;
export const UNKNOWN_MIN_STAY_MS = 5 * 60_000;
const CANTONS = ['ZH', 'BE', 'LU', 'SG', 'AG', 'TG', 'VD', 'GE', 'TI', 'BS'] as const;

/** Delay until the next tick: calm 8–15 s, busy 3–6 s. */
export function nextDelay(pace: Pace, rand: () => number = Math.random): number {
  const [a, b] = pace === 'busy' ? [3_000, 6_000] : [8_000, 15_000];
  return Math.round(a + rand() * (b - a));
}

/** Check-out probability p = clamp(0.15 + (r − 0.5) × 1.2, 0.05, 0.8) for occupancy ratio r. */
export function checkoutProbability(ratio: number): number {
  return Math.min(0.8, Math.max(0.05, 0.15 + (ratio - 0.5) * 1.2));
}

function pick<T>(items: T[], rand: () => number): T | undefined {
  if (!items.length) return undefined;
  return items[Math.min(items.length - 1, Math.floor(rand() * items.length))];
}

/** Gate: north 60 % / south 40 %; with other known gates, weighted by `eventsToday`. */
export function pickGate(gates: AutopilotGate[], rand: () => number = Math.random): string {
  const named = gates.filter((g): g is AutopilotGate & { gateId: string } => Boolean(g.gateId));
  const others = named.filter((g) => g.gateId !== 'north' && g.gateId !== 'south');
  if (others.length === 0) return rand() < 0.6 ? 'north' : 'south';
  const weights = named.map((g) => Math.max(1, g.eventsToday));
  const sum = weights.reduce((a, b) => a + b, 0);
  let x = rand() * sum;
  for (let i = 0; i < named.length; i++) {
    x -= weights[i]!;
    if (x < 0) return named[i]!.gateId;
  }
  return named[named.length - 1]!.gateId;
}

/** A random canton plate that is neither permitted nor parked. */
export function randomUnknownPlate(taken: Set<string>, rand: () => number = Math.random): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const canton = pick([...CANTONS], rand) ?? 'ZH';
    const len = 1 + Math.floor(rand() * 6);
    let digits = String(1 + Math.floor(rand() * 9));
    while (digits.length < len) digits += String(Math.floor(rand() * 10));
    const plate = canton + digits;
    if (!taken.has(plate)) return formatPlate(plate);
  }
  return formatPlate(`ZZ${Math.floor(rand() * 900_000) + 100_000}`);
}

/** Decide the next autopilot action, or null when there is nothing sensible to do. */
export function planStep(input: PlanInput, rand: () => number = Math.random): Plan | null {
  const { permitted, parked, capacity, now, lastUnknownAt, gates } = input;
  const ratio = parked.length / Math.max(1, capacity);
  const parkedSet = new Set(parked.map((p) => normalizePlate(p.plate)));
  const forceOut = ratio >= 0.95;
  const forceIn = parked.length === 0;
  const wantOut = forceOut || (!forceIn && rand() < checkoutProbability(ratio));
  const gateId = pickGate(gates, rand);

  const checkOut = (): Plan | null => {
    const authorized = parked.filter((p) => p.authorized);
    const unknownEligible = parked.filter((p) => !p.authorized && now - Date.parse(p.enteredAt) >= UNKNOWN_MIN_STAY_MS);
    // Prefer authorized cars; eligible unknown cars leave now and then.
    const pool = unknownEligible.length && (authorized.length === 0 || rand() < 0.2) ? unknownEligible : authorized;
    const car = pick(pool, rand);
    return car ? { kind: 'out', plate: formatPlate(car.plate), gateId, unknown: !car.authorized } : null;
  };

  const checkIn = (): Plan | null => {
    const unknownAllowed = lastUnknownAt === null || now - lastUnknownAt >= UNKNOWN_MIN_GAP_MS;
    if (unknownAllowed && rand() < UNKNOWN_PROBABILITY) {
      const taken = new Set([...permitted.map((p) => normalizePlate(p.plate)), ...parkedSet]);
      return { kind: 'in', plate: randomUnknownPlate(taken, rand), gateId, unknown: true };
    }
    const free = permitted.filter((p) => !parkedSet.has(normalizePlate(p.plate)));
    const p = pick(free, rand);
    return p ? { kind: 'in', plate: p.plateDisplay?.trim() || formatPlate(p.plate), gateId, unknown: false } : null;
  };

  if (wantOut) return checkOut() ?? (forceOut ? null : checkIn());
  return checkIn() ?? checkOut();
}
