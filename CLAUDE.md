# CLAUDE.md — Primecom OCPP Platform

## What This Project Is

This is the **Primecom OCPP Central System** — an internal web-based platform that allows Primecom Technologies LLC to monitor, manage, diagnose, and remotely control their EV chargers in real time.

Primecom manufactures and sells Level 2 AC and DC fast chargers under the brand **Primecom Tech** (primecom.tech). This platform is an internal operations tool — not a customer-facing storefront. It is used by the Primecom team to manage their charger inventory, run firmware updates, track charging sessions, and diagnose issues in the field.

The platform must be:
- Functional and reliable above all else
- Clean and easy to use with minimal training
- Dark-themed (this is a technical operations dashboard, not a marketing site)
- Built in phases — start simple, expand later
- Buildable and maintainable with AI assistance (non-technical team)

---

## Brand Reference

**Company:** Primecom Technologies LLC
**Website:** https://www.primecom.tech
**Phone:** (408) 839-6297
**Email:** info@primecom.tech

**Primary Green:** `#47a141`
**Font:** Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif

This platform uses the Primecom brand identity but is styled as a **dark-theme operations dashboard**, not a white/light marketing site. Use the Primecom green as the primary accent color throughout.

---

## Tech Stack — Use Exactly This

### Backend
- **Runtime:** Node.js (v20+)
- **WebSocket Server:** `ws` npm package (for OCPP connections)
- **HTTP Server:** Express.js
- **Language:** JavaScript (no TypeScript to keep it AI-friendly)

### Database
- **Provider:** Supabase (https://supabase.com)
- **Type:** PostgreSQL (managed, free tier to start)
- **Client:** `@supabase/supabase-js`
- Supabase is used for: charger records, session history, message logs, user auth

### Frontend
- **Framework:** React (Vite)
- **Styling:** Tailwind CSS
- **Theme:** Dark mode only
- **Charts:** Recharts (for meter data graphs)
- **Icons:** Lucide React

### Auth
- **Provider:** Supabase Auth (email + password)
- Internal use only — no public signup
- Admin creates user accounts manually

### Hosting
- **Platform:** Railway.app (https://railway.app)
- Single Railway project with two services:
  1. `ocpp-server` — Node.js WebSocket + Express backend
  2. `ocpp-frontend` — React frontend (served via Vite build)
- Railway auto-deploys from GitHub on every push
- Environment variables stored in Railway dashboard

### Version Control
- GitHub repository
- Repo name: `primecom-ocpp`
- Two folders: `/server` and `/client`

---

## Project Folder Structure

```
primecom-ocpp/
├── server/
│   ├── index.js              ← Entry point: starts WebSocket + Express
│   ├── ocpp/
│   │   ├── handler.js        ← Routes incoming OCPP messages to handlers
│   │   ├── messages/
│   │   │   ├── bootNotification.js
│   │   │   ├── heartbeat.js
│   │   │   ├── statusNotification.js
│   │   │   ├── startTransaction.js
│   │   │   ├── stopTransaction.js
│   │   │   ├── meterValues.js
│   │   │   ├── authorize.js
│   │   │   └── firmwareStatusNotification.js
│   │   └── commands/
│   │       ├── remoteStartTransaction.js
│   │       ├── remoteStopTransaction.js
│   │       ├── reset.js
│   │       ├── updateFirmware.js
│   │       ├── getConfiguration.js
│   │       ├── changeConfiguration.js
│   │       └── getDiagnostics.js
│   ├── routes/
│   │   ├── chargers.js       ← REST API: list, detail, update chargers
│   │   ├── sessions.js       ← REST API: session history
│   │   ├── commands.js       ← REST API: send remote commands
│   │   └── logs.js           ← REST API: raw OCPP message logs
│   ├── db/
│   │   └── supabase.js       ← Supabase client init
│   ├── state/
│   │   └── connections.js    ← In-memory map of active WebSocket connections
│   └── package.json
│
├── client/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx       ← All chargers overview
│   │   │   ├── ChargerDetail.jsx   ← Single charger detail + controls
│   │   │   ├── Sessions.jsx        ← Session history table
│   │   │   ├── Logs.jsx            ← Raw OCPP message logs
│   │   │   └── Login.jsx
│   │   ├── components/
│   │   │   ├── ChargerCard.jsx
│   │   │   ├── StatusBadge.jsx
│   │   │   ├── MeterChart.jsx
│   │   │   ├── CommandPanel.jsx
│   │   │   └── Sidebar.jsx
│   │   └── lib/
│   │       ├── api.js              ← Fetch wrappers for REST API
│   │       └── supabase.js         ← Supabase client (auth)
│   ├── index.html
│   ├── tailwind.config.js
│   └── package.json
│
├── .env.example
├── README.md
└── CLAUDE.md                 ← This file
```

---

## Database Schema — Supabase Tables

### Table: `chargers`
```sql
id              uuid primary key default gen_random_uuid()
charger_id      text unique not null        -- OCPP chargePointIdentifier (e.g. "PC-UNIT-001")
vendor          text                        -- from BootNotification
model           text                        -- from BootNotification
serial_number   text
firmware_version text
status          text default 'offline'      -- online | offline | charging | faulted
last_heartbeat  timestamptz
last_seen       timestamptz
connector_count int default 1
location_label  text                        -- human label e.g. "San Jose Dealership"
notes           text
created_at      timestamptz default now()
```

### Table: `sessions`
```sql
id              uuid primary key default gen_random_uuid()
charger_id      text references chargers(charger_id)
transaction_id  int
connector_id    int
id_tag          text                        -- RFID or free charge tag
start_time      timestamptz
stop_time       timestamptz
energy_kwh      numeric(10,3)              -- kWh delivered
stop_reason     text
created_at      timestamptz default now()
```

### Table: `meter_values`
```sql
id              uuid primary key default gen_random_uuid()
charger_id      text references chargers(charger_id)
transaction_id  int
timestamp       timestamptz
measurand       text                        -- Energy.Active.Import.Register, Power.Active.Import, etc.
value           numeric
unit            text
context         text
created_at      timestamptz default now()
```

### Table: `ocpp_logs`
```sql
id              uuid primary key default gen_random_uuid()
charger_id      text
direction       text                        -- 'incoming' | 'outgoing'
message_type    int                         -- 2=Call, 3=CallResult, 4=CallError
action          text                        -- BootNotification, Heartbeat, etc.
message_id      text
payload         jsonb
created_at      timestamptz default now()
```

### Table: `firmware_updates`
```sql
id              uuid primary key default gen_random_uuid()
charger_id      text references chargers(charger_id)
firmware_url    text
requested_at    timestamptz
status          text default 'pending'     -- pending | downloading | downloaded | installed | failed
status_updated  timestamptz
notes           text
```

---

## OCPP 1.6 Message Map

### Messages Charger Sends TO Server (Incoming — Claude Code must handle these)

| Action | What It Means | What Server Does |
|---|---|---|
| `BootNotification` | Charger just connected/rebooted | Save vendor/model/firmware, set status=online, reply Accepted |
| `Heartbeat` | Charger is still alive (periodic) | Update last_heartbeat timestamp, reply with current time |
| `StatusNotification` | Connector status changed | Update charger status in DB (Available, Charging, Faulted, etc.) |
| `StartTransaction` | Charging session started | Create session record, reply with transactionId |
| `StopTransaction` | Charging session ended | Update session with stop time, energy, reason |
| `MeterValues` | Power/energy readings | Save to meter_values table |
| `Authorize` | Charger asking if RFID tag is allowed | Reply Accepted for all tags (Phase 1 — no restriction) |
| `FirmwareStatusNotification` | Status of a firmware update | Update firmware_updates table |
| `DiagnosticsStatusNotification` | Status of diagnostics upload | Log the status |
| `DataTransfer` | Custom vendor message | Log it, reply Accepted |

### Commands Server Sends TO Charger (Outgoing — Claude Code must implement these)

| Command | What It Does | Key Parameters |
|---|---|---|
| `RemoteStartTransaction` | Start a charge session | `connectorId`, `idTag` |
| `RemoteStopTransaction` | Stop a charge session | `transactionId` |
| `Reset` | Reboot the charger | `type: "Soft"` or `"Hard"` |
| `UpdateFirmware` | Push firmware update | `location` (URL), `retrieveDate` |
| `GetConfiguration` | Read charger config keys | `key` (optional, omit for all) |
| `ChangeConfiguration` | Change a config setting | `key`, `value` |
| `GetDiagnostics` | Request charger log upload | `location` (upload URL) |
| `UnlockConnector` | Unlock a stuck connector | `connectorId` |
| `ClearCache` | Clear charger auth cache | none |

---

## WebSocket Connection Logic

Chargers connect via WebSocket to:
```
wss://your-server.railway.app/ocpp/{chargePointIdentifier}
```

- The `chargePointIdentifier` in the URL is the unique charger ID
- Server tracks all active connections in `state/connections.js` as a Map
- Format: `connections.set(chargePointId, ws)`
- When sending a command, look up the WebSocket by charger ID and call `ws.send()`
- OCPP 1.6 JSON format:

**Call (server to charger):**
```json
[2, "unique-message-id", "ActionName", { ...payload }]
```

**CallResult (charger to server, or server replying to charger):**
```json
[3, "unique-message-id", { ...response }]
```

**CallError:**
```json
[4, "unique-message-id", "ErrorCode", "Description", {}]
```

- Use `crypto.randomUUID()` for message IDs
- Always wait for CallResult after sending a command (use a pending-calls Map with 30s timeout)

---

## Dashboard UI Design Rules

This is a **dark-theme internal operations dashboard**. Not a marketing site.

### Color Palette (Dark Theme)
```css
--bg-primary: #0f1117       /* Page background */
--bg-secondary: #1a1d27     /* Cards, panels */
--bg-tertiary: #22263a      /* Hover states, inner sections */
--border: #2e3347           /* Card borders */
--text-primary: #f1f5f9     /* Main text */
--text-muted: #8892a4       /* Labels, secondary text */
--primecom-green: #47a141   /* Primary accent — buttons, active states, highlights */
--green-dim: #2d5c2a        /* Dimmed green for badges/backgrounds */
--status-online: #47a141    /* Green */
--status-charging: #3b82f6  /* Blue */
--status-faulted: #ef4444   /* Red */
--status-offline: #6b7280   /* Gray */
--warning: #f59e0b          /* Amber */
```

### Layout Rules
- Sidebar navigation on the left (collapsible on mobile)
- Main content area on the right
- Max content width: 1280px centered
- Cards with `border-radius: 12px` and subtle borders
- No emojis anywhere
- No marketing language anywhere
- Every screen should answer: "What is happening with my chargers right now?"

### Status Badge Colors
- **Online / Available:** Green `#47a141`
- **Charging:** Blue `#3b82f6`
- **Faulted:** Red `#ef4444`
- **Offline:** Gray `#6b7280`
- **Preparing / Finishing:** Amber `#f59e0b`

### Page-by-Page UI Spec

**Dashboard (/):**
- Top summary row: total chargers, online count, charging count, faulted count — 4 stat cards
- Below: grid of ChargerCards (one per charger)
- Each ChargerCard shows: charger ID, location label, status badge, last heartbeat, connector status, quick-action button
- Real-time updates via polling every 10 seconds (Phase 1) or WebSocket push (Phase 2)

**Charger Detail (/charger/:id):**
- Header: charger ID, model, firmware version, status badge
- Tabs: Overview | Sessions | Meter Data | Config | Logs | Firmware
- Overview tab: live status, connector states, last heartbeat, location
- Command Panel (right side or bottom): buttons for Reboot, Remote Start, Remote Stop, Unlock Connector, Get Config, Push Firmware
- Each command shows a confirmation modal before sending
- After command is sent, show result (Accepted / Rejected / Timeout)

**Sessions (/sessions):**
- Table: charger ID, transaction ID, start time, stop time, duration, kWh, ID tag, stop reason
- Filter by charger, date range
- Export to CSV button

**Logs (/logs):**
- Table: timestamp, charger ID, direction (IN/OUT), action, message ID
- Click a row to expand and see full JSON payload
- Filter by charger ID and date

**Login (/login):**
- Simple centered form
- Primecom logo
- Email + password
- No public signup — admin creates accounts in Supabase dashboard

---

## Environment Variables

Store these in Railway dashboard and in a local `.env` file (never commit `.env`):

```
# Server
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Client (Vite prefix required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=https://your-server.railway.app
```

---

## Phase Build Plan

### Phase 1 — Core Platform (Build This First)
**Goal:** Chargers can connect, server records everything, dashboard shows live status.

- [ ] WebSocket server that accepts OCPP 1.6 connections on `/ocpp/:chargePointId`
- [ ] Handle: BootNotification, Heartbeat, StatusNotification, StartTransaction, StopTransaction, MeterValues, Authorize
- [ ] Save all data to Supabase
- [ ] REST API endpoints: GET /chargers, GET /charger/:id, GET /sessions, GET /logs
- [ ] React frontend with login page
- [ ] Dashboard page with charger grid
- [ ] Charger detail page (Overview tab only)
- [ ] Sessions page with table
- [ ] Deploy to Railway

**Done when:** A physical charger can connect, and you can see it online in the dashboard.

---

### Phase 2 — Remote Control & Diagnostics
**Goal:** You can control chargers from the dashboard.

- [ ] Send RemoteStartTransaction from dashboard
- [ ] Send RemoteStopTransaction from dashboard
- [ ] Send Reset (reboot) from dashboard
- [ ] Send UpdateFirmware (OTA) — enter URL, set date, monitor status
- [ ] Send GetConfiguration — show all config keys in a table
- [ ] Send ChangeConfiguration — edit a key value
- [ ] Logs page with raw OCPP message viewer
- [ ] Email alert when charger goes offline (via Supabase Edge Function or SendGrid)
- [ ] Firmware update history tab on charger detail page

**Done when:** You can reboot a charger and push a firmware update from the browser.

---

### Phase 3 — Management Layer
**Goal:** Organized management of multiple chargers across locations.

- [ ] Location/group management (assign chargers to a site)
- [ ] Bulk actions (reboot all chargers at a location)
- [ ] RFID tag management (add/remove authorized ID tags)
- [ ] Session export to CSV
- [ ] Field technician notes per charger
- [ ] Charger health score (based on uptime, faults, heartbeat gaps)
- [ ] Dashboard filters (by location, status)

---

### Phase 4 — Business Features (Defer)
- Billing and cost tracking per session
- Customer-facing charging portal
- Load balancing / smart charging (OCPP Smart Charging profile)
- Mobile app for field technicians
- OCPP 2.0.1 upgrade

---

## Claude Code Behavior Rules for This Project

### Always
1. Build the simplest version that works first
2. Use the exact tech stack listed above — do not substitute libraries
3. Use JavaScript, not TypeScript
4. Keep all OCPP logic in `/server/ocpp/` — keep it organized by message type
5. Keep the in-memory connection state separate from the database
6. Use `async/await` throughout, never raw Promise chains
7. Log every incoming and outgoing OCPP message to the `ocpp_logs` table
8. Validate that a charger's WebSocket connection exists before sending any command
9. Always return a meaningful error to the UI if a command fails or times out
10. Use Tailwind utility classes — do not write custom CSS unless absolutely necessary

### Never
- Do not use TypeScript
- Do not use Socket.io (use raw `ws` library)
- Do not use ORMs (use Supabase client directly)
- Do not add features not in the current phase
- Do not add unnecessary npm packages
- Do not break existing working functionality when adding new features
- Do not use emojis in the UI
- Do not add public-facing signup or registration

### When Unsure
Make it:
- Simpler
- More explicit (log more, explain more in comments)
- Easier for a non-developer to understand what went wrong
- Closer to what the current phase requires

---

## OCPP Protocol Notes (Important)

### Charger connects to:
```
wss://[server-domain]/ocpp/[chargePointIdentifier]
```
The `Sec-WebSocket-Protocol` header must be `ocpp1.6` — the server must echo this back or some chargers will reject the connection.

### Message format is always an array:
```json
[MessageTypeId, UniqueId, Action, Payload]   ← Call (type 2)
[MessageTypeId, UniqueId, Payload]            ← CallResult (type 3)
[MessageTypeId, UniqueId, ErrorCode, ErrorDescription, ErrorDetails] ← CallError (type 4)
```

### StatusNotification connector statuses to handle:
- `Available` — ready, no car
- `Preparing` — car plugged in, not yet charging
- `Charging` — actively charging
- `SuspendedEV` — paused by vehicle
- `SuspendedEVSE` — paused by charger
- `Finishing` — session ending
- `Reserved` — reserved
- `Unavailable` — taken offline by command
- `Faulted` — hardware/software fault

### Firmware Update Flow:
1. Admin enters firmware URL and a retrieve date/time in the dashboard
2. Server sends `UpdateFirmware` call to charger
3. Charger downloads the firmware from the URL
4. Charger sends `FirmwareStatusNotification` messages: Downloading → Downloaded → Installing → Installed (or Failed)
5. Server saves each status update to `firmware_updates` table
6. Dashboard shows live status of the update

### Heartbeat Timeout:
- If a charger has not sent a heartbeat in 90 seconds, mark it `offline` in the database
- Run this check on a `setInterval` every 30 seconds on the server

---

## Deployment Instructions (Railway)

1. Push code to GitHub repo `primecom-ocpp`
2. Create Railway project, connect to GitHub repo
3. Add two services: one for `/server`, one for `/client`
4. Set environment variables in Railway dashboard
5. Server service: start command = `node index.js`
6. Client service: build command = `npm run build`, serve the `dist/` folder
7. Railway provides a `.railway.app` domain for each service
8. Point chargers to the server's WebSocket URL

---

## Final Operating Principle

This platform exists so the Primecom team can answer:
```
Are all my chargers online right now?
Which chargers are actively charging?
Which chargers have faults?
What happened during a specific session?
How do I push a firmware update to a charger in the field?
How do I reboot a charger remotely?
What is the raw OCPP log for this charger?
```

Every feature built should directly support one of those questions.
If it does not, defer it to a later phase.
