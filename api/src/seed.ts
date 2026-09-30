import { config } from './config.js';
import { withTransaction } from './db.js';
import { log } from './lib/log.js';
import { normalizePlate } from './lib/plate.js';
import { addDays, todayInTz, zonedTimeToUtc } from './lib/time.js';
import { checkInTx, checkOutTx } from './services/gate.js';
import { insertAdminPermit, insertRequestPermit } from './services/permits.js';
import { getFlag, getLotSettings, setFlag } from './services/settings.js';
import { DEMO_DAY_END_MIN, DEMO_DAY_START_MIN, planDemoDay } from './seedPlan.js';

const HOUR = 3_600_000;
const MINUTE = 60_000;

/**
 * Maps natural local minutes of the demo day (06:00–18:30) onto real instants strictly before `now`.
 * After 18:30 the natural times are used as-is; earlier in the day the pattern is compressed into the
 * elapsed part of the day so nothing lies in the future.
 */
export function demoClock(today: string, tz: string, now: Date): (minute: number) => Date {
  const midnight = zonedTimeToUtc(today, '00:00', tz).getTime();
  const natStart = zonedTimeToUtc(today, '06:00', tz).getTime();
  const natEnd = zonedTimeToUtc(today, '18:30', tz).getTime();
  const latest = now.getTime() - MINUTE;
  let from = natStart;
  let to = natEnd;
  if (latest < natEnd) {
    to = latest;
    if (latest - natStart < 3 * HOUR) from = midnight + Math.min(5 * MINUTE, Math.max(0, latest - midnight) * 0.05);
    if (to <= from) {
      from = midnight;
      to = Math.max(midnight, now.getTime() - 1000);
    }
  }
  const span = DEMO_DAY_END_MIN - DEMO_DAY_START_MIN;
  return (minute: number) => new Date(Math.round(from + ((minute - DEMO_DAY_START_MIN) / span) * (to - from)));
}

/**
 * Demo data (ARCHITECTURE.md §7, v1 records + v2 "day of traffic"). Runs once, guarded by
 * settings.demo_seeded, in a single transaction. Gate events go through the same check-in/check-out
 * code as the real endpoints (with explicit past `occurredAt`), without SSE or webhooks.
 * Returns true when data was seeded.
 */
export async function seedDemoData(now: Date = new Date()): Promise<boolean> {
  const tz = config.timezone;
  const today = todayInTz(tz, now);
  const tomorrow = addDays(today, 1);

  // Spread today's gate events over (at most) the last 4 hours, never before local midnight.
  const midnight = zonedTimeToUtc(today, '00:00', tz).getTime();
  const span = Math.max(0, Math.min(now.getTime() - midnight, 4 * HOUR));
  const at = (fraction: number) => new Date(now.getTime() - span + Math.round(fraction * span));

  const seeded = await withTransaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('parklens:demo-seed'))");
    if (await getFlag('demo_seeded', c)) return false;

    const admin = await c.query<{ id: string }>(
      'SELECT id FROM admins ORDER BY (lower(email) = lower($1)) DESC, created_at LIMIT 1',
      [config.adminEmail],
    );
    const adminId = admin.rows[0]?.id ?? null;

    const adminPermit = (plateDisplay: string, holderName: string, holderEmail: string, validDate: string | null, note: string | null = null) =>
      insertAdminPermit(c, {
        plate: normalizePlate(plateDisplay),
        plateDisplay,
        holderName,
        holderEmail,
        type: validDate ? 'daily' : 'permanent',
        validDate,
        requestNote: note,
        adminId,
      });

    // Approved permanent + approved daily for today
    await adminPermit('ZH 123 456', 'Anna Muster', 'anna.muster@example.com', null);
    await adminPermit('BE 98 765', 'Marco Rossi', 'marco.rossi@example.com', null);
    await adminPermit('ZH 555 111', 'Lea Keller', 'lea.keller@example.com', today, 'Visitor');

    // Pending public requests
    const request = (
      plateDisplay: string,
      holderName: string,
      holderEmail: string,
      validDate: string | null,
      requestNote: string,
      createdAt: Date,
    ) =>
      insertRequestPermit(c, {
        plate: normalizePlate(plateDisplay),
        plateDisplay,
        holderName,
        holderEmail,
        type: validDate ? 'daily' : 'permanent',
        validDate,
        requestNote,
        createdAt,
      });
    await request('AG 44 321', 'Tom Weber', 'tom.weber@example.com', tomorrow, 'Customer workshop', new Date(now.getTime() - 3 * HOUR));
    await request('SG 1 234', 'Sara Frei', 'sara.frei@example.com', null, 'New team member, commutes by car', new Date(now.getTime() - HOUR));

    // Rejected request
    const rejected = await request('LU 777', 'Max Beispiel', 'max.beispiel@example.com', null, 'Occasional visits', new Date(now.getTime() - 30 * HOUR));
    await c.query(
      `UPDATE permits SET status = 'rejected', decision_note = $2, decided_at = $3, decided_by = $4, updated_at = $3
       WHERE id = $1`,
      [rejected.id, 'No permanent spaces available – please request a daily permit when needed.', new Date(now.getTime() - 26 * HOUR), adminId],
    );

    // v2: more permit holders and a plausible day of traffic before `now` (gates north/south)
    const { capacity } = await getLotSettings(c);
    const plan = planDemoDay(capacity, 2);
    for (const p of plan.staff) await adminPermit(p.plateDisplay, p.holderName, p.holderEmail, null);
    for (const v of plan.visitors) {
      if (!v.existingPermit) await adminPermit(v.plateDisplay, v.holderName, v.holderEmail, today, v.note);
    }
    const clock = demoClock(today, tz, now);
    for (const a of plan.actions) {
      const input = { plate: a.plateDisplay, occurredAt: clock(a.minute), gateId: a.gateId };
      if (a.direction === 'out') {
        await checkOutTx(c, input);
        continue;
      }
      const { result } = await checkInTx(c, input, { webhook: false });
      if (result.alarmId && a.plateDisplay === plan.denied.plateDisplay) {
        // earlier denied entry, already handled by the admin
        await c.query(
          `UPDATE alarms SET status = 'resolved', resolved_at = $2, resolved_by = $3, resolution_note = $4 WHERE id = $1`,
          [result.alarmId, clock(plan.denied.resolvedMinute), adminId, plan.denied.note],
        );
      }
    }

    // v1 gate events (last few hours): ZH 123 456 parked, BE 98 765 in+out, ZH 999 999 → open alarm
    const gate = (plate: string, fraction: number, gateId: string) => ({ plate, occurredAt: at(fraction), gateId });
    await checkInTx(c, gate('ZH 123 456', 0.1, 'north'), { webhook: false });
    await checkInTx(c, gate('BE 98 765', 0.3, 'south'), { webhook: false });
    await checkOutTx(c, gate('BE 98 765', 0.6, 'south'));
    await checkInTx(c, gate('ZH 999 999', 0.9, 'north'), { webhook: false }); // → open unauthorized_entry alarm

    await setFlag('demo_seeded', c);
    return true;
  });

  if (seeded) log.info(`demo data seeded (today=${today}, tz=${tz})`);
  return seeded;
}
