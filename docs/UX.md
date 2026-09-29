# ParkLens: UX Specification (MVP)

Companion to `ARCHITECTURE.md`, which defines the API. This document never changes the API.
Tokens: `web/src/styles/tokens.css`. Copy: `web/src/i18n/locales/{en,de}.json`. Keys are written as
`namespace.key` (e.g. `alarms.banner.resolve`). Components must use **semantic tokens**
(`--color-*`, `--text-*`, `--space-*`, …), never hex values or the `--c-*` primitives.

---

## 1. Design direction

**Signal blue on asphalt.** ParkLens takes its visual language from the car park itself: the blue
Swiss "P" sign, asphalt, yellow road markings and, most of all, the number plate. It should feel like
a calm, well-signposted car park. Surfaces are quiet, signs are clear, and red appears only when
something needs attention.

- **Tone:** calm, factual, operational. Plain verbs, sentence case, no exclamation marks, no marketing copy.
- **Personality lives in three places only:**
  1. **PlateChip**: every plate appears as a small Swiss-style number plate (white field, black
     characters, inset rim). This is the signature element, and it makes lists quick to scan.
  2. **Asphalt shell**: the admin navigation is dark asphalt, with a road-marking-yellow lane line
     next to the active page.
  3. **Fresh paint**: rows that arrive live get a pale marking-yellow wash that fades out.
- **Everything else stays quiet:** white panels with 1px borders and no drop shadows, one blue for all
  actions, left-aligned layouts. Only floating layers (dialogs, toasts, the alarm banner) get shadows.
- **Light theme only** for the MVP (`color-scheme: light`). Because every colour comes from semantic
  tokens, a dark theme can be added later by overriding tokens alone.

### 1.1 Colour meaning (strict)

| Colour | Means | Never used for |
|---|---|---|
| Red (danger) | Car on the lot without a valid permit (open alarm, unauthorized entry), destructive actions, errors | Decoration, rejected requests |
| Amber (warning) | Waiting for a decision (pending), needs checking (date passed, notification failed) | Alarms |
| Green (success) | Valid permit, authorized entry, approved | – |
| Grey (neutral) | Closed history: rejected, revoked, resolved, check-out | – |
| Blue (primary/info) | Actions, links, focus on light surfaces, brand, info hints | Status |
| Yellow (marking) | Active nav marker, focus ring on asphalt, fresh-paint highlight | Text on light surfaces, status |

Rejected and revoked are grey on purpose, so that red always means "act now".

### 1.2 Typography

**Barlow** for UI text, **Barlow Semi Condensed** for headings, KPI values and plates. Both belong to
one superfamily modelled on highway signs and number plates, which suits the subject. The
semi-condensed width also keeps plates and numbers compact in tables.

- Self-host with Fontsource (no Google CDN, which suits nDSG/GDPR and LAN-only installs):
  `npm i @fontsource/barlow @fontsource/barlow-semi-condensed`, then import weights 400/500/600
  (Barlow) and 500/600/700 (Semi Condensed) in `main.tsx`. The exact import list is in the header of
  `tokens.css`.
- `--font-mono` (system stack) is only for text people copy or type: reference codes, URLs, the API key hint.

| Role | Font token | Size token | Weight / notes |
|---|---|---|---|
| Public h1 | `--font-display` | `--text-3xl` (`--text-2xl` < 720px) | 600, `--tracking-tight` |
| Admin page h1 | display | `--text-2xl` (`--text-xl` < 720px) | 600, `--tracking-tight` |
| Panel title (h2) | display | `--text-md` | 600 |
| Dialog title (h2) | display | `--text-lg` | 600 |
| Public body, inputs | `--font-sans` | `--text-base` (16px, prevents iOS zoom) | 400 |
| Admin body, table cells | sans | `--text-ui` | 400 |
| Field labels | sans | `--text-sm` | 600 |
| Hints, meta | sans | `--text-sm` | 400, `--color-text-muted` |
| Buttons | sans | sm: `--text-sm`, md: `--text-ui`, lg: `--text-base` | 600 |
| KPI value | display | `--text-3xl` | 600, tabular numerals |
| Badges | sans | `--text-xs` | 600 |

Rules: sentence case everywhere and no ALL-CAPS labels. Apply `font-variant-numeric: tabular-nums` to
times, durations, counts and KPI values. Limit prose to `--measure`.

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
- **Relative time** (`<RelativeTime>`) is used in live feeds: dashboard panels, alarm list, request
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
| `409` on `POST /api/admins` | Email field, `settings.admins.duplicateEmail` |
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
| `/admin` | – |
| `/admin/alarms` | `status=open\|resolved\|all` (default `open`), `plate`, `focus=<alarmId>`, `page` |
| `/admin/requests` | `tab=pending\|all` (default `pending`), `page` |
| `/admin/permits` | `q`, `status`, `type`, `activeToday=true`, `page` |
| `/admin/activity` | `tab=parked\|log` (default `parked`), `plate`, `direction`, `authorized`, `page` |
| `/admin/simulator`, `/admin/settings` | – |
| any unknown route | Not-found page (`errors.notFoundPage.*`) |

### 3.2 Public shell

```
┌──────────────────────────────────────────────────────────────────────┐
│ [P] ParkLens                                                EN | DE  │  header, 64px, surface, 1px bottom border
├──────────────────────────────────────────────────────────────────────┤
│        ┌──────────────── max 560px, left-aligned text ──────────┐    │  page: --color-bg
│        │  page content                                          │    │
│        └────────────────────────────────────────────────────────┘    │
│        Admin login                                                   │  footer link, sm, muted
└──────────────────────────────────────────────────────────────────────┘
```
- **Logo mark:** a 28px square with 6px radius, `--color-logo-bg`, and a white "P" in display 700 at
  18px. The wordmark "ParkLens" is display 600 at `--text-md`. Reuse the same "P" square as the SVG favicon.
- **Language switcher:** a compact SegmentedControl on the right of the header.
- **Footer:** the link `public.adminLogin` → `/login`. It is hidden on `/login` itself.

### 3.3 Admin shell, desktop (≥ 960px)

```
┌─ 248px asphalt ─────┬──────────────────────────────────────────────────────────────┐
│ [P] ParkLens        │ ┌ AlarmBanner (sticky, only when needed, §4.2) ─────────────┐ │
│                     │ └───────────────────────────────────────────────────────────┘ │
│▌ Dashboard          │  Dashboard                                   [page action]   │
│  Alarms         (1) │  Today, Tue 29 Sep 2026                                       │
│  Requests       (2) │                                                               │
│  Permits            │  … content, max 1280px, padding --page-pad-x/y                │
│  Activity           │                                                               │
│  Gate simulator     │                                                               │
│  Settings           │                                                               │
│                     │                                                               │
│ ─────────────────── │                                                               │
│ ● Live              │                                                               │
│ Alarm sound   [o ]  │                                                               │
│ [ EN | DE ]         │                                                               │
│ Parking Admin       │                                                               │
│ admin@parklens.local│                                                               │
│ [Log out]           │                                                               │
└─────────────────────┴──────────────────────────────────────────────────────────────┘
```

| Item | lucide icon | Label key | Route | Badge |
|---|---|---|---|---|
| Dashboard | `LayoutDashboard` | `nav.dashboard` | `/admin` | – |
| Alarms | `Siren` | `nav.alarms` | `/admin/alarms` | Danger CountBadge = `summary.openAlarms` |
| Requests | `Inbox` | `nav.requests` | `/admin/requests` | Warning CountBadge = `summary.pendingRequests` |
| Permits | `BadgeCheck` | `nav.permits` | `/admin/permits` | – |
| Activity | `ArrowRightLeft` | `nav.activity` | `/admin/activity` | – |
| Gate simulator | `ScanLine` | `nav.simulator` | `/admin/simulator` | – |
| Settings | `Settings` | `nav.settings` | `/admin/settings` | – |

**Sidebar:**
- Fixed full height with `--color-nav-bg`. The logo block is 64px tall.
- Nav items are 40px tall with 12px side padding, a 20px icon and a `--text-ui` label (weight 500) in `--color-nav-text`.
- Hover uses `--color-nav-hover-bg`.
- The active item gets `aria-current="page"`, `--color-nav-active-bg`, white text, and a **3px
  `--color-nav-marker` bar** on its left edge at full item height (the lane line).
- CountBadges are right-aligned and hidden when the count is 0. The link's accessible name includes
  the count, e.g. "Alarms, 1 open alarm" (`nav.openAlarms_*`).

**Sidebar footer** (1px `--color-nav-border` on top, 16px padding), from top to bottom:
- LiveIndicator (§4.1)
- Alarm sound Switch (`nav.sound.label`)
- LanguageSwitcher (dark variant)
- Signed-in admin: name in white 600, email in `--text-sm` `--color-nav-text-muted`, truncated with an ellipsis
- Logout button (`nav` variant, `DoorOpen` icon, `nav.logout`)

**Content:**
- `<main id="content">`, left-aligned, max `--content-max`.
- Page header: h1 on the left and page actions on the right. An optional sub-line below uses `--text-sm` muted.
- Skip link `nav.skipToContent` is the first focusable element.

### 3.4 Admin shell, mobile and tablet portrait (< 960px)

```
┌──────────────────────────────────────────────┐
│ [P]  Alarms                  ●  [Siren 1]    │  top bar 56px, asphalt, sticky
├──────────────────────────────────────────────┤
│ ┌ AlarmBanner ─────────────────────────────┐ │
│ └──────────────────────────────────────────┘ │
│  content (padding 16px)                      │
│                                              │
├──────────────────────────────────────────────┤
│ Dashboard  Alarms(1)  Requests(2) Permits More│  tab bar 64px + safe-area, white
└──────────────────────────────────────────────┘
```
- **Top bar:**
  - Logo mark (→ `/admin`).
  - Current page title in display 600 `--text-md`, white, truncated.
  - LiveIndicator: dot only, with `aria-label` giving the state.
  - Alarm button: a `Siren` icon plus a danger CountBadge, linking to `/admin/alarms`.
- **Bottom tab bar:**
  - Items: Dashboard, Alarms, Requests, Permits, More. Each has a 22px icon and an `--text-xs` label.
  - The active item uses `--color-tabbar-text-active` and weight 600, with `aria-current`.
  - Use `padding-bottom: env(safe-area-inset-bottom)`.
- **More** (`Ellipsis` icon) opens a bottom sheet (Dialog sheet variant) containing:
  - Links: Activity, Gate simulator, Settings (same icons as the sidebar)
  - Alarm sound switch
  - LanguageSwitcher
  - "Signed in as"
  - Log out
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
- **LiveIndicator:**
  - `live`: an 8px `--color-success-solid` dot with `nav.live.connected`.
  - Otherwise: an amber dot with `nav.live.connecting` / `nav.live.reconnecting`, plus
    `nav.live.hintDisconnected` in a tooltip and the `aria-describedby`.
- **After reconnecting**, invalidate every admin query.
- **Safety net:** the `summary` and `alarms` queries refetch every 60 s.

| Event | Invalidate query keys | UI effect |
|---|---|---|
| `alarm.created` | `summary`, `alarms`, `sessions`, `gate-events` | Banner (§4.2), announcement + sound (§4.3), fresh-paint row, document title |
| `alarm.updated` | `summary`, `alarms`, `sessions` | If `resolved`, remove its banner. Webhook status changes update silently. |
| `gate.event` | `gate-events`, `sessions`, `summary` | Fresh-paint row in visible lists |
| `permit.changed` | `permits`, `summary`, `sessions` | Lists update, no extra UI |
| `request.created` | `permits`, `summary` | Info toast `requests.newRequestToast` with action `requests.review` → `/admin/requests` (suppressed on that page) |

### 4.2 AlarmBanner

**Source:** open alarms (`GET /api/alarms?status=open&limit=20`), minus the ids this browser session
has dismissed (`sessionStorage["parklens.dismissedAlarms"]`, a JSON array). As a result:
- An open alarm is visible right after login. The demo seed shows one immediately.
- Nothing is lost across reconnects.

It shows the **newest** remaining alarm. **Hide the banner on `/admin/alarms`**, because the list is
the source of truth there. Sound and announcements still play on that page.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ (Siren)  Car without permit entered    [ZH 999 999]    08:12 at gate main           │
│          2 more open alarms                          [ Resolve ]  View alarm    ✕   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Visual:**
- Background `--color-danger-solid`, text `--color-on-danger`, secondary text `--color-on-danger-muted`.
- `--radius-lg`, `--shadow-banner`, 12px × 16px padding.
- Sticky: `top: 0` on desktop and `top: var(--topbar-h)` on mobile, with `z-index: var(--z-banner)`.
- Sits inside the content column with a 16px gap below it.

**Content:**
- `Siren` icon (24px).
- Title `alarms.banner.title.<type>` (display 600, `--text-md`).
- PlateChip md, which stays white.
- Meta line `alarms.banner.meta` with `{time, gate}` (`metaNoGate` when there is no `gateId`). Use
  `time` for today and `dateTime` otherwise.
- `alarms.banner.more_*` as a link to `/admin/alarms` when more than one alarm is visible.

**Actions:**
- **Resolve:** Button `inverse` variant (white background, danger text), `alarms.banner.resolve`.
  Opens the global ResolveAlarmDialog in place.
- **View alarm:** a white underlined link, `alarms.banner.view` → `/admin/alarms?status=open&focus=<id>`.
- **Dismiss:** an icon button (`X`, `aria-label` `alarms.banner.dismiss`). It adds the id to the
  dismissed set. The alarm stays open and the nav badge still counts it.

**Motion:**
- On enter, the banner slides down by `--motion-distance` and fades in (`--dur-base`, `--ease-out`).
- The siren icon pulses once (scale 1 → 1.15 → 1 over `--dur-pulse`). No looping animation.

**Mobile (< 720px):**
- Row 1: icon, title, and the ✕ in the top-right corner.
- Row 2: PlateChip and meta.
- Row 3: Resolve and View as two equal-width buttons.

The banner is **not** a live region. Screen-reader announcements come from §4.3.

### 4.3 Announcement, sound, title, badge

- **Screen readers:** the shell renders `<div class="sr-only" aria-live="assertive" aria-atomic="true">`.
  On `alarm.created`, it sets `alarms.announce.<type>` with `{plate, time}` and clears it after 5 s.
- **Sound:**
  - The toggle is the Switch `nav.sound.label` in the sidebar footer and the More sheet.
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

### 4.4 Fresh-paint highlight

When a row whose id just arrived via SSE is rendered in a visible list, add `.is-fresh`:
- The background starts as `--color-highlight`.
- Hold for 600 ms, then transition `background-color` to transparent over `--dur-highlight`.

Rows targeted by `?focus=<id>` get the same highlight plus `scrollIntoView({ block: 'center' })`.
Under reduced motion, pass `behavior: 'auto'`.

### 4.5 ResolveAlarmDialog (global, mounted once in the shell)

It opens from the banner, the dashboard alarm list and the alarms page. Dialog size md.

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
- **Steps** are an `<ol>` because they are a real sequence.
  - Each number sits in a 28px circle with a 1.5px `--color-text` outline, in display 600.
  - Title: `--text-ui` 600. Body: `--text-sm`, muted.
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
│ PL-7K3Q9                   [Copy] │   CopyField, mono --text-2xl 600, tracking 0.04em
└───────────────────────────────────┘
Status link
┌─────────────────────────────────────────────────────────┐
│ https://…/request/9fJx…Qe2                  [Copy link] │   CopyField, mono --text-sm, middle-truncated
└─────────────────────────────────────────────────────────┘
Save the link or note the reference code. To look up the request later, you need the code and your plate.

[ Open status page ]    Request another permit
```
- The status link is `${location.origin}/request/${token}`.
- "Request another permit" (`request.success.another`) resets the form, keeps the type, and shows the form again.

### 5.3 Status lookup `/request/status`

- h1 `status.lookup.title` and lead `status.lookup.lead`, then a Panel form:
  - **Reference code:** Input in mono, uppercased as the user types, `autocomplete="off"`,
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
Request PL-7K3Q9                                  ← h1 --text-2xl; reference in mono
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
  display 600 `--text-lg`, body `--text-base`.
- **Details:** a DescriptionList. Labels come from `common.fields.*`; the type uses `common.permitTypeLong.*`.
- **404:** EmptyState with `status.notFound.title/body`, plus action `status.notFound.action` → `/request/status`.
- **Loading:** skeletons for the plate and the panel.

### 5.5 Login `/login`

- A centred column, max 400px. The logo mark sits above h1 `login.title` and lead `login.lead`.
- **Panel:**
  - Email: `type=email`, `autocomplete=username`.
  - Password: `autocomplete=current-password`, with an Eye/EyeOff icon button that uses `aria-pressed`
    and `common.actions.showPassword` / `hidePassword`.
  - Submit: primary lg, full width, `login.submit` / `login.submitting`.
- **Info InlineAlert above the form:** `login.sessionExpired` (when `?expired=1`) or `login.loggedOut` (from router state).
- **Errors:** `errors.INVALID_CREDENTIALS` and `errors.RATE_LIMITED` as a form-level InlineAlert.
  Keep the email, clear the password, and focus the password field.
- **Below the panel:** `login.publicHint` plus the link `login.publicLink` → `/`.

### 5.6 Dashboard `/admin`

**Purpose:** show the state of the lot at a glance and give the shortest path to acting on it.
Header: h1 `dashboard.title`, sub-line `dashboard.today {date: dateWeekday}`.

```
┌────────────────┬────────────────┬────────────────┬────────────────┬────────────────┐
│▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│                │▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│                │                │  3px top bar when alert
│ Open alarms    │ Parked now     │ Requests       │ Entries today  │ Valid permits  │
│ 1   (Siren)    │ 2              │ waiting        │ 3              │ today          │
│                │ (x) 1 without  │ 2   (Clock)    │                │ 3              │
│ View alarms    │ permit         │ Review requests│ View gate log  │ View permits   │
└────────────────┴────────────────┴────────────────┴────────────────┴────────────────┘
┌ Open alarms ────────────────────── View all ┐  ┌ Parked now ─────────────── View all ┐
│ [ZH 999 999] (No permit)  Today, 08:12       │  │ [ZH 999 999] (No permit)      40 min │
│ gate main  (Still parked)        [Resolve]   │  │ [ZH 123 456] Anna Muster, Perm. 2 h  │
├──────────────────────────────────────────────┤  └──────────────────────────────────────┘
┌ Latest gate events ─────────────── View all ┐  ┌ Waiting for approval ───── View all ┐
│ 5 min ago  In   [BE 98 765] (Authorized)     │  │ [AG 44 321] Tom Weber                │
│ 2 h ago    Out  [BE 98 765]  Marco Rossi     │  │ Day permit, Wed, 30 Sep   2 h ago    │
└──────────────────────────────────────────────┘  └──────────────────────────────────────┘
```

**KpiStrip:**
- One Panel split into cells by 1px `--color-border` dividers, like the lines between parking bays.
- Each cell is a single `<a>`. Label `--text-sm` 600 muted; value display `--text-3xl` tabular; link text `--text-sm` in link colour.
- Cell padding: 16px × 20px.
- Data: `GET /api/dashboard/summary`.

| Cell | Value | Secondary line | Link | Alert state |
|---|---|---|---|---|
| `kpi.openAlarms` | `openAlarms` | – | `/admin/alarms` (`kpi.viewAlarms`) | `> 0`: `--color-danger-bg` background, value in `--color-danger-text`, `Siren` icon, 3px `--color-danger-solid` top bar |
| `kpi.parkedNow` | `parkedNow` | `parkedUnauthorized > 0`: `kpi.parkedUnauthorized_*` in danger text with a `ShieldAlert` icon; else `kpi.allParkedAuthorized` (muted) | `/admin/activity` (`kpi.viewParked`) | – |
| `kpi.pendingRequests` | `pendingRequests` | – | `/admin/requests` (`kpi.reviewRequests`) | `> 0`: `Clock` icon, 3px `--color-warning-solid` top bar |
| `kpi.entriesToday` | `entriesToday` | – | `/admin/activity?tab=log` (`kpi.viewLog`) | – |
| `kpi.activePermitsToday` | `activePermitsToday` | – | `/admin/permits?activeToday=true&status=approved` (`kpi.viewPermits`) | – |

- **Responsive:** 5 columns at ≥ 1080px, 3 + 2 at 720–1079px, 2 columns below 720px. Below 720px the
  "Open alarms" cell spans both columns when its value is above 0.

**Panel grid:**
- At ≥ 1080px, two columns (3fr / 2fr): left holds Open alarms then Latest gate events; right holds
  Parked now then Waiting for approval.
- Below that, one column in the order: Open alarms, Parked now, Waiting for approval, Latest gate events.
- Each panel loads, empties and errors on its own. Every panel header has a "View all" link.

**Panels:**
- **Open alarms:** `GET /api/alarms?status=open&limit=5`.
  - Row: PlateChip md, alarm type badge, RelativeTime, gate, and a "Still parked" badge when true.
  - Action: Button primary sm `alarms.resolve`, which opens the ResolveAlarmDialog.
  - Empty: `dashboard.openAlarms.empty*` with a success-coloured `CircleCheck` icon.
- **Parked now:** `GET /api/sessions?active=true&limit=10`.
  - Sort client-side: unauthorized first, then `enteredAt` descending.
  - Row: PlateChip md, `permit.holderName` + `common.permitType.*`, or a danger badge `common.noPermit`.
    Duration is right-aligned and tabular.
  - When `openAlarmId` is set, add a small link `activity.openAlarm` → `/admin/alarms?focus=`.
- **Latest gate events:** `GET /api/gate-events?limit=8`.
  - Row: RelativeTime (fixed 96px column), direction icon + `common.direction.*`, PlateChip sm, access
    badge (`in` events only), and the holder name muted.
- **Waiting for approval:** `GET /api/permits?status=pending&limit=5`.
  - Row: PlateChip md, holder name, `common.permitDailyOn` or `common.permitTypeLong.permanent`, and RelativeTime of `createdAt`.
  - The whole row links to `/admin/requests`.

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
  (`--text-ui` 600) with the email below (muted), and on the right RelativeTime `requests.requestedAt`
  plus `requests.reference` in mono.
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
- **Holder:** name (500) with the email below (muted).
- **Type:** `common.permitTypeLong.permanent`, or `common.permitDailyOn {date}`.
- **Status:** StatusBadge, then one of:
  - `isActiveToday`: a success dot with `common.validToday`.
  - Approved and `isDatePassed`: muted `common.datePassed`.
- **Source:** `common.source.admin`, or `common.source.request` with the reference in mono below.
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
- Success: close, toast `success {plate}`, invalidate `permits` and `summary`, and fresh-paint the new row.

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

- New cards get the fresh-paint highlight.
- The list container is `aria-live="polite"`, so only the new card is announced.
- Header action: `clearResults` (ghost sm).
- Empty state: `simulator.empty.*`, `ScanLine` icon.
- A denied check-in also triggers the global alarm banner and sound. This is correct behaviour and
  makes the demo convincing.

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
  hint `passwordHint`. A 409 maps to the email field (`duplicateEmail`). Success toast `added {name}`.
- **RemoveAdminDialog** (sm): `removeDialog.title {name}`, `body {email}`, and a danger `confirm`.
  Cancel gets initial focus. `CANNOT_DELETE_SELF` and `LAST_ADMIN` show as toasts.

**4. Your password** (`settings.account.*`)
- Fields: `currentLabel`, `newLabel` (hint `newHint`) and `confirmLabel`, with submit `submit`.
- 204: toast `success`, then clear the fields.
- `INVALID_CREDENTIALS` / 401: field error `wrongCurrent` on the current password. **Do not log out** (§2.4).

---

## 6. Component inventory

Class names are suggestions. Every component uses semantic tokens only.

### Button `.btn`
- **Variants:**

  | Variant | Background | Text | Hover / active / notes |
  |---|---|---|---|
  | `primary` | `--color-primary` | `--color-on-primary` | Hover `-hover`, active `-active` |
  | `secondary` | `--color-surface` | `--color-text` | 1px `--color-border-input`; hover `--color-surface-hover` + `--color-border-input-hover` |
  | `ghost` | transparent | `--color-text-secondary` | Hover `--color-surface-sunken` |
  | `danger` | `--color-danger-solid` | `--color-on-danger` | Hover `-hover`, active `-active` |
  | `inverse` | white | `--color-danger-text` | Only on the red banner |
  | `nav` | transparent | `--color-nav-text` | On asphalt; hover `--color-nav-hover-bg` |

- **Sizes:**

  | Size | Height | Padding x | Text | Icon |
  |---|---|---|---|---|
  | `sm` | `--control-h-sm` | 12px | `--text-sm` | 16px |
  | `md` | `--control-h-md` | 16px | `--text-ui` | 16px |
  | `lg` | `--control-h-lg` | 20px | `--text-base` | 20px |

  Icon-only buttons are square and require an `aria-label`. `.btn--block` makes a button full width.
- **Style:** weight 600, `--radius-md`, 8px gap between icon and label. Labels are verbs, with no
  trailing arrows. Pressing changes colour only (`--dur-fast`), never transform.
- **States:**
  - `:focus-visible`: 2px outline at 2px offset, `--color-focus`. Use `--color-focus-on-dark` on asphalt and `--color-focus-on-danger` on the banner.
  - Disabled: `--color-surface-sunken` background, `--color-text-disabled` text, transparent border, `cursor: not-allowed`, no hover.
  - Loading: a 16px spinner replaces the leading icon, the label stays, `aria-busy="true"`, clicks are ignored, and the width stays stable.

### Field / Input / Select / Textarea / Date / Checkbox / Switch
- **Field anatomy:**
  - Label: `--text-sm` 600. Optional fields add "(`common.optional`)" in muted 400. Don't use asterisks; use the `required` attribute.
  - 6px gap, then the control.
  - 6px gap, then the hint (`--text-sm`, muted) **or** the error (`--text-sm`, `--color-danger-text`,
    `CircleAlert` 14px). The error replaces the hint.
  - 20px between fields. Link hint and error to the control with `aria-describedby`, and set `aria-invalid` on error.
- **Input:**
  - Height `--control-h-md`, 12px side padding, `--text-base`.
  - 1px `--color-border-input`, `--radius-md`, `--color-surface` background, `--color-placeholder` placeholder.
  - Hover: border `-hover`.
  - Focus: `--color-primary` border plus a 2px `--color-focus` outline at 1px offset.
  - Error: `--color-danger-solid` border. On focus the border stays red and the outline stays blue.
  - Disabled: sunken background, muted text.
  - Read-only: `--color-bg` background with a `--color-border` border.
  - Optional leading icon (Search, 16px) at left 12px; the input then gets 36px left padding.
- **Select:** native, `appearance: none`, with a `ChevronDown` 16px at right 12px and 36px right padding.
- **Textarea:** min height 88px, vertical resize, 10px vertical padding. A counter (`--text-xs`, muted,
  right-aligned, "420 / 500") appears at ≥ 80% of the maximum and turns danger colour past it.
- **Date:** native `type="date"` / `datetime-local` with `min` and `max`. The browser shows its own
  locale format, which is acceptable for the MVP.
- **Checkbox:** native, 18px, `accent-color: var(--color-primary)`. The label (`--text-ui`) sits to
  the right, with the hint below the label.
- **Switch:**
  - `<button role="switch" aria-checked>`: a 36 × 20 pill track with a 1px border and a 14px thumb
    (`--shadow-xs`). The thumb moves over `--dur-fast`. The label is clickable.
  - Light surfaces: off uses `--color-switch-track-off` / `-border-off` / `-thumb-off`; on uses
    `--color-switch-track-on` (border same colour) / `-thumb-on`.
  - On asphalt (sidebar): the `*-dark` variants. On is a yellow track with an asphalt thumb, matching the lane marker.
  - State is never colour-only: the thumb position changes too.

### SegmentedControl
- **Markup:** `<fieldset>` + `<legend>`, with native radios visually hidden and styled labels. Arrow-key navigation comes for free.
- **`compact`** (filters, forms):
  - Container: `--color-surface-sunken` background, 2px padding, `--radius-md`, height `--control-h-sm`.
  - Option: 12px side padding, `--text-sm` 600, `--color-text-muted`.
  - Selected: `--color-surface` background, `--color-text`, `--shadow-xs`.
  - Focus ring sits on the option, via `:has(:focus-visible)`.
- **`card`** (public request type):
  - Two cards side by side, stacked below 480px.
  - Each card: 16px padding, 1px `--color-border-input`, `--radius-lg`, a 24px icon, the title in
    `--text-md` 600 and the description in `--text-sm` muted.
  - Selected: 2px `--color-primary` border (reduce padding by 1px to compensate),
    `--color-primary-subtle` background, and a 20px `CircleCheck` in the top-right corner.
- **`dark`** (LanguageSwitcher in the sidebar): `--color-nav-control-bg` container, options in
  `--color-nav-text`; the selected option uses `--color-nav-control-selected-bg` with `--color-nav-text-active`.

### StatusBadge `.badge`
- **Anatomy:** a 14px icon (`aria-hidden`) plus text. Height 22px, 8px side padding, `--radius-sm`,
  `--text-xs` 600, 1px border in the tone's border colour, tone background and text.
- **Icon and text are always both shown.** Colour alone never carries the status.

| Value | Tone | Icon | Label key |
|---|---|---|---|
| permit `pending` | warning | `Clock` | `common.permitStatus.pending` |
| permit `approved` | success | `CircleCheck` | `common.permitStatus.approved` |
| permit `rejected` | neutral | `CircleX` | `common.permitStatus.rejected` |
| permit `revoked` | neutral | `Ban` | `common.permitStatus.revoked` |
| alarm `open` | danger | `Siren` | `common.alarmStatus.open` |
| alarm `resolved` | neutral | `Check` | `common.alarmStatus.resolved` |
| allowed (`authorized: true`) | success | `ShieldCheck` | `common.access.authorized` |
| denied (`authorized: false`) | danger | `ShieldAlert` | `common.access.unauthorized` |
| `unauthorized_entry` | danger | `ShieldAlert` | `common.alarmType.unauthorized_entry` |
| `overstay` | danger | `TimerOff` | `common.alarmType.overstay` |
| session without permit | danger | `ShieldAlert` | `common.noPermit` |
| still parked | neutral | `Car` | `common.stillParked` |
| valid today (text variant) | success text, 8px dot | – | `common.validToday` |

### CountBadge
- A pill: min-width 20px, height 20px, 6px side padding, `--text-xs` 700, tabular, `--tracking-wide`.
- **Tones:**
  - danger: `--color-danger-solid` with white text.
  - warning: `--color-warning-pill-bg` / `--color-warning-pill-text`.
  - neutral: `--color-neutral-bg` / `--color-neutral-text`.
- Hidden at 0. The number is `aria-hidden`; the parent link or tab carries the plural label.

### PlateChip `.plate`, the signature element
- **Props:** `plate` (normalized) **or** `display`; `size`: `sm | md | lg | xl` (default `md`);
  `interactive` (renders a `<button>`).
- **Always white with black characters**, on any surface (tables, the red banner, toasts).
- Never truncate: plates are at most 12 characters plus spaces. Add `translate="no"`.
- Where no column header gives context (banner, toasts, dialog headers), prefix a visually hidden
  `common.fields.plate`.

```css
.plate {
  display: inline-flex; align-items: center; white-space: nowrap; vertical-align: middle;
  height: var(--plate-md-h); padding-inline: var(--plate-md-pad);
  font-family: var(--plate-font); font-weight: var(--plate-weight);
  font-size: var(--plate-md-font); line-height: 1;
  letter-spacing: var(--plate-tracking); text-transform: uppercase;
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--plate-ink); background: var(--plate-bg);
  border: 1px solid var(--plate-edge); border-radius: var(--plate-md-radius);
  /* white gap, then the inset rim line, then a hairline lift */
  box-shadow: inset 0 0 0 var(--plate-rim-gap) var(--plate-bg),
              inset 0 0 0 calc(var(--plate-rim-gap) + 1px) var(--plate-rim),
              var(--plate-shadow);
}
.plate--sm { height: var(--plate-sm-h); padding-inline: var(--plate-sm-pad);
             font-size: var(--plate-sm-font); border-radius: var(--plate-sm-radius);
             box-shadow: var(--plate-shadow); }            /* no inset rim at sm */
.plate--lg { height: var(--plate-lg-h); padding-inline: var(--plate-lg-pad);
             font-size: var(--plate-lg-font); border-radius: var(--plate-lg-radius); }
.plate--xl { height: var(--plate-xl-h); padding-inline: var(--plate-xl-pad);
             font-size: var(--plate-xl-font); border-radius: var(--plate-xl-radius);
             --plate-rim-gap: 3px; }
button.plate:hover { --plate-rim: var(--color-primary); --plate-edge: var(--color-primary); }
```

### PlateInput
- A text input that looks like a plate. It uses the same edge, rim, font and tracking as PlateChip.
  - Height `--plate-input-h`, font `--plate-input-font`, `--plate-input-radius`, side padding `--plate-input-pad`.
  - `md` size (for dialogs and the lookup): height 48px, font 22px.
- **Value:** uppercased on change and stored as typed (with spaces). Normalize only when validating or submitting.
- **Attributes:** `autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="20"`.
- **Placeholder:** `ZH 123 456`, not translated, in `--color-placeholder`.
- **Focus:** edge and rim become `--plate-input-rim-focus`, plus a 2px `--color-focus` outline at 2px offset.
- **Error:** edge and rim become `--plate-input-rim-error`.

### KpiStrip / KpiCell
See §5.6. States:
- Loading: skeleton value.
- Error: values show `common.emptyValue`, and a retry InlineAlert appears under the strip.
- Alert tones: danger or warning, per the table in §5.6.

### ResponsiveTable
- At ≥ 720px it renders a `<table>`; below that, a `<ul>` of cards (via `useMediaQuery`). Column defs
  declare `cardSlot: 'title' | 'badge' | 'body' | 'meta' | 'action' | 'hidden'`.
- **Table:**
  - Header row: `--color-surface-sunken`, `<th scope="col">` in `--text-sm` 600 muted, 40px tall, sticky inside its scroll container.
  - Cells: 12px × 16px padding, `--text-ui`, 1px `--color-border-subtle` bottom border.
  - Numeric and duration cells are right-aligned and tabular.
- **Clickable rows:** hover `--color-surface-hover` and a pointer cursor. The row contains a real
  button or link, and a row click delegates to it. Never put `role="button"` on a `<tr>`.
- **Card:** 16px padding with a border between cards. Layout: title slot and badge slot on one row,
  then body lines, then meta (`--text-sm`, muted), then the action row.
- **States:** 5 skeleton rows or cards while loading; EmptyState inside the Panel when empty; Pagination below the Panel.

### Panel
- `--color-surface` background, 1px `--color-border`, `--radius-lg`, **no shadow**.
- Optional header: h2 in display 600 `--text-md` with an optional right-side action. 16px × 20px
  padding and a 1px `--color-border-subtle` bottom border.
- Body padding is 20px, or 0 for tables and lists. List rows use 12px × 20px padding with subtle dividers.

### Dialog
- **Markup:** native `<dialog>` with `showModal()`, which provides the focus trap, Esc and inert
  background. `::backdrop` uses `--color-overlay`.
- **Style:** width `--dialog-w-sm` or `--dialog-w-md`, max height 85vh, scrolling body, `--radius-lg`,
  `--shadow-lg`, 24px padding.
- **Header:** title h2 (display 600 `--text-lg`) with a close icon button (`X`,
  `common.actions.close`) at the top right. Wire `aria-labelledby` and `aria-describedby`.
- **Footer:** right-aligned with a 12px gap, secondary first and primary last.
- **Focus:** initial focus goes to the first field. For destructive confirmations it goes to
  **Cancel**. On close, focus returns to the trigger.
- **Closing:**
  - A backdrop click closes the dialog only when the form is not dirty.
  - While submitting, Esc and close are blocked (prevent the `cancel` event).
- **Motion:** fade plus a `--motion-distance` rise, over `--dur-base` `--ease-out`.
- **Below 720px it becomes a bottom sheet:** full width, anchored to the bottom, top corners
  `--radius-xl`, full-width footer buttons stacked with the primary on top, bottom padding including
  the safe-area inset.

### Toast
- `--color-surface` background with a 1px border, a 4px left bar in the tone's solid colour,
  `--shadow-md`, `--radius-lg`, 12px × 16px padding, max width 420px, `z-index: var(--z-toast)`.
- Content: a 20px icon in the tone colour, text in `--text-ui`, an optional action link (600) and a close button.
- Tones: success, info, warning, danger. Timing and roles are in §2.6.

### AlarmBanner
See §4.2.

### InlineAlert
- **Tones:** info, success, warning, danger. Tone background with a 1px tone border, `--radius-md`,
  12px padding, and text in the tone's text colour.
- **Icons (18px):** `Info`, `CircleCheck`, `TriangleAlert`, `CircleAlert`.
- **Size `sm`:** `--text-sm`, 8px × 12px padding.
- Optional action link.
- `role="alert"` only for errors that appear after a submit.

### EmptyState
- Centred in its Panel, 40px vertical padding.
- Icon at `--icon-xl` in `--color-text-disabled`, or in the tone colour for success and error.
- Title in display 600 `--text-md`; body in `--text-sm` muted, max 44ch; optional secondary button.
- Variant `error` (§2.6).

### Tabs
- URL-driven links inside `<nav aria-label="…">`, with `aria-current="page"` on the active tab. Don't use ARIA tabs.
- Row: 1px bottom border.
- Tab: 10px vertical padding, 24px gap between tabs, `--text-ui` 600, muted.
- Active tab: `--color-text` with a 2px `--color-primary` underline that overlaps the row border.
- CountBadges sit inside the tab. The row scrolls horizontally on overflow.

### Pagination
- `common.pagination.range` (`--text-sm`, muted) on the left.
- On the right, two secondary sm icon buttons (`ChevronLeft` / `ChevronRight`) labelled with
  `common.pagination.previous` / `next`.
- Hidden when `total ≤ limit`.

### CopyField
- The value in mono, inside a box with `--color-surface-sunken` background and `--radius-md`.
- A secondary sm Copy button (`Copy` icon). After copying it shows `Check` + `common.actions.copied`
  for 2 s, announced via a polite live region.
- Uses `navigator.clipboard`; the fallback selects the text.

### LiveIndicator, LanguageSwitcher, Spinner, Skeleton, RelativeTime, DescriptionList
- **LiveIndicator:** see §4.1. The amber dot pulses opacity every 2 s; the pulse is off under reduced motion.
- **LanguageSwitcher:**
  - Compact SegmentedControl labelled `common.language.label`.
  - Options show `common.language.shortEn` / `shortDe`, with `aria-label` giving the full name and `lang` set on each option.
  - Changing it sets the i18n language, `localStorage` and `<html lang>`.
- **Spinner:** a 16 or 20px ring with a 2px `currentColor` stroke, rotating every 700 ms. It indicates
  essential progress, so it stays under reduced motion.
- **Skeleton:** see §2.6.
- **RelativeTime:** see §2.2.
- **DescriptionList:** `<dl>` grid with the `dt` column at 160px (`--text-sm`, muted) and `dd` in
  `--text-ui`. Stacked below 480px.

---

## 7. Accessibility (WCAG 2.2 AA)

- **Contrast:** the token pairs are verified (see the `tokens.css` header). Never put
  `--color-text-subtle` on sunken surfaces, and never use yellow text on light surfaces.
- **Status is never colour-only:** badges always pair icon and text. Alert KPI cells add an icon and
  wording. Allowed and denied results carry distinct icons and titles.
- **Focus:**
  - Style: `:focus-visible` with a 2px outline at 2px offset: blue on light surfaces, yellow on asphalt, white on the red banner.
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
- **Motion:** every movement uses tokens that collapse under `prefers-reduced-motion`. No looping
  animation except the progress spinner.
- **Language:** `<html lang>` follows the switcher.
- **Time:** use `<time dateTime>` with the full date in `title`.
- **Reflow:** usable at 320px width and 400% zoom. Tables turn into cards below 720px, so the page
  never scrolls horizontally.
- **Plates in speech:** plates read as text ("ZH 123 456"). Add the visually hidden "Plate" prefix where context is missing.

---

## 8. Implementation notes

- **Storage keys:**

  | Key | Storage |
  |---|---|
  | `parklens.lang` | localStorage |
  | `parklens.alarmSound` | localStorage |
  | `parklens.simGate` | localStorage |
  | Auth token (developer's choice, e.g. `parklens.token`) | localStorage |
  | `parklens.dismissedAlarms` | sessionStorage |
  | `parklens.simResults` | sessionStorage |

- **Breakpoints** (use literal values in `@media`):

  | Width | Changes |
  |---|---|
  | 480px | Stack card segments and description lists |
  | 720px | Tables become cards, dialogs become sheets, KPI grid switches to 2 columns |
  | 960px | Sidebar ↔ top bar + tab bar |
  | 1080px | Dashboard and simulator switch to 2 columns, KPI strip to 5 columns |

- **Query keys:**

  | Key | Params |
  |---|---|
  | `['summary']` | – |
  | `['alarms', params]` | Filter params |
  | `['sessions', params]` | Filter params |
  | `['gate-events', params]` | Filter params |
  | `['permits', params]` | Filter params |
  | `['settings']` | – |
  | `['admins']` | – |
  | `['public-request', token]` | Request token |

  SSE invalidation matches on the first key segment.

- **Base CSS the developer adds** (not part of the tokens file):
  - `body { font-family: var(--font-sans); background: var(--color-bg); color: var(--color-text); }`
  - Admin body text uses `--text-ui`/`--leading-ui`; public body text uses `--text-base`/`--leading-base`.
  - `-webkit-font-smoothing: antialiased`.
  - `.sr-only`.
  - A global `:focus-visible` rule.
- **Icons** (lucide-react): 16px in controls, 20px in navigation and toasts, 24px in banners and
  panels, 32px in empty states. All decorative icons get `aria-hidden`. Key icons:
  - Navigation: `LayoutDashboard`, `Siren`, `Inbox`, `BadgeCheck`, `ArrowRightLeft`, `ScanLine`, `Settings`, `DoorOpen`.
  - Status: `Clock`, `CircleCheck`, `CircleX`, `Ban`, `Check`, `ShieldCheck`, `ShieldAlert`, `TimerOff`, `CalendarX`.
  - Alerts: `TriangleAlert`, `CircleAlert`, `Info`.
  - Content and actions: `Car`, `CalendarDays`, `LogIn`, `LogOut`, `Shuffle`, `Send`, `Copy`, `Plus`, `Search`, `Eye`, `EyeOff`, `Minus`, `Ellipsis`.
  - Navigation arrows and close: `ChevronLeft`, `ChevronRight`, `ChevronDown`, `X`.
- **Demo readiness:** with seed data, the first login shows the red banner for `ZH 999 999`,
  alarm badge 1, requests badge 2 and a red "Open alarms" KPI. That is the intended first impression.
