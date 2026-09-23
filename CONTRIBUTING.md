# Contributing to Pulse

Thanks for your interest in contributing.

## Development setup

```bash
npm install
cp .env.example .env
npm run infra:up   # MongoDB + Redis
npm run dev        # API + monitor worker + notification worker + web
```

## Before you open a PR

The CI runs exactly this — please make sure it passes locally too:

```bash
npm run lint        # must be 0 errors, 0 warnings
npm run typecheck   # tsc across shared/api/web
npm test            # Vitest, 65 tests
npm run build       # tsup + Vite production build
```

## Guidelines

- **Small, focused changes.** This is a deliberately lean codebase — no new frameworks, no abstractions for single implementations.
- **No secrets, ever.** Never commit `.env`, real webhook URLs, tokens or credentials. `.env.example` documents variable *names* only.
- **Keep the log contract.** Structured events (`worker_started`, `incident_opened`, `incident_resolved`, `notification_sent`, `notification_failed`, …) are part of the operational surface — add events rather than ad-hoc `console.log`.
- **Don't weaken the safety rails.** SSRF validation, HMAC signing, masked DTOs and generic production errors must stay intact; tests should follow the real contract, not the other way around.
- **Tests follow production code.** If a test and the implementation disagree, first decide which one is actually right.
- **Architecture stays split.** API (`server.cjs`) and workers (`workersRunner.cjs`) are separate services on purpose — don't merge them.

## Project layout

```text
apps/api        Express API + BullMQ workers (TypeScript)
apps/web        React SPA (Vite + Tailwind)
packages/shared Zod schemas + DTO types shared by both
```
