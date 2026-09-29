import { config } from './config.js';
import { withTransaction } from './db.js';
import { log } from './lib/log.js';
import { normalizePlate } from './lib/plate.js';
import { addDays, todayInTz, zonedTimeToUtc } from './lib/time.js';
import { checkInTx, checkOutTx } from './services/gate.js';
import { insertAdminPermit, insertRequestPermit } from './services/permits.js';
import { getFlag, setFlag } from './services/settings.js';

const HOUR = 3_600_000;

/**
 * Demo data (ARCHITECTURE.md §7). Runs once, guarded by settings.demo_seeded, in a single
 * transaction. Gate events go through the same check-in/check-out code as the real endpoints.
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

    // Gate events today
    const gate = (plate: string, fraction: number) => ({ plate, occurredAt: at(fraction), gateId: 'main' });
    await checkInTx(c, gate('ZH 123 456', 0.1), { webhook: false });
    await checkInTx(c, gate('BE 98 765', 0.3), { webhook: false });
    await checkOutTx(c, gate('BE 98 765', 0.6));
    await checkInTx(c, gate('ZH 999 999', 0.9), { webhook: false }); // → open unauthorized_entry alarm

    await setFlag('demo_seeded', c);
    return true;
  });

  if (seeded) log.info(`demo data seeded (today=${today}, tz=${tz})`);
  return seeded;
}
