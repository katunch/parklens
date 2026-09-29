import type { ParkingSession } from '../api/types';

/** Parked cars: unauthorized first, then newest entry first (UX §5.6 / §5.10). */
export function sortParked(items: ParkingSession[]): ParkingSession[] {
  return [...items].sort((a, b) => {
    if (a.authorized !== b.authorized) return a.authorized ? 1 : -1;
    return b.enteredAt.localeCompare(a.enteredAt);
  });
}
