# ParkLens — Architecture & API Contract (MVP)

ParkLens tracks which vehicles enter/leave the company parking lot, checks them against
permits, and raises an alarm when a vehicle without a valid permit enters.

This document is the **single source of truth** shared by backend and frontend. If you need
to deviate, update this file in the same change.

---

## 1. Product decisions

| Topic | Decision |
|---|---|
| Users | Only **admins** log in (email + password, JWT). Employees/visitors use a **public request form** (no login) and receive a status link + reference code. |
| Permit types | `permanent` (no end date, revocable) and `daily` (exactly one calendar day in `APP_TIMEZONE`, default `Europe/Zurich`, 00:00–23:59). |
| Permit lifecycle | Admin-created permits are `approved` immediately. Public requests start `pending` → `approved` / `rejected`. Approved permits can be `revoked`. |
| Plate matching | All plates are **normalized**: uppercase, strip everything except `A-Z 0-9 Ä Ö Ü` (e.g. `zh 123-456` → `ZH123456`). Valid normalized length: 2–12. Original input kept as `plateDisplay`. |
| Gate integration | ANPR camera / gate controller calls `POST /api/gate/check-in` and `/check-out` with `X-API-Key`. Response contains `allowed` so a barrier *could* act on it; MVP is monitoring only. |
| Alarms | `unauthorized_entry` (check-in without valid permit) and `overstay` (still parked after daily permit day ended; checked every 60 s). Live in UI via SSE; admins **resolve** with optional note and optional one-click "grant daily permit for today". |
| Webhook | Optional outgoing webhook per alarm, configured in the admin UI (URL, format `generic` / `slack` / `teams`, enabled flag) with a "send test" button. Fire-and-forget with 3 retries; must never block the gate response. |
| Languages | UI in English + German with a switcher (persisted in `localStorage`, default from browser). Timestamps displayed in `APP_TIMEZONE`. |
| Deployment | `docker compose up -d` starts `db`, `api`, `web`. API runs migrations + seeds admin (and demo data if `SEED_DEMO_DATA=true`) on startup. |

---

## 2. System overview

```
 ANPR camera / gate ──X-API-Key──┐
                                 ▼
 Browser ──► web (nginx :80, published on :8088)
               ├── /            → React SPA (static, built by Vite)
               └── /api/*       → proxy → api:3000 (SSE-safe: no buffering)
                                 │
                                 ▼
                      api (Node 24, TypeScript, Express 5)
                        ├── REST + SSE (/api/stream)
                        ├── overstay job (every 60 s)
                        └── webhook dispatcher (async, retries)
                                 │
                                 ▼
                      db (PostgreSQL 17, named volume)
```

### Repository layout

```
parklens/
├── docker-compose.yml
├── .env.example
├── README.md
├── docs/
│   ├── ARCHITECTURE.md      ← this file (contract)
│   └── UX.md                ← UX spec (owned by UX designer)
├── api/                     ← Node backend (owned by backend dev)
│   ├── Dockerfile
│   ├── package.json / tsconfig.json
│   ├── migrations/*.sql
│   ├── src/…
│   └── test/…
└── web/                     ← React + Vite frontend (owned by frontend dev)
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json / vite.config.ts
    └── src/…
```

### Tech stack

- **api**: Node 24, TypeScript (compiled with `tsc` to `dist/`), Express 5, `pg` (plain SQL, no ORM),
  `zod` (validation), `jsonwebtoken`, `bcryptjs`, `helmet`, `express-rate-limit`, `vitest` (+ `supertest`) for tests.
  Plain SQL migrations in `api/migrations/NNN_name.sql`, applied at startup by a tiny runner
  (`schema_migrations` table + `pg_advisory_lock`).
- **web**: React 19, Vite, TypeScript, `react-router`, `@tanstack/react-query`, `react-i18next`,
  `lucide-react` icons. Styling: plain CSS with design tokens as CSS custom properties (no heavy UI kit).
  Production image: multi-stage build → `nginx:alpine`.
- **db**: `postgres:17-alpine`.

---

## 3. Environment variables (api)

| Var | Default (compose) | Notes |
|---|---|---|
| `PORT` | `3000` | |
| `DATABASE_URL` | `postgres://parklens:parklens@db:5432/parklens` | |
| `JWT_SECRET` | `change-me-in-production` | HS256, token TTL 12 h |
| `GATE_API_KEY` | `dev-gate-key` | Required on gate endpoints (`X-API-Key`) |
| `ADMIN_EMAIL` | `admin@parklens.local` | Seeded if no admin exists |
| `ADMIN_PASSWORD` | `parklens-admin` | |
| `ADMIN_NAME` | `Parking Admin` | |
| `APP_TIMEZONE` | `Europe/Zurich` | Defines "today" for daily permits |
| `PUBLIC_APP_URL` | `http://localhost:8088` | Used for links in webhook messages |
| `SEED_DEMO_DATA` | `true` | Seeds demo permits/events/alarm once (idempotent) |
| `WEBHOOK_URL` | *(empty)* | Optional initial webhook URL (UI setting wins once saved) |
| `WEBHOOK_FORMAT` | `generic` | `generic` \| `slack` \| `teams` |
| `LOT_CAPACITY` | `40` | Initial number of parking spaces (v2; UI setting wins once saved) |

---

## 4. Data model (PostgreSQL)

```sql
-- enums
permit_type    : 'permanent' | 'daily'
permit_status  : 'pending' | 'approved' | 'rejected' | 'revoked'
permit_source  : 'admin' | 'request'
gate_direction : 'in' | 'out'
alarm_type     : 'unauthorized_entry' | 'overstay'
alarm_status   : 'open' | 'resolved'
webhook_status : 'skipped' | 'pending' | 'sent' | 'failed'

admins(id uuid pk, email citext/text unique, name, password_hash, created_at, last_login_at)

permits(
  id uuid pk, plate text not null /*normalized*/, plate_display text not null,
  holder_name text not null, holder_email text null,
  type permit_type not null, valid_date date null,         -- daily ⇒ not null; permanent ⇒ null (CHECK)
  status permit_status not null, source permit_source not null,
  reference text unique null,                              -- e.g. 'PL-7K3Q9' (requests only)
  public_token text unique null,                           -- 32+ char url-safe random (requests only)
  request_note text null, decision_note text null,
  decided_at timestamptz null, decided_by uuid null → admins,
  created_by uuid null → admins, created_at, updated_at
)  -- index (plate, status)

parking_sessions(
  id uuid pk, plate text, entered_at timestamptz, exited_at timestamptz null,
  entry_event_id, exit_event_id null, permit_id uuid null, authorized boolean,
  closed_reason text null   -- 'exit' | 'superseded' (new check-in while still open)
)  -- partial index on plate where exited_at is null

gate_events(
  id bigserial pk, plate text, plate_raw text, direction gate_direction,
  occurred_at timestamptz, gate_id text null, authorized boolean null /* null for 'out' */,
  permit_id uuid null, session_id uuid null, created_at
)

alarms(
  id uuid pk, type alarm_type, plate text, status alarm_status default 'open',
  occurred_at timestamptz, gate_id text null, gate_event_id bigint null, session_id uuid null,
  resolved_at null, resolved_by uuid null → admins, resolution_note text null,
  webhook_status webhook_status, webhook_error text null, created_at
)  -- unique (session_id, type) where type='overstay'

settings(key text pk, value jsonb, updated_at)   -- 'webhook' → {enabled,url,format}; 'lot' → {capacity}; 'demo_seeded' → true
```

### Permit validity rule

A plate is **authorized** at instant `t` iff there exists a permit with `plate = normalize(input)`,
`status = 'approved'` and (`type = 'permanent'` **or** (`type = 'daily'` and
`valid_date = (t AT TIME ZONE APP_TIMEZONE)::date`)). If several match, prefer `permanent`.

---

## 5. API contract

Base path `/api`. JSON, **camelCase**. Timestamps ISO-8601 UTC strings; dates `YYYY-MM-DD`.

**Errors** — always `{"error": {"code": "SOME_CODE", "message": "Human readable", "details"?: any}}`
with status 400 (bad input), 401 (no/invalid auth), 403, 404, 409 (conflict), 422 (invalid plate/state), 429, 500.
Known codes: `VALIDATION_ERROR`, `INVALID_PLATE`, `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `NOT_FOUND`,
`DUPLICATE_REQUEST`, `ALREADY_PERMITTED`, `INVALID_STATE`, `DATE_IN_PAST`, `DATE_TOO_FAR`, `CANNOT_DELETE_SELF`,
`LAST_ADMIN`, `EMAIL_TAKEN`, `RATE_LIMITED`, `INTERNAL`.
`VALIDATION_ERROR` responses carry `details: [{path: "validDate", message: "…"}]` (zod issues).

**Lists** — `{"items": T[], "total": number}`; support `limit` (default 50, max 200 — larger values are clamped) and `offset`.

### 5.1 Shared object shapes (TypeScript notation)

```ts
type PermitSummary = { id: string; type: 'permanent'|'daily'; holderName: string; validDate: string|null };

type Permit = {
  id: string; plate: string; plateDisplay: string;
  holderName: string; holderEmail: string|null;
  type: 'permanent'|'daily'; validDate: string|null;
  status: 'pending'|'approved'|'rejected'|'revoked';
  source: 'admin'|'request';
  reference: string|null;          // requests only
  requestNote: string|null; decisionNote: string|null;
  decidedAt: string|null; decidedByName: string|null;
  createdAt: string; updatedAt: string;
  isActiveToday: boolean;          // approved && (permanent || validDate === today in APP_TIMEZONE)
  isDatePassed: boolean;           // daily && validDate < today
};

type GateEvent = {
  id: string;                      // bigserial as string
  plate: string; plateRaw: string; direction: 'in'|'out';
  occurredAt: string; gateId: string|null;
  authorized: boolean|null;        // null for 'out'
  permit: PermitSummary|null; sessionId: string|null; alarmId: string|null;
};

type ParkingSession = {
  id: string; plate: string; enteredAt: string; exitedAt: string|null;
  durationMinutes: number;         // until exitedAt or now
  authorized: boolean; permit: PermitSummary|null;
  openAlarmId: string|null;
};

type Alarm = {
  id: string; type: 'unauthorized_entry'|'overstay'; plate: string;
  status: 'open'|'resolved'; occurredAt: string; gateId: string|null;
  sessionId: string|null; isStillParked: boolean;
  previousAlarmCount: number;      // other alarms for same plate in last 30 days
  resolvedAt: string|null; resolvedByName: string|null; resolutionNote: string|null;
  webhookStatus: 'skipped'|'pending'|'sent'|'failed'; webhookError: string|null;
  createdAt: string;
};

type Admin = { id: string; email: string; name: string; createdAt: string; lastLoginAt: string|null };
```

### 5.2 Public (no auth)

| Method & path | Body / query | Response |
|---|---|---|
| `GET /api/health` | – | `200 {"status":"ok","db":"ok","time":"…","timezone":"Europe/Zurich"}` |
| `POST /api/public/requests` | `{plate, holderName, holderEmail, type, validDate?, requestNote?}` — `validDate` required iff `daily`; must be ≥ today and ≤ today+60 d | `201 {reference, token, status:"pending"}`. 409 `DUPLICATE_REQUEST` if identical pending request exists; 409 `ALREADY_PERMITTED` if an approved permanent permit (or approved daily for same date) exists. Rate-limited (10/min/IP). |
| `GET /api/public/requests/:token` | – | `200 PublicRequestStatus` or 404 |
| `POST /api/public/requests/lookup` | `{reference, plate}` | `200 PublicRequestStatus & {token}` or 404 (rate-limited) |

```ts
type PublicRequestStatus = {
  reference: string; plate: string; plateDisplay: string; holderName: string;
  type: 'permanent'|'daily'; validDate: string|null;
  status: 'pending'|'approved'|'rejected'|'revoked';
  decisionNote: string|null; createdAt: string; decidedAt: string|null;
};
```

### 5.3 Auth

| Method & path | Body | Response |
|---|---|---|
| `POST /api/auth/login` | `{email, password}` | `200 {token, admin: Admin}`; 401 `INVALID_CREDENTIALS` (rate-limited 10/min/IP) |
| `GET /api/auth/me` | – | `200 Admin` |
| `POST /api/auth/change-password` | `{currentPassword, newPassword}` (min 10 chars) | `204`; wrong `currentPassword` → **403** `INVALID_CREDENTIALS` (not 401, so clients don't treat it as an expired session) |

All endpoints below (except gate) require `Authorization: Bearer <jwt>`.

### 5.4 Admin

| Method & path | Body / query | Response |
|---|---|---|
| `GET /api/dashboard/summary` | – | `{parkedNow, parkedUnauthorized, openAlarms, pendingRequests, entriesToday, activePermitsToday, capacity}` (all numbers; `capacity` added in v2) |
| `GET /api/dashboard/timeline` | – | `DashboardTimeline` (v2, see §5.8) |
| `GET /api/dashboard/gates` | – | `{items: GateStatus[]}` (v2, see §5.8) |
| `GET /api/permits` | `status?, type?, source?, q?` (matches plate or holder name, case-insensitive; plate part normalized), `activeToday?=true`, `limit, offset` | `{items: Permit[], total}` newest first (pending: oldest first) |
| `POST /api/permits` | `{plate, holderName, holderEmail?, type, validDate?, requestNote?}` | `201 Permit` (status `approved`, source `admin`). 409 `ALREADY_PERMITTED` on duplicate active permit. Daily date may be today..+365 d. |
| `GET /api/permits/:id` | – | `Permit` |
| `PATCH /api/permits/:id` | `{holderName?, holderEmail?}` | `Permit` |
| `POST /api/permits/:id/approve` | `{decisionNote?}` | `Permit`; 422 `INVALID_STATE` unless `pending`; 422 `DATE_IN_PAST` if daily date passed |
| `POST /api/permits/:id/reject` | `{decisionNote?}` | `Permit`; only from `pending` |
| `POST /api/permits/:id/revoke` | `{decisionNote?}` | `Permit`; only from `approved` |
| `GET /api/sessions` | `active?=true`, `plate?`, `limit, offset` | `{items: ParkingSession[], total}` newest first |
| `GET /api/gate-events` | `plate?, direction?, authorized?, limit, offset` | `{items: GateEvent[], total}` newest first |
| `GET /api/alarms` | `status?=open\|resolved\|all` (default `all`), `plate?`, `limit, offset` | `{items: Alarm[], total}` open first, then newest first |
| `GET /api/alarms/:id` | – | `Alarm` (additive, for deep links) |
| `POST /api/alarms/:id/resolve` | `{note?, grantDailyPermit?: {holderName, holderEmail?}}` | `Alarm`. If `grantDailyPermit`: create approved daily permit for today and link the open session (set `authorized=true`, `permit_id`). 422 if already resolved. |
| `GET /api/settings` | – | `{webhook:{enabled, url, format}, lot:{capacity}, timezone, gateApiKeyHint}` (hint = first 4 chars + `…`; `lot` added in v2) |
| `PUT /api/settings` | `{webhook?:{enabled, url, format}, lot?:{capacity}}` — at least one key; `capacity` integer 1–5000; url must be http(s) when enabled | same as GET |
| `POST /api/settings/webhook/test` | – | `{ok: boolean, status: number\|null, error: string\|null}` |
| `GET /api/admins` | – | `{items: Admin[], total}` |
| `POST /api/admins` | `{email, name, password}` (password min 10 chars) | `201 Admin`; 409 `EMAIL_TAKEN` on duplicate email (case-insensitive) |
| `DELETE /api/admins/:id` | – | `204`; 409 `CANNOT_DELETE_SELF` / `LAST_ADMIN` |

### 5.5 Gate (camera / barrier)

Auth: header `X-API-Key: <GATE_API_KEY>` **or** an admin `Authorization: Bearer <jwt>` (used by the UI's gate simulator).

| Method & path | Body | Response |
|---|---|---|
| `POST /api/gate/check-in` | `{plate, occurredAt?, gateId?}` (occurredAt default now) | `200 {allowed, plate, reason, permit: PermitSummary\|null, eventId, sessionId, alarmId: string\|null}` where `reason ∈ PERMANENT_PERMIT \| DAILY_PERMIT \| NO_VALID_PERMIT`. 422 `INVALID_PLATE`. |
| `POST /api/gate/check-out` | `{plate, occurredAt?, gateId?}` | `200 {plate, eventId, sessionId: string\|null, durationMinutes: number\|null}` (null when no open session — still recorded) |

Check-in semantics: record `gate_event`; if an open session exists for the plate, close it with
`closed_reason='superseded'`; open a new session with `authorized` + `permit_id`; if not authorized create an
`unauthorized_entry` alarm, emit SSE, dispatch webhook asynchronously. All in one DB transaction (webhook after commit).

### 5.5.1 Backend clarifications (implemented behaviour)

- **Plate filters** (`plate?` on sessions / gate-events / alarms, `q` on permits) are normalized and match as a
  *substring* of the normalized plate (`plate=zh 12` matches `ZH123456`).
- **Boolean query params** accept `true`/`false` (also `1`/`0`).
- **Optional strings**: `""` and `null` are treated as "not set" (e.g. `holderEmail: ""` → `null`); `validDate` is
  ignored (stored `null`) for `permanent`. `PATCH /api/permits/:id` with `holderEmail: ""` or `null` clears it.
- **`plateDisplay`** is the input as typed, trimmed, with inner whitespace collapsed.
- **Public lookup** matches `reference` case-insensitively (`PL-` prefix optional) and the normalized plate.
- **Settings**: `webhook.url` is `""` when unset (never `null`). `POST /api/settings/webhook/test` sends one request
  (5 s timeout) with a sample alarm (`event: "webhook.test"` in generic format) to the **saved** URL, even if the webhook
  is disabled; without a URL it returns `{ok:false, status:null, error:"No webhook URL configured"}`.
- **Alarm webhook status**: created as `pending` if the webhook is enabled with a URL at creation time, otherwise
  `skipped`. The `alarm.created` SSE event therefore shows `pending`; the final `sent`/`failed` arrives via
  `alarm.updated`. Network errors, timeouts, 5xx, 408 and 429 are retried (3 attempts at 0/2/8 s); other 4xx fail
  immediately. `webhookError` e.g. `"HTTP 404 Not Found (after 1 attempt)"`.
- **Overstay alarms** have `gateId: null` and `occurredAt` = detection time; at most one per session.
- **Check-out** gate events carry the closed session's `permit` (or `null`); `authorized` is always `null` for `out`.
  A superseded or exited session never gets `exitedAt` earlier than `enteredAt`.

### 5.6 Live updates — Server-Sent Events

`GET /api/stream?token=<jwt>` (query param because `EventSource` cannot set headers).
Messages: `event: <name>\ndata: <json>\n\n`; heartbeat comment `: ping` every 25 s. On connect the server sends
`retry: 5000` and a `: connected` comment. Invalid/missing token → `401` JSON error (EventSource `onerror`).

| Event | Data |
|---|---|
| `alarm.created` | `Alarm` |
| `alarm.updated` | `Alarm` |
| `gate.event` | `GateEvent` |
| `permit.changed` | `Permit` (created / approved / rejected / revoked / updated) |
| `request.created` | `Permit` (new public request) |

Frontend: invalidate relevant React Query caches on each event; `alarm.created` also triggers a prominent
live alert (banner/toast, optional sound).

### 5.7 Webhook payloads

- `generic`: `{"event":"alarm.created","text":"<human summary>","alarm": Alarm,"url":"<PUBLIC_APP_URL>/admin/alarms"}`
- `slack`: `{"text": "<summary>", "blocks": [...]}` (section with plate, type, time, gate, link)
- `teams`: Workflows-compatible message: `{"type":"message","attachments":[{"contentType":"application/vnd.microsoft.card.adaptive","content":{AdaptiveCard 1.4 with summary + FactSet + OpenUrl action}}]}`

Timeout 5 s, 3 attempts (0 s, 2 s, 8 s backoff). Result stored in `alarms.webhook_status/webhook_error`,
followed by an `alarm.updated` SSE event.

---

## 6. Frontend routes

| Route | Access | Purpose |
|---|---|---|
| `/` | public | Landing: request a permit (primary CTA), check request status, admin login link |
| `/request` | public | Permit request form → success screen with reference + status link |
| `/request/status` | public | Lookup by reference + plate |
| `/request/:token` | public | Request status page |
| `/login` | public | Admin login |
| `/admin` | admin | Dashboard: KPIs, live alarms, parked now, recent gate events |
| `/admin/alarms` | admin | Alarm list, resolve (note / grant daily permit) |
| `/admin/requests` | admin | Pending request queue: approve / reject |
| `/admin/permits` | admin | All permits: filter, create, revoke |
| `/admin/activity` | admin | Parked now + gate event log |
| `/admin/simulator` | admin | Gate simulator (check-in / check-out any plate) |
| `/admin/settings` | admin | Webhook config + test, admin accounts, change password |

The nginx container serves the SPA with `try_files $uri /index.html` and proxies `/api/` to `http://api:3000`
with `proxy_buffering off`, `proxy_http_version 1.1`, `proxy_read_timeout 1h` (SSE).
In dev, Vite proxies `/api` to `http://localhost:3000`.

---

### 5.8 Command-center additions (v2)

```ts
type DashboardTimeline = {
  date: string;            // today, YYYY-MM-DD in APP_TIMEZONE
  timezone: string;
  currentHour: number;     // local hour 0–23 of "now"
  buckets: Array<{         // one per local hour of today (23/25 on DST change days), ascending
    hour: number;          // local hour 0–23
    start: string;         // ISO UTC instant the bucket starts
    entries: number;       // check-ins in this hour
    exits: number;         // check-outs in this hour
    denied: number;        // check-ins without a valid permit in this hour
    occupancy: number | null; // cars parked at bucket end (current hour: now); null for future hours
  }>;
};

type GateStatus = {
  gateId: string | null;   // null groups events sent without gateId
  lastEventAt: string; lastDirection: 'in' | 'out'; lastPlate: string;
  eventsToday: number; deniedToday: number;
};                          // gates with events in the last 30 days, most recent first
```

Lot capacity lives in `settings.lot = {capacity}` (initialised from `LOT_CAPACITY`). No new SSE events: the UI
refetches timeline/gates/summary when it receives `gate.event` / `alarm.*`.

Backend clarifications (implemented behaviour):
- **Timeline buckets** are half-open `[start, start + 1 h)`; `start` of bucket 0 is local midnight. `denied` = check-ins
  with `authorized = false` (always ≤ `entries`). `occupancy` counts sessions with `enteredAt < T` and
  (`exitedAt` null or `≥ T`), where `T` = bucket end, or *now* for the current bucket — so it includes cars parked
  since previous days and equals `summary.parkedNow` for the current hour. On the fall-back day `hour` 2 appears twice
  (use `start` as key); on the spring-forward day hour 2 is missing. `currentHour` = local hour of now.
- **Gates**: `eventsToday` counts both directions, `deniedToday` = denied check-ins (both in the local day of
  `APP_TIMEZONE`, `0` if the gate only had events on earlier days). `lastPlate` is the normalized plate. Events stamped
  more than 5 min in the future (camera clock skew / simulator) are ignored for `lastEventAt`.
- **`PUT /api/settings`** with neither `webhook` nor `lot` → 400 `VALIDATION_ERROR`; a key that is omitted keeps its
  saved value (the v1 `{webhook}`-only body still works).

---

## 7. Demo seed (`SEED_DEMO_DATA=true`, once, guarded by `settings.demo_seeded`)

- Approved permanent: `ZH 123 456` (Anna Muster), `BE 98 765` (Marco Rossi)
- Approved daily for today: `ZH 555 111` (Lea Keller, visitor)
- Pending requests: `AG 44 321` daily tomorrow (Tom Weber), `SG 1 234` permanent (Sara Frei)
- Rejected request: `LU 777` (Max Beispiel)
- Gate events today: `ZH 123 456` in (still parked), `BE 98 765` in+out, `ZH 999 999` in → **open unauthorized alarm**
- **v2 (command center):** additionally ~20 more approved permanent permits (realistic Swiss names, plates from
  various cantons) and 2 more daily permits for today; a plausible day of traffic *before the seed time* across
  gates `north` and `south` (arrivals clustered in the morning, some lunch movements, departures late afternoon —
  compressed into the elapsed part of the day if the seed runs early), leaving roughly 45–60 % of `LOT_CAPACITY`
  occupied, plus one earlier unauthorized entry whose alarm is already **resolved** with a note.
