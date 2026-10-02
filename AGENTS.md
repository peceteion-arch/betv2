# AGENTS.md

## Overview

betNANDO is a virtual football betting platform for friend groups. Users bet with 100 virtual credits on real football matches. Monorepo managed with **Turborepo** (`apps/api` + `apps/web`).

## Essential Commands

```bash
# Root (monorepo)
npm install              # Install all deps (workspaces)
npm run dev              # Start api + web concurrently via turbo
npm run build            # Build both apps
npm run db:generate      # Regenerate Prisma client
npm run db:push          # Push schema changes to DB
npm run db:seed          # Seed test data
npm run db:studio        # Open Prisma Studio

# API (apps/api)
npx tsx watch src/index.ts   # Dev with hot reload
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts

# Web (apps/web)
vite                       # Dev server (port 5555, proxies /api → localhost:3001)

# Docker
docker-compose up -d       # Starts postgres, api (3001), web (5173)
```

**No test framework is configured.** No `test` script exists in any `package.json`. No test files found.

## Rularea testelor e2e

Testul e2e (`apps/api/tests/e2e-settlement.ts`) rulează **doar pe PostgreSQL** și se va închide automat (cu un mesaj clar) dacă `DATABASE_URL` nu punctează la o bază a cărei nume conține `test` sau `_test`. Nu atinge baze de producție.

### Cum creezi baza de test

```sql
CREATE DATABASE betleague_test;
```

### Cum rulezi e2e

```powershell
$env:DATABASE_URL="postgresql://USER:PAROLA@localhost:5432/betleague_test"
npx prisma db push
npx tsx tests/e2e-settlement.ts
# sau, prin scriptul din package.json:
npm run test:e2e
```

### Curățarea datelor de test

Un e2e rulat lasă în urmă utilizatori (email `*@t.com`), meciuri (`H vs A`, ligă `L`, externalId `t-*`/`f-*`), bilete, selecții, cote și notificări. Testul curăță automat doar ceea ce a creat el însuși (în ordine: bilete → meciuri → utilizatori, profitând de cascade).

Pentru datele deja rămase pe bază, rulează mai întâi **dry-run** (fără modificări):

```powershell
npm run cleanup:test-data
```

Afișează utilizatorii, meciurile și biletele de test identificate, precum și numărul de notificări cascade. Dacă există bilete ale utilizatorilor **non-test** pe meciuri de test, scriptul se oprește cu cod 1 (miza trebuie returnată manual).

Pentru aplicare, confirmă exact numele bazei:

```powershell
npm run cleanup:test-data -- --apply --confirm-db=betleague_test
```

Totul se execută într-o singură tranzacție Prisma interactivă (bilete → meciuri → utilizatori), cu timeout generos.

**Nu introduce niciodată parole reale în AGENTS.md** — folosește mereu `USER`/`PAROLA`.

## Architecture

### API (`apps/api`) — Express + Prisma + PostgreSQL

**Entry**: `src/index.ts` — Express server on port 3001.

**Layered structure** (routes → services → prisma):
- `src/routes/*.routes.ts` — HTTP handlers, input validation (Zod), auth middleware
- `src/services/*.service.ts` — Business logic, all exported as singleton objects (e.g. `export const betService = { ... }`)
- `src/middleware/` — `auth.ts` (JWT `authenticate` + `requireAdmin`), `validation.ts` (Zod schema validator)
- `src/config/env.ts` — Centralized env vars + Zod schemas for request validation
- `src/lib/prisma.ts` — Singleton PrismaClient (global cache pattern for dev hot-reload)
- `src/jobs/` — Cron jobs: `syncMatches` (every 30 min, fetches from Football-Data.org), `settleBets` (every 2 min + on startup)
- `prisma/schema.prisma` — Database schema (PostgreSQL)

**Key data flow**:
1. Matches synced from Football-Data.org API → DB (with fallback to hardcoded matches if no API key)
2. Odds auto-generated with jitter when matches are created, or applied from `odds.json` via admin sync
3. Users place bets (atomic transaction: balance check + deduction + bet creation)
4. Settlement job runs periodically: checks match results → marks bets WON/LOST/CANCELLED → updates balances + stats + notifications

**Background jobs** both use a `isRunning` guard flag to prevent concurrent execution.

### Web (`apps/web`) — React + Vite + Tailwind + Zustand

**Entry**: `src/main.tsx` → `App.tsx` (React Router v6).

**State management**:
- `src/lib/auth.tsx` — React Context for auth (user, login, register, logout, refreshUser)
- `src/store/betSlip.ts` — Zustand store for bet slip (selections, stake, totalOdds)
- No global state beyond these two; most data fetched via `useEffect` + axios

**Routing** (all under `ProtectedRoute` except `/login`, `/register`):
- `/` — Dashboard, `/matches` — Browse matches, `/bets` — Bet history
- `/groups` — Groups, `/rankings` — Leaderboard, `/statistics` — Stats
- `/admin` — Admin panel (AdminRoute, requires ADMIN role)
- `/change-password`, `/install` (PWA install), `/notifications`

**API client**: `src/lib/api.ts` — Axios instance with `/api` baseURL, auto-attaches JWT from `localStorage`, auto-removes token on 401. Frontend proxies `/api` to backend in dev via Vite proxy.

## Key Gotchas

- **Odds are locked from DB at bet time**, not from client. The `odds` field in bet selection request body is ignored — server fetches from `Odds` table. This prevents client-side odds manipulation.
- **Bet settlement** runs every 2 minutes, not 5 as README states. It also runs immediately on API server startup.
- **Match sync** falls back to hardcoded Premier League/La Liga/etc. matches when `FOOTBALL_DATA_API_KEY` is not set.
- **Balance is a Float**, not integer. Rounding is done to 2 decimal places at creation time (`Math.round(value * 100) / 100`).
- **PrismaClient singleton** is cached on `globalThis` in non-production to survive hot-reload without connection exhaustion.
- **Rate limiting**: 200 req/15min on all `/api/` routes, 10 req/15min on login/register.
- **Vite dev server runs on port 5555** (not 5173), but the proxy targets `localhost:3001`. Docker uses port 5173.
- **The `totalOdds()` in betSlip Zustand store is a method** that must be called as `totalOdds()`, not read as a property. There's also a `selectTotalOdds` selector export for components.

## Code Conventions

- **Services are plain objects** exported as `export const fooService = { async method() {...} }` — not classes.
- **Error handling pattern in routes**: `try/catch` with `error instanceof Error ? error.message : 'Default msg'` and Portuguese error messages.
- **Validation**: Zod schemas defined in `src/config/env.ts` (some) and inline in route files (admin). Use the `validate()` middleware.
- **Auth**: JWT token contains `{ userId, role }`. `AuthRequest` extends Express `Request` with `userId` and `userRole`.
- **Database**: All tables use `@@map("snake_case")` for DB names. Prisma fields are camelCase.
- **User roles**: `"USER"` or `"ADMIN"` stored as plain strings (not enum).
- **UI**: Tailwind with custom theme (`bet-*` dark colors, `neon-*` accent colors). CSS component classes in `index.css` (`btn-neon`, `card-bet`, `input-bet`, `odds-btn`, etc.).
- **Language**: UI is in Portuguese. Error messages in Portuguese. Code identifiers in English.
- **Frontend pages**: Each page is a single file in `src/pages/`, no sub-components extracted unless shared (like `BetSlip.tsx`).
- **No `.env` file in repo** (only `.env.example`). The API reads `env` vars via `src/config/env.ts`.

## Database

PostgreSQL via Prisma. Tables: `users`, `groups`, `group_members`, `matches`, `odds`, `bets`, `bet_selections`, `notifications`. CUIDs for all primary keys.

**Schema changes**: Edit `prisma/schema.prisma`, then run `npm run db:push`. No migrations are used (direct push to DB).

## Infrastructure

- Docker Compose with PostgreSQL 16 Alpine, API, and Web services
- API container builds from `apps/api/Dockerfile`
- Web container builds from `apps/web/Dockerfile`
- `compile.bat` compiles `dashboard_gui.ps1` to `.exe` using `ps2exe` (Windows-only admin tool)

## Environment Variables (API)

```
DATABASE_URL        # Required. PostgreSQL connection string
JWT_SECRET          # Required. JWT signing key
JWT_EXPIRES_IN      # Optional. Default "7d"
PORT                # Optional. Default 3001
FOOTBALL_DATA_API_KEY  # Optional. Falls back to hardcoded matches
FRONTEND_URL        # Optional. Default "http://localhost:5173" (CORS origin)
```

## Test Credentials (Seed)

- Admin: `admin@betnando.com` / `admin123`
- User: `joao@example.com` / `password123`
- Group invite code: `TESTCODE`
