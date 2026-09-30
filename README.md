# ParkLens

Parking-lot access monitoring for the company office. An ANPR camera at the entrance reports
check-ins and check-outs; every plate is checked against a permit. Vehicles without a valid permit
raise a live alarm in the admin UI and, optionally, a Slack / Teams / JSON webhook.

- **Admins** manage permanent and daily permits, approve or reject requests, and resolve alarms.
- **Employees** request a permit through a public form (no account needed) and track its status with a link or reference code.
- **UI** in English and German.

## Quick start

```bash
docker compose up -d
```

Then open **http://localhost:8088**.

| What | Default |
|---|---|
| Admin login | `admin@parklens.local` / `parklens-admin` |
| Gate API key | `dev-gate-key` |
| Demo data | seeded on first start (`SEED_DEMO_DATA=true`) |

The first start builds the images and takes about a minute. The API runs database migrations and seeds data
automatically. To start fresh, run `docker compose down -v && docker compose up -d`. After changing code, run
`docker compose up -d --build`.

Port 8088 was picked because 8080 is often already taken. Set `WEB_PORT` (and `PUBLIC_APP_URL`) in `.env` to change it.

To override defaults, copy `.env.example` to `.env`. **Change `JWT_SECRET`, `GATE_API_KEY` and `ADMIN_PASSWORD`
before running anywhere other than your laptop.**

## Command center

After logging in, **Admin → Command center** shows the lot live:

- **Status bar**: live connection indicator, clock (Zurich time), open-alarm counter and **⌘K / Ctrl+K** command
  palette (search plates, go to pages, quick actions).
- **Occupancy gauge**: parked cars vs. capacity, with and without permit.
- **Parked vehicles**: one tile per parked car. Cars without a permit pulse; click a tile to see the plate's history.
- **Gate feed**: every check-in plays a plate scan and shows *allowed* or *denied*. Also shows north/south gate status.
- **Timeline**: today's entries, exits and occupancy per hour.
- **Alarms**: a red screen-edge flash and banner when a car without a permit enters. Resolve directly from the panel.

**Wall mode** (`/admin?wall=1`, or the *Enter wall mode* button) is a fullscreen layout for a reception monitor.
**Autopilot** (Admin → Gate simulator) generates realistic traffic while an admin tab is open, which is handy for demos.

Lot capacity defaults to 40 (`LOT_CAPACITY`) and can be changed in **Admin → Settings → Parking lot**.
The design prototype is in [`docs/design/command-center.html`](docs/design/command-center.html). Open it directly in a browser.

## Services

| Service | Image / build | Purpose |
|---|---|---|
| `web` | `./web` (Vite build → nginx) | Serves the React SPA on port 8088 and proxies `/api` to the API |
| `api` | `./api` (Node 24, Express, TypeScript) | REST API, SSE live stream, webhook dispatch, overstay job |
| `db`  | `postgres:17-alpine` | Data, stored in the `db-data` volume |

### Prebuilt images

GitHub Actions ([`.github/workflows/docker.yml`](.github/workflows/docker.yml)) builds both images for
`linux/amd64` and `linux/arm64` and publishes them to the GitHub Container Registry:

```bash
docker pull ghcr.io/katunch/parklens-api:latest
docker pull ghcr.io/katunch/parklens-web:latest
```

| Trigger | Tags |
|---|---|
| Push to `main` | `latest`, `main`, `sha-<commit>` |
| Push a `vX.Y.Z` tag | `X.Y.Z`, `X.Y`, `sha-<commit>` |
| Pull request | built to check it works, not pushed |

The `web` image proxies `/api` to a host named `api`, so run the API container under that name (as in
`docker-compose.yml`).

### Kubernetes

Manifests for the EKS cluster (https://parklens.dora.cust.sobr-brews.ch) are in [`k8s/`](k8s/). See
[`k8s/README.md`](k8s/README.md) for the deploy steps.

## Connecting the entrance camera / gate

Both endpoints are reachable through the web container, so only one port needs to be opened.

```bash
# Vehicle enters
curl -X POST http://localhost:8088/api/gate/check-in \
  -H 'Content-Type: application/json' -H 'X-API-Key: dev-gate-key' \
  -d '{"plate":"ZH 123 456","gateId":"north-entrance"}'
# → {"allowed":true,"plate":"ZH123456","reason":"PERMANENT_PERMIT","permit":{...},"eventId":"…","sessionId":"…","alarmId":null}

# Vehicle leaves
curl -X POST http://localhost:8088/api/gate/check-out \
  -H 'Content-Type: application/json' -H 'X-API-Key: dev-gate-key' \
  -d '{"plate":"ZH 123 456","gateId":"north-exit"}'
```

- `occurredAt` (ISO-8601) is optional. Use it to send the camera's own timestamp.
- Plates are normalized, so `zh 123-456` and `ZH123456` are the same vehicle.
- A check-in without a valid permit returns `"allowed": false` with an `alarmId`.
- The **Gate simulator** page (Admin → Simulator) lets you try this from the browser without real hardware.

## Permit rules

- **Permanent**: valid until an admin revokes it.
- **Daily**: valid for one calendar day (00:00–23:59) in `APP_TIMEZONE` (default `Europe/Zurich`).
- **Requests** from the public form start as *pending* and are valid only once an admin approves them.
- **Alarms**
  - *Unauthorized entry*: a check-in with no valid permit.
  - *Overstay*: a car still parked after its daily permit's day has ended (checked every minute).

## Alarm webhook

Configure it in **Admin → Settings**: URL, format (`generic` JSON, `slack` incoming webhook, or `teams` Workflows
webhook), and on/off. Use **Send test** to check the connection. Failed deliveries are retried 3 times, and the result
is shown on each alarm.

## Development

```bash
# database only, published on localhost:5432 (dev override)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db

# api: defaults to postgres://parklens:parklens@localhost:5432/parklens
cd api && npm install && npm run dev      # http://localhost:3000 (migrates + seeds on start)
npm test                                  # unit tests; integration tests also run when TEST_DATABASE_URL is set

# web
cd web && npm install && npm run dev      # http://localhost:5173, proxies /api → :3000
npm test && npm run typecheck
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the architecture, data model and full API contract, and
[`docs/UX.md`](docs/UX.md) for the UX specification.
