# Pulse — portfolio notes

Design decisions, trade-offs and what I'd do next. Companion to the [README](../README.md).

## What this is

Pulse is a fullstack uptime-monitoring platform in the spirit of UptimeRobot / Better Stack: scheduled HTTP checks, incident detection that resists flapping, notifications over three channels, and public status pages — behind one dark, terminal-flavored UI.

The interesting part isn't the feature list; it's the operational details that separate a demo from something you could actually run.

## Decisions worth calling out

### Three processes, one repo

The API, the monitor worker and the notification worker are separate entry points (`server.cjs`, `worker.cjs`, `notificationWorker.cjs`), bundled independently by tsup and supervised by `workersRunner.cjs` when the platform wants a single worker service.

Why: a slow SMTP server or a rate-limited Discord webhook can never delay a scheduled uptime check, and the two services scale independently. The trade-off is a bit more deployment surface — worth it, and mirrored exactly in local dev (`npm run dev` starts all three).

### Anti-flapping as a first-class concept

Naive monitors flap: one dropped packet flips a status page. Pulse requires N consecutive failures (default 3) before declaring DOWN and M consecutive successes (default 2) before recovery. The subtle part is UX, not logic — the UI shows *why* a badge hasn't changed yet ("2 / 3 failed checks…") instead of silently disagreeing with what the user sees in their logs.

### Concurrency-safe incidents

"Exactly one open incident per monitor" can't rely on read-then-write. It's a **partial unique index** (`monitorId + status: OPEN`) plus an atomic `findOneAndUpdate` upsert: two workers racing both "succeed", one hits a duplicate-key error and falls back to refreshing the existing incident. The loser of the race produces a correct result by construction.

### SSRF that survives DNS rebinding

Blocklisting `localhost` at form-submit time is theatre. Pulse validates at create, at edit, and **again immediately before every outgoing request**, resolving DNS and checking *every* returned address (including IPv4-mapped IPv6 and cloud-metadata endpoints). All three egress points (check, webhook, Discord) use `redirect: 'manual'` — a 302 to `169.254.169.254` is never followed. The known residual is a TOCTOU window between validation and connect (fetch does its own resolution); closing it fully requires IP-pinning agents, which I documented rather than half-implemented.

### Secrets that stay secret

Notification targets are masked in every response (`https://discord.com/api/webhooks/***`), the webhook HMAC secret is returned exactly once (create/rotation) and only a `hasSecret` boolean afterwards, and the structured logger redacts by key name (`secret|token|password|authorization|apikey|jwt`) plus credential-bearing URLs — so a new log line added in a hurry still can't leak. Delivery errors are URL-stripped before they're persisted.

### Tests follow reality

The v1.0 pass started with 13 failing tests. Every single one was a stale mock: services had evolved to read `_id`/`startedAt` from `findOneAndUpdate`, chain `.select()` on queries, and rely on a real `NotificationProviderError` class for `instanceof`. I fixed the mocks to model the actual contract instead of bending production code to satisfy the mocks — the production behavior was correct in all 13 cases.

### Lean on purpose

No Redux (React Query + context), no design-system package (a handful of Tailwind primitives), no DI framework, no repository layer over Mongoose. Each of those would be justified by a team or a scaling story this project doesn't have. Monorepo + shared Zod schemas across the wire is the one "infrastructure" abstraction, because it eliminates a real class of bugs (client/server validation drift).

## Trade-offs I accepted

| Choice | Cost | Why anyway |
| ------ | ---- | ---------- |
| MongoDB as source of truth, Redis for queues only | Two data stores | BullMQ needs Redis; keeping *all* durable state in Mongo means Redis eviction (`volatile-lru` on free tiers) is a non-event |
| JWT in localStorage | XSS surface vs. httpOnly cookie | Standard for SPA + Bearer APIs; documented, Helmet + CSP-ish headers do the rest |
| Generic 500s in production | Harder to debug from a user's report | Structured logs carry the detail; users get "Something went wrong" — never a stack trace |
| Single ~834 kB JS chunk | Larger first load | Code-splitting pass queued as future work; not a v1.0 correctness issue |
| One status page per user | No per-project pages | Multi-tenancy was explicitly out of scope for v1.0 |

## What I'd do next

Keyword/SSL checks, rate limiting on auth, bundle splitting, then — in order of user demand — Slack/Teams channels, on-call/escalation, and multi-tenant teams. Full list in the README's *Future work*; none of it is half-built in the codebase today, which is the point.

## Verification

- `npm run lint` → 0 errors, 0 warnings
- `npm run typecheck` → shared/api/web clean
- `npm test` → 65/65 (9 files)
- `npm run build` → tsup 4 bundles + Vite production build
- Docker: `docker build -f apps/api/Dockerfile .`, web image, and a full `docker compose up -d --build` smoke (health, register/login, monitor CRUD, manual check, pause/resume, incident lifecycle, status page, notification with a local mock target)
