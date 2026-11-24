# eDeployment — operations runbook

How to run, secure and recover the application. For what the app does, see `docs/PLAN.md`; for local setup, see `README.md`.

## 1. Configuration

All configuration is environment variables (`.env.local` locally; the hosting provider's settings in production). `.env.example` lists every variable.

| Variable | Purpose | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Pooled Postgres connection used by the app | Neon: the `-pooler` host |
| `DATABASE_URL_UNPOOLED` | Direct connection for migrations | Neon: the host without `-pooler` |
| `BETTER_AUTH_SECRET` | Signs sessions; encrypts two-step (TOTP) secrets | 32+ random bytes. See §4 before rotating |
| `BETTER_AUTH_URL` | Public base URL of the app | Must match the browser origin |
| `QR_SECRET` | Signs the check-in QR codes on ID cards / duty passes | Falls back to `BETTER_AUTH_SECRET` if unset |
| `CRON_SECRET` | Protects `/api/cron/tick` | Long random string |
| `APP_URL` | Base URL printed inside QR codes | Defaults to the request origin |
| `REQUIRE_ADMIN_2FA` | State Admins must use two-step sign-in | `true` in production; `false` only for demos / CI |
| `SHOW_DEMO_ACCOUNTS` | Shows demo usernames on the sign-in page | Never `true` in production |
| `OUTBOX_PROVIDER` | Message delivery adapter | `console` (default) until SMS / WhatsApp is added (§6) |
| `BLOB_READ_WRITE_TOKEN` | Store uploads in Vercel Blob | Unset = local disk under `.data/uploads` |
| `NEXT_PUBLIC_MAP_TILE_URL` | Map tile server | Defaults to OpenStreetMap; its host is added to the CSP automatically |

## 2. Database

- **Migrations** are SQL files in `drizzle/`. Apply them with `pnpm db:migrate`, which uses `DATABASE_URL_UNPOOLED`. Never edit an applied migration; generate a new one with `pnpm db:generate --name <change>`.
- CI fails if the schema changes without a committed migration ("migration drift check").
- `drizzle/0005_sourcing.sql` adds an exclusion constraint (`plan_personnel_no_double_booking`, btree_gist) that stops one officer being booked on two overlapping bandobasts. Keep it when squashing migrations.
- **Seeding** (`pnpm db:seed`) wipes and reloads demo data. It refuses to run with `NODE_ENV=production`, and on any non-local database unless `--allow-remote` is passed.

### Backups and point-in-time restore (Neon)

- Neon keeps a history of every change (the "restore window", 1–30 days depending on plan). Check it under **Project → Settings → Storage**.
- **To inspect the past without touching production:** create a branch from a timestamp (**Branches → Create branch → Past data**). Point a local copy at it and compare.
- **To roll production back:** use **Branches → main → Restore** to a timestamp. This replaces the branch's data, and Neon keeps a backup branch of the state it replaced.
- **Before risky migrations:** create a branch of `main` (instant, copy-on-write). Then run the migration against `main`, and delete the branch once satisfied.
- **Weekly offline copy:** `pg_dump --format=custom "$DATABASE_URL_UNPOOLED" > edeployment-$(date +%F).dump`, kept encrypted off-site.

## 3. Scheduled work (cron)

`GET /api/cron/tick`, with header `Authorization: Bearer $CRON_SECRET`, runs in this order:

1. Auto-accepts force requests whose deadline passed, and tells the Unit Officer.
2. Sends deadline reminders (2 hours before).
3. Sends absentee alerts for live bandobasts (at most hourly per plan).
4. Sends meeting reminders.
5. Drains the message outbox.

Run it every 5–10 minutes:

- **Vercel:** `vercel.json` already schedules it; Vercel Cron sends the bearer token automatically when `CRON_SECRET` is set.
- **Elsewhere:** use any scheduler, e.g. ``curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/tick``.
- **Locally:** `pnpm cron:tick` (needs the app running).

Deadlines are also evaluated whenever a page reads them, so a missed tick never shows wrong numbers. Only reminders and messages are delayed.

## 4. Secrets and rotation

| Secret | Effect of rotating | Procedure |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Everyone is signed out. **Two-step sign-in stops working:** TOTP secrets are encrypted with it | Rotate, then ask users with two-step sign-in to set it up again. Clear the old enrolments first: `delete from two_factors; update users set two_factor_enabled = false;` |
| `QR_SECRET` | All printed ID cards and duty passes stop checking in | Rotate only between bandobasts, or reprint cards for live plans |
| `CRON_SECRET` | The scheduler gets 401 until updated | Update the app and the scheduler together |
| Database password | App and migrations lose access | Neon → **Roles → Reset password**, then update both `DATABASE_URL`s |

Never commit secrets. `.env.local` is git-ignored.

## 5. Accounts

- **Locked account** (5 wrong passwords → 15 minutes): it unlocks automatically, or an admin uses **Admin → Users → Unlock**.
- **Forgotten password:** **Admin → Users → Reset password**. This gives a one-time password, which the officer must change at first sign-in.
- **Lost authenticator phone:** the user signs in with a backup code, then sets up two-step sign-in again under **Account → Two-step sign-in**. If they have no backup codes, a database admin runs `delete from two_factors where user_id = '<id>'; update users set two_factor_enabled = false where id = '<id>';`. The user must set it up again at next sign-in if they are a State Admin.
- **Role changes:** **Admin → Users → Roles**. The permission matrix is under **Admin → Roles & permissions**, and every change is audited.

## 6. Adding an SMS / WhatsApp provider

All outgoing messages are written to `notifications_outbox` in the same transaction as the change that caused them. A rolled-back change therefore never sends anything.

1. Implement an adapter in `src/lib/server/outbox.ts`, alongside `consoleAdapter`. It receives `{ channel, template, payload, toPhone, toName }`.
2. Map `template` values to the provider's approved templates:
   - `force.request`, `force.reminder`;
   - `duty.assigned`, `duty.changed`, `duty.removed`;
   - `plan.proposal_requested`, `proposal.reminder`, `proposal.returned`;
   - `meeting.reminder`, `meeting.mom`;
   - `task.assigned`, `oi.assigned`.
3. Add the provider's API key as a secret, and set `OUTBOX_PROVIDER=<name>`.
4. Failures are retried with exponential backoff, and marked `failed` after 5 attempts. To list them: `select * from notifications_outbox where status = 'failed'`.

## 7. Security notes

- **Headers:** `next.config.ts` sets the following on every response:
  - a static Content-Security-Policy (no nonces, so partial prerendering keeps working);
  - HSTS;
  - `X-Frame-Options: DENY`;
  - `nosniff`;
  - a strict referrer policy;
  - a Permissions-Policy that allows geolocation (needed for QR check-in).
- **Access control:**
  - Every mutation goes through `mutate()` (permission → validation → transaction → audit row).
  - Every read goes through the scoped query helpers.
  - `tests/db/isolation.test.ts` proves that a Unit Officer of another district sees and changes nothing.
- **Audit:** all document and Excel exports are recorded in `audit_log` (`export.*` actions). For example, who downloaded ID cards in the last week:
  ```sql
  select created_at, actor_user_id, action, entity_id from audit_log
  where action like 'export.%' and created_at > now() - interval '7 days' order by created_at desc;
  ```
- **Public endpoints:**
  - `/login`;
  - `/api/auth/*`, rate-limited;
  - `/c/<token>` and `/api/checkin`, which accept only HMAC-signed tokens;
  - `/api/cron/tick`, which needs the bearer secret.

## 8. Performance reference

Measured in `tests/db/load.test.ts` / `tests/unit/placement-perf.test.ts` on a 3,000-slot plan:

| Step | Time |
| --- | --- |
| Save CO proposal (300 points) | ~0.5 s |
| Submit → generate 3,000 slots | ~0.3 s |
| Send to Unit Officer | ~0.4 s |
| Load the placement board | ~0.25 s |
| Suggest placements (whole plan) | ~0.7 s |
| Suggestion engine alone (3,000 slots, 3,200 officers) | ~1.3 s |

If a step regresses, run `EXPLAIN ANALYZE` on its queries. Hot paths are already indexed by `plan_id` and by `(plan_id, person_id)`.

## 9. Health checks after a deploy

1. `pnpm db:migrate` reports nothing pending.
2. The sign-in page loads, and a test user can sign in.
3. `/api/cron/tick` returns `{ ok: true }` when called with the secret.
4. An ID card PDF downloads for a published plan, and its QR opens `/c/<token>`.
