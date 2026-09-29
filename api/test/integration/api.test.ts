import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool, query } from '../../src/db.js';
import { runOverstayCheck } from '../../src/jobs/overstay.js';
import { addDays, todayInTz, zonedTimeToUtc } from '../../src/lib/time.js';
import { migrate } from '../../src/migrate.js';
import { seedDemoData } from '../../src/seed.js';
import { ensureInitialAdmin } from '../../src/services/admins.js';
import { initSettings } from '../../src/services/settings.js';
import { waitForWebhooks } from '../../src/services/webhook.js';

const TZ = 'Europe/Zurich';
const GATE_KEY = 'test-gate-key';

describe.skipIf(!process.env['TEST_DATABASE_URL'])('API integration (Postgres)', () => {
  const app = createApp();
  let token = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const today = () => todayInTz(TZ);

  const checkIn = (plate: string, extra: Record<string, unknown> = {}) =>
    request(app).post('/api/gate/check-in').set('X-API-Key', GATE_KEY).send({ plate, gateId: 'test', ...extra });
  const checkOut = (plate: string, extra: Record<string, unknown> = {}) =>
    request(app).post('/api/gate/check-out').set('X-API-Key', GATE_KEY).send({ plate, gateId: 'test', ...extra });

  beforeAll(async () => {
    await query('DROP SCHEMA IF EXISTS public CASCADE');
    await query('CREATE SCHEMA public');
    await migrate();
    await initSettings();
    await ensureInitialAdmin();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ADMIN@test.local', password: 'test-admin-password' });
    expect(res.status).toBe(200);
    token = res.body.token;
  });

  afterAll(async () => {
    await waitForWebhooks();
    await closePool();
  });

  // -------------------------------------------------------------------------
  describe('basics & auth', () => {
    it('GET /api/health', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok', db: 'ok', timezone: TZ });
    });

    it('login returns token + admin; wrong password is 401 INVALID_CREDENTIALS', async () => {
      const bad = await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: 'wrong' });
      expect(bad.status).toBe(401);
      expect(bad.body).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: expect.any(String) } });

      const me = await request(app).get('/api/auth/me').set(auth());
      expect(me.status).toBe(200);
      expect(me.body).toEqual({
        id: expect.any(String),
        email: 'admin@test.local',
        name: 'Test Admin',
        createdAt: expect.any(String),
        lastLoginAt: expect.any(String),
      });
    });

    it('admin endpoints require a bearer token', async () => {
      const res = await request(app).get('/api/permits');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      const bad = await request(app).get('/api/permits').set('Authorization', 'Bearer nope');
      expect(bad.status).toBe(401);
    });

    it('gate endpoints require X-API-Key or admin token', async () => {
      expect((await request(app).post('/api/gate/check-in').send({ plate: 'ZZ1' })).status).toBe(401);
      expect((await request(app).post('/api/gate/check-in').set('X-API-Key', 'wrong').send({ plate: 'ZZ1' })).status).toBe(401);
      const viaAdmin = await request(app).post('/api/gate/check-out').set(auth()).send({ plate: 'ZZ1' });
      expect(viaAdmin.status).toBe(200);
    });

    it('uses the standard error format', async () => {
      const validation = await request(app).post('/api/permits').set(auth()).send({ type: 'daily' });
      expect(validation.status).toBe(400);
      expect(validation.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(validation.body.error.details)).toBe(true);

      const plate = await request(app).post('/api/permits').set(auth()).send({ plate: 'X', holderName: 'A', type: 'permanent' });
      expect(plate.status).toBe(422);
      expect(plate.body.error.code).toBe('INVALID_PLATE');

      const json = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
      expect(json.status).toBe(400);
      expect(json.body.error.code).toBe('VALIDATION_ERROR');

      const route = await request(app).get('/api/nope');
      expect(route.status).toBe(404);
      expect(route.body.error.code).toBe('NOT_FOUND');

      const permit = await request(app).get('/api/permits/not-a-uuid').set(auth());
      expect(permit.status).toBe(404);
      expect(permit.body.error.code).toBe('NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  describe('permits & gate', () => {
    it('creates a permanent permit (409 ALREADY_PERMITTED on duplicate)', async () => {
      const res = await request(app)
        .post('/api/permits')
        .set(auth())
        .send({ plate: 'zh 100-200', holderName: 'Anna Muster', holderEmail: 'anna@example.com', type: 'permanent' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        plate: 'ZH100200',
        plateDisplay: 'zh 100-200',
        holderName: 'Anna Muster',
        holderEmail: 'anna@example.com',
        type: 'permanent',
        validDate: null,
        status: 'approved',
        source: 'admin',
        reference: null,
        decidedByName: 'Test Admin',
        isActiveToday: true,
        isDatePassed: false,
      });

      const dup = await request(app).post('/api/permits').set(auth()).send({ plate: 'ZH100200', holderName: 'X', type: 'permanent' });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('ALREADY_PERMITTED');

      const list = await request(app).get('/api/permits?q=zh 100&activeToday=true').set(auth());
      expect(list.body.total).toBe(1);
      expect(list.body.items[0].id).toBe(res.body.id);
    });

    it('check-in with a permanent permit is allowed', async () => {
      const res = await checkIn('ZH 100 200');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        allowed: true,
        plate: 'ZH100200',
        reason: 'PERMANENT_PERMIT',
        permit: { id: expect.any(String), type: 'permanent', holderName: 'Anna Muster', validDate: null },
        eventId: expect.any(String),
        sessionId: expect.any(String),
        alarmId: null,
      });
    });

    it('check-in without a permit raises an unauthorized_entry alarm', async () => {
      const res = await checkIn('XX 999');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ allowed: false, plate: 'XX999', reason: 'NO_VALID_PERMIT', permit: null });
      expect(res.body.alarmId).toEqual(expect.any(String));

      const alarms = await request(app).get('/api/alarms?status=open&plate=xx999').set(auth());
      expect(alarms.status).toBe(200);
      expect(alarms.body.total).toBe(1);
      expect(alarms.body.items[0]).toEqual({
        id: res.body.alarmId,
        type: 'unauthorized_entry',
        plate: 'XX999',
        status: 'open',
        occurredAt: expect.any(String),
        gateId: 'test',
        sessionId: res.body.sessionId,
        isStillParked: true,
        previousAlarmCount: 0,
        resolvedAt: null,
        resolvedByName: null,
        resolutionNote: null,
        webhookStatus: 'skipped',
        webhookError: null,
        createdAt: expect.any(String),
      });

      const events = await request(app).get('/api/gate-events?plate=XX999').set(auth());
      expect(events.body.items[0]).toMatchObject({
        id: res.body.eventId,
        plate: 'XX999',
        plateRaw: 'XX 999',
        direction: 'in',
        authorized: false,
        permit: null,
        sessionId: res.body.sessionId,
        alarmId: res.body.alarmId,
      });

      const sessions = await request(app).get('/api/sessions?active=true&plate=XX999').set(auth());
      expect(sessions.body.items[0]).toMatchObject({ id: res.body.sessionId, authorized: false, openAlarmId: res.body.alarmId });
    });

    it('a second check-in supersedes the open session', async () => {
      const first = await checkIn('SU 1');
      const second = await checkIn('SU 1');
      const sessions = await request(app).get('/api/sessions?plate=SU1').set(auth());
      expect(sessions.body.total).toBe(2);
      const open = sessions.body.items.filter((s: { exitedAt: string | null }) => s.exitedAt === null);
      expect(open).toHaveLength(1);
      expect(open[0].id).toBe(second.body.sessionId);
      expect(first.body.sessionId).not.toBe(second.body.sessionId);
    });

    it('check-out closes the session and reports the duration', async () => {
      const enteredAt = new Date(Date.now() - 90 * 60_000);
      const inRes = await checkIn('ZH 100 200', { occurredAt: enteredAt.toISOString() });
      const out = await checkOut('zh100200', { occurredAt: new Date(enteredAt.getTime() + 90 * 60_000 + 5_000).toISOString() });
      expect(out.status).toBe(200);
      expect(out.body).toEqual({ plate: 'ZH100200', eventId: expect.any(String), sessionId: inRes.body.sessionId, durationMinutes: 90 });

      const noSession = await checkOut('NO 1');
      expect(noSession.body).toEqual({ plate: 'NO1', eventId: expect.any(String), sessionId: null, durationMinutes: null });

      const outEvents = await request(app).get('/api/gate-events?direction=out&plate=ZH100200').set(auth());
      expect(outEvents.body.items[0]).toMatchObject({ direction: 'out', authorized: null, sessionId: inRes.body.sessionId });
    });

    it('rejects invalid plates at the gate with 422', async () => {
      const res = await checkIn('!');
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('INVALID_PLATE');
    });

    it('a daily permit is only valid on its date (in APP_TIMEZONE)', async () => {
      const tomorrow = addDays(today(), 1);
      const created = await request(app)
        .post('/api/permits')
        .set(auth())
        .send({ plate: 'DA 1', holderName: 'Day Visitor', type: 'daily', validDate: tomorrow });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ validDate: tomorrow, isActiveToday: false, isDatePassed: false });

      const now = await checkIn('DA 1');
      expect(now.body).toMatchObject({ allowed: false, reason: 'NO_VALID_PERMIT' });

      const tomorrowNoon = zonedTimeToUtc(tomorrow, '12:00', TZ);
      const later = await checkIn('DA 1', { occurredAt: tomorrowNoon.toISOString() });
      expect(later.body).toMatchObject({ allowed: true, reason: 'DAILY_PERMIT', permit: { type: 'daily', validDate: tomorrow } });

      const dayAfter = zonedTimeToUtc(addDays(tomorrow, 1), '00:00', TZ);
      const tooLate = await checkIn('DA 1', { occurredAt: dayAfter.toISOString() });
      expect(tooLate.body.allowed).toBe(false);

      const past = await request(app)
        .post('/api/permits')
        .set(auth())
        .send({ plate: 'DA 2', holderName: 'X', type: 'daily', validDate: addDays(today(), -1) });
      expect(past.status).toBe(422);
      expect(past.body.error.code).toBe('DATE_IN_PAST');

      const far = await request(app)
        .post('/api/permits')
        .set(auth())
        .send({ plate: 'DA 2', holderName: 'X', type: 'daily', validDate: addDays(today(), 366) });
      expect(far.status).toBe(422);
      expect(far.body.error.code).toBe('DATE_TOO_FAR');
    });
  });

  // -------------------------------------------------------------------------
  describe('public requests', () => {
    it('request → status → approve → status', async () => {
      const body = {
        plate: 'ag 44-321',
        holderName: 'Tom Weber',
        holderEmail: 'tom@example.com',
        type: 'daily',
        validDate: addDays(today(), 1),
        requestNote: 'Workshop',
      };
      const created = await request(app).post('/api/public/requests').send(body);
      expect(created.status).toBe(201);
      expect(created.body).toEqual({ reference: expect.stringMatching(/^PL-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/), token: expect.any(String), status: 'pending' });
      expect(created.body.token).toMatch(/^[A-Za-z0-9_-]{32}$/);

      const dup = await request(app).post('/api/public/requests').send(body);
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('DUPLICATE_REQUEST');

      const status = await request(app).get(`/api/public/requests/${created.body.token}`);
      expect(status.status).toBe(200);
      expect(status.body).toEqual({
        reference: created.body.reference,
        plate: 'AG44321',
        plateDisplay: 'ag 44-321',
        holderName: 'Tom Weber',
        type: 'daily',
        validDate: body.validDate,
        status: 'pending',
        decisionNote: null,
        createdAt: expect.any(String),
        decidedAt: null,
      });

      const lookup = await request(app)
        .post('/api/public/requests/lookup')
        .send({ reference: created.body.reference.toLowerCase(), plate: 'AG44321' });
      expect(lookup.status).toBe(200);
      expect(lookup.body.token).toBe(created.body.token);
      const wrongPlate = await request(app).post('/api/public/requests/lookup').send({ reference: created.body.reference, plate: 'AG1' });
      expect(wrongPlate.status).toBe(404);

      const pending = await request(app).get('/api/permits?status=pending').set(auth());
      const item = pending.body.items.find((p: { reference: string }) => p.reference === created.body.reference);
      expect(item).toMatchObject({ status: 'pending', source: 'request', requestNote: 'Workshop' });

      const approved = await request(app).post(`/api/permits/${item.id}/approve`).set(auth()).send({ decisionNote: 'Welcome' });
      expect(approved.status).toBe(200);
      expect(approved.body).toMatchObject({ status: 'approved', decisionNote: 'Welcome', decidedByName: 'Test Admin' });

      const again = await request(app).post(`/api/permits/${item.id}/approve`).set(auth()).send({});
      expect(again.status).toBe(422);
      expect(again.body.error.code).toBe('INVALID_STATE');

      const after = await request(app).get(`/api/public/requests/${created.body.token}`);
      expect(after.body).toMatchObject({ status: 'approved', decisionNote: 'Welcome', decidedAt: expect.any(String) });

      const already = await request(app).post('/api/public/requests').send(body);
      expect(already.status).toBe(409);
      expect(already.body.error.code).toBe('ALREADY_PERMITTED');

      expect((await request(app).get('/api/public/requests/doesnotexistdoesnotexist12')).status).toBe(404);
    });

    it('validates request dates (max 60 days ahead)', async () => {
      const far = await request(app).post('/api/public/requests').send({
        plate: 'FA 1',
        holderName: 'Far',
        holderEmail: 'far@example.com',
        type: 'daily',
        validDate: addDays(today(), 61),
      });
      expect(far.status).toBe(422);
      expect(far.body.error.code).toBe('DATE_TOO_FAR');
    });

    it('reject and revoke only from the right state', async () => {
      const created = await request(app)
        .post('/api/public/requests')
        .send({ plate: 'RJ 1', holderName: 'Rex', holderEmail: 'rex@example.com', type: 'permanent' });
      const list = await request(app).get('/api/permits?q=RJ1').set(auth());
      const id = list.body.items[0].id;
      expect((await request(app).post(`/api/permits/${id}/revoke`).set(auth()).send({})).status).toBe(422);
      const rejected = await request(app).post(`/api/permits/${id}/reject`).set(auth()).send({ decisionNote: 'No space' });
      expect(rejected.body.status).toBe('rejected');
      const status = await request(app).get(`/api/public/requests/${created.body.token}`);
      expect(status.body).toMatchObject({ status: 'rejected', decisionNote: 'No space' });

      const permit = await request(app).post('/api/permits').set(auth()).send({ plate: 'RV 1', holderName: 'Rev', type: 'permanent' });
      const revoked = await request(app).post(`/api/permits/${permit.body.id}/revoke`).set(auth()).send({});
      expect(revoked.body).toMatchObject({ status: 'revoked', isActiveToday: false });
      expect((await checkIn('RV 1')).body.allowed).toBe(false);

      const patched = await request(app).patch(`/api/permits/${permit.body.id}`).set(auth()).send({ holderName: 'Renamed', holderEmail: '' });
      expect(patched.body).toMatchObject({ holderName: 'Renamed', holderEmail: null });
    });
  });

  // -------------------------------------------------------------------------
  describe('alarms', () => {
    it('resolve with grantDailyPermit creates/reuses a daily permit and authorizes the session', async () => {
      const entry = await checkIn('GU 77');
      expect(entry.body.allowed).toBe(false);

      const resolved = await request(app)
        .post(`/api/alarms/${entry.body.alarmId}/resolve`)
        .set(auth())
        .send({ note: 'Guest of Anna', grantDailyPermit: { holderName: 'Guest', holderEmail: 'guest@example.com' } });
      expect(resolved.status).toBe(200);
      expect(resolved.body).toMatchObject({
        id: entry.body.alarmId,
        status: 'resolved',
        resolutionNote: 'Guest of Anna',
        resolvedByName: 'Test Admin',
        resolvedAt: expect.any(String),
        isStillParked: true,
      });

      const sessions = await request(app).get('/api/sessions?active=true&plate=GU77').set(auth());
      expect(sessions.body.items[0]).toMatchObject({
        id: entry.body.sessionId,
        authorized: true,
        permit: { type: 'daily', holderName: 'Guest', validDate: today() },
        openAlarmId: null,
      });

      const permits = await request(app).get('/api/permits?q=GU77').set(auth());
      expect(permits.body.total).toBe(1);
      expect(permits.body.items[0]).toMatchObject({ type: 'daily', status: 'approved', source: 'admin', plateDisplay: 'GU 77', isActiveToday: true });

      const again = await request(app).post(`/api/alarms/${entry.body.alarmId}/resolve`).set(auth()).send({});
      expect(again.status).toBe(422);
      expect(again.body.error.code).toBe('INVALID_STATE');

      // Now the plate is valid today → next check-in is allowed.
      expect((await checkIn('GU 77')).body).toMatchObject({ allowed: true, reason: 'DAILY_PERMIT' });

      // An approved daily permit for today that already exists is reused (no second permit).
      const e1 = await checkIn('GU 78');
      expect(e1.body.allowed).toBe(false);
      const existing = await request(app)
        .post('/api/permits')
        .set(auth())
        .send({ plate: 'GU 78', holderName: 'Existing', type: 'daily', validDate: today() });
      expect(existing.status).toBe(201);
      const r1 = await request(app)
        .post(`/api/alarms/${e1.body.alarmId}/resolve`)
        .set(auth())
        .send({ grantDailyPermit: { holderName: 'Ignored' } });
      expect(r1.status).toBe(200);
      const gu78 = await request(app).get('/api/permits?q=GU78').set(auth());
      expect(gu78.body.total).toBe(1);
      const s78 = await request(app).get('/api/sessions?active=true&plate=GU78').set(auth());
      expect(s78.body.items[0]).toMatchObject({ authorized: true, permit: { id: existing.body.id, holderName: 'Existing' } });

      // previousAlarmCount counts other alarms for the same plate (last 30 days)
      await request(app).post(`/api/permits/${existing.body.id}/revoke`).set(auth()).send({});
      const e2 = await checkIn('GU 78');
      expect(e2.body.allowed).toBe(false);
      const open = await request(app).get('/api/alarms?plate=GU78&status=open').set(auth());
      expect(open.body.items[0]).toMatchObject({ id: e2.body.alarmId, previousAlarmCount: 1 });
    });

    it('lists open alarms first', async () => {
      const res = await request(app).get('/api/alarms').set(auth());
      expect(res.status).toBe(200);
      const statuses: string[] = res.body.items.map((a: { status: string }) => a.status);
      expect(statuses.indexOf('resolved')).toBeGreaterThan(statuses.lastIndexOf('open'));
    });

    it('overstay job creates exactly one alarm per session', async () => {
      const yesterday = addDays(today(), -1);
      await query(
        `INSERT INTO permits (plate, plate_display, holder_name, type, valid_date, status, source)
         VALUES ('OV1', 'OV 1', 'Overstayer', 'daily', $1, 'approved', 'admin')`,
        [yesterday],
      );
      const entry = await checkIn('OV 1', { occurredAt: zonedTimeToUtc(yesterday, '12:00', TZ).toISOString() });
      expect(entry.body).toMatchObject({ allowed: true, reason: 'DAILY_PERMIT' });

      expect(await runOverstayCheck()).toBe(1);
      expect(await runOverstayCheck()).toBe(0);
      const alarms = await request(app).get('/api/alarms?plate=OV1').set(auth());
      expect(alarms.body.items).toHaveLength(1);
      expect(alarms.body.items[0]).toMatchObject({ type: 'overstay', status: 'open', sessionId: entry.body.sessionId, isStillParked: true });
    });

    it('dashboard summary returns numbers', async () => {
      const res = await request(app).get('/api/dashboard/summary').set(auth());
      expect(res.status).toBe(200);
      for (const key of ['parkedNow', 'parkedUnauthorized', 'openAlarms', 'pendingRequests', 'entriesToday', 'activePermitsToday']) {
        expect(typeof res.body[key]).toBe('number');
      }
      expect(res.body.parkedNow).toBeGreaterThan(0);
      expect(res.body.openAlarms).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('live updates & webhooks', () => {
    it('SSE stream delivers gate.event and alarm.created', async () => {
      expect((await request(app).get('/api/stream')).status).toBe(401);

      const server = app.listen(0);
      const { port } = server.address() as AddressInfo;
      const ac = new AbortController();
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/stream?token=${token}`, { signal: ac.signal });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/event-stream');
        expect(res.headers.get('x-accel-buffering')).toBe('no');
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        await reader.read(); // initial "retry" preamble

        const entry = await checkIn('SSE 1');
        const deadline = Date.now() + 5_000;
        while (!buf.includes('event: alarm.created') && Date.now() < deadline) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
        }
        expect(buf).toContain('event: gate.event');
        expect(buf).toContain('event: alarm.created');
        expect(buf.indexOf('event: gate.event')).toBeLessThan(buf.indexOf('event: alarm.created'));
        const dataLine = buf.split('\n').find((l, i, all) => all[i - 1] === 'event: alarm.created' && l.startsWith('data: '))!;
        expect(JSON.parse(dataLine.slice(6))).toMatchObject({ id: entry.body.alarmId, plate: 'SSE1', type: 'unauthorized_entry' });
      } finally {
        ac.abort();
        await new Promise((r) => server.close(r));
      }
    });

    it('webhook: settings round-trip, test send and delivery on alarm', async () => {
      const received: { url: string; body: unknown }[] = [];
      const sink: Server = createServer((req: IncomingMessage, res) => {
        let data = '';
        req.on('data', (c) => (data += c));
        req.on('end', () => {
          received.push({ url: req.url ?? '', body: JSON.parse(data || 'null') });
          res.statusCode = req.url === '/bad' ? 400 : 200;
          res.end('ok');
        });
      });
      await new Promise<void>((r) => sink.listen(0, '127.0.0.1', r));
      const { port } = sink.address() as AddressInfo;
      try {
        const initial = await request(app).get('/api/settings').set(auth());
        expect(initial.body).toEqual({ webhook: { enabled: false, url: '', format: 'generic' }, timezone: TZ, gateApiKeyHint: 'test…' });

        const invalid = await request(app).put('/api/settings').set(auth()).send({ webhook: { enabled: true, url: 'nope', format: 'generic' } });
        expect(invalid.status).toBe(400);

        const url = `http://127.0.0.1:${port}/hook`;
        const put = await request(app).put('/api/settings').set(auth()).send({ webhook: { enabled: true, url, format: 'generic' } });
        expect(put.status).toBe(200);
        expect(put.body.webhook).toEqual({ enabled: true, url, format: 'generic' });

        const test = await request(app).post('/api/settings/webhook/test').set(auth());
        expect(test.body).toEqual({ ok: true, status: 200, error: null });
        expect(received.at(-1)?.body).toMatchObject({ event: 'webhook.test' });

        const entry = await checkIn('WH 1');
        expect(entry.body.allowed).toBe(false);
        await waitForWebhooks();
        const alarm = (await request(app).get('/api/alarms?plate=WH1').set(auth())).body.items[0];
        expect(alarm).toMatchObject({ id: entry.body.alarmId, webhookStatus: 'sent', webhookError: null });
        expect(received.at(-1)?.body).toMatchObject({
          event: 'alarm.created',
          alarm: { id: entry.body.alarmId, plate: 'WH1' },
          url: 'http://parklens.test/admin/alarms',
        });

        // non-retryable 4xx → failed after one attempt
        await request(app).put('/api/settings').set(auth()).send({ webhook: { enabled: true, url: `http://127.0.0.1:${port}/bad`, format: 'slack' } });
        const bad = await checkIn('WH 2');
        await waitForWebhooks();
        const failed = (await request(app).get('/api/alarms?plate=WH2').set(auth())).body.items[0];
        expect(failed).toMatchObject({ id: bad.body.alarmId, webhookStatus: 'failed', webhookError: expect.stringContaining('HTTP 400') });
        expect(received.at(-1)?.body).toHaveProperty('blocks');
      } finally {
        await request(app).put('/api/settings').set(auth()).send({ webhook: { enabled: false, url: '', format: 'generic' } });
        await new Promise((r) => sink.close(r));
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('admins', () => {
    it('create, duplicate, delete self/other, change password', async () => {
      const created = await request(app)
        .post('/api/admins')
        .set(auth())
        .send({ email: 'second@test.local', name: 'Second', password: 'second-password' });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ email: 'second@test.local', name: 'Second', lastLoginAt: null });

      const dup = await request(app).post('/api/admins').set(auth()).send({ email: 'SECOND@test.local', name: 'X', password: 'xxxxxxxxxxxx' });
      expect(dup.status).toBe(409);

      const list = await request(app).get('/api/admins').set(auth());
      expect(list.body.total).toBe(2);

      const me = await request(app).get('/api/auth/me').set(auth());
      const self = await request(app).delete(`/api/admins/${me.body.id}`).set(auth());
      expect(self.status).toBe(409);
      expect(self.body.error.code).toBe('CANNOT_DELETE_SELF');

      const short = await request(app).post('/api/auth/change-password').set(auth()).send({ currentPassword: 'x', newPassword: 'short' });
      expect(short.status).toBe(400);
      const wrong = await request(app)
        .post('/api/auth/change-password')
        .set(auth())
        .send({ currentPassword: 'wrong-password', newPassword: 'another-long-password' });
      expect(wrong.status).toBe(403);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

      const del = await request(app).delete(`/api/admins/${created.body.id}`).set(auth());
      expect(del.status).toBe(204);
      expect((await request(app).delete(`/api/admins/${created.body.id}`).set(auth())).status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  describe('demo seed', () => {
    it('seeds once, with an open unauthorized alarm for ZH 999 999', async () => {
      expect(await seedDemoData()).toBe(true);
      expect(await seedDemoData()).toBe(false);

      const alarms = await request(app).get('/api/alarms?plate=ZH999999').set(auth());
      expect(alarms.body.items).toHaveLength(1);
      expect(alarms.body.items[0]).toMatchObject({ type: 'unauthorized_entry', status: 'open', webhookStatus: 'skipped', isStillParked: true });

      const pending = await request(app).get('/api/permits?status=pending&q=AG44321').set(auth());
      // AG 44 321 daily for tomorrow was approved in an earlier test for the same date → seed still inserts its own
      expect(pending.body.items.some((p: { validDate: string }) => p.validDate === addDays(today(), 1))).toBe(true);

      const parked = await request(app).get('/api/sessions?active=true&plate=ZH123456').set(auth());
      expect(parked.body.items[0]).toMatchObject({ authorized: true, permit: { type: 'permanent', holderName: 'Anna Muster' } });
      const be = await request(app).get('/api/sessions?plate=BE98765').set(auth());
      expect(be.body.items[0].exitedAt).not.toBeNull();
      const rejected = await request(app).get('/api/permits?status=rejected&q=LU777').set(auth());
      expect(rejected.body.total).toBe(1);
    });
  });
});
