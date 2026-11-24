# eDeployment (simplified)

Bandobast (security plan) planning for police units. The Initiating Officer creates a plan. Component Officers design sectors and points. The Unit Officer sources men from stations, and officers are placed at points. Duties are published, and the bandobast is monitored live with QR check-in. Alongside it sit an Office Manager module (tasks, meetings, appointments, reports, notes) and an inter-district flow through the Chief Office (DGP).

It rebuilds the workflow in the two eDeployment user manuals, with two deliberate changes:

1. **No re-application when stations give fewer men.** The Unit Officer accepts the shortfall in one click, or tops up from other stations in parallel. The plan never goes back to the Initiating Officer or Component Officers. If a gap remains, it can be sent to the Chief Office, which asks other districts.
2. **Officers decide placement; the system only suggests.** Suggestions take age, fitness, gender and point intensity into account, and give a reason for every pick. Component Officers place officers in their own component, and the Initiating Officer can override across components. Nothing is sent to officers until someone clicks **Publish**. A re-publish only notifies officers whose posting changed.

Further documentation:

- [`docs/PLAN.md`](docs/PLAN.md) has the design and the feature checklist covering both manuals. Its "As built" section lists where the build differs from the original plan.
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) covers configuration, backups, secrets, cron and adding an SMS provider.

## Status

All ten phases are built. Each one was pushed with lint, typecheck, unit/DB tests, build, Playwright (desktop and phone) and CI green.

| Phase | Scope |
|---|---|
| 1 | Foundation, design system, app shell, schema, seed, CI |
| 2 | Username + password sign-in, roles and scopes, admin screens, audit log, notifications |
| 3 | Masters: persons, stations, ranks, units, components, points library (map), equipment, accommodation, vehicles, teams, shifts, instructions, ID-card headers, transfers, unit profile |
| 4 | Initiate plan, Component Officer proposal wizard, IO consolidation with inline edits |
| 5 | Force sourcing: distribution grid, station replies with names, reconciliation ledger (accept shortfall / top-up), deadlines |
| 6 | Placement board (suggest, drag, "Place in…", lock, drop slot), publish with snapshot and diff |
| 7 | ID cards and duty passes (PDF, signed QR), QR check-in, live monitoring map, scheme book, accommodation, equipment |
| 8 | Office Manager: tasks, meetings calendar and minutes, appointments, MIS reports, notes |
| 9 | Hardening: CSP, two-step sign-in (TOTP), audited exports, isolation, load and accessibility tests |
| 10 | DGP / inter-district: send a gap to the Chief Office, unit-wise distribution, other-unit requirements |

## Run it locally

Requires Node 22 and pnpm 10, plus PostgreSQL 16 (local) or a Neon branch.

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

Edit `.env.local`, then:

```bash
pnpm db:migrate
```

```bash
pnpm db:seed:demo
```

```bash
pnpm dev
```

Open http://localhost:3000 and sign in with a demo account (below).

- `pnpm db:seed:demo` wipes the database. It loads the demo district, and then two bandobasts built through the real workflow:
  - **Nagula Chavithi Utsav 2026**: completed ten days ago; published, attended, lodged.
  - **Karthika Deepotsavam 2026**: a week out and mid-way through force sourcing. Town I PS gave 4 of 6 PC; Town II PS hasn't replied; 2 PC were sent to the Chief Office.
  - Office tasks, meetings, an appointment and notes.
- `pnpm db:seed` loads the same masters and accounts **without** the demo plans. The automated tests use this.

### Using Neon instead of local Postgres

Neon project `edeployment` (id `bold-glitter-41655874`, AWS Singapore):

| Branch | State |
|---|---|
| `main` | Migrated to the latest schema (all 11 migrations), no data |
| `dev` | Still holds the phase 1 schema and data. Bring it up to date from your machine |

To bring `dev` up to date:

1. Put the `dev` branch's pooled URL in `DATABASE_URL` and its direct URL in `DATABASE_URL_UNPOOLED` (Neon console → Branch → Connect).
2. Run the following. The second command wipes `dev` and loads the demo data; it refuses any non-local database unless `ALLOW_REMOTE=1` is set.

```bash
pnpm db:migrate
```

```bash
ALLOW_REMOTE=1 DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:seed:demo
```

Connection strings are never committed.

## Demo accounts

Every demo account uses the password **`Demo@12345`**. They exist only in seeded development databases; the seed refuses to run in production. Set `SHOW_DEMO_ACCOUNTS=true` to list them on the sign-in page. With `REQUIRE_ADMIN_2FA=true` (the default), `admin` is asked to set up two-step sign-in with an authenticator app at first sign-in. Set it to `false` for a quick local demo.

| Username | Role | Who |
|---|---|---|
| `admin` | State Admin | State administrator: users, roles and permissions |
| `sp` | Unit Officer + Initiating Officer | SP, Demo District. Switch role from the header |
| `addlsp` | Initiating Officer | Addl. SP, Demo District |
| `dsp1`, `dsp2` | Component Officer | DSPs, Demo District |
| `sho.town1`, `sho.town2`, `sho.rural` | Office Incharge | SHOs of Town I, Town II and Rural PS |
| `om` | Office Manager | SI, District Police Office |
| `staff1` | Employee | HC, District Police Office |
| `pc1015` | Personnel | PC, Town I PS (duty passes) |
| `dgp` | DGP / Chief Office | Distributes inter-district requests |
| `sp.north` | Unit Officer | SP, North Demo District |
| `sho.north1` | Office Incharge | SHO, North Town PS |
| `comdt.apsp` | Unit Officer | Commandant, APSP 1st Battalion |

All names, numbers and places in the demo data are fictional.

**A quick tour:**

1. Sign in as `sp`. The dashboard lists what needs attention.
2. Open **Karthika Deepotsavam 2026** → *Force sourcing* to see the ledger: accept the shortfall, top up, or send the gap to the Chief Office.
3. Sign in as `dgp` to distribute that gap to North district.
4. Then sign in as `sp.north` and `sho.north1` to answer it.
5. The completed plan has ID cards, duty passes, the scheme book and the live attendance view.

## Stack

- Next.js 16 (App Router; Cache Components and Partial Prefetching), React 19, TypeScript (strict).
- PostgreSQL with Drizzle ORM (`pg` driver): Neon or Postgres 16.
- Better Auth: username + password, database sessions, rate limiting, TOTP two-step.
- Tailwind CSS v4 with shadcn-style components (light theme, pill buttons, rounded surfaces).
- TanStack Table, dnd-kit, zod and sonner.
- Leaflet maps, React-PDF and ExcelJS.
- Vitest (unit tests plus a real-Postgres suite that calls the Server Actions), Playwright (desktop and phone, axe accessibility checks).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm lint` / `pnpm typecheck` | ESLint / route typegen + `tsc` |
| `pnpm test` | Vitest: unit tests, and DB tests against `TEST_DATABASE_URL` (skipped when unset) |
| `pnpm test:e2e` | Playwright on port 3100. Run `pnpm build` and `pnpm db:seed` first |
| `pnpm db:generate --name <change>` | Create a migration after a schema change |
| `pnpm db:migrate [--test]` | Apply migrations over the direct connection |
| `pnpm db:seed [--test] [--allow-remote]` | Reset and load masters and demo accounts |
| `pnpm db:seed:demo` | `db:seed`, plus two demo bandobasts and office samples (`ALLOW_REMOTE=1` for a non-local DB) |
| `pnpm cron:tick` | Run the scheduled work once: deadlines, reminders, absentee alerts, outbox. Needs the app running |

## Project layout

```
src/app/(app)/plans/      plan list, initiate, proposal wizard, consolidate, sourcing, placement, live, documents
src/app/(app)/station/    Office Incharge: force requests, distributed equipment, duty passes
src/app/(app)/dgp/        Chief Office: unit-wise distribution
src/app/(app)/requirements/  receiving Unit Officer: other unit requirements
src/app/(app)/office/     Office Manager module
src/app/(app)/masters/    masters
src/app/c/[token]         public QR check-in
src/lib/sourcing/         ledger, distribution engine, escalation
src/lib/placement/        suggestion engine, publish diff
src/lib/execution/        QR tokens, PDFs, attendance, allocation
src/lib/server/mutate.ts  every write: permission → validation → transaction → audit
scripts/                  migrate, seed, demo data, cron tick
tests/unit, tests/db, tests/e2e
drizzle/                  SQL migrations
```

## Notes for contributors

- **Cache Components.** Anything that reads the session, cookies or the database must sit inside a `<Suspense>` boundary and call `connection()`. The bundled docs in `node_modules/next/dist/docs/` describe this Next.js version.
- **Every write goes through `mutate()`.** It checks the permission, validates with zod, runs in a transaction, and writes an audit row.
- **Reads go through the scoped helpers** in `src/lib/authz/`. `tests/db/isolation.test.ts` proves that one district can't see another's data.
- **Age is derived, not stored.** Persons carry `dob`.
