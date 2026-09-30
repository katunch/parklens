/**
 * Symbolic lot slots (UX §5.6 Lot map): one tile per active session.
 * - First assignment: sessions sorted by `enteredAt` ascending take slots 0…n−1.
 * - Later: existing sessions keep their slot; a closed session frees its slot; a new session takes the
 *   first free slot, except that a new session for the same plate as a just-closed one (superseded
 *   check-in) keeps that plate's slot.
 */

export interface SlotSession {
  id: string;
  plate: string;
  enteredAt: string;
}

export interface SlotEntry {
  slot: number;
  plate: string;
}

export type SlotMap = Map<string, SlotEntry>;

export function assignSlots(prev: SlotMap | null, sessions: SlotSession[]): SlotMap {
  const sorted = [...sessions].sort((a, b) => a.enteredAt.localeCompare(b.enteredAt) || a.id.localeCompare(b.id));
  const next: SlotMap = new Map();
  if (!prev || prev.size === 0) {
    sorted.forEach((s, i) => next.set(s.id, { slot: i, plate: s.plate }));
    return next;
  }
  const present = new Set(sorted.map((s) => s.id));
  const used = new Set<number>();
  for (const s of sorted) {
    const e = prev.get(s.id);
    if (e) {
      next.set(s.id, e);
      used.add(e.slot);
    }
  }
  // Slots of sessions that disappeared, by plate (superseded check-ins keep their slot).
  const freedByPlate = new Map<string, number>();
  for (const [id, e] of prev) {
    if (!present.has(id) && !used.has(e.slot)) freedByPlate.set(e.plate, e.slot);
  }
  for (const s of sorted) {
    if (next.has(s.id)) continue;
    let slot = freedByPlate.get(s.plate);
    if (slot === undefined || used.has(slot)) {
      slot = 0;
      while (used.has(slot)) slot++;
    }
    used.add(slot);
    next.set(s.id, { slot, plate: s.plate });
  }
  return next;
}
