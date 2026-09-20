# Pulse

**Pulse** is a fullstack SaaS platform for website and API uptime monitoring — conceptually inspired by UptimeRobot, Better Uptime and Statuspage, with its own identity.

Create monitors for HTTP endpoints, let Pulse check them automatically on a schedule, and track status, response time and check history from a modern dark dashboard.

![Stack](https://img.shields.io/badge/stack-React%20%C2%B7%20Express%20%C2%B7%20MongoDB%20%C2%B7%20Redis%20%C2%B7%20BullMQ-10b981)

---

## Features (v0.1)

- **Authentication** — register, login and session restore with JWT (bcrypt-hashed passwords)
- **Dashboard** — totals, operational/down/paused counts, active incidents and average response time
- **Monitors CRUD** — name, URL, HTTP method (GET/HEAD), interval and timeout
- **Pause / Resume** — idempotent pausing that removes the BullMQ scheduler while preserving history and last status
- **Incidents** — automatic detection (UP → DOWN), exactly-one-open-per-monitor, and automatic resolution (DOWN → UP)
- **Automatic checks** — scheduled with BullMQ Job Schedulers (30s / 1m / 5m / 10m)
- **Manual checks** — run a check on demand from the monitor page
- **Check history** — timestamp, status, HTTP status code and response time (30-day retention via TTL index)
- **Response time chart** — recent checks visualized with Recharts (24h / 7d / 30d ranges)
- **Public status pages** — publish `/status/:slug` without authentication: global status, 30-day uptime bars and past incidents
- **SSRF protection** — centralized destination validation (blocks localhost, private ranges, link-local and cloud metadata endpoints) applied on creation, on edit **and** before every outgoing request, with DNS-rebinding protection
- **Unit tests** — Vitest coverage for incident lifecycle, pause/resume and SSRF classification
- **Docker** — one-command full stack with Docker Compose

## Tech Stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form, Zod, Recharts, Lucide |
| Backend  | Node.js, TypeScript, Express, Zod, JWT, bcrypt |
| Database | MongoDB (Mongoose) |
| Queues   | Redis + BullMQ (separate worker process) |
| Infra    | Docker, Docker Compose, Nginx (SPA + reverse proxy), GitHub Actions |

## Project Structure

```text
pulse/
├── apps/
│   ├── web/                  # React SPA (Vite + Tailwind)
│   │   ├── src/
│   │   │   ├── components/   # UI primitives, layout, domain components
│   │   │   ├── lib/          # API client, auth context, helpers
│   │   │   └── pages/        # Route pages
│   │   ├── Dockerfile
│   │   └── nginx.conf
│   │
│   └── api/                  # Express REST API + BullMQ worker
│       ├── src/
│       │   ├── config/       # env, database, redis
│       │   ├── controllers/  # thin HTTP handlers
│       │   ├── routes/
│       │   ├── services/     # business logic (auth, monitors, checks, stats)
│       │   ├── models/       # Mongoose models
│       │   ├── middlewares/  # auth, validation, error handling
│       │   ├── jobs/         # BullMQ queue + schedulers
│       │   ├── workers/      # check execution consumer
│       │   ├── utils/        # errors, SSRF-safe URL validation
│       │   ├── app.ts
│       │   ├── server.ts     # HTTP entrypoint
│       │   └── worker.ts     # worker entrypoint
│       └── Dockerfile
│
├── packages/
│   └── shared/               # Zod schemas, DTO types and constants
│
├── docker-compose.yml
├── .github/workflows/ci.yml
└── .env.example
```

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for MongoDB/Redis) — or local instances of both

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

### 3. Start infrastructure (MongoDB + Redis)

```bash
npm run infra:up
```

### 4. Run the app (API + worker + web)

```bash
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:4000 (`GET /health` for liveness)

### Alternative: full stack with Docker

```bash
docker compose up -d --build
```

- Web (Nginx): http://localhost:8080
- API: http://localhost:4000

## API Reference

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| POST | `/api/auth/register` | Create account (returns JWT) |
| POST | `/api/auth/login` | Sign in (returns JWT) |
| GET | `/api/auth/me` | Current user |
| GET | `/api/monitors` | List monitors (with 24h/30d uptime, pause state) |
| GET | `/api/monitors/:id` | Monitor details |
| POST | `/api/monitors` | Create monitor |
| PATCH | `/api/monitors/:id` | Update monitor (reschedules job, resets state on URL change) |
| DELETE | `/api/monitors/:id` | Delete monitor + history + incidents + schedule |
| GET | `/api/monitors/:id/checks` | Last 100 checks |
| POST | `/api/monitors/:id/check` | Run a manual check |
| POST | `/api/monitors/:id/pause` | Pause automatic checks (idempotent) |
| POST | `/api/monitors/:id/resume` | Resume monitoring (idempotent) |
| GET | `/api/monitors/:id/incidents` | Incident history for a monitor |
| GET | `/api/incidents` | All incidents for the user |
| GET | `/api/status-page` | Get your status page config |
| PUT | `/api/status-page` | Create/update your status page (slug, monitors, published) |
| GET | `/api/public/status-pages/:slug` | **Public** — published status page data (no auth) |
| GET | `/api/stats/dashboard` | Aggregated dashboard stats (incl. paused, active incidents) |

All routes require `Authorization: Bearer <token>` except `/api/auth/*` and `/api/public/*`.

## Monitoring flow

```text
Monitor
   ↓
BullMQ (Job Schedulers, per-monitor interval)
   ↓
Worker
   ↓
HTTP Check (SSRF-validated, no redirects, body discarded)
   ↓
MonitorCheck
   ↓
Status Transition
   ↓
Incident (OPEN on first DOWN, RESOLVED on recovery)
   ↓
Public Status Page (aggregated health + uptime bars)
```

## How monitoring works

1. Creating a monitor registers a **BullMQ Job Scheduler** (`upsertJobScheduler`) with the chosen interval — idempotent and rescheduled automatically on updates.
2. A separate **worker process** consumes the queue and calls `monitorCheckService.runCheckForMonitor`.
3. The service validates the destination (SSRF), performs the HTTP request with a timeout, measures latency, stores a `MonitorCheck` document and updates the monitor's status snapshot.
4. **Status semantics** (`< 400` → UP, otherwise DOWN):
   - `2xx/3xx` — the endpoint is serving correctly → **UP**.
   - `4xx/5xx` — the endpoint answered but is not serving correctly → **DOWN** (e.g. `HTTP 500`).
   - Network errors, DNS failures, timeouts → **DOWN**.
5. **Incident lifecycle**:
   - First DOWN (`UP → DOWN` or `UNKNOWN → DOWN` on the first real check) opens an incident. Paused monitors never open incidents.
   - While DOWN, further checks only refresh `lastHttpStatus` — no duplicates.
   - Recovery (`DOWN → UP`) resolves the open incident with `resolvedAt`.
   - Concurrency safety: a **partial unique index** (`monitorId + status`, only for `OPEN`) plus an atomic `findOneAndUpdate` upsert guarantees at most one OPEN incident per monitor even with concurrent workers; the loser of the race hits a duplicate-key error and falls back to refreshing.
   - Changing a monitor's URL resets its status to `UNKNOWN` and resolves any open incident, since the old results describe a different target.
6. **Pause / Resume**: pausing removes the scheduler (no automatic checks, history and last status preserved); resuming recreates it idempotently. Manual checks still run while paused.
7. **Status pages**: one page per user (architecture-ready for multiple), published via `/api/status-page`. The public endpoint exposes only safe data (name, slug, description, statuses, uptime buckets, sanitized incidents) — never userIds, tokens, URLs' internals or auth data. Global status: all UP → `ALL_OPERATIONAL`; some DOWN → `PARTIAL_OUTAGE`; all DOWN → `MAJOR_OUTAGE` (paused monitors excluded).

## Security notes

- Passwords are hashed with bcrypt (12 rounds) and never leave the API.
- Monitors can only target public `http(s)` URLs: localhost, private/reserved IP ranges (including IPv6 ULA/link-local and IPv4-mapped forms), `169.254.x.x` metadata endpoints and `.internal`/`.local` hostnames are rejected — both at creation time and before every check (protecting against DNS rebinding). Redirects are not followed.
- Response bodies of monitored endpoints are never stored.

## Roadmap

- [ ] Email / Slack / webhook notifications on status changes
- [ ] Public status pages
- [ ] Keyword & SSL certificate checks
- [ ] Teams and multi-user workspaces
- [ ] Billing / plans
