/**
 * Pure, deterministic plan for the v2 demo day (ARCHITECTURE.md §7): permit holders plus gate
 * actions expressed in "natural" local minutes of the day. seed.ts maps the minutes onto real
 * instants before the seed time and replays them through the gate service.
 */

export type DemoGate = 'north' | 'south';

export interface DemoPerson {
  plateDisplay: string;
  holderName: string;
  holderEmail: string;
}

export interface DemoVisitor extends DemoPerson {
  note: string;
  /** Plate already created by the v1 seed (no new permit needed). */
  existingPermit?: boolean;
}

export interface DemoAction {
  minute: number; // natural local minute of the day (0–1439)
  plateDisplay: string;
  direction: 'in' | 'out';
  gateId: DemoGate;
}

export interface DemoPlan {
  staff: DemoPerson[]; // approved permanent permits
  visitors: DemoVisitor[]; // approved daily permits for today
  actions: DemoAction[]; // sorted by minute (stable, per-plate chronological)
  denied: { plateDisplay: string; entryMinute: number; resolvedMinute: number; note: string };
  /** v2 vehicles still parked after the last action. */
  parkedAtEnd: number;
}

/** Natural window of the demo day: 06:00 → 18:30 local. */
export const DEMO_DAY_START_MIN = 6 * 60;
export const DEMO_DAY_END_MIN = 18 * 60 + 30;
/** Upper bound for generated parked cars (keeps the seed fast for very large lots). */
export const DEMO_MAX_PARKED = 300;
/** Share of LOT_CAPACITY occupied at seed time (spec: roughly 45–60 %). */
export const DEMO_OCCUPANCY_TARGET = 0.52;

const NAMED_STAFF: [plate: string, name: string][] = [
  ['ZG 45 678', 'Lukas Meier'],
  ['ZH 245 118', 'Sophie Müller'],
  ['BE 412 907', 'Noah Schmid'],
  ['LU 88 214', 'Mia Graf'],
  ['AG 312 540', 'Luca Brunner'],
  ['SG 70 331', 'Emma Baumann'],
  ['BS 21 874', 'Leon Fischer'],
  ['BL 66 402', 'Lina Huber'],
  ['SO 19 285', 'David Steiner'],
  ['TG 55 709', 'Nina Gerber'],
  ['GR 30 616', 'Jonas Widmer'],
  ['VD 482 115', 'Laura Moser'],
  ['GE 710 244', 'Samuel Zimmermann'],
  ['TI 23 456', 'Chiara Bernasconi'],
  ['FR 91 337', 'Julien Favre'],
  ['SZ 60 812', 'Elena Wyss'],
  ['TI 118 902', 'Matteo Colombo'],
  ['SZ 14 227', 'Alina Kälin'],
  ['ZH 519 764', 'Fabian Roth'],
  ['VS 72 150', 'Céline Bonvin'],
  ['ZH 830 045', 'Tim Hofmann'],
  ['BE 263 381', 'Sarah Lüthi'],
  ['NE 48 290', 'Nicolas Perret'],
  ['SH 37 614', 'Anja Suter'],
];

const FIRST_NAMES = ['Simon', 'Jana', 'Marc', 'Sandra', 'Reto', 'Petra', 'Urs', 'Monika', 'Beat', 'Claudia', 'Andreas', 'Daniela', 'Stefan', 'Karin', 'Thomas', 'Ursula'];
const LAST_NAMES = ['Frey', 'Schneider', 'Bühler', 'Marti', 'Egli', 'Kunz', 'Sutter', 'Arnold', 'Meyer', 'Bachmann', 'Gasser', 'Tanner', 'Imhof', 'Studer', 'Zürcher', 'Ammann', 'Hess'];
const CANTONS = ['ZH', 'BE', 'LU', 'UR', 'SZ', 'OW', 'NW', 'GL', 'ZG', 'FR', 'SO', 'BS', 'BL', 'SH', 'AR', 'AI', 'SG', 'GR', 'AG', 'TG', 'TI', 'VD', 'VS', 'NE', 'GE', 'JU'];

/** Plates used by the v1 seed — never reused for generated staff. */
const V1_PLATES = ['ZH123456', 'BE98765', 'ZH555111', 'AG44321', 'SG1234', 'LU777', 'ZH999999'];

const VISITORS: DemoVisitor[] = [
  { plateDisplay: 'AR 29 105', holderName: 'Peter Vogel', holderEmail: 'peter.vogel@example.com', note: 'Client meeting' },
  { plateDisplay: 'ZH 555 111', holderName: 'Lea Keller', holderEmail: 'lea.keller@example.com', note: 'Visitor', existingPermit: true },
  { plateDisplay: 'NW 3 817', holderName: 'Martina Ammann', holderEmail: 'martina.ammann@example.com', note: 'Job interview' },
];

const DENIED = {
  plateDisplay: 'UR 6 150',
  entryMinute: 10 * 60 + 40,
  resolvedMinute: 10 * 60 + 52,
  exitMinute: 11 * 60 + 8,
  note: 'Courier delivery for reception – driver informed that visitors need a day permit.',
};

/** Small deterministic PRNG (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const plateKey = (display: string) => display.toUpperCase().replace(/[^A-Z0-9ÄÖÜ]/g, '');

function emailFor(name: string): string {
  const local = name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .trim()
    .replace(/\s+/g, '.');
  return `${local}@example.com`;
}

function formatNumber(n: number): string {
  return n < 1000 ? String(n) : `${Math.floor(n / 1000)} ${String(n % 1000).padStart(3, '0')}`;
}

function buildStaff(count: number, rand: () => number): DemoPerson[] {
  const used = new Set<string>(V1_PLATES);
  const staff: DemoPerson[] = [];
  for (const [plateDisplay, holderName] of NAMED_STAFF.slice(0, count)) {
    used.add(plateKey(plateDisplay));
    staff.push({ plateDisplay, holderName, holderEmail: emailFor(holderName) });
  }
  for (let i = staff.length; i < count; i++) {
    let plateDisplay: string;
    do {
      const canton = CANTONS[Math.floor(rand() * CANTONS.length)]!;
      plateDisplay = `${canton} ${formatNumber(1000 + Math.floor(rand() * 899_000))}`;
    } while (used.has(plateKey(plateDisplay)));
    used.add(plateKey(plateDisplay));
    const holderName = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length]}`;
    staff.push({ plateDisplay, holderName, holderEmail: emailFor(holderName).replace('@', `.${i}@`) });
  }
  return staff;
}

/**
 * Plan a plausible day: staff arrive in the morning (peak ~07:50), a few lunch trips, visitors
 * in the late morning, one denied courier, afternoon departures — ending with
 * ≈ DEMO_OCCUPANCY_TARGET × capacity vehicles parked (including the `alreadyParked` v1 cars).
 */
export function planDemoDay(capacity: number, alreadyParked = 2): DemoPlan {
  const rand = prng(20_260_930);
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const triangular = (lo: number, mode: number, hi: number) => {
    const u = rand();
    const f = (mode - lo) / (hi - lo);
    return Math.round(u < f ? lo + Math.sqrt(u * (hi - lo) * (mode - lo)) : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode)));
  };

  const target = Math.max(alreadyParked + 1, Math.round(capacity * DEMO_OCCUPANCY_TARGET));
  const visitorsParked = 1;
  const staffParked = Math.min(DEMO_MAX_PARKED, Math.max(0, target - alreadyParked - visitorsParked));
  const lunchNoReturn = Math.max(1, Math.round(staffParked * 0.1));
  const lunchReturn = Math.max(2, Math.round(staffParked * 0.15));
  const afternoonLeavers = Math.max(2, Math.round(staffParked * 0.12));
  const arriving = staffParked + lunchNoReturn + afternoonLeavers;
  const absent = 2; // a couple of permit holders don't come today
  const staff = buildStaff(Math.max(20, arriving + absent), rand);

  const actions: DemoAction[] = [];
  const add = (minute: number, plateDisplay: string, direction: 'in' | 'out', gateId: DemoGate) =>
    actions.push({ minute, plateDisplay, direction, gateId });
  const pickGate = (northShare: number): DemoGate => (rand() < northShare ? 'north' : 'south');

  staff.slice(0, arriving).forEach((p, i) => {
    add(triangular(400, 470, 565), p.plateDisplay, 'in', pickGate(0.65)); // 06:40–09:25, peak 07:50
    const lunchOut = i < lunchNoReturn + lunchReturn;
    if (lunchOut) {
      const out = between(705, 740); // 11:45–12:20
      add(out, p.plateDisplay, 'out', pickGate(0.4));
      if (i >= lunchNoReturn) add(out + between(40, 80), p.plateDisplay, 'in', pickGate(0.4));
    }
    const leavesInAfternoon = i >= lunchNoReturn && i < lunchNoReturn + afternoonLeavers;
    if (leavesInAfternoon) add(between(950, 1065), p.plateDisplay, 'out', pickGate(0.5)); // 15:50–17:45
  });

  // Visitors (north = reception): the first two leave in the afternoon, the last one stays.
  const visitorTimes: [number, number | null][] = [
    [575, 850], // 09:35 → 14:10
    [605, 940], // 10:05 → 15:40
    [650, null], // 10:50 → still parked
  ];
  VISITORS.forEach((v, i) => {
    const [arrive, leave] = visitorTimes[i]!;
    add(arrive, v.plateDisplay, 'in', 'north');
    if (leave !== null) add(leave, v.plateDisplay, 'out', 'north');
  });

  add(DENIED.entryMinute, DENIED.plateDisplay, 'in', 'north');
  add(DENIED.exitMinute, DENIED.plateDisplay, 'out', 'north');

  // Stable sort keeps each plate's events in chronological order.
  actions.sort((a, b) => a.minute - b.minute);

  return {
    staff,
    visitors: VISITORS,
    actions,
    denied: { plateDisplay: DENIED.plateDisplay, entryMinute: DENIED.entryMinute, resolvedMinute: DENIED.resolvedMinute, note: DENIED.note },
    parkedAtEnd: staffParked + visitorsParked,
  };
}
