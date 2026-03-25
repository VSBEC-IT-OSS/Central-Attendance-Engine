# Contributing to AttendanceEngine

Thank you for your interest in contributing. This project is maintained by students
and faculty of [Your Institution] and welcomes contributions from the community.

---

## Development setup

### Prerequisites
- Node.js ≥ 20
- Docker & Docker Compose
- Git

### First-time setup

```bash
# Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/attendance-engine.git
cd attendance-engine

# Install all dependencies (monorepo — installs everything)
npm install

# Copy environment template
cp .env.example .env
# Edit .env — for local dev the defaults work if you use Docker

# Start Postgres + Redis
docker compose up postgres redis -d

# Generate Prisma client and run migrations
npm run db:migrate

# Seed the database
npm run db:seed

# Start API + Dashboard in dev mode (hot reload)
npm run dev
```

The API runs at `http://localhost:3001` and the dashboard at `http://localhost:5173`.

---

## Project structure

```
attendance-engine/
├── apps/
│   ├── api/           Fastify backend (Node.js + TypeScript)
│   │   ├── src/
│   │   │   ├── config/        env, db, redis, logger
│   │   │   ├── ingest/        file watcher
│   │   │   ├── jobs/          BullMQ queue + WS emitter
│   │   │   ├── middleware/    auth, access logger
│   │   │   ├── parser/        xlsx parsing + adapters
│   │   │   ├── routes/        REST + WebSocket routes
│   │   │   ├── services/      business logic
│   │   │   ├── utils/         response helpers
│   │   │   └── validation/    Zod validators
│   │   └── prisma/    schema + migrations
│   └── dashboard/     React admin UI (Vite + TypeScript)
└── packages/
    └── schema/        Shared TypeScript types
```

---

## Adding a new xlsx format (parser adapter)

If the institution gets a new biometric machine with a different xlsx format:

1. Create `apps/api/src/parser/adapters/your-format.adapter.ts`
2. Implement `IAttendanceAdapter` (see `adapter.interface.ts`)
3. Register it in `apps/api/src/parser/adapterRegistry.ts`
4. Add a test in `apps/api/tests/`

The adapter's `canHandle()` method inspects the header row and returns `true`
if it recognises the format. The registry tries adapters in order — first match wins.

---

## Code conventions

- **TypeScript strict mode** — no `any` unless unavoidable, add a comment explaining why
- **Zod** for all runtime validation (request bodies, env variables)
- **Pino** for all logging — never use `console.log` in production code
- **Prisma** for all database access — no raw SQL unless profiling shows it's necessary
- **No student data in commits** — use generated seed data for tests

---

## Running tests

```bash
npm test                    # run once
npm run test:watch          # watch mode
```

---

## Submitting a PR

1. Create a branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Run `npm test` and `npm run typecheck` — both must pass
4. Push and open a PR against `main` of the org repo
5. Fill in the PR template

For significant changes, open an issue first to discuss the approach.

---

## Data privacy

This system processes real student attendance data. Contributors must:

- Never commit real student data, even anonymised, to the repository
- Use only generated/synthetic data in tests and examples
- Not add any analytics, tracking, or third-party data sharing

---

## Licence

MIT — see `LICENSE` file.
