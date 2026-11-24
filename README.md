# eDeployment (simplified)

Bandobast (security plan) planning for police units: initiate a plan, let Component Officers design sectors and points, source force from stations, place officers at points, publish duties, and monitor the bandobast live.

It rebuilds the workflow in the two eDeployment user manuals, with two deliberate changes:

1. **No re-application when stations give fewer men.** The Unit Officer accepts the shortfall in one click, or tops up from other stations in parallel. The plan never goes back to the Initiating Officer or Component Officers (`src/lib/sourcing/ledger.ts`).
2. **Officers decide placement; the system only suggests.** Suggestions take age, fitness and point intensity into account and give a reason for every pick. Component Officers place officers in their own component, and the Initiating Officer can override across components. Nothing is sent to officers until someone clicks **Publish** (`src/lib/placement/rules.ts`).

The full delivery plan, including a feature checklist covering both manuals, is in [`docs/PLAN.md`](docs/PLAN.md).

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Foundation, design system, app shell, core schema, seed, CI | **Done** |
| 2 | Phone OTP login (Better Auth), roles & scopes, admin screens, audit log | Next |
| 3 | Masters | Planned |
| 4 | Plan → propose → consolidate | Planned |
| 5 | Force sourcing & reconciliation ledger | Planned (rules engine already built and tested) |
| 6 | Placement board & publish | Planned (suggestion engine already built and tested) |
| 7 | ID cards, QR check-in, live map, duty pass, accommodation, equipment | Planned |
| 8 | Office Manager module | Planned |
| 9 | Hardening | Planned |

Sidebar entries for later phases open a "coming in phase N" card, so you can navigate the whole app as it grows.

## Stack

- Next.js 16 (App Router; Cache Components and Partial Prefetching enabled), TypeScript (strict)
- PostgreSQL with Drizzle ORM (`pg` driver): Neon (Mumbai) in the cloud, Postgres 16 locally and in CI
- Tailwind CSS v4, Radix primitives, and shadcn-style components written for this design (pill buttons, rounded surfaces, light/dark)
- TanStack Table, dnd-kit, react-hook-form + zod, sonner
- Vitest (unit tests plus a real-Postgres suite), Playwright (desktop and phone smoke tests)

## Getting started

Requires Node 22, pnpm 10 and PostgreSQL 16 locally. To develop against a Neon branch instead, see [Database: Neon Postgres](#database-neon-postgres).

```bash
pnpm install
cp .env.example .env.local      # then edit DATABASE_URL / TEST_DATABASE_URL if needed
pnpm db:migrate                 # apply migrations
pnpm db:seed                    # fictional demo district: 12 stations, 400 officers
pnpm dev                        # http://localhost:3000
```

Useful pages:

- `/dashboard`: unit strength and availability from the database
- `/design`: the design system, including live demos of the reconciliation ledger and the placement board
- `/login`: the sign-in screens (OTP is wired up in phase 2)

## Database: Neon Postgres

Production and preview deployments use **Neon** (serverless Postgres). Local development and CI use plain Postgres 16. The code is the same for both; only the connection URLs differ.

| Variable | Neon value | Used by |
|---|---|---|
| `DATABASE_URL` | pooled connection (`-pooler` host) | the running app |
| `DATABASE_URL_UNPOOLED` | direct connection | migrations, seed, drizzle-kit |
| `TEST_DATABASE_URL` | local DB or a throwaway branch | `pnpm test` |

How the app handles Neon (`src/lib/db/`):

- `sslmode=require` is upgraded to `verify-full`. Neon's certificates are publicly trusted, so this is full TLS verification without node-postgres's start-up warning.
- On Vercel Fluid compute, `attachDatabasePool` closes idle connections before an instance is suspended. Pool idle timeout is 5 s, so Neon can scale to zero.
- Migrations always use the direct URL, never the pooler.
- `pnpm db:seed` wipes data, so it refuses production and needs `--allow-remote` for any non-local database.

### Set it up on Vercel

1. In the Vercel project, go to **Storage → Create → Neon**. Pick region **AWS Asia Pacific (Mumbai) – ap-south-1** and connect it to *Production*, *Preview* and *Development*. This sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
2. Recommended: enable Neon **preview branching** in the integration, so each preview deployment gets its own copy-on-write database branch.
3. Deploy. The `vercel-build` script runs `scripts/migrate.ts` against the direct URL, then `next build`, so the schema always matches the deployed code.
4. To load the demo district into a **development** branch:
   ```bash
   vercel env pull .env.local
   pnpm db:seed --allow-remote
   ```
5. A Vercel **Pro** plan is needed for the per-minute cron used by deadlines and notifications, which start in phase 5.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm lint` / `pnpm typecheck` | ESLint / route typegen + `tsc` |
| `pnpm test` | Vitest: rules engine, utils, and DB tests (DB tests skip when `TEST_DATABASE_URL` is unset) |
| `pnpm test:e2e` | Playwright smoke tests (needs `pnpm build` first) |
| `pnpm db:generate` | Create a migration after a schema change |
| `pnpm db:migrate [--test]` | Apply migrations over the direct connection (`DATABASE_URL_UNPOOLED`, else `DATABASE_URL`; `--test` uses `TEST_DATABASE_URL`) |
| `pnpm db:seed [--test] [--allow-remote]` | Reset and seed the demo district. Refuses production; needs `--allow-remote` for Neon or any non-local DB |
| `pnpm vercel-build` | What Vercel runs: migrate, then build |

## Project layout

```
src/app/(app)/          signed-in area: dashboard, design showcase, placeholders for later phases
src/app/(auth)/login    sign-in screens
src/components/ui/      design-system primitives (button, card, sheet, table, …)
src/components/         app components (status pill, KPI card, stage tracker, stepper, shell)
src/lib/db/             Drizzle schema, client
src/lib/sourcing/       reconciliation ledger (fix #1)
src/lib/placement/      placement rules + suggestion engine (fix #2)
src/lib/authz/          roles (phase 2 adds permissions and scopes)
scripts/                migrate, seed
tests/unit, tests/db, tests/e2e
drizzle/                SQL migrations
```

## Notes for contributors

- **Cache Components.** Anything that reads the session, cookies or the database must sit inside a `<Suspense>` boundary (see `src/app/(app)/dashboard/page.tsx`). The bundled docs in `node_modules/next/dist/docs/` describe this Next.js version.
- **Age is derived, not stored.** Persons carry `dob`; use `ageFromDob`.
- **All demo data is fictional.**
