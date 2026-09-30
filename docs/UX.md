# ParkLens: UX Specification (v2, command center)

Companion to `ARCHITECTURE.md`, which defines the API. This document never changes the API.
Tokens: `web/src/styles/tokens.css`. Copy: `web/src/i18n/locales/{en,de}.json`. Keys are written as
`namespace.key` (e.g. `alarms.banner.resolve`). Components must use **semantic tokens**
(`--color-*`, `--glass-*`, `--glow-*`, `--chart-*`, `--plate-*`, `--cc-*`, `--text-*`, `--space-*`, …), never hex values or the `--c-*` primitives.

**v2** keeps every v1 flow, state, a11y rule, i18n key contract and error mapping. It replaces the visual
language (§1, §6), turns the dashboard into the **Command center** (§5.6), and adds the alarm takeover
(§4.6), command palette (§9), plate dossier (§10), wall mode (§11), autopilot (§12) and an effects
catalogue (§13). §14 lists what was removed or renamed.

**Visual target:** `docs/design/command-center.html`. It's self-contained, so open it in a browser. Hash
switches: `#still` (no autopilot), `#alarm` (fires a takeover), `#wall`, `#palette=zh` (combine with `&`).
The "Component kit" section at the bottom shows every restyled core component.

---

## 1. Design direction (v2)

**Daylight command center.** Think of a control tower in daylight: a bright blueprint room. The parking
lot is drawn as a plan, cameras lock on to number plates, and exactly one screen is dark: the camera
monitor. The room is calm by default, and red appears only when a car without a permit is on the lot.

**Principles**
1. **Light first; dark is an accent.** Dark surfaces are limited to the command strip, the gate scanner
   instrument, tooltips and the parking-guidance plaque, about 15–20% of the command center and less
   elsewhere. Pages, panels, forms and tables stay light.
2. **One motif: the lock-on reticle.** ANPR corner brackets appear:
   - on a plate while it is scanned, focused or hovered;
   - around lot tiles on hover and focus;
   - as the viewfinder of the scanner;
   - as static registration marks on instrument corners.

   The reticle replaces v1's yellow lane marker as the ownable element.
3. **Motion reports data.** Every animation corresponds to a real event: a car scanned, a tile arriving,
   a number changing, an alarm. Ambient motion (light fields, radar) is slow and quiet. Nothing loops
   fast except the scan beam while it scans.
4. **Glass is structure.** Instruments are frosted glass panels over a blueprint grid, with hairline
   borders and an inner top highlight. Content-heavy surfaces (tables, forms, dialogs) use near-opaque
   glass so text never sits on busy backgrounds.
5. **The Swiss plate stays the signature.** It now has a small Swiss shield, sits inside a reticle
   when it matters, and glows green or red on a verdict (§6 PlateChip).

**Core palette** (full scales in `tokens.css`)

| Name | Hex | Role |
|---|---|---|
| Paper | `#F3F6FA` | Page background under the blueprint grid |
| Ink | `#101C2E` | Text; plate characters use `#0A1322` |
| Signal blue | `#1F56E6` | Actions, links, focus, brand (Swiss "P" sign) |
| Scan cyan | `#06AFD4` | Live data: scan beam, radar, occupancy line, live ping |
| Night | `#0D1829` | Dark accent surfaces only |
| Status | green `#0A7F4F`, amber `#B86500`, red `#D92D20` | See §1.1 |

### 1.1 Colour meaning (strict)

| Colour | Means | Never used for |
|---|---|---|
| Red (danger) | Car on the lot without a valid permit (open alarm, unauthorized entry), destructive actions, errors, the alarm takeover | Decoration, rejected requests |
| Amber (warning) | Waiting for a decision (pending), needs checking (date passed, notification failed, silent gate) | Alarms |
| Green (success) | Valid permit, allowed entry, approved, "all clear" | – |
| Grey (neutral) | Closed history: rejected, revoked, resolved, check-out, idle gate | – |
| Blue (primary/info) | Actions, links, focus on light surfaces, brand, permanent-permit vehicles | Status |
| Cyan (live) | Live data and motion: scan beam, radar, occupancy line, live ping, day-permit vehicles, autopilot, focus ring on dark | Text on light surfaces (use `--color-live-text`) |
| Night (dark) | Accent surfaces listed in principle 1 | Page or panel backgrounds, forms |

### 1.2 Typography

Exactly two faces, each in one weight:

- **Space Grotesk 700** ("SG 700" below): headings, numbers and KPIs, plates, labels, buttons, nav, badges, readouts, table headers, reference codes.
- **Inter 400**: body text, descriptions, hints, inputs, table cells, toasts' body text.

No other weights or families exist. The one exception is `--font-mono` (system monospace), used only for
the API key hint and endpoint URLs in Settings.

- Load them self-hosted: `npm i @fontsource/space-grotesk @fontsource/inter`, then remove both
  `@fontsource/barlow*` packages. In `main.tsx`, import `@fontsource/space-grotesk/700.css` and
  `@fontsource/inter/400.css`. `tokens.css` sets `font-synthesis: none`, so the browser never fakes a weight.
- **Rule of thumb when porting v1 CSS:** anything that was weight 500/600 or used `--font-display` becomes
  `font: var(--weight-bold) … var(--font-display)`. Anything else is `var(--weight-regular) … var(--font-sans)`.
  Never put 700 on Inter. The v1 aliases `--weight-medium` and `--weight-semibold` exist only to keep
  the old CSS rendering during migration.

| Role | Face | Size token | Notes |
|---|---|---|---|
| Public h1 | SG 700 | `--text-3xl` (`--text-xl` < 720px) | `--tracking-tight` |
| Admin page h1 | SG 700 | `--text-2xl` (`--text-xl` < 720px) | `--tracking-tight` |
| Panel / instrument title (h2) | SG 700 | `--text-md` | −0.01em |
| Dialog title | SG 700 | `--text-lg` | |
| KPI value | SG 700 | `--cc-kpi-value` (40px; 72px in wall mode) | tabular numerals |
| Gauge value | SG 700 | `--cc-gauge-value` (56px; 96px in wall mode) | tabular numerals |
| Labels, buttons, nav, table headers | SG 700 | `--text-sm` / `--text-ui` | |
| Badges, axis labels | SG 700 | `--text-xs` | |
| Readouts | SG 700 | `--text-2xs` | UPPERCASE with `--tracking-readout`, the **only** uppercase text: `LIVE`, `AUTOPILOT ON`, `N OPEN ALARMS`, `SYSTEM OK`, gate states, scanner HUD, `ALLOWED` / `DENIED` / `CHECKED OUT`. Uppercase comes from CSS `text-transform`; copy stays sentence case in the JSON. |
| Body (admin) / cells | Inter 400 | `--text-ui` | |
| Body (public), inputs | Inter 400 | `--text-base` | 16px avoids iOS zoom |
| Hints, meta, captions | Inter 400 | `--text-sm` / `--text-xs` | `--color-text-muted` / `-subtle` |

Other rules:
- Tabular numerals for times, durations, counts and plates.
- Prose is limited to `--measure`.
- No ALL-CAPS headings or eyebrow labels.
- No arrows appended to link text.

### 1.3 Surfaces and depth

- **Page:** `--color-bg` with the ambient layer: two drifting light fields plus the blueprint grid
  (`--bg-grid-*`, masked to fade towards the bottom). It is fixed behind the content and never scrolls.
- **Instrument panel:** `--glass-bg` + `--glass-filter` + a 1px `--glass-border` + `--shadow-panel`
  (inner top highlight plus a soft blue ambient shadow), `--radius-lg`. Instruments on the command
  center also carry registration marks (9px L-ticks, 8px inset, `--reg-mark`) and the cursor spotlight (§13).
- **Content panel** (tables, forms, settings): the same glass without registration marks or spotlight.
- **Floating layers** (palette, dialogs, drawer, toasts): `--glass-bg-strong`, `--radius-xl`, `--shadow-lg`.
- **Dark accent surfaces** use the `--color-dark-*` tokens. Their text, focus (cyan) and glows come from
  the dark set only.
- **Radius hierarchy:** 4 (small plate, kbd) < 6 (badges, tooltips) < 10 (controls) < 16 (panels) < 22 (floating layers).

### 1.4 Public pages: the calm dose

Landing, request, status and login use the same language at lower intensity:
- The light-field layer gets `opacity: var(--bg-public-dose)` (0.6). There is no radar, spotlight or command strip.
- Forms sit on one near-opaque glass panel.
- The PlateInput shows the lock-on reticle on focus.
- The success and status panels get a single soft glow in their tone.
- One entrance per page: the main panel fades and rises by `--motion-distance` over `--dur-enter`.
- The public header is a thin light-glass bar (logo + language switcher). The footer stays as in v1.

---

## 2. Global conventions

### 2.1 Plates

- **Display string:** use `plateDisplay` when the object has one (`Permit`, `PublicRequestStatus`).
  Otherwise (`Alarm`, `ParkingSession`, `GateEvent`, check-in response) use `formatPlate(plate)`:
  - If the normalized plate matches `^([A-ZÄÖÜ]{2})(\d{1,6})$`, output the canton, a space, then the
    digits grouped in threes from the right: `ZH123456 → ZH 123 456`, `BE98765 → BE 98 765`,
    `SG1234 → SG 1 234`, `LU777 → LU 777`.
  - Otherwise return the normalized plate unchanged.
- For a `GateEvent` whose `plateRaw` differs from the formatted plate, show it as a tooltip
  (`title`) using `activity.cameraRead`.
- `normalizePlate(s)` on the client must mirror the backend: uppercase, then strip everything except
  `A-Z 0-9 Ä Ö Ü`. A plate is valid when the result is 2 to 12 characters long.
- Search fields send the text as typed. The backend normalizes it.

### 2.2 Dates, times, durations

- **Always format in the app timezone**, not the browser's. Admin pages read `timezone` from
  `GET /api/settings`. Public pages read it from `GET /api/health`. Fall back to `Europe/Zurich`.
- **Locales:** `en` → `en-GB`, `de` → `de-CH`. Use `Intl.DateTimeFormat` with `timeZone` and `hourCycle: 'h23'`.

| Format | en | de | Options |
|---|---|---|---|
| `dateTime` | 29 Sep 2026, 08:12 | 29.09.2026, 08:12 | en: day numeric, month short, year numeric; de: day/month 2-digit, year numeric; + hour/minute 2-digit |
| `date` | 29 Sep 2026 | 29.09.2026 | as above, without time |
| `dateWeekday` (day permits) | Tue, 29 Sep 2026 | Di., 29.09.2026 | + `weekday: 'short'` |
| `time` | 08:12 | 08:12 | hour + minute |
| `timeSeconds` (simulator) | 08:12:05 | 08:12:05 | + second |

- A `validDate` (`YYYY-MM-DD`) is a calendar date. Format it with `timeZone: 'UTC'` after parsing it
  as UTC midnight. Any other method can shift it by a day.
- **Today** (for date `min`/`max` and the public "expired" check) is
  `Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())`, which returns `YYYY-MM-DD`.
- **Relative time** (`<RelativeTime>`) is used in live feeds: command-center instruments, alarm list, request
  queue, gate log.
  - Under 45 s: `common.time.justNow`
  - Under 60 min: `Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })`, giving "5 min ago" / "vor 5 Min."
  - Same calendar day (app timezone): `common.time.today` + `time`, giving "Today, 08:12" / "Heute, 08:12"
  - Previous day: `common.time.yesterday` + `time`
  - Older: `dateTime`
  - Always render `<time dateTime={iso} title={dateTime}>`. A single shared ticker re-renders every 30 s.
- **Durations** (`durationMinutes`, or computed live from `enteredAt`):
  - Under 60 min: `common.duration.minutes`
  - Under 24 h: `hoursMinutes`, or `hours` when the minutes are 0
  - Otherwise: `daysHours`, or `days`

  Example: "2 h 14 min" / "2 Std. 14 Min."
- **Numbers:** `Intl.NumberFormat(locale)`. de-CH uses the ’ thousands separator.

### 2.3 Copy and i18n

- All strings come from the JSON files. Never concatenate translated fragments; use `{{var}}`
  interpolation. Plurals use `count` with `_one`/`_other`.
- An action keeps its verb through the flow. "Approve" produces "Request for ZH 123 456 approved";
  "Revoke permit" produces "Permit … revoked".
- German is Swiss standard German: "ss" (never "ß"), the "Sie" form, and Swiss terms (Kontrollschild,
  Bewilligung, Gesuch, parkieren), with «guillemets» for quotes.
- **Language:** `localStorage["parklens.lang"]`. The default comes from `navigator.language`: anything
  starting with `de` gives `de`, everything else `en`. Keep `<html lang>` in sync.

### 2.4 API errors → UI

Translate with `t('errors.' + code)`, falling back to `errors.UNKNOWN`. A failed fetch (network error)
maps to `errors.NETWORK`.

| Situation | Display |
|---|---|
| Form submit error with a field-specific code (below) | Inline error on that field, then focus it |
| `VALIDATION_ERROR` with `details` | Map each detail to its field when the path matches a field name, otherwise show a form-level InlineAlert |
| Any other form error | InlineAlert (danger) directly above the submit button |
| Row actions (approve, reject, revoke, resolve, remove) | Error toast |
| `401` on any admin call | Clear the token, close SSE, go to `/login?expired=1&from=<path>`. **Exception:** `INVALID_CREDENTIALS` from change-password is a field error, not a logout. |
| Query load failure | Panel-level error EmptyState with "Try again" |

Field mapping:

| Code | Maps to |
|---|---|
| `INVALID_PLATE` | Plate field |
| `DATE_IN_PAST`, `DATE_TOO_FAR` | Date field |
| `ALREADY_PERMITTED` | Plate field (admin); form-level `request.errors.alreadyPermitted` (public) |
| `DUPLICATE_REQUEST` | Form-level `request.errors.duplicate` + link `request.errors.duplicateAction` → `/request/status` |
| `EMAIL_TAKEN` (409) on `POST /api/admins` | Email field, `settings.admins.duplicateEmail` |
| `INVALID_STATE` on approve/reject/revoke/resolve | Toast, then refetch the list |
| `RATE_LIMITED` on the public request form | `request.errors.rateLimited` |

### 2.5 Validation rules (client-side, mirroring the API)

| Field | Rule | Message key (`validation.*`) |
|---|---|---|
| plate | Required; normalized length 2–12 | `plateRequired`, `plateInvalid` |
| holderName | Required; trimmed 2–100 | `nameRequired`, `nameTooShort {min:2}`, `tooLong {max:100}` |
| holderEmail | **Required on the public form**, optional for admins; ≤ 254 characters; `^[^\s@]+@[^\s@]+\.[^\s@]+$` | `emailRequired`, `emailInvalid` |
| validDate (daily only) | Required; ≥ today; ≤ today + 60 d (public) or + 365 d (admin) | `dateRequired`, `dateInPast`, `dateTooFar {date}` |
| requestNote, decisionNote, resolve note | Optional, ≤ 500 | `tooLong {max:500}` |
| gateId | Optional, ≤ 50 | `gateTooLong {max:50}` |
| email (login, add admin) | Required, format | `emailRequired`, `emailInvalid` |
| password (login, current) | Required | `passwordRequired` |
| new password, admin initial password | 10–200 characters | `passwordTooShort {min:10}` |
| repeat password | Equals the new password | `passwordMismatch` |
| webhook url | Required only when enabled; starts with `http://` or `https://` and parses with `new URL()` | `urlRequired`, `urlInvalid` |
| reference | Required; trimmed and uppercased before sending | `referenceRequired` |

- Validate on submit first. After the first submit, re-validate each field as it changes. The plate
  and email fields also validate on blur once touched.
- After a failed submit, focus the first invalid field. With two or more errors, also show
  `validation.summary_*` in an InlineAlert (`role="alert"`) at the top of the form.
- Keep submit buttons enabled. Signal invalid input with errors, not with disabled buttons.
- Trim every string before sending, and omit empty optional fields (don't send `""`).

### 2.6 Loading, empty, error, toasts

- **Loading:** skeletons appear only after 300 ms, to avoid flicker. Tables show 5 skeleton rows,
  panel lists 3, and KPI values a 48px bar. Skeletons are static `--color-surface-sunken` blocks.
  Background refetches never show skeletons.
- **Empty:** an EmptyState with icon, title, body and an optional action. Each screen lists its keys below.
- **Load error:** EmptyState, `error` variant: `TriangleAlert` icon, `errors.loadFailedTitle` /
  `errors.loadFailedBody`, and a "Try again" button (`common.actions.tryAgain`) that refetches.
- **Toasts:**
  - Position: bottom-right on desktop (24px inset); bottom-centre on mobile, above the tab bar.
  - At most 3, newest on top.
  - Success and info close after 5 s, errors after 8 s. Hover or focus pauses the timer. Every toast has a close button.
  - Success and info use `role="status"`; errors use `role="alert"`.

---

## 3. Information architecture and navigation

### 3.1 Routes and URL state

URL state keeps views shareable and makes the back button work.

| Route | Query params |
|---|---|
| `/` | – |
| `/request` | `plate` (prefilled from the landing page), `type=permanent\|daily` |
| `/request/status` | – |
| `/request/:token` | – |
| `/login` | `from`, `expired=1` |
| `/admin` | `wall=1` (wall mode, §11) |
| `/admin/alarms` | `status=open\|resolved\|all` (default `open`), `plate`, `focus=<alarmId>`, `page` |
| `/admin/requests` | `tab=pending\|all` (default `pending`), `page` |
| `/admin/permits` | `q`, `status`, `type`, `activeToday=true`, `page` |
| `/admin/activity` | `tab=parked\|log` (default `parked`), `plate`, `direction`, `authorized`, `page` |
| `/admin/simulator` | `plate` (prefill, e.g. from the palette) |
| `/admin/settings` | – |
| any admin route | `dossier=<normalized plate>` opens the PlateDossier (§10) |
| any unknown route | Not-found page (`errors.notFoundPage.*`) |

### 3.2 Public shell

```
┌──────────────────────────────────────────────────────────────────────┐
│ [P] ParkLens                                                EN | DE  │  header 64px, light glass bar, hairline bottom
├──────────────────────────────────────────────────────────────────────┤
│        ┌──────────────── max 560px, left-aligned text ──────────┐    │  page: --color-bg + ambient (calm dose, §1.4)
│        │  page content (forms on one glass panel)               │    │
│        └────────────────────────────────────────────────────────┘    │
│        Admin login                                                   │  footer link, sm, muted
└──────────────────────────────────────────────────────────────────────┘
```
- **Logo mark:** a 26px square with 7px radius, a `--c-blue-500 → --color-logo-bg` gradient and a white
  "P" in SG 700 at 16px. It gets a soft blue glow only inside the dark command strip. The wordmark
  "ParkLens" is SG 700 at `--text-ui`/`--text-md`. Reuse the same "P" square as the SVG favicon.
- **Language switcher:** a compact SegmentedControl on the right of the header.
- **Footer:** the link `public.adminLogin` → `/login`, hidden on `/login` itself.

### 3.3 Admin shell, desktop (≥ 960px)

The shell has three layers: the dark **command strip** (global, sticky, `--strip-h`), a **light glass
sidebar** (nav only), and the content area over the ambient background.

```
┌ command strip (dark, 44px, sticky, z strip) ───────────────────────────────────────────────────────────────────┐
│ [P] ParkLens │ ●LIVE  [⚠ 1 OPEN ALARM]  [➤ AUTOPILOT ON]  ●SYSTEM OK  2 GATES ACTIVE   [⌕ Search plates, pages, actions ⌘K]  14:32:07 Zurich  (snd)  EN|DE  (wall)  (PA) │
├──────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────┤
│ sidebar 232px        │ ┌ AlarmBanner (sticky under the strip, only when needed, §4.2) ─────────────────────┐   │
│ light glass          │ └───────────────────────────────────────────────────────────────────────────────────┘   │
│ ▍Command center      │  Command center                                           [page actions]                 │
│  Alarms          (1) │  Wednesday, 30 September 2026                                                           │
│  Requests        (2) │                                                                                         │
│  Permits             │  … content, max --content-max, padding --page-pad-x/y                                    │
│  Activity            │                                                                                         │
│  Gate simulator   ●  │  (● = autopilot running)                                                                 │
│  Settings            │                                                                                         │
│ ┌ Lot  23 / 40 ────┐ │                                                                                         │
│ │ ████████████▌░░░ │ │                                                                                         │
│ └──────────────────┘ │                                                                                         │
└──────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────┘
```

**Command strip** (component spec in §6 CommandStrip). Left to right:

| Slot | Content | Behaviour |
|---|---|---|
| Brand | Logo mark + "ParkLens" | Link to `/admin` |
| LIVE readout | Green dot (ping) + `nav.live.connected` | Amber + `nav.live.connecting` / `nav.live.reconnecting` when SSE is down (§4.1) |
| Alarm chip | `Siren` + `nav.openAlarms_*` | Only while `summary.openAlarms > 0`. Red glass chip. Links to `/admin/alarms?status=open`. Bumps on `alarm.created`. |
| Autopilot chip | `Navigation` icon + `strip.autopilot` | Only while autopilot runs (§12). Animated cyan stripes. Opens the autopilot popover. |
| System readout | Dot + `strip.system.*` | From `GET /api/health` (refetch every 60 s): `ok` / `degraded` (db not ok) / `offline` (request failed) |
| Gates readout | `strip.gatesActive_*` | Gates with an event in the last 10 min, from `GET /api/dashboard/gates`. Hidden < 1500px. |
| Search | Button styled as a field: `strip.search` + `⌘K` hint | Opens the command palette (§9). Shows `Ctrl K` on non-Apple platforms. |
| Clock | `HH:mm:ss` in the app timezone + place name (`timezone` after the last `/`, `_` → space) | Ticks each second, aligned to the second. `aria-label` `strip.clockLabel`. Place hidden < 1500px. |
| Sound | Icon button `Volume2` / `VolumeX`, `aria-pressed`, `nav.sound.label` | Replaces the v1 sidebar switch (§4.3) |
| Language | Dark compact SegmentedControl EN/DE | |
| Wall mode | Icon button `Maximize` (`strip.wallEnter`). In wall mode, a labelled button `strip.wallExit`. | §11 |
| Account | Avatar with initials. Menu: "Signed in as {name}", email, Change password (→ Settings), Log out. | Replaces the v1 sidebar footer |

**Sidebar:**
- Light glass (`--color-nav-bg` + `--glass-filter`, 1px `--color-nav-border`), sticky below the strip.
- Nav items: 40px, SG 700 `--text-ui`, 18px icon, `--color-nav-text`; hover `--color-nav-hover-bg`.
- Active item: `aria-current="page"`, `--color-nav-active-bg`, `--color-nav-text-active`, and a 3px
  `--color-nav-marker` bar with `--glow-marker` on its left edge.
- CountBadges as in v1.
- The Gate simulator item shows a 7px cyan dot while autopilot runs.
- **Bottom: lot meter.** "Lot", `{parked} / {capacity}` (SG 700) and a 6px bar with authorized (blue)
  and unauthorized (red) segments, from `summary`. It links to `/admin`.

The v1 sidebar footer (live indicator, sound switch, language, user, logout) is gone. Those controls
now live in the strip.

**Content:** unchanged from v1 (skip link, `main#content`, page header), except that the command
center uses the full `--content-max` width.

### 3.4 Admin shell, mobile and tablet portrait (< 960px)

```
┌──────────────────────────────────────────────┐
│ [P] ●LIVE [⚠ 1 OPEN ALARM] [➤]      (⌕) (PA) │  top bar = the command strip, 52px, dark, sticky
├──────────────────────────────────────────────┤
│ ┌ AlarmBanner ─────────────────────────────┐ │
│ └──────────────────────────────────────────┘ │
│  content (padding 16px)                      │
├──────────────────────────────────────────────┤
│ Center  Alarms(1)  Requests(2)  Permits  More│  tab bar 64px + safe area, light glass
└──────────────────────────────────────────────┘
```
- **Top bar:**
  - Brand is the logo mark only below 720px; the wordmark shows at 720–959px.
  - LIVE readout.
  - Alarm chip (count only, below 480px).
  - Autopilot chip, icon only.
  - Search icon button (opens the palette full-screen as a sheet).
  - Avatar menu.
  - System/gates readouts, clock, sound, language and wall mode move into the **More** sheet. Wall mode
    is not offered below 960px.
- **Bottom tab bar:** as in v1, restyled as light glass. The first tab is labelled
  `nav.dashboardShort` ("Center" / "Leitstand"). The active tab uses `--color-tabbar-text-active`.
- **More sheet:**
  - Links: Activity, Gate simulator, Settings.
  - Alarm sound, language.
  - "Signed in as", log out.
  - System status line.
- **Content** bottom padding is `--tabbar-h` + 16px + the safe-area inset.

### 3.5 Auth flow

- Admin routes without a token redirect to `/login?from=<path>`.
- A successful login goes to `from` (if it starts with `/admin`), otherwise `/admin`.
- `/login` while already logged in redirects to `/admin`.
- **Logout:** clear the token, close SSE, clear the React Query cache, then navigate to `/login` with
  router state `{ loggedOut: true }` so `login.loggedOut` is shown.
- A `401` goes to `/login?expired=1`, which shows `login.sessionExpired` as an info InlineAlert.

---

## 4. Live updates and alarms

### 4.1 SSE connection (one per admin session, owned by the shell)

- **Connection:** `new EventSource('/api/stream?token=…')`.
- **States:** `connecting` → `live`. On error the state becomes `reconnecting`. EventSource retries on
  its own. After 3 consecutive errors, close it and recreate it with a 2 / 5 / 10 / 30 s backoff.
- **LIVE readout (strip):**
  - `live`: green dot with ping, `nav.live.connected`.
  - Otherwise: static amber dot with `nav.live.connecting` / `nav.live.reconnecting`, plus
    `nav.live.hintDisconnected` as a tooltip and `aria-describedby`.
  - While not live, the Gate feed instrument also dims its stage and shows the same hint.
- **After reconnecting**, invalidate every admin query.
- **Safety net:** `summary`, `timeline`, `gates` and `alarms` refetch every 60 s. Clocks, durations and
  "last event" ages tick locally.

| Event | Invalidate query keys | UI effect |
|---|---|---|
| `alarm.created` | `summary`, `alarms`, `sessions`, `gate-events`, `timeline`, `gates` | Alarm takeover (§4.6): edge glow, banner, badge bump, chime, announcement. Lot tile turns red. |
| `alarm.updated` | `summary`, `alarms`, `sessions` | If `resolved`, remove its banner and stop the wall-mode residual glow. Webhook status changes update silently. |
| `gate.event` | `gate-events`, `sessions`, `summary`, `timeline`, `gates` | Gate feed plays the plate scan. Lot tile arrives or leaves. KPIs count. Radar blip. Live ping in visible lists. |
| `permit.changed` | `permits`, `summary`, `sessions` | Lists update. A tile's colour changes if its session gets a permit. |
| `request.created` | `permits`, `summary` | Info toast `requests.newRequestToast` with action `requests.review` (suppressed on `/admin/requests`) |

**Scan-first ordering.** A `gate.event` for a check-in often arrives together with its `alarm.created`.
The Gate feed plays the scan first, and the rest waits for the verdict:
- Takeover, tile and KPI updates start when the verdict locks (≈ 1.2 s), not when the event arrives.
- Screen-reader announcements are **not** delayed.
- Under reduced motion there is no delay.

### 4.2 AlarmBanner

Two modes, by route:
- **Other admin pages (persistent, as in v1):** it shows open alarms minus the ids dismissed this session
  (`sessionStorage["parklens.dismissedAlarms"]`), newest first. It is hidden on `/admin/alarms`.
- **Command center `/admin`, including wall mode (transient):** it appears only for a *new*
  `alarm.created` (the takeover, §4.6; a joined alarm switches it to the newest and restarts the
  countdown) and collapses into the strip's alarm chip after 10 s (it flies to the chip, which pulses
  once). The countdown pauses while the banner is hovered or holds focus, and in a hidden tab; a 3px
  white line along its bottom edge shows the time left. Pre-existing open alarms never show it: the
  strip chip, KPI tile, lot tile and Open alarms instrument already do. Resolving or dismissing the
  alarm closes it at once.
- Its actions are `alarms.banner.resolve` (opens the global ResolveAlarmDialog), `alarms.banner.view` and dismiss.

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ (Siren) Car without permit entered  [ZH 999 999]                  [ Resolve ]  View alarm  ✕ │
│         14:32 at gate south  1 more open alarm                                              │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

**v2 look:**
- Solid red gradient (`--c-red-500 → --c-red-600 → --c-red-700`, 100°), `--radius-lg`, `--shadow-banner`
  (red-tinted drop plus a light inner top edge). Text `--color-on-danger`; meta `--color-on-danger-muted`.
- Siren tile: 40px, 12px radius, white 16% glass, 22px icon.
- Title in SG 700 `--text-md`, with a PlateChip md next to it. The plate stays white.
- Buttons: Resolve (`inverse`), View alarm (underlined white link), dismiss (icon button).

**Placement:**
- Default (persistent): sticky at `top: calc(var(--strip-h) + 12px)` at the top of the content column.
  Below 720px it scrolls away with the page (the top-bar alarm chip stays).
- Command center (transient): in a zero-height sticky slot at the same position, so it floats over the
  page head for its 10 s and the instruments never shift.
- **Wall mode:** `position: fixed` over the KPI row for its 10 s (full content width, 16px below the
  strip). Title `--text-xl`, meta `--text-base`. After it collapses, the breathing edge glow (§4.6) is
  the persistent signal.

**Motion** (timings in §13):
- Enter: slide down 14px + fade, `--ease-out`, 460 ms.
- One white sheen sweeps across (1.1 s, after 200 ms).
- The siren icon swings once (±14°, 900 ms).
- No loops.

**Mobile (< 720px):**
- Title and plate wrap.
- Actions become a full-width row.
- ✕ stays top-right.

The banner is not a live region (§4.3 announces).

### 4.3 Announcement, sound, title, badge

- **Screen readers:** the shell renders `<div class="sr-only" aria-live="assertive" aria-atomic="true">`.
  On `alarm.created`, it sets `alarms.announce.<type>` with `{plate, time}` and clears it after 5 s.
- **Sound:**
  - The toggle is the sound icon button in the command strip (`aria-pressed`, label `nav.sound.label`) and a Switch in the mobile More sheet.
  - It is stored in `localStorage["parklens.alarmSound"]` (`"on"` or `"off"`) and **defaults to off**.
  - Switching it on plays the chime once, which confirms the setting and unlocks audio under the
    autoplay policy, and shows toast `nav.sound.enabled`.
  - On `alarm.created`, play the chime once, at most one chime per 3 s. Never on `alarm.updated`.
  - Chime: Web Audio, no asset needed. Two sine tones, 880 Hz then 660 Hz, 160 ms each with a 60 ms
    gap, gain 0.15, 10 ms attack and release.
- **Document title:** `nav.documentTitleAlarms` when `summary.openAlarms > 0`, else
  `nav.documentTitle`. `{page}` is the current nav label.
- **Nav badge:** follows `summary.openAlarms`. It scale-bumps once (1 → 1.2 → 1, `--dur-base`) when
  the count increases. No bump under reduced motion.

### 4.4 Live ping (v1 "fresh paint")

When a row, card or tile whose id just arrived via SSE is rendered:
- It gets `.is-fresh`: background `--color-highlight` (cyan-50; on the dark feed, `rgb(63 216 245 / .16)`).
- Hold 600 ms, then fade to transparent over `--dur-highlight`.
- New list rows also expand from 0 height (motion `layout` + `initial={{height: 0, opacity: 0}}`).

Rows targeted by `?focus=<id>` behave as in v1.

### 4.5 ResolveAlarmDialog (global, mounted once in the shell)

It opens from the banner, the command center's Open alarms instrument, the plate dossier and the alarms page. Dialog size md.

```
Resolve alarm                                                          ✕
[ZH 999 999]   [ShieldAlert No permit]
Entered without a valid permit
Today, 08:12 at gate main    [Car Still parked]    2 earlier alarms in 30 days

Note (optional)
┌──────────────────────────────────────────────────────────────────┐
│ e.g. Visitor for Marco Rossi, confirmed by reception             │
└──────────────────────────────────────────────────────────────────┘
Visible to other admins.

[ ] Grant a day permit for today
    For a legitimate visitor. The car counts as authorized for the rest of today.
      Driver's name       [                         ]      ← shown when checked
      Email (optional)    [                         ]

                                        [ Cancel ]  [ Resolve alarm ]
```

- **Data:** the `Alarm`: plate, type, occurredAt, gateId, isStillParked, previousAlarmCount.
  - When `previousAlarmCount > 0`, show `alarms.previous_*` in `--color-warning-text`.
  - When `isStillParked`, show a neutral "Still parked" badge.
- **Grant checkbox** (`alarms.resolveDialog.grantLabel`):
  - Hint is `grantHint` when `isStillParked`, otherwise `grantHintLeft`.
  - Checking it reveals the holder fields and moves focus to "Driver's name".
- **Submit label:** `submit`, or `submitGrant` when the checkbox is checked.
- **Body:** `{ note?, grantDailyPermit?: { holderName, holderEmail? } }`.
- **Validation:** when granting, holderName is required (2–100). Email is optional but must be
  well-formed. The note is limited to 500 characters.
- **Success:** close the dialog and show toast `success` or `successGrant {name}`. Invalidate
  `alarms`, `summary`, `sessions` and `permits`. The banner for this alarm disappears.
- **422 / `INVALID_STATE`:** close the dialog, show an info toast `alreadyResolved`, and refetch.
- **Initial focus:** the Note textarea.

### 4.6 Alarm takeover (new in v2)

**Purpose:** make a new unauthorized entry impossible to miss anywhere in the admin area, strongly
but calmly, without ever blocking work.

**Trigger:** `alarm.created` only. It is never triggered by alarms that already exist at load (those get
the badge and, outside the command center, the persistent banner, §4.2). A second `alarm.created` within 10 s joins the running takeover: counts
update and the banner switches to the newest alarm, but the pulses don't restart.

**Sequence** (t = when the verdict locks in the gate feed, or on arrival when the feed isn't visible or
the alarm is an `overstay`):

| t | Layer | What happens |
|---|---|---|
| 0 | Edge glow | Fixed full-viewport layer (`.takeover`, `z-index: --z-takeover`, `pointer-events: none`). It has three inset red shadows: a 2px edge line, a 64px inner glow and a 180px faint wash. Opacity keyframes over `--dur-takeover` (2.4 s): 0 → 1 at 9% → 0.28 at 32% → 0.85 at 50% → 0 at 100%. Two pulses, then gone. |
| 0 | Badges | Nav alarm badge, strip alarm chip and the Open alarms count bump (scale 1 → 1.32 → 1, 460 ms, `--ease-snap`). The strip chip appears if it was hidden. |
| 0 | Sound | Chime (v1 §4.3), only if alarm sound is on. At most one chime per 3 s. |
| 0 | Screen reader | Assertive announcement `alarms.announce.<type>`. |
| +80 ms | Banner | Slides in (§4.2), unless the admin is on `/admin/alarms`. On the command center it is transient: it collapses into the strip chip after 10 s. |
| 0–600 ms | Instruments | The Open alarms KPI turns alert red and counts up. The lot tile turns red and starts its pulse. The alarm item slides into the Open alarms instrument (`--ease-snap`). The radar gets a red blip. |

**Rules:**
- Never steal focus. Never open a dialog. Never block pointer input: the glow layer has `pointer-events: none`.
- Never flash more than twice. Luminance change stays well under the WCAG 2.3.1 flash threshold: two
  pulses over 2.4 s, mostly at the edges.
- **Wall mode residual:** after the pulses, while any open alarm is not dismissed, the edge glow stays
  at 0.18 ↔ 0.42 opacity, breathing over `--dur-breathe` (4 s alternate). It stops on resolve or dismiss.
- **Reduced motion:** no pulses and no breathing. Show the glow layer statically at opacity 1 for 4 s
  (wall mode: statically at 0.35 while unresolved). The banner appears without sliding. Badges don't bump.
- The takeover runs in every admin route, including dialogs being open (the glow sits below dialogs
  and the palette).

---

## 5. Screens

### 5.1 Landing `/`

**Purpose:** get employees and visitor hosts into the request form quickly. The status lookup is secondary.

```
Parking at the office                                           ← h1 (display 3xl)
A camera at the entrance reads each number plate and checks it
against the permit list. Cars without a permit are reported to
the parking team.                                               ← lead, --text-md, muted

Your plate
╔══════════════════════════════════════════╗
║ ZH 123 456                                ║                   ← PlateInput lg (optional)
╚══════════════════════════════════════════╝
[ Request a permit ]                                            ← primary lg (block < 720)

Already sent a request? Look it up with your reference code.
[ Check a request ]                                             ← secondary md

How it works
 (1) Send a request         (2) The parking team decides   (3) Check the status
     A permanent permit …       They approve or reject …       Open your status link …
```
- The page is the public shell, left-aligned. Top padding is 64px on desktop and 32px on mobile.
- **"Request a permit"** (`landing.requestCta`) goes to `/request?plate=<normalized>` when the plate
  input holds a valid plate, or to `/request` when it is empty. An invalid plate shows
  `validation.plateInvalid` inline. Pressing Enter in the plate input triggers the same action.
- **"Check a request"** (`landing.statusCta`) → `/request/status`.
- **Hero (≥ 1024px):** the column widens to 1120px; the headline, form and status link sit left
  (540px) and a dark scanner card sits right: the gate-feed stage with lock-on brackets decoding a demo
  plate, then an ALLOWED verdict, the pass dropping into a three-row list, looping every ~4.3 s. Slight
  3D tilt, slow float, soft blue/cyan glow. Decorative (`aria-hidden`); pauses off-screen and in hidden
  tabs; reduced motion shows one static locked frame. Below 1024px a compact version (stage only) sits
  between the lead and the form. The form stays the primary action.
- **Steps** are an `<ol>` because they are a real sequence.
  - Each number sits in a 28px circle with a 1.5px `--color-text` outline, in SG 700.
  - Title: SG 700 `--text-ui`. Body: Inter `--text-sm`, muted.
  - Three columns at ≥ 720px, stacked below.
- The page makes no API calls.

### 5.2 Request form `/request`

**Layout:**
- Back link `public.backToStart`, then h1 `request.title` and lead `request.lead`.
- A white Panel holds the form, with 24px padding (32px at ≥ 720px).

```
What do you need?
┌─────────────────────────────┐ ┌─────────────────────────────┐
│ (Car)            (●)        │ │ (CalendarDays)       ( )    │   SegmentedControl, card variant
│ Permanent permit            │ │ Day permit                  │
│ For your own car. Valid     │ │ For one day, e.g. a visitor │
│ until revoked.              │ │ or a one-off.               │
└─────────────────────────────┘ └─────────────────────────────┘
Licence plate
╔═════════════════════════════════════════════════════════════╗
║ ZH 123 456                                                   ║   PlateInput lg
╚═════════════════════════════════════════════════════════════╝
As shown on the plate, e.g. ZH 123 456.
Date                                                  (daily only)
[ 2026-09-30  ▾]   Any day from today until 28 Nov 2026.
Driver's name / Your name
[                                  ]
Contact email / Your email
[                                  ]
Only used by the parking team if they have questions about this request.
Note (optional)
[ e.g. visiting Anna Muster, Marketing                          ]
[ Send request ]
```

- **Type:** `request.typeLegend` with options `request.type.*`. The default comes from `?type`, else `permanent`.
- **Plate:** prefilled from `?plate`.
- **Date:** only rendered for daily permits. `min` is today and `max` is today + 60. No default value.
  Hint `request.date.hint {maxDate}` formatted as `date`. Switching type keeps the value but only
  sends it for daily permits.
- **Name and email labels depend on the type:**
  - Name: `request.name.labelPermanent` or `labelDaily` (daily also shows hint `hintDaily`).
  - Email: `request.email.labelPermanent` or `labelDaily`, always with hint `request.email.hint`.
- **Note:** `request.note.*`, 3 rows, counter from 400 characters.
- **Submit:** primary lg (`request.submit`, loading label `request.submitting`), full width below 720px.
  Sends `POST /api/public/requests`. Errors follow §2.4.
- **Success:** stays on the same route and replaces the form. Focus the success h1 (`tabIndex={-1}`)
  and update the document title.

```
(CircleCheck 32px, success)
Request sent
The parking team will review your request for [ZH 123 456].

Reference code
┌───────────────────────────────────┐
│ PL-7K3Q9                   [Copy] │   CopyField, SG 700 --text-2xl, tracking 0.04em
└───────────────────────────────────┘
Status link
┌─────────────────────────────────────────────────────────┐
│ https://…/request/9fJx…Qe2                  [Copy link] │   CopyField, Inter --text-sm, middle-truncated
└─────────────────────────────────────────────────────────┘
Save the link or note the reference code. To look up the request later, you need the code and your plate.

[ Open status page ]    Request another permit
```
- The status link is `${location.origin}/request/${token}`.
- "Request another permit" (`request.success.another`) resets the form, keeps the type, and shows the form again.

### 5.3 Status lookup `/request/status`

- h1 `status.lookup.title` and lead `status.lookup.lead`, then a Panel form:
  - **Reference code:** Input in SG 700, uppercased as the user types, `autocomplete="off"`,
    placeholder `status.lookup.referencePlaceholder`.
  - **Plate:** PlateInput md.
  - **Submit:** `status.lookup.submit`.
- **On 200:** `navigate('/request/' + token, { replace: true, state: data })`. Seed the query cache with the response.
- **On 404:** form-level InlineAlert `status.lookup.notFound`. Never reveal which field is wrong.
- **On 429:** `errors.RATE_LIMITED`.

### 5.4 Request status `/request/:token`

**Data:** `GET /api/public/requests/:token` returns `PublicRequestStatus`. While `pending`, refetch
every 60 s and on window focus.

```
Request PL-7K3Q9                                  ← h1 --text-2xl; reference in SG 700
[ZH 123 456]                                      ← PlateChip lg

┌───────────────────────────────────────────────────────┐
│ (Clock) Waiting for approval                          │  StatusPanel (tone by state), role="status"
│ The parking team hasn't decided yet. This page        │
│ checks for updates every minute.                      │
└───────────────────────────────────────────────────────┘
│ Note from the parking team                            ← only if decisionNote; 3px left border
│ «Please use the public car park on Bahnhofstrasse.»

Request details
Type        Day permit
Date        Wed, 30 Sep 2026            (daily only)
Name        Tom Weber
Requested   29 Sep 2026, 08:12
Decided     29 Sep 2026, 10:40          (if decidedAt)

Last checked 10:41   [Refresh]
Bookmark this page to check again later.
Check another request      Send a new request (rejected / revoked / expired only)
```

| status | Condition | Tone | Icon | Keys (`status.page.*`) |
|---|---|---|---|---|
| pending | – | warning | `Clock` | `pending.title/body` |
| approved | permanent | success | `CircleCheck` | `approvedPermanent.*` |
| approved | daily, validDate ≥ today | success | `CircleCheck` | `approvedDaily.* {date: dateWeekday}` |
| approved | daily, validDate < today | neutral | `CalendarX` | `expired.* {date}` |
| rejected | – | neutral | `CircleX` | `rejected.*` |
| revoked | – | neutral | `Ban` | `revoked.*` |

- **StatusPanel:** tone background and border, `--radius-lg`, 20px padding. 24px icon, title in
  SG 700 `--text-lg`, body `--text-base`.
- **Details:** a DescriptionList. Labels come from `common.fields.*`; the type uses `common.permitTypeLong.*`.
- **404:** EmptyState with `status.notFound.title/body`, plus action `status.notFound.action` → `/request/status`.
- **Loading:** skeletons for the plate and the panel.

### 5.5 Login `/login`

- A centred column, max 400px. The logo mark sits above h1 `login.title` and lead `login.lead`,
  framed as a small static viewfinder (lock-on brackets and a resting cyan scan line, decorative).
- **Panel:**
  - Email: `type=email`, `autocomplete=username`.
  - Password: `autocomplete=current-password`, with an Eye/EyeOff icon button that uses `aria-pressed`
    and `common.actions.showPassword` / `hidePassword`.
  - Submit: primary lg, full width, `login.submit` / `login.submitting`.
- **Info InlineAlert above the form:** `login.sessionExpired` (when `?expired=1`) or `login.loggedOut` (from router state).
- **Errors:** `errors.INVALID_CREDENTIALS` and `errors.RATE_LIMITED` as a form-level InlineAlert.
  Keep the email, clear the password, and focus the password field.
- **Below the panel:** `login.publicHint` plus the link `login.publicLink` → `/`.

### 5.6 Command center `/admin` (replaces the v1 dashboard)

**Purpose:** show the state of the lot at a glance and give the shortest path to act. It is designed
first for 1440×900 (fits without scrolling), scales to 1920×1080 in wall mode (§11), and stacks down to mobile.

Header: h1 `dashboard.title`, sub-line `dashboard.today {date}` (long weekday date). Right: primary
Button `strip.wallEnter` (`Maximize` icon), shown ≥ 960px.

**1440×900 (sidebar visible, 12-column grid, gap `--cc-gap`)**

```
┌─ KPI tiles (5 × 1fr, height --cc-kpi-h 104) ─────────────────────────────────────────────────────────┐
│┌⚠ Open alarms ──┐┌ Parked now ────┐┌ Entries today ─┐┌ Requests waiting ┐┌ Valid permits today ┐   │
││ 1        ╱╲_╱  ││ 23 / 40   ╱‾‾  ││ 44    ╱╲_╱‾    ││ 2                ││ 28                  │   │
││ Denied today: 2 ││ 1 without permit││ 2 in the current…││ Oldest sent 3 h ago││ Permanent 26, day 2 │   │
│└────────────────┘└────────────────┘└────────────────┘└──────────────────┘└─────────────────────┘   │
├─ row --cc-row-main (400) ────────────────────────────────────────────────────────────────────────────┤
│┌ Occupancy (3 col) ─[P 17 free]┐┌ Parked vehicles (5 col) ── legend ┐┌ Gate feed (4 col, DARK) ─ ●LIVE ┐│
││      ╭─── arc 300° ───╮        ││ ┃ZH┃AG┃LU┃SG┃  ┃ZG┃TG┃BS┃SO┃ZH!┃ ││ [● North ACTIVE][● South ACTIVE]  ││
││     (  radar sweep   )        ││ ─ ─ ─ ─ ─ aisle ─ ─ ─ ─ ─ ─ ─ ›  ││ ┌ GATE NORTH ────── 14:31:48 ┐   ││
││     (    ( 23 )      ) lens   ││ ┃BL┃SZ┃  ┃VD┃GE┃  ┃TI┃FR┃GR┃   ┃ ││ │   ⌜ [+ ZH 271 009] ⌝       │   ││
││      ╰────────────────╯        ││ ┃BE┃  ┃ZH┃ZH┃  ┃ZH┃  ┃ZH┆VS┆   ┃ ││ │     [✓ ALLOWED]            │   ││
││ ■ With permit 22  ■ No permit 1││ ─ ─ ─ ─ ─ aisle ─ ─ ─ ─ ─ ─ ─ ›  ││ │ Permanent permit: S. Weber │   ││
││ Radar: gate events of the last …││ ┃  ┃LU┃  ┃  ┃  ┃  ┃  ┃  ┃  ┃   ┃ ││ └────────────────────────────┘   ││
││                                ││ One tile per parked car, in order…││ 14:26:10 ↗ [AG 55 780] ● Out  south││
│└────────────────────────────────┘└───────────────────────────────────┘└───────────────────────────────┘│
├─ row --cc-row-lower (224) ───────────────────────────────────────────────────────────────────────────┤
│┌ Today (8 col) ─ ■Entries ■Exits ◆Denied ─Parked ──── 44 in, 21 out, 2 denied ┐┌ Open alarms (4 col) ⓵ ┐│
││ 40 cap- - - - - - - - - - - - - - - - - - [14:32]┊////////////////////////// ││[ZH 999 999][No permit] ││
││                        ◆  ╭──────────╮ ___●      ┊//// future (hatched) //// ││          [Resolve]     ││
││            ▁ ▃ █ ▅ ▂ ▂ ▄ █ ▂ ────────────────────┊────────────────────────── ││Entered 08:12 at gate…  ││
││                ▔ ▔ ▀ ▀ ▀ ▔ (exits below the line)┊                           ││1 earlier alarm…        ││
││ 00    03    06    09    12    15    18    21                                 │└────────────────────────┘│
│└──────────────────────────────────────────────────────────────────────────────┘                          │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Grid areas: `"k×12" / "g×3 l×5 f×4" / "t×8 a×4"`, rows `auto var(--cc-row-main) var(--cc-row-lower)`.
Panels never grow a row: long content scrolls or is masked inside the panel.

**960–1279px:** sidebar visible; 2 columns. KPIs 3 + 2. Areas `"k k" "g f" "l l" "t t" "a a"`, rows
auto; gauge and feed have a min height of 420px.

**Mobile (< 720px):**
- Order: KPIs, Occupancy, Gate feed, Open alarms, Lot map, Timeline.
- KPIs become a horizontal scroll-snap row (72% card width, `scroll-snap-align: start`).
- The gauge keeps 232px; its legend and caption sit below.
- Gate feed: stage 150px plus 5 rows.
- Lot map: bays shrink to fit 10 per row (min 28px). Below 30px, the compact grid is used (see Lot map).
- Timeline: scrolls horizontally inside its panel (24 × 28px) and scrolls "now" into view on mount.

#### Data per instrument

| Instrument | Source | Refresh |
|---|---|---|
| KPI tiles | `GET /api/dashboard/summary`; sparklines from `timeline`. Requests: `GET /api/permits?status=pending&limit=1` (oldest `createdAt`). Permits breakdown: `GET /api/permits?status=approved&activeToday=true&limit=200`, counted by `type`. | SSE + 60 s |
| Occupancy gauge | `summary.parkedNow`, `parkedUnauthorized`, `capacity`. Radar: `GET /api/gate-events?limit=100`, filtered to `occurredAt` ≥ now − 60 min. | SSE + 60 s |
| Lot map | `GET /api/sessions?active=true&limit=200` | SSE |
| Gate feed + sensors | `GET /api/gate-events?limit=12` (list) and `GET /api/dashboard/gates` | SSE + 60 s (ages tick locally) |
| Timeline | `GET /api/dashboard/timeline` | SSE + 60 s (now marker moves locally each minute) |
| Open alarms | `GET /api/alarms?status=open&limit=20` | SSE + 60 s |

Each instrument loads, empties and errors on its own. Loading shows the instrument frame with a skeleton
(gauge: empty track; lot: bays without cars; feed: stage with "Connecting…"; timeline: axis only). A
load error shows the v1 error EmptyState inside the instrument.

#### KPI tiles

Each tile is a glass `<a>` instrument (registration marks, spotlight):
- Label: SG 700 `--text-sm`, muted, 15px icon.
- Value: `--cc-kpi-value`, count-up.
- Sub-line: Inter `--text-sm`.
- Optional sparkline: 88×34 SVG (150×56 in wall mode) to the right of the value, with the last point as a glowing dot.

| Tile | Value | Sub-line | Sparkline (from `timeline.buckets`) | Link | Alert |
|---|---|---|---|---|---|
| `dashboard.kpi.openAlarms` | `openAlarms` | `dashboard.kpi.deniedToday {count}` (Σ `denied`) | `denied` per hour, red | `/admin/alarms?status=open` | `> 0`: red hairline + glow, red value and label, pinging red dot instead of the icon |
| `dashboard.kpi.parkedNow` | `parkedNow` + `dashboard.kpi.capacityUnit {capacity}` | `kpi.parkedUnauthorized_*` (danger) or `kpi.allParkedAuthorized` | `occupancy`, cyan | `/admin/activity` | – |
| `dashboard.kpi.entriesToday` | `entriesToday` | `dashboard.kpi.entriesThisHour {count}` (current bucket) | `entries`, blue | `/admin/activity?tab=log` | – |
| `dashboard.kpi.pendingRequests` | `pendingRequests` | `dashboard.kpi.oldestRequest {time}` (relative), or none at 0 | – | `/admin/requests` | `> 0`: amber icon |
| `dashboard.kpi.activePermitsToday` | `activePermitsToday` | `dashboard.kpi.permitsBreakdown {permanent, daily}` | – | `/admin/permits?activeToday=true&status=approved` | – |

Sparklines start at the first bucket with activity (or 05:00) and end at the current bucket. They are
`aria-hidden`. The tile's accessible name is label + value + sub-line.

#### Occupancy gauge

- **Arc:** SVG, 232px (`--cc-gauge-d`), radius 104, stroke 12, round caps, 300° with the gap at the bottom
  (starts at 120° clockwise from 3 o'clock). Layers:
  - Track (`--gauge-track`).
  - Authorized segment (blue gradient, soft blue drop-shadow), length `300° × (parked − unauthorized) / capacity`.
  - Unauthorized segment (`--gauge-unauthorized` with red glow), directly after the authorized one.
  - If `parked > capacity`, the arc is full, and the lens shows `dashboard.gauge.overCapacity {count}` in danger text.
  - Implementation note: set `stroke-dasharray` in **px** (circumference 2π·104). Chromium ignores
    `pathLength` for CSS-set dash arrays.
- **Ticks:** 31 ticks every 10° just outside the arc; every 50° is longer and darker (`--gauge-tick`).
- **Radar:** a disc inside the arc (69% of the gauge):
  - Pale blue fill, 2 hairline rings, a crosshair.
  - A cyan conic sweep rotating once per `--dur-radar` (8 s).
  - Blips are the gate events of the last 60 min, placed like a clock face: angle = minute × 6° +
    second × 0.1°. Ring: first gate from `/dashboard/gates` inner, second outer; further gates fall back
    to the outer ring.
  - Colours: in = cyan, out = slate, denied = red.
  - Opacity fades with age (0.95 → 0.35).
  - Each blip flares (scale 1.7, full opacity) when the sweep passes it. Set its animation delay to
    `angle/360 × 8 s − sweepPhase`, where `sweepPhase` is read from the sweep's `getAnimations()[0].currentTime`.
- **Lens:** a 46% white-glass disc in the centre with `--glass-filter` blur 6px. It shows the value
  (`--cc-gauge-value`, count-up) and `dashboard.gauge.ofCapacity {capacity, percent}`. `role="img"`, `aria-label`
  `dashboard.gauge.aria`.
- **Header right: parking-guidance plaque** (dark accent, modelled on Swiss "Parkleitsystem" signs): a blue
  "P" square, then free spaces (`capacity − parkedNow`, min 0) as green glowing digits, then `dashboard.gauge.free`.
  At 0 free, the digits turn red and read `dashboard.gauge.full`.
- **Foot:** a one-line legend `dashboard.gauge.withPermit {n}` / `dashboard.gauge.noPermit {n}`, and the
  caption `dashboard.gauge.radarCaption` with `dashboard.gauge.radarHint` as its tooltip.

#### Lot map (parked vehicles)

We have no bay sensors, so the map shows **symbolic slots**: one tile per active session. The caption
`dashboard.lot.caption` states this.

**Slot assignment:**
- On first load, sort active sessions by `enteredAt` ascending and give them slots 0…n−1.
- Keep `sessionId → slot` in memory. A new session takes the first free slot. A closed session frees
  its slot, and its tile leaves.
- A reload reassigns compactly.
- Sessions superseded by a new check-in of the same plate keep the slot (same plate).

**Layout by capacity:**
- ≤ 60: the drawn lot.
  - Rows of 10 bays (`--cc-bay-w × --cc-bay-h`); two rows face an aisle (`--cc-aisle-h`).
  - Bays are separated by 2px white road markings (`--lot-marking`) on `--lot-surface`. The open side
    faces the aisle.
  - Each aisle has a dashed centre line and a painted direction chevron at its right end.
  - The last row may be partial.
- 61–200: the compact grid. 20 columns of 14px rounded squares in the same colours, no bays, with the
  same tooltips.
- \> 200: a 100-cell waffle, where each cell is `capacity/100` spaces, coloured by share. There are no
  per-car tooltips; clicking goes to Activity.
- `parked > capacity`: extra tiles go into an overflow row after the lot, with a red pill
  `dashboard.lot.overflow {count}`.

**Tile (`<button class="car">`, 72% × 82% of the bay):**
- It reads as a top-down car: rounded body, a light windscreen band towards the aisle, and a white top sheen.
- Label: the canton code (first 2 characters of the plate, SG 700 10px).

| State | Fill / edge | Extra |
|---|---|---|
| Permanent permit | `--vehicle-permanent` / solid `--vehicle-permanent-edge` | – |
| Day permit | `--vehicle-daily` / **dashed** `--vehicle-daily-edge` | – |
| No permit | `--vehicle-unauthorized` / solid red, red glow | "!" badge top-right, plus a pulse ring (`--dur-pulse`, infinite) while the session has an open alarm |
| Arriving | Drops in from the aisle side (translateY ∓16px, scale 0.8 → 1, `--ease-snap`, 620 ms) plus a cyan ping ring | – |
| Leaving | Fades and moves back towards the aisle, 360 ms | – |
| Hover / focus | Lifts 2px, reticle corners (blue, 7px) | Dark tooltip |

**Tooltip** (dark accent, `role="tooltip"`, on hover and focus):
- PlateChip sm + holder name (or `dashboard.lot.unknownVehicle`).
- Permit line (`dashboard.lot.tooltip.*`).
- `dashboard.lot.tooltip.parkedSince {duration, time}`.
- Hint `dashboard.lot.tooltip.hint`.

**Activation:**
- Click or Enter opens the **PlateDossier** (§10).
- Accessible name: `dashboard.lot.tileLabel`.
- The map is a `role="group"` with `aria-label` `dashboard.lot.title`. Tiles are in DOM order: slot order, rows left to right.

#### Gate feed (the one dark hero instrument)

- **Surface:** `--color-dark-bg` with a blue radial light from the top, `--radius-lg`, 1px `--color-dark-border`.
  Text, icons and focus use the dark tokens.
- **Header:** title `dashboard.feed.title` + a LIVE readout.
- **Gate sensors:** up to 3 cells from `/dashboard/gates`, 2 per row.

  | Age of `lastEventAt` | State | Display |
  |---|---|---|
  | < 10 min | `dashboard.sensors.state.active` | Green pinging dot |
  | < 2 h | `dashboard.sensors.state.idle` | Grey static dot |
  | ≥ 2 h between 06:00 and 20:00 local | `dashboard.sensors.state.silent` | Amber dot |

  - Each cell shows the name (`gateId` capitalised, or `dashboard.sensors.unnamed`), the state readout,
    `dashboard.sensors.lastEvent {time}` (relative, ticking) and `dashboard.sensors.counts*`.
  - A cell's `title` is `dashboard.sensors.hint`: we infer activity from events, not camera health.
  - More than 3 gates: a "+N" link to Activity.
- **Stage** (150px; 220px in wall mode):
  - A camera viewport with a scanline texture, vignette and cyan viewfinder corners.
  - HUD: `dashboard.feed.stageGate {gate}` (top-left) and `timeSeconds` (top-right), as uppercase readouts.
  - It always shows the newest event: PlateChip lg (xl in wall mode) inside a reticle, the verdict stamp
    and the reason line.
- **Scan sequence** for each new `gate.event` (details in §13):
  1. The previous stage event moves into the list (new row expands at the top).
  2. The plate appears with its final width fixed and scrambled characters. The reticle "hunts" in cyan.
  3. The beam sweeps left → right (`--dur-scan`).
  4. Characters decode left → right (`--dur-decode`).
  5. The reticle locks (snap), and the stamp appears (`--dur-verdict`):
     - `in`, allowed: green `dashboard.feed.verdict.allowed` with a stage glow; reason from `simulator.result.reason.*`.
     - `in`, denied: red `dashboard.feed.verdict.denied`; reason `simulator.result.reason.NO_VALID_PERMIT`.
     - `out`: neutral `dashboard.feed.verdict.out`; reason `dashboard.feed.reasonOut {duration}`, or
       `dashboard.feed.reasonOutUnknown` when there was no session.

  Queue: events play one at a time, each ≥ 1.4 s. If more than 3 are waiting, the older ones skip the
  animation and go straight into the list.
- **List:**
  - The previous 8 events in rows of 38px: time (SG 700, tabular), direction icon (`in` cyan, `out` slate),
    PlateChip sm, verdict dot + word, gate.
  - The bottom fades out (mask). New rows get the live ping.
  - `aria-live="polite"` announces additions, e.g. "ZH 271 009, allowed, gate north".
- **Empty:** the stage shows `dashboard.feed.emptyTitle` / `emptyBody` in the viewfinder.

#### Activity timeline ("Today")

- **SVG** with viewBox 760×164, scaled to width. One slot per `buckets[i]` (23 or 25 on DST days).
  Position by **index**; label with `bucket.hour`.
- **Bars:** entries rise from the baseline (blue gradient); exits hang below it (`--chart-exits`). Both
  use the same unit scale, so they are comparable. `rx` 2.5; width `min(14, slot × 0.46)`.
- **Denied:** a red diamond above that hour's entry bar (`--chart-denied`, glow).
- **Occupancy:** a smoothed line (quadratic through midpoints, so no overshoot) with a cyan area fill,
  on a 0…capacity scale. Gridlines at 10/20/30. A dashed capacity line is labelled
  `dashboard.timeline.capacity {capacity}` at the right; "20" and "0" also appear on the right axis.
  `occupancy: null` buckets (future) are not drawn.
- **Now marker:** a dashed vertical line at `index(currentHour) + minutes/60`. A dark tooltip chip on top
  shows `HH:mm`. The occupancy line ends in a glowing dot with a halo pulse.
- **Future:** a hatched area (`url(#p-future)`) from now to the end.
- **X axis:** every 3 h, SG 700 10.5px, subtle.
- **Header:** legend (`dashboard.timeline.legend.*`) and totals `dashboard.timeline.totals`.
- **Accessibility:** `role="img"` with `aria-label` `dashboard.timeline.aria`, plus a visually hidden
  table of the buckets for screen readers.

#### Open alarms

- Items from open alarms. Each item has a red-tinted glass background, a 3px glowing red left bar, and:
  - Row 1: PlateChip md (denied state), type badge, then Button primary sm `alarms.resolve` pushed right.
  - Row 2: `dashboard.openAlarms.metaParked` (or `meta` when the car left, `metaOverstay` for overstay).
  - Row 3 (optional): `alarms.previous_*` in warning text.
  - Below 720px: plate + badge, then the meta text, then Resolve full-width (40px) at the bottom.
- Resolve opens the global ResolveAlarmDialog (v1 §4.5).
- On resolve the item slides out right (280 ms) and the list closes the gap (layout).
- **All clear state:** a green ring with `ShieldCheck` (success glow), title `dashboard.openAlarms.emptyTitle`,
  body `dashboard.openAlarms.emptyBody`.

### 5.7 Alarms `/admin/alarms`

**Header:** h1 `alarms.title`.
**Toolbar:**
- Left: Tabs (`alarms.tabs.open` with a danger CountBadge, `resolved`, `all`).
- Right: a plate search Input (`Search` icon, `alarms.searchLabel` as the visually hidden label,
  debounced 300 ms, writes `?plate`).

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Plate            Alarm                       Time           Gate   Status        Notif.   │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [ZH 999 999]     (ShieldAlert No permit)     Today, 08:12   main   (Siren Open)   ✓  [Resolve] │
│ 2 earlier alarms Entered without a valid                           (Still parked)          │
│ Plate history    permit                                                                     │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [LU 777]         (TimerOff Overstay)         28 Sep, 19:02  main   (Check Resolved)  ⚠     │
│                  Still parked after …                       Resolved by Parking Admin, …  │
│                                                             «Called the owner, left 19:30» │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Columns:**
- **Plate:** PlateChip md.
  - When `previousAlarmCount > 0`, add `alarms.previous_*` in `--color-warning-text` `--text-sm`.
  - Link `alarms.plateHistory` → `/admin/activity?tab=log&plate=<plate>`.
- **Alarm:** type badge plus `common.alarmTypeLong.*` below it (`--text-sm`, muted).
- **Time:** `occurredAt` as RelativeTime.
- **Gate:** `gateId`, or `common.emptyValue`.
- **Status:**
  - StatusBadge open/resolved, plus a "Still parked" neutral badge when open and `isStillParked`.
  - Resolved rows add `alarms.resolvedBy {name, time}` and the `resolutionNote` in «» (`--text-sm`, clamped to 2 lines, expands on click).
- **Notification:** an icon, the WebhookStatus.
  - `sent`: `Check` in success colour.
  - `failed`: `TriangleAlert` in warning colour, with `webhookError` in the tooltip.
  - `pending`: spinner.
  - `skipped`: `Minus` in grey.
  - Visually hidden text uses `alarms.webhook.*`.
- **Actions:** open rows get Button primary sm `alarms.resolve`.

**Behaviour and states:**
- Order comes from the API. 50 rows per page, with Pagination.
- `?focus=<id>` highlights and scrolls to that row (§4.4).
- Empty states: `alarms.empty.{open|resolved|all}Title/Body`. When a search is active, show
  `searchTitle {plate}` with a `common.actions.clearFilters` action.
- Mobile cards:
  - Row 1: plate (title) + status badge.
  - Row 2: type long.
  - Row 3: time and gate.
  - Row 4: extra badges and history.
  - Resolve as a full-width button.

### 5.8 Requests `/admin/requests`

**Header:** h1 `requests.title`. Tabs: `requests.tabs.pending` (warning CountBadge) | `requests.tabs.all`.

**Waiting tab**

A queue of **RequestCards** rather than a table: each card needs room for notes, warnings and the decision.
- Data: `GET /api/permits?status=pending&limit=50` (oldest first).
- Duplicate-check data: `GET /api/permits?status=approved&limit=200`, fetched once and cached.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ [AG 44 321]   Tom Weber                                     Requested 2 h ago   │
│               tom.weber@example.com                         Ref. PL-7K3Q9       │
│ Day permit for Wed, 30 Sep 2026                                                 │
│ ┃ Visiting Anna Muster, Marketing                           ← requestNote       │
│ (i) AG 44 321 already has a permanent permit (Anna Muster).  ← InlineAlert sm   │
│ + Add a note for the requester                                                   │
│                                                        [ Reject ]  [ Approve ]  │
└────────────────────────────────────────────────────────────────────────────────┘
```
- **Card:** Panel with 20px padding and 12px between cards. Header: PlateChip md, holder name
  (SG 700 `--text-ui`) with the email below (muted), and on the right RelativeTime `requests.requestedAt`
  plus `requests.reference` in SG 700.
- **Type line:** `requests.permanent`, or `requests.dailyFor {date: dateWeekday}`.
- **Warnings** (InlineAlert sm, in this order):
  1. `isDatePassed`: **warning**, `requests.warnings.datePassed {date}`. **Approve is disabled**,
     with the alert linked via `aria-describedby`. Reject stays available.
  2. An approved permanent permit exists for the same `plate`: info, `hasPermanent {plate, name}`.
  3. An approved daily permit exists for the same `plate` and `validDate`: info, `hasDaily`.
  4. Another pending card has the same `plate`: info, `duplicatePending`.

  Info warnings don't block approval. If the API answers 409, show toast `errors.ALREADY_PERMITTED`.
- **Note:** ghost link button `requests.addNote` (`Plus` icon). It toggles a Textarea
  (`requests.noteLabel`, hint `requests.noteHint`, max 500), which becomes the `decisionNote` for
  either action.
- **Approve** (primary md): posts immediately (`POST …/approve {decisionNote?}`) with a loading state.
  - On success the card collapses (height and opacity over `--dur-slow`; removed instantly under
    reduced motion) and toast `requests.approved {plate}` appears.
  - Focus moves to the next card's Approve button, or to the empty-state heading.
- **Reject** (secondary md) opens **RejectDialog** (size sm):
  - Title `requests.rejectDialog.title {plate}`, body `body {name}`.
  - Textarea `noteLabel`, prefilled from the inline note, with placeholder `notePlaceholder`. It gets initial focus.
  - Buttons: Cancel, then danger `confirm`. Success shows toast `requests.rejected {plate}`.
- **Errors:** `DATE_IN_PAST` shows a toast and refetches (the card then shows the datePassed warning).
  `INVALID_STATE` shows a toast and refetches.
- **Empty:** `requests.empty.pendingTitle/Body`, `Inbox` icon.
- **Mobile:** Reject and Approve become two equal-width buttons. Header items stack.

**All requests tab:** the Permits table (§5.9) with `source=request`, all statuses, the Reference
column shown, and `requests.empty.all*` as the empty state.

### 5.9 Permits `/admin/permits`

**Header:** h1 `permits.title` with a primary Button `permits.create` (`Plus` icon) on the right.

**Filter bar** (wraps on small screens; every value lives in the URL):
- Search Input with `permits.filters.searchPlaceholder`, debounced 300 ms, writes `q`.
- Status Select: `statusAll` + `common.permitStatus.*`.
- Type SegmentedControl, compact: `typeAll` | `common.permitType.permanent` | `common.permitType.daily`.
- Checkbox `activeToday`.
- Ghost `common.actions.clearFilters`, shown only when a filter is set.

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Plate          Holder                 Type                  Status              Source    Created   │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ [ZH 123 456]   Anna Muster            Permanent permit      (✓ Approved)        Admin     12 Aug 2026 › │
│                anna.muster@firma.ch                         ● Valid today                          │
│ [ZH 555 111]   Lea Keller             Day permit,           (✓ Approved)        Request   29 Sep 2026 › │
│                                       29 Sep 2026           ● Valid today       PL-4H2M8               │
│ [LU 777]       Max Beispiel           Permanent permit      (⊗ Rejected)        Request   27 Sep 2026 › │
└───────────────────────────────────────────────────────────────────────────────────────────┘
1–3 of 3                                                               [ ‹ ]  [ › ]
```

**Columns:**
- **Holder:** name (SG 700) with the email below (Inter, muted).
- **Type:** `common.permitTypeLong.permanent`, or `common.permitDailyOn {date}`.
- **Status:** StatusBadge, then one of:
  - `isActiveToday`: a success dot with `common.validToday`.
  - Approved and `isDatePassed`: muted `common.datePassed`.
- **Source:** `common.source.admin`, or `common.source.request` with the reference in SG 700 below.
- **Created:** `date`.

**Row click and paging:**
- The last cell holds a `ChevronRight` icon button (`aria-label` `common.actions.details`) that opens
  PermitDetailsDialog. A click anywhere on the row triggers the same button.
- 50 rows per page. Empty: `permits.empty.title/body` with a `permits.create` action; with filters set,
  `filteredTitle/Body` with a clear-filters action.

**PermitDetailsDialog** (md):
- Title `permits.detailsDialog.title {plate}`, then PlateChip lg and a StatusBadge.
- DescriptionList: holder, email, type/date, source + reference, `requestNote`, `decisionNote`,
  `decidedByName` + `decidedAt`, `createdAt`.
- Footer actions:
  - `editHolder` (secondary), always shown.
  - `revoke` (danger), only when `status === 'approved'`.
  - Close.

**CreatePermitDialog** (md, `permits.createDialog.*`):

| Field | Control | Rules |
|---|---|---|
| Plate | PlateInput md | Required, valid |
| `holderNameLabel` | Input | Required 2–100 |
| `holderEmailLabel` | Input `type=email` | Optional |
| Type | SegmentedControl compact: Permanent / Day | Default Permanent |
| Date | `type=date` (daily only) | Default today, min today, max today + 365, hint `dateHint {maxDate}` |
| `noteLabel` | Textarea | Optional, ≤ 500 → `requestNote` |

- Lead `permits.createDialog.lead`. Submit `submit`.
- `409 ALREADY_PERMITTED` shows on the plate field.
- Success: close, toast `success {plate}`, invalidate `permits` and `summary`, and live-ping the new row.

**EditHolderDialog** (sm): holder name (required) and email. Submit `permits.editDialog.submit`,
success toast `permits.editDialog.success`. Sends `PATCH`.

**RevokeDialog** (sm):
- Title `permits.revokeDialog.title {plate}`, body `body {name}`.
- Optional Textarea `noteLabel` → `decisionNote`.
- Buttons: **Cancel** (gets initial focus) and danger `confirm`.
- Success: toast `success {plate}`, close both dialogs, invalidate `permits`, `summary` and `sessions`.

### 5.10 Activity `/admin/activity`

**Header:** h1 `activity.title`. Tabs: `activity.tabs.parked` (neutral CountBadge = `total`) | `activity.tabs.log`.

**Parked now:** `GET /api/sessions?active=true&limit=50` (+ `plate`). Sort unauthorized first, then
`enteredAt` descending.

| Column | Content |
|---|---|
| Plate | PlateChip md |
| `common.fields.permit` | Holder name + `common.permitType.*`, or danger badge `common.noPermit` |
| `common.fields.entered` | RelativeTime |
| `common.fields.duration` | Duration, right-aligned. Computed on the client from `enteredAt` and re-rendered every minute. |
| `common.fields.alarm` | When `openAlarmId`: danger link `activity.openAlarm` → `/admin/alarms?focus=<id>` |

Empty: `activity.empty.parkedTitle/Body`, `Car` icon.

**Gate log:** `GET /api/gate-events`.
- **Filters:**
  - Plate Input.
  - Direction SegmentedControl compact: `directionAll` / `common.direction.in` / `common.direction.out`.
  - Result Select: `resultAll` / `common.access.authorized` → `authorized=true` / `common.access.unauthorized` → `authorized=false`.

| Column | Content |
|---|---|
| Time | RelativeTime (full `dateTime` in the title) |
| Direction | `LogIn` / `LogOut` icon + `common.direction.*` |
| Plate | PlateChip sm (tooltip `activity.cameraRead` when the raw read differs) |
| Result | `in`: access badge; `out`: `common.emptyValue` |
| Permit | `permit.holderName` + type, or `common.emptyValue` |
| Gate | `gateId` |
| Alarm | When `alarmId`: link `activity.viewAlarm` |

- 50 rows per page.
- Empty: `activity.empty.logTitle/Body` with action `logAction` → `/admin/simulator`. With filters set,
  use `filteredTitle/Body`.

### 5.11 Gate simulator `/admin/simulator`

**Header:** h1 `simulator.title`, lead `simulator.lead` (muted, max `--measure`).
**Layout:** two columns at ≥ 1080px (a 420px form panel and a fluid results panel), stacked below.

```
┌ Simulate a car ─────────────────────────┐  ┌ Results ───────────────────── Clear results ┐
│ Plate                                    │  │ ┃ (CircleX) No valid permit        08:14:05 │ ← danger-bg, 4px danger bar
│ ╔══════════════════════════════════════╗ │  │ ┃ [ZH 999 999]  Check-in, gate simulator    │
│ ║ ZH 999 999                            ║ │  │ ┃ Alarm raised.  View alarm                 │
│ ╚══════════════════════════════════════╝ │  │                                             │
│ Press Enter to check in.                 │  │ ┃ (CircleCheck) Entry allowed      08:13:40 │ ← 4px success bar
│                                          │  │ ┃ [ZH 123 456]  Check-in, gate simulator    │
│ Demo plates                              │  │ ┃ Permanent permit: Anna Muster              │
│ [ZH 123 456]  [BE 98 765]  [ZH 555 111]  │  │                                             │
│ Permanent     Permanent    Day permit    │  │ ┃ (LogOut) Checked out             08:10:02 │ ← neutral bar
│ permit        permit       today         │  │ ┃ [BE 98 765]  Check-out, gate simulator    │
│ [ZH 999 999]  [AG 44 321]  [LU 777]      │  │ ┃ Parked for 2 h 14 min                      │
│ No permit     Request      Request       │  │                                             │
│               pending      rejected      │  └─────────────────────────────────────────────┘
│ (Shuffle) Random plate                   │
│ Gate  [ simulator          ]             │
│ ▸ Set event time                         │
│ [ (LogIn) Check in ]  [ (LogOut) Check out ] │
└──────────────────────────────────────────┘
```

**Plate:** PlateInput lg with hint `simulator.enterHint`. Pressing Enter runs **Check in**.

**Demo plates** (`simulator.demoLabel`):
- A 3-column grid of buttons, each a PlateChip md with a caption below (`--text-xs`, muted).
- Clicking one fills the plate input and focuses Check in. It does not submit.
- Accessible name: "ZH 123 456, Permanent permit".
- Hover: the chip rim turns `--color-primary`.

| Plate | Caption key |
|---|---|
| `ZH 123 456` | `simulator.demo.permanent` |
| `BE 98 765` | `simulator.demo.permanent` |
| `ZH 555 111` | `simulator.demo.daily` |
| `ZH 999 999` | `simulator.demo.none` |
| `AG 44 321` | `simulator.demo.pending` |
| `LU 777` | `simulator.demo.rejected` |

**Other form controls:**
- **Random plate:** ghost sm, `Shuffle` icon, `simulator.demo.random`. It fills `<canton> <1–6 digits>`
  using a random canton from ZH BE LU SG AG TG VD GE TI BS.
- **Gate:** Input, default `simulator.gateDefault`, remembered in `localStorage["parklens.simGate"]`,
  hint `gateHint`, max 50.
- **Event time:** a `<details>` disclosure (`timeToggle`) with a `datetime-local` input (`timeLabel`,
  hint `timeHint`). When empty, `occurredAt` is omitted. When set, send `new Date(value).toISOString()`.
- **Buttons:**
  - `checkIn`: primary lg, `LogIn` icon.
  - `checkOut`: secondary lg, `LogOut` icon.
  - Only the pressed button shows loading, but both are disabled while a request is in flight.
- **Errors:** `INVALID_PLATE` shows on the plate field. Anything else shows an InlineAlert above the buttons.

**Result cards:**
- Newest first, at most 20, stored in `sessionStorage["parklens.simResults"]`.
- Each card: `--radius-md`, 4px left bar in its tone, 12px × 16px padding. It shows PlateChip md,
  `common.directionLong.*`, gate and `timeSeconds`.

| Result | Tone | Icon | Title | Body |
|---|---|---|---|---|
| check-in `allowed` | success | `CircleCheck` | `result.allowed` | `result.reason.PERMANENT_PERMIT {name}` or `DAILY_PERMIT {date, name}` |
| check-in denied | danger (danger-bg fill) | `CircleX` | `result.denied` | `result.reason.NO_VALID_PERMIT` + link `result.viewAlarm` → `/admin/alarms?focus=<alarmId>` |
| check-out | neutral | `LogOut` | `result.checkedOut` | `result.parkedFor {duration}`, or `result.noSession` when `sessionId` is null |

- New cards get the live ping.
- The list container is `aria-live="polite"`, so only the new card is announced.
- Header action: `clearResults` (ghost sm).
- Empty state: `simulator.empty.*`, `ScanLine` icon.
- A denied check-in also triggers the global alarm banner and sound. This is correct behaviour and
  makes the demo convincing.

**Autopilot panel (v2).** A glass panel at the top of the simulator's form column, above "Simulate a car":

```
┌ Autopilot ───────────────────────────────────────────── [ o] Run autopilot ┐
│ Generates realistic gate traffic every few seconds: mostly cars with a       │
│ permit, now and then an unknown plate. Useful for demos.                     │
│ Pace  [ Calm | Busy ]                     24 events sent, 2 alarms this run  │
│ (!) The events are real. They create sessions, alarms and notifications.     │
│     Autopilot stops when you log out or close this tab.                      │
└──────────────────────────────────────────────────────────────────────────────┘
```
- Keys: `autopilot.*`.
- The Switch toggles autopilot; the pace SegmentedControl is `autopilot.pace.*`.
- Stats come from the running session (§12).
- The warning is an InlineAlert, warning tone.
- While autopilot runs, the result cards below also show its events: they share the simulator result
  list, and each card has an `autopilot.badge` tag.

### 5.12 Settings `/admin/settings`

A single column, max `--content-narrow`, with four stacked Panels, each titled with an h2. There are
no tabs: the page is short.

**1. Alarm notifications** (`settings.notifications.*`)
```
Alarm notifications
Post each new alarm to a chat channel, for example in Slack or Microsoft Teams.
[ o] Send alarm notifications                        ← Switch
Webhook URL
[ https://hooks.slack.com/services/…                                   ]
Create an incoming webhook in Slack, or a workflow in Teams, and paste its URL here.
Format
[ Slack                                   ▾ ]        ← generic / slack / teams
[ Save changes ]   [ (Send) Send test message ]
(✓) Test message delivered (HTTP 200).               ← InlineAlert, after a test
```
- **Load:** `GET /api/settings`. Track whether the form is dirty.
- **URL field:** always editable. It is only required while `enabled` is on.
- **Save** (primary): `PUT`, then toast `saved`, then reset the dirty state.
- **Send test message** (secondary, `Send` icon, loading label `testing`):
  - Enabled only when the **saved** settings have `enabled = true` **and** the form is not dirty.
  - When disabled, explain why below it via `aria-describedby`: `testUnsaved` if the form is dirty,
    otherwise `testDisabled`.
- **Test result:** an InlineAlert that stays until the next edit.
  - `ok`: success, `testOk {status}`.
  - Otherwise: danger, `testFailed {error}` when `error` is set, else `testFailedStatus {status}`.

**1b. Parking lot** (`settings.lot.*`, new in v2; placed between Alarm notifications and Camera connection)
- Field `capacityLabel`: `type="number"`, `inputmode="numeric"`, min 1, max 5000, step 1, suffix
  `capacitySuffix`, hint `capacityHint`.
- Validation: `validation.capacityInvalid`.
- Save sends `PUT /api/settings {lot: {capacity}}` (the webhook is not sent), then toast `saved`, then
  invalidate `settings` and `summary`.
- The command center gauge and lot map re-layout immediately.

**2. Camera connection** (`settings.camera.*`, read-only DescriptionList)
- `checkInLabel`: `POST {origin}/api/gate/check-in` in mono, as a CopyField that copies the URL only.
- `checkOutLabel`: the same pattern for check-out.
- `apiKeyLabel`: `gateApiKeyHint` in mono, with hint `apiKeyHint`.
- `timezoneLabel`: `timezone`, with hint `timezoneHint`.

**3. Admins** (`settings.admins.*`)
- **Panel header:** title plus a secondary sm button `add` (`Plus` icon).
- **Table columns:**
  - Name, plus a neutral badge `common.you` on your own row.
  - Email.
  - `common.fields.lastLogin` (`dateTime`, or `never`).
  - `common.fields.created` (`date`).
  - Remove: ghost sm in danger text. It is **not rendered on your own row**.
- **AddAdminDialog** (sm): `addDialog.nameLabel`, `emailLabel`, `passwordLabel` (with show/hide) and
  hint `passwordHint`. `EMAIL_TAKEN` (409) maps to the email field (`duplicateEmail`). Success toast `added {name}`.
- **RemoveAdminDialog** (sm): `removeDialog.title {name}`, `body {email}`, and a danger `confirm`.
  Cancel gets initial focus. `CANNOT_DELETE_SELF` and `LAST_ADMIN` show as toasts.

**4. Your password** (`settings.account.*`)
- Fields: `currentLabel`, `newLabel` (hint `newHint`) and `confirmLabel`, with submit `submit`.
- 204: toast `success`, then clear the fields.
- `INVALID_CREDENTIALS` / 401: field error `wrongCurrent` on the current password. **Do not log out** (§2.4).

---

## 6. Component inventory (v2 look, v1 behaviour)

Class names are suggestions. Every component uses semantic tokens only. The "Component kit" section of
`docs/design/command-center.html` renders the items marked ★ in their v2 look. Behaviour (states,
keyboard, ARIA) is unchanged from v1 unless stated.

### Button `.btn` ★
- **Variants:**

  | Variant | Background | Text | Hover / active |
  |---|---|---|---|
  | `primary` | Gradient `--c-blue-500 → --color-primary`, inner top highlight, blue drop `0 8px 18px -10px` | `--color-on-primary` | Hover: darker gradient + `--glow-primary`. Active: `--color-primary-active`. |
  | `secondary` | White 82% glass, 1px `--glass-border-strong`, `--glass-highlight` | `--color-text` | Hover: white, border `--color-primary-border`, text `--color-primary` |
  | `ghost` | Transparent | `--color-text-secondary` | Hover: `rgb(16 28 46 / .05)` |
  | `danger` | Gradient `--c-red-500 → --color-danger-solid`, red drop | `--color-on-danger` | Hover: `--color-danger-solid-hover` + `--glow-danger` |
  | `inverse` | White | `--color-danger-text` | Only on the red banner |
  | `dark` | Transparent | `--color-dark-text-muted` | Hover: `--color-dark-raised`. For the strip, scanner and tooltips (replaces v1 `nav`). |

- **Sizes:** unchanged (sm/md/lg = `--control-h-*`, text `--text-sm` / `--text-ui` / `--text-base`).
- **Style:** SG 700, `--radius-md` (10px), 8px icon gap.
- **Motion:** press changes colour and shadow only (`--dur-fast`).
- **States:**
  - Focus: 2px outline at 2px offset (`--color-focus`; cyan on dark; white on danger).
  - Disabled: sunken background, `--color-text-disabled`, no shadow.
  - Loading: spinner + label, `aria-busy`.

### Field / Input / Select / Textarea / Date / Checkbox / Switch ★
- **Anatomy and rules:** as in v1. Labels are SG 700 `--text-sm`; hints and errors are Inter `--text-sm`.
- **Input:**
  - White 90% glass, 1px `--color-border-input`, `--radius-md`, `--shadow-xs`, Inter `--text-base`.
  - Hover: `--color-border-input-hover`.
  - **Focus:** border `--color-primary` + `box-shadow: 0 0 0 1px var(--color-primary), 0 0 0 5px rgb(49 107 255 / .16)`.
    That gives a 2px ring plus a halo, and replaces the v1 outline for inputs.
  - Error: `--color-danger-solid` border; on focus, the same ring in red.
- **Select:** as in v1, chevron colour `--color-text-muted`.
- **Textarea:** as in v1.
- **Switch:** 38×22 track, 14px thumb. On: `--color-switch-track-on` + a soft blue glow. On dark
  surfaces, use the `*-dark` tokens (the on state is a cyan track with a night thumb).
- **Checkbox:** as in v1.

### SegmentedControl ★
- **`compact`:** sunken container with an inner shadow, 3px padding; options SG 700 `--text-sm`. The
  selected option is a white pill with `--shadow-sm` and an inner top highlight.
- **`card`** (public request type): glass cards, `--radius-lg`. Selected: 2px `--color-primary` border,
  `--color-primary-subtle`, `CircleCheck`, plus `--glow-primary`.
- **`dark`** (LanguageSwitcher in the strip): `--color-nav-control-bg` container; the selected option is
  `--color-nav-control-selected-bg` with `--color-dark-text`.

### StatusBadge `.badge` ★
- **Anatomy:** a 13px icon + text, 22px high, 8px padding, `--radius-sm`, SG 700 `--text-xs`. Tone
  background with an **inset** 1px tone border (`box-shadow`, so badge heights stay exact).
- **Mapping:** the v1 table is unchanged.
- **New tone `live`** (`--color-live-subtle` / `--color-live-text`, `Car` icon): used for "Parked {duration}"
  in the palette and dossier.

### CountBadge ★
- As in v1, with SG 700 `--text-2xs`, tabular.
- The danger tone adds a red glow (`0 0 14px rgb(240 68 58 / .5)`).
- It bumps on increase (§13).

### PlateChip `.plate` ★ (the signature)

**Look:**
- Swiss plate: `--plate-fill` (white → paper gradient), 1px `--plate-edge`, and an inset rim (a
  `--plate-bg` gap ring plus a 1px `--plate-rim` ring).
- SG 700, `--plate-tracking`, tabular numerals, `--plate-shadow`.
- **Swiss shield** (`::before`, inline SVG: red shield with a white cross) at md, lg and xl, only when
  the plate matches the Swiss canton format (`^[A-ZÄÖÜ]{2}\d{1,6}$`). Hidden at sm.
- The chip is always light, on every surface.

**Reticle:** `<i class="reticle">` inside the chip. It is the ANPR lock-on corners, drawn as a 2px
border masked to its four corners:
```css
mask: conic-gradient(at var(--reticle-size) var(--reticle-size), #0000 75%, #000 0)
      0 0 / calc(100% - var(--reticle-size)) calc(100% - var(--reticle-size));
```
It sits `--reticle-gap` outside the chip. Its hidden state is `opacity: 0; scale: 1.2`.

**States:**

| State | When | Visual |
|---|---|---|
| Default | Everywhere | As above, reticle hidden |
| Interactive hover / focus | `interactive` chips (simulator demo plates, palette, dossier links) | Lifts 1px; reticle locks on in blue (`--ease-snap`) |
| Scanning | Gate feed stage, simulator result while pending | Cyan reticle "hunting" (scale 1.14 ↔ 1.04, 700 ms alternate); beam overlay; scrambled characters |
| Allowed | Verdict | Green reticle + `--glow-success` |
| Denied | Verdict, open alarms, dialogs about an unauthorized car | Red reticle + `--glow-danger` |
| Muted | History: car left, revoked, rejected context | `--plate-muted-opacity`, no drop shadow |

**Other rules:**
- Sizes: `sm`/`md`/`lg`/`xl` via `--plate-*` tokens. The rim is removed at sm.
- The state is never colour-only: the verdict or badge text next to the chip carries the meaning.
- `translate="no"`, never truncated. Visually hidden `common.fields.plate` prefix where context is missing (v1).

### PlateInput ★
- The same plate look (with the shield at the left), `--plate-input-*` tokens, uppercase.
- **Focus:** edge and rim turn `--plate-input-rim-focus`, plus a 4px blue halo, and the reticle locks on
  around the input (14px corners, 7px gap).
- **Error:** `--plate-input-rim-error`.
- Attributes and behaviour: as in v1.

### Panel / Instrument ★
- **Panel:** the glass recipe in §1.3; header title SG 700 `--text-md`; body padding `--cc-panel-pad` (20px).
- **Instrument** = Panel + registration marks (8 background layers: L-ticks at the four corners, 8px
  inset, `--reg-mark`) + the `spot` cursor spotlight (§13). It is used on the command center only.
- **Dark instrument** (Gate feed only): §5.6.

### Dialog ★
- Native `<dialog>`; behaviour as in v1.
- Look: `--glass-bg-strong`, `--radius-xl`, `--shadow-lg` + `--glass-highlight`.
- `::backdrop`: `--color-overlay` + `blur(6px) saturate(120%)`.
- The subject strip (e.g. the plate being resolved) sits in a tinted glass box at the top: red tint for alarms.
- Enter: fade + rise + blur-in (`--motion-blur`) over `--dur-base`.
- Mobile sheet: as in v1.

### Toast ★
- Glass strong, `--radius-lg`, `--shadow-md`.
- A 3px left bar in the tone's solid colour **with a glow**; a 20px tone icon; title SG 700; body Inter muted.
- Enter: rise 12px + fade (`--dur-base`). Exit: slide right + fade.
- Stack, timing and roles: as in v1.

### Tooltip (new)
- Dark accent: night 94% + `blur(8px)`, `--radius-md`, 1px dark border, `--shadow-lg`, `--z-tooltip`.
- Shown on hover (after 150 ms) **and** on keyboard focus. Esc hides it.
- Positioned above the target; flips below when there's less than 52px of space; clamped 8px from the edges.
- `role="tooltip"`, referenced by `aria-describedby`. Never the only place for essential information.

### CommandStrip (new)
- Layout and slots: §3.3.
- Surface: a `--c-night-850 → --color-dark-bg` gradient; a bottom hairline gradient (transparent → cyan
  → blue → transparent); a soft drop shadow.
- Readouts: 26px pills, SG 700 `--text-2xs` uppercase `--tracking-readout`, 1px dark border.
- Chips (alarm, autopilot) use tinted glass in their colour, a coloured border and a text glow.

### Reticle (new, shared)
- One component (`<Reticle tone="blue|cyan|green|red|muted" size gap />`) used by PlateChip,
  PlateInput, lot tiles, the scanner stage viewfinder (static, 16px corners, cyan 35%) and focused
  palette plates.
- `aria-hidden`.

### GuidancePlaque (new)
- The dark "P 17 free" sign (§5.6). 30px high: blue P square, green glowing SG 700 digits, label.
- `title` is `dashboard.gauge.freeLabel`.

### KpiTile, OccupancyGauge, LotMap, GateFeed, GateSensor, ActivityTimeline, OpenAlarmsList (new)
Specified in §5.6. Each is a self-contained component with its own query, skeleton and error state.

### CommandPalette, PlateDossier (new)
§9 and §10.

### Unchanged in look beyond tokens
InlineAlert, EmptyState, Tabs, Pagination, CopyField, DescriptionList, Skeleton, Spinner, RelativeTime,
ResponsiveTable. They pick up the new fonts, radii and colours through tokens. Specifics:
- **Tabs:** the active underline gets `--glow-marker`.
- **Tables:** the header is a sunken 60% glass row; hovered rows get a 3px blue inset bar on the first cell.
- **CopyField:** uses SG 700 for reference codes; `--font-mono` only for URLs.
- **EmptyState:** icons sit in a 56px ring (success: green ring with `--glow-success`).

---

## 7. Accessibility (WCAG 2.2 AA)

- **Contrast:** the token pairs are verified (see the `tokens.css` header). Never put
  `--color-text-subtle` on sunken surfaces, and never use `--color-live` (cyan) as text on light surfaces; use `--color-live-text`.
- **Status is never colour-only:** badges always pair icon and text. Alert KPI cells add an icon and
  wording. Allowed and denied results carry distinct icons and titles.
- **Focus:**
  - Style: `:focus-visible` with a 2px outline at 2px offset: blue on light surfaces, cyan on dark accent surfaces, white on the red banner.
  - Never remove an outline without a replacement.
  - Focus Not Obscured (2.4.11): add `scroll-padding-top` (banner height plus the top bar) and
    `scroll-padding-bottom` (`--tabbar-h`) so sticky bars never cover focused elements.
- **Keyboard:**
  - Everything is reachable in visual order.
  - Dialogs use native `<dialog>`, so Esc and the focus trap come built in.
  - Each shell starts with the skip link.
  - SegmentedControls use native radios, so arrow keys work.
- **Landmarks and headings:**
  - Landmarks: `header`, `nav` (`nav.mainLabel`), `main#content`, and `footer` on public pages.
  - One h1 per page; panel and dialog titles are h2.
- **Live regions:**
  - Assertive: new alarms only (§4.3).
  - Polite: toasts (status), simulator results, CopyField, the public StatusPanel.
- **Forms:**
  - Every control has a visible `<label>`.
  - Hints and errors are linked with `aria-describedby`; invalid fields get `aria-invalid`.
  - Error summary with `role="alert"`; focus moves to the first invalid field.
- **Target size (2.5.8):** controls are ≥ 32px, and ≥ 44px on coarse pointers (tokens). Icon buttons are 40/44px.
- **Motion:** every movement uses tokens that collapse under `prefers-reduced-motion`. The looping
  ambient animations are listed in §13. All of them stop under reduced motion; only the progress spinner keeps turning.
- **Language:** `<html lang>` follows the switcher.
- **Time:** use `<time dateTime>` with the full date in `title`.
- **Reflow:** usable at 320px width and 400% zoom. Tables turn into cards below 720px, so the page
  never scrolls horizontally.
- **Plates in speech:** plates read as text ("ZH 123 456"). Add the visually hidden "Plate" prefix where context is missing.
- **v2 additions:**
  - **Focus colours:** blue on light surfaces; **cyan** (`--color-focus-on-dark`) on the strip, gate
    feed and tooltips; white on the red banner.
  - **Takeover:** never moves focus. It stays under the flash thresholds (2.3.1): two pulses over
    2.4 s, edges only. Reduced motion shows a static state.
  - **Command palette:** combobox/listbox pattern (§9). Focus returns to the invoker on close.
  - **Lot tiles:** real `<button>`s with full accessible names. Tooltips also appear on focus. The
    map has a text alternative: the Parked now KPI and the Activity page.
  - **Charts:** gauge, sparklines and timeline carry `role="img"` with a text summary. The timeline
    also has a visually hidden table.
  - **Readouts:** the uppercase comes from CSS, so screen readers read the sentence-case copy.
  - **Glass legibility:** body text only on `--glass-bg` (≥ 0.72 alpha) or stronger. Without
    `backdrop-filter`, glass falls back to near-opaque (tokens `@supports`).
  - **Continuous motion** (radar, light fields, autopilot stripes, pulses) stops under reduced motion
    and while the tab is hidden. Wall mode adds no motion of its own beyond the residual alarm glow.

---

## 8. Implementation notes

- **Storage keys:**

  | Key | Storage | Since |
  |---|---|---|
  | `parklens.lang` | localStorage | v1 |
  | `parklens.alarmSound` | localStorage | v1 |
  | `parklens.simGate` | localStorage | v1 |
  | Auth token (e.g. `parklens.token`) | localStorage | v1 |
  | `parklens.recentPlates` (max 5 normalized plates) | localStorage | v2 |
  | `parklens.dismissedAlarms` | sessionStorage | v1 |
  | `parklens.simResults` | sessionStorage | v1 |
  | `parklens.autopilot` (`{on, pace, startedAt, sent, alarms}`) | sessionStorage | v2 |
  | `parklens.wall` (`"1"` while in wall mode) | sessionStorage | v2 |

- **Breakpoints** (literal values in `@media`):

  | Width | Changes |
  |---|---|
  | 480px | Stack card segments and description lists; strip alarm chip shows the count only |
  | 720px | Tables become cards, dialogs become sheets, command center goes to 1 column, KPIs scroll horizontally |
  | 960px | Sidebar ↔ tab bar; strip ↔ mobile top bar (`--strip-h` becomes 52px via tokens); wall mode available |
  | 1280px | Command center switches to its 12-column layout |
  | 1500px | Strip shows the gates readout and the clock's place name |

- **Query keys:**

  | Key | Params |
  |---|---|
  | `['summary']` | – |
  | `['timeline']` | – (v2) |
  | `['gates']` | – (v2) |
  | `['health']` | – (v2, strip system readout) |
  | `['alarms', params]` | Filter params |
  | `['sessions', params]` | Filter params |
  | `['gate-events', params]` | Filter params |
  | `['permits', params]` | Filter params |
  | `['plate', normalizedPlate]` | Dossier bundle (v2) |
  | `['settings']` | – |
  | `['admins']` | – |
  | `['public-request', token]` | Request token |

  SSE invalidation matches on the first key segment (§4.1).

- **motion (`motion/react`):**
  - Wrap the app in `<MotionConfig reducedMotion="user">`.
  - `AnimatePresence`: toasts, banner, palette, dossier, feed rows, alarm items, lot tiles.
  - `layout`: feed list, alarm list, request queue.
  - Numbers: `animate(motionValue, to, { duration: 1.1, ease: [0.16, 1, 0.3, 1] })` rendered through
    `useTransform` + `Intl.NumberFormat`, with no React state per frame.
  - Springs: enter `{ stiffness: 380, damping: 32 }`, layout `{ stiffness: 500, damping: 40 }`.
  - CSS keeps the infinite ambient loops (radar, light fields, pings, stripes), because they cost nothing in React.

- **Performance budget** (office laptop, 60 fps; wall mini-PC ≥ 45 fps):
  - Animate only `transform`, `opacity` and (once, for draw-on) `stroke-dashoffset`. Never animate
    `box-shadow` or `filter`: pre-render glow layers and fade their opacity.
  - At most about 12 `backdrop-filter` surfaces on screen. Never blur list rows or table cells.
  - Infinite animations pause while the document is hidden (`html.is-hidden { animation-play-state: paused }`)
    and while off-screen (IntersectionObserver on the radar and the timeline halo).
  - **Low-effects fallback:** in wall mode, measure frame rate over 2 s after load. Below 45 fps, set
    `html[data-lowfx]`, which removes backdrop blur (opaque glass), the light-field drift and the
    spotlight. Keep all data motion.
  - No canvas or WebGL is needed: gauge, sparklines and timeline are SVG; radar and ambient layers are CSS.

- **Base CSS** (not in the tokens file):
  - `body`: Inter 400, `--color-bg`.
  - Admin text `--text-ui`, public text `--text-base`.
  - `.sr-only`, a global `:focus-visible`.
  - The ambient layer (fixed, `z-index: 0`; the shell uses `position: relative; z-index: 1`).
  - `html.is-hidden` pause rule.
  - The `@media (prefers-reduced-motion)` block that stops the loops (the prototype's last CSS section).

- **Icons** (lucide-react): the v1 set, plus these v2 additions: `Navigation` (autopilot),
  `Maximize` / `Minimize` (wall), `Volume2` / `VolumeX` (sound), `ArrowDownLeft` / `ArrowUpRight`
  (feed direction), `History` (dossier), `Globe` (language action), `CornerDownLeft` (palette hint),
  `Activity` (system). `DoorOpen` moves into the avatar menu (log out).

- **Demo readiness:** with the v2 seed, the first login shows about 23 of 40 parked, a full morning
  timeline, both gates active, and `ZH 999 999` as a red tile, a KPI alert and an open-alarm item. The
  banner shows unless dismissed this session. Start autopilot from the palette or the simulator for a
  live demo.

---

## 9. Command palette (⌘K / Ctrl+K)

**Open:**
- ⌘K (macOS) or Ctrl+K anywhere in the admin area, including while typing. The same shortcut toggles it closed.
- `/` when focus is not in an editable field.
- The strip's search button.
- On mobile, the top-bar search icon.
- It does not open while a modal dialog is open.

**Layout** (desktop): a centred panel, `--palette-w` (680px), 12vh from the top, `--glass-bg-strong`,
`--radius-xl`, `--shadow-lg` plus a 6px white 25% halo. The scrim is `--color-overlay` with a 6px blur.
- **Input row:** 60px, `Search` icon in primary blue, Inter `--text-md`, `Esc` kbd.
- **Results:** scrollable, max 460px.
- **Footer:** kbd hints (`palette.hints.*`) and the result count (polite live region).
- **Mobile:** a full-screen sheet.

**Groups and items** (in this order):

| Query | Groups |
|---|---|
| Empty | `palette.groups.recent` (up to 5 recent plates) · `palette.groups.pages` (7 nav pages) · `palette.groups.actions` |
| Any text | `palette.groups.plates` (when the normalized query has ≥ 2 characters) · pages matching · actions matching · `palette.groups.search` (always: `palette.searchPermits`, `palette.searchLog`) |

**Plate search:**
- Debounce 200 ms. Normalize the query (v1 §2.1).
- Run three requests in parallel: `GET /api/permits?q=`, `GET /api/sessions?active=true&plate=`,
  `GET /api/alarms?status=open&plate=`, each with `limit=10`.
- Merge by exact normalized plate and show at most 6. The API matches substrings, so that is expected.
- **Row:**
  - PlateChip sm with the matched characters highlighted (`<mark>`, cyan 18%).
  - Title: holder name, or `palette.plate.unknown`.
  - Badges: `palette.plate.parked {duration}` (live), permit type or `palette.plate.noPermit`,
    `palette.plate.pending`, `palette.plate.openAlarms_*`.
- **Loading:** `palette.searching` as a skeleton row.
- **Error:** an inline row `errors.NETWORK`.

**Actions** (label keys `palette.actions.*`; hidden when not applicable):

| Label | Action |
|---|---|
| `newPermit` | Opens CreatePermitDialog (prefilled plate if the query is a plate) |
| `simulateCheckIn` / `simulateCheckInPlate {plate}` | → `/admin/simulator?plate=` |
| `autopilotStart` / `autopilotStop` | Toggles autopilot (§12) |
| `wallEnter` / `wallExit` | Toggles wall mode (§11); ≥ 960px only |
| `language {language}` | Switches language |
| `soundOn` / `soundOff` | Toggles alarm sound |
| `logout` | Logs out |

Pages use `palette.pageDesc` as their description. Matching compares the label and description
case-insensitively. Highlight the matched substring.

**Selecting:**
- Plate → PlateDossier (§10), and add the plate to recents.
- Page → navigate.
- Search → navigate with the filter (`/admin/permits?q=`, `/admin/activity?tab=log&plate=`).
- Action → run it.

The palette closes before navigating.

**Keyboard:**

| Key | Behaviour |
|---|---|
| ↑ / ↓ | Move the active option (wraps); it scrolls into view |
| Enter | Run the active option |
| Esc | Close (focus returns to the invoker) |
| Tab | Stays in the input (modal) |
| Mouse | Hover sets the active option; click runs it |

**Active item:** `--color-primary-subtle` with a 1px primary-border ring, a glowing 3px marker bar on the
left, and a white icon tile in blue. A `↵` kbd appears on the right.

**A11y:**
- `role="dialog"` with `aria-modal` and `aria-label` `palette.label`.
- The input is `role="combobox"` with `aria-expanded="true"`, `aria-controls` pointing at the listbox,
  and `aria-activedescendant`.
- The results are `role="listbox"`; groups are `role="group"` with `aria-labelledby`; options are `role="option"` with `aria-selected`.
- The result count is announced politely (`palette.results_*`).
- No results: `palette.noResults {query}` + `palette.noResultsHint`.

---

## 10. Plate dossier (new)

A right-side drawer showing everything about one plate. It opens from lot tiles, palette plate results,
PlateChips in alarm and activity rows (as `interactive` chips), and the deep link `?dossier=<normalized plate>`
on any admin route.

- **Surface:** `<dialog>` drawer, `--drawer-w` (440px), full height below the strip, glass strong,
  `--radius-xl` on the left corners. It slides in from the right (spring). Mobile: full-screen sheet.
- **Header:** PlateChip xl (with the denied state if an open alarm exists), holder name (or
  `palette.plate.unknown`), and a status line: `dossier.status.parked {time, duration}`, or
  `dossier.status.notParked` plus `dossier.status.lastSeen {time}`. Close button top-right.
- **Sections:**

  | Section | Source | Content | Empty |
  |---|---|---|---|
  | `dossier.sections.permits` | `GET /api/permits?q=` | Permits with StatusBadge, type/date and source; the row opens PermitDetailsDialog | `dossier.empty.permits` |
  | `dossier.sections.visits` | `GET /api/sessions?plate=&limit=5` | `dossier.visit.parked` / `dossier.visit.closed`, with duration and an authorized/unauthorized badge | `dossier.empty.visits` |
  | `dossier.sections.alarms` | `GET /api/alarms?plate=&limit=5` | Alarms with status and a Resolve action on open ones | `dossier.empty.alarms` |

  Filter all three results to the **exact** normalized plate on the client.
- **Footer actions:**
  - `dossier.actions.createPermit`: opens CreatePermitDialog prefilled; shown when no approved permit
    is active today.
  - `dossier.actions.openLog` → `/admin/activity?tab=log&plate=`.
  - `dossier.actions.openPermits` → `/admin/permits?q=`.
- **Data:** a single query key `['plate', plate]` that bundles the three requests. It is invalidated by
  any SSE event for the same plate.

---

## 11. Wall mode (kiosk)

**Purpose:** the command center on a reception monitor or wall display, readable from about 3 m, with
no navigation chrome.

**Enter:**
- The strip's wall button, the command center header button, or the palette action.
- The URL `/admin?wall=1`, useful for kiosk bookmarks.
- Wall mode is not available below 960px.

**Behaviour:**
- Set `html[data-wall]`. Tokens then switch the `--cc-*` sizes and `--strip-h` (56px).
- Request fullscreen. It needs a user gesture: when opened by URL, show a centred glass button
  `wall.fullscreenAction` with `wall.fullscreenPrompt`. Leaving fullscreen (Esc) also leaves wall mode.
- Store `sessionStorage["parklens.wall"]` so a reload stays in wall mode.
- Hide the sidebar, the page header and page actions, the component-level "View all" links and all
  toasts except errors. The strip, takeover, tooltips and palette stay. The banner is transient (§4.2):
  it overlays the KPI row for 10 s after a new alarm, never for pre-existing ones, so the KPIs stay
  readable; the breathing edge glow remains while alarms are open.
- Request a Screen Wake Lock where supported, and release it on exit.
- Hide the cursor after 3 s without pointer movement (`html.is-idle { cursor: none }`).
- Residual alarm glow while open alarms are undismissed (§4.6).
- Low-effects fallback (§8).

**Exit:**
- The strip's labelled button `strip.wallExit` (always visible in wall mode).
- Esc, which leaves fullscreen.
- The palette action.

**Layout, 1920×1080** (the `.cc` grid fills the viewport: `height: calc(100vh − strip − 2 × --page-pad-y)`):

```
┌ strip 56px ─ [P] ParkLens │ ●LIVE [⚠ 1 OPEN ALARM] ●SYSTEM OK 2 GATES ACTIVE ······ [⌕] 14:32:07 Zurich (snd) EN|DE [Exit wall mode] (PA) ┐
│┌ Open alarms ─────┐┌ Parked now ──────┐┌ Entries today ───┐┌ Requests waiting ┐┌ Valid permits today ┐   KPI row 148px     │
││ 1          ╱╲_╱  ││ 23 / 40    ╱‾‾   ││ 44     ╱╲_╱‾     ││ 2                ││ 28                  │   values 72px       │
│└──────────────────┘└──────────────────┘└──────────────────┘└──────────────────┘└─────────────────────┘                    │
│┌ Occupancy (3) ───────────┐┌ Parked vehicles (6), bays 80×76 ─────────────────────────┐┌ Gate feed (3), rows 2–3, DARK ──┐ │
││   gauge 320px, value 96px ││                                                          ││ sensors                         │ │
││   plaque, legend          ││                                                          ││ stage 220px, plate xl           │ │
│└──────────────────────────┘└──────────────────────────────────────────────────────────┘│ list rows 46px (≈ 8 visible)    │ │
│┌ Open alarms (3) ─────────┐┌ Today (6) ───────────────────────────────────────────────┐│                                 │ │
│└──────────────────────────┘└──────────────────────────────────────────────────────────┘└─────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
Areas: `"k×12" / "g×3 l×6 f×3" / "a×3 t×6 f×3"`, rows `var(--cc-kpi-h) minmax(0,1.55fr) minmax(0,1fr)`.
A new alarm's transient banner overlays the KPI row for 10 s (§4.2).

**Session expiry:** after the 12 h JWT expires the kiosk lands on `/login?from=/admin?wall=1`.
Logging in restores wall mode (the fullscreen prompt appears).

---

## 12. Simulator autopilot

**Purpose:** generate believable gate traffic for demos, so every effect can be shown without a camera.

**Where:**
- The toggle lives on `/admin/simulator` (panel spec in §5.11).
- Palette actions start and stop it.
- It **runs in the admin shell** (a provider next to the SSE provider), so it keeps going while the
  admin navigates.

**Indicator:**
- Strip chip `strip.autopilot` (readout, cyan stripes animating at 1.1 s per cycle; static stripes under
  reduced motion) with `title` `strip.autopilotHint`. Clicking it opens a popover: `autopilot.title`,
  pace control, stats, `autopilot.popover.stop`, `autopilot.popover.open`.
- A cyan dot on the Gate simulator nav item.
- The chip is only rendered while autopilot runs.

**Algorithm** (every tick; Calm: random 8–15 s, Busy: random 3–6 s):
1. Inputs:
   - Permitted plates active today: `GET /api/permits?status=approved&activeToday=true&limit=200`, cached 5 min.
   - Active sessions: from the `sessions` query.
   - `capacity`: from `summary`.
2. Occupancy `r = parked / capacity`. Check-out probability `p = clamp(0.15 + (r − 0.5) × 1.2, 0.05, 0.8)`.
   Force a check-out when `r ≥ 0.95`; force a check-in when nobody is parked.
3. **Check-out:** a random active session, preferring authorized ones (unknown cars leave after at least 5 min).
4. **Check-in:**
   - With probability 1/12, and at least 60 s since the last one, send an **unknown plate**: a random
     canton code plus 1–6 digits, not in the permit list. This creates an alarm.
   - Otherwise, send a permitted plate that isn't currently parked.
5. Gate: `north` 60%, `south` 40%. If `/dashboard/gates` lists other gates, pick one at random with the
   same weighting as their `eventsToday`.
6. Send `POST /api/gate/check-in` or `check-out` with the admin JWT, exactly like the simulator.
   Results also go into the simulator result list.

**Safety:**
- At most one request in flight.
- After 3 consecutive errors, pause and show a danger toast `autopilot.paused {error}`.
- Stop on logout, token expiry or tab close.
- It never resolves alarms.

**Persistence:** `sessionStorage["parklens.autopilot"]` keeps `{on, pace, startedAt, sent, alarms}`,
so a reload resumes it. It never persists across tabs.

**A11y:**
- Start and stop announce `autopilot.started` / `autopilot.stopped` politely.
- The generated events get the normal live treatment, and the takeover still announces alarms.

---

## 13. Effects catalogue

All durations and easings are tokens (`--dur-*`, `--ease-*`). "RM" is the behaviour under `prefers-reduced-motion: reduce`.

| # | Effect | Trigger | Spec | Duration / easing | RM fallback | Perf notes |
|---|---|---|---|---|---|---|
| 1 | Ambient light fields | Always (admin; public at 0.6 dose) | 3 radial fields (blue, cyan, blue) on a fixed layer, drifting ±2% and scaling up to 1.06 | `--dur-ambient` 48 s, alternate, `--ease-standard` | Static | One fixed layer, `transform` only, `will-change: transform` |
| 2 | Blueprint grid | Always | 24px minor + 120px major hairlines, masked to fade downwards | Static | Same | Background only |
| 3 | Power-on | First command-center mount per session | KPI tiles then instruments: fade + rise `--motion-distance` + blur-in `--motion-blur`, stagger `--dur-stagger` | `--dur-enter` 520 ms, `--ease-out` | Instant | Only on first mount (flag in memory) |
| 4 | Count-up | Mount and every value change (KPIs, lens, plaque) | Tween from the last shown value, ease-out quart | `--dur-count` 1.1 s (600 ms for updates) | Final value | motion value; no per-frame React renders |
| 5 | Draw-on | First mount of sparklines and the occupancy line | `stroke-dashoffset` 1 → 0 with `pathLength=1`; area and dots fade in after | `--dur-draw` 900 ms, stagger 90 ms | Drawn | Once; later updates redraw without animation |
| 6 | Timeline bars grow | First mount | `scaleY` 0 → 1 from the baseline, 22 ms stagger per hour | `--dur-slow` 360 ms, `--ease-out` | Instant | `transform-box: fill-box` |
| 7 | Gauge sweep | Mount and value change | Arc `stroke-dasharray` transitions; the unauthorized segment rotates to follow | `--dur-draw`, `--ease-out` | Instant | px dash values (§5.6) |
| 8 | Radar sweep + blip flare | Always on the command center | Conic sweep rotates; each blip flares when passed (delay synced to sweep phase) | `--dur-radar` 8 s linear, infinite | Sweep frozen at 300° (35% opacity), blips static | 1 rotating layer; paused off-screen or hidden |
| 9 | Plate scan | Each `gate.event` in the Gate feed; simulator results | Scrambled plate at fixed width → cyan reticle hunts → beam sweeps → decode left → right → reticle snaps + verdict stamp (scale 1.35 → 1) + stage glow | Beam `--dur-scan` 900 ms `--ease-scan`; decode `--dur-decode` 600–820 ms; lock/stamp `--dur-verdict` 320 ms `--ease-snap` | Final state immediately | One element animates; decode writes text in rAF for < 1 s |
| 10 | Tile arrive / leave | Session opened or closed | Drop in from the aisle side (∓16px, scale 0.8 → 1) + cyan ping ring; leave = reverse + fade | 620 ms `--ease-snap` / 360 ms `--ease-in` | Appear / disappear | `transform`/`opacity` |
| 11 | Unauthorized pulse | Tile with an open alarm | Red ring scales 0.96 → 1.35 and fades out | `--dur-pulse` 1.6 s, infinite | Static ring at 1.12 | One pseudo-element per red tile (rarely > 3) |
| 12 | Sensor / LIVE ping | Active gate; LIVE readout | Dot ring scales 1 → 3.2 and fades out | 2 s infinite, `--ease-out` | Static dot | `transform` |
| 13 | Live ping | Row/card/tile id from SSE | Cyan wash holds 600 ms, then fades; list rows expand from 0 height | `--dur-highlight` 1.8 s | Colour fade kept (no motion) | Colour only |
| 14 | Alarm takeover | `alarm.created` | §4.6: edge glow ×2, banner slide + sheen + siren swing, badge bump | 2.4 s / 460 ms / 1.1 s / 900 ms / 460 ms | Static edge 4 s, no slide or bump | Glow is a fixed layer: opacity only |
| 15 | Badge bump | Count increases (alarms, requests) | Scale 1 → 1.32 → 1 | 460 ms `--ease-snap` | None | – |
| 16 | Cursor spotlight | Pointer over an instrument (fine pointer only) | Radial blue fill (`--spotlight-size` 380px) + border light masked to the 1px edge, following the cursor via `--mx`/`--my` | Fade 400 ms | Off | One rAF-throttled pointermove listener on the document |
| 17 | Palette open | ⌘K | Scrim fades; panel rises 10px, scales 0.98 → 1, blur-in | `--dur-base` 220 ms `--ease-out` | Instant | – |
| 18 | Dossier / dialogs / toasts | Open and close | Drawer slides from the right (spring); dialogs fade + rise + blur-in; toasts rise, exit right | Spring / `--dur-base` | Fade only | – |
| 19 | Autopilot stripes | Autopilot on | Diagonal cyan stripes scroll inside the strip chip | 1.1 s linear, infinite | Static stripes | Small element; `background-position` |
| 20 | Wall residual glow | Wall mode + undismissed open alarm | Edge glow breathes 0.18 ↔ 0.42 | `--dur-breathe` 4 s alternate | Static at 0.35 | Opacity only |

Keep effects to this list. Anything new needs a real data trigger, token timings, an RM fallback and the
same performance rules.

---

## 14. Removed or renamed in v2

| v1 | v2 |
|---|---|
| Barlow + Barlow Semi Condensed (400–700) | Space Grotesk 700 + Inter 400 only (§1.2); remove the Barlow packages |
| Dark asphalt sidebar with a yellow lane marker | Light glass sidebar with a blue glowing marker; dark command strip on top (§3.3) |
| Sidebar footer: LiveIndicator, sound switch, language, user, logout | Moved into the command strip and avatar menu |
| Yellow "fresh paint" highlight, `--c-marking*` | Cyan live ping (§4.4); the yellow primitives are removed |
| Dashboard with KPI strip (bay dividers) + 4 panels | Command center (§5.6). `dashboard.recentEvents.*` and `dashboard.pendingRequests.*` become unused once the old DashboardPage is deleted (keys kept until then). |
| `nav.dashboard` "Dashboard" / "Übersicht" | "Command center" / "Leitstand" (same key). `dashboard.title` too. New `nav.dashboardShort` for the tab bar. |
| `--text-sm` 14px; radii 4/6/10/14 | 13px; radii 6/10/16/22 (+ `--radius-xs` 4) |
| `--plate-bg` as fill | `--plate-bg` is now the flat gap colour; the fill is `--plate-fill` (gradient) |
| `--color-nav-*` dark values; `--color-focus-on-dark` yellow | Light-sidebar values; `--color-focus-on-dark` is cyan and only used on dark accent surfaces |
| 409 on `POST /api/admins` (no code) | `EMAIL_TAKEN`, mapped to the email field (`settings.admins.duplicateEmail`; `errors.EMAIL_TAKEN` as fallback) |
