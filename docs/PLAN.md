# eDeployment (simplified) — Build Plan

> Approved plan. Source manuals: "eDeployment User Manual 2.0 – Within District" (Manual A) and "AP Police eDeployment" (Manual B).

## Context

The two uploaded manuals describe AP Police eDeployment:
- **Manual A:** *eDeployment User Manual 2.0 – Within District*, 219 pages.
- **Manual B:** *AP Police eDeployment*, 242 pages. Adds the DGP flow, the Office Manager module, accommodation allotment and teams.

The system is a bandobast (security plan) application. The repo is empty, so this is a rebuild from scratch on **Next.js + TypeScript + PostgreSQL**, with proper AuthN/AuthZ and a **clean, modern UI**. **Every feature in both manuals is carried over**; the checklist at the end maps each one to a delivery phase. Two workflows are deliberately changed:

1. **The shortfall loop.** The SP can only send the provisional distribution when every rank total exactly matches the requirement (A p68). Stations often give fewer men (A p194–197). To go ahead with the smaller count, the SP has to Readjust. That sends the plan back to the IO (A p84), who returns it to the COs (A p116–117). The COs resubmit, the IO sends to the SP again (A p119), and the distribution round repeats. **New:** the SP accepts what was given in one click and the plan carries on. The gap can optionally be filled by a **parallel top-up request** to other stations. The plan never goes backwards.
2. **System-decided placement.** "Force Allocation" (B p42, A p125–126) picks officers for points by itself: preferred station, then nearest, then division, then district. It ignores age and fitness, so older men end up on demanding points. COs can only swap officers of the same rank before a timer (A p178–181). The final distribution auto-submits and notifications go out automatically (A p131, B p48). **New:** the system only **suggests**, and the suggestion is aware of age, fitness and how demanding each point is. **COs place officers in their own component; the IO can override across components.** Nothing is sent until a human clicks **Publish**.

Decisions confirmed: accept + optional top-up · CO places, IO overrides · v1 = within district (data model ready for the DGP flow, which is phase 2) · cloud hosting (Vercel + managed Postgres) · clean modern UI with rounded corners and pill-shaped buttons.

---

## As built (supersedes the plan below where they differ)

All ten phases are built. Decisions taken during the build that change what this plan says:

| Plan said | As built | Why |
|---|---|---|
| Mobile + OTP login | **Username + password** (Better Auth `username` plugin), lockout after 5 failures, forced password change, optional **TOTP two-step sign-in** (required for State Admins when `REQUIRE_ADMIN_2FA=true`) | Your decision; OTP can be added later as another Better Auth plugin |
| DGP flow deferred | **Built as Phase 10**: UO sends the gap to the Chief Office → DGP distributes across units → receiving UO commits and asks its own stations → names flow into the requesting plan | Your decision |
| Light and dark mode | **Light theme only**, compact density, collapsible sidebar, page templates (list / detail / wizard / board) | Your decision |
| Hosted on Vercel | **No deployment**: GitHub + local only. `vercel.json` (cron) and the `vercel-build` script stay so a later deploy needs no code change | Your decision |
| Neon in Mumbai | Neon **Singapore** (`aws-ap-southeast-1`); Mumbai isn't offered on this account | Availability |
| Vercel Blob for files | Local disk under `.data/uploads` (served through an access-checked route); Vercel Blob is used automatically when `BLOB_READ_WRITE_TOKEN` is set | No deployment |
| SMS / WhatsApp | Messages are queued in `notifications_outbox` and delivered by a console adapter; a real provider is one adapter (see `docs/RUNBOOK.md` §6) | No provider keys yet |

How to run it, the demo accounts and the database set-up are in the README; operations (backups, secrets, cron, SMS provider) are in `docs/RUNBOOK.md`.

---

## Tech stack

| Concern | Choice | Why |
|---|---|---|
| App | Next.js (latest stable, App Router), TypeScript `strict`, Server Actions + Route Handlers | One deployable; authz enforced on the server |
| DB | PostgreSQL on **Neon (AWS ap-south-1 / Mumbai)** via Vercel Marketplace; **Drizzle ORM** + drizzle-kit migrations; `pg` driver on Vercel Fluid compute | Interactive transactions and row locks; portable to SDC later |
| DB guarantees | `btree_gist` **exclusion constraint** on `(person_id, duty_window)` | Postgres itself makes double-booking an officer across overlapping bandobasts impossible |
| AuthN | **Better Auth** + `phoneNumber` plugin (mobile + OTP, as today), DB sessions, rate limiting; `twoFactor` TOTP for UO/IO/Admin | Only pre-registered phones can log in (`signUpOnVerification` off) |
| SMS / WhatsApp | Provider adapters (SMS gateway, WhatsApp Business Cloud API) behind an interface + **outbox table**; console adapter in dev | Retries; nothing lost if the provider is down |
| AuthZ | RBAC + scopes; admin-editable role→permission matrix (B p147–152) | Same model as the existing User Access / Roles / Allocate Permissions screens |
| UI | Tailwind CSS v4 + **shadcn/ui** (Radix) themed to the design system below; TanStack Table; **dnd-kit**; react-hook-form + zod; sonner toasts; lucide icons; FullCalendar (meetings/appointments) | |
| Maps | react-leaflet with a provider switch: OSM-based tiles by default; **Google Maps layer (satellite + Street View, as in the manuals) when an API key is configured** | Street View is Google-only |
| Files | Vercel Blob (photos, signatures, logos, ID-card headers, sector images, task attachments) | |
| PDFs / QR / Excel | `@react-pdf/renderer`, `qrcode`, `exceljs` | ID cards, duty pass, scheme book, reports, Excel import/export |
| Jobs | **Vercel Cron every minute (Pro plan)** → `/api/cron/tick`: deadlines, reminders, live alerts, outbox. Deadline status is also computed lazily on read | |
| Tests / CI | Vitest (real Postgres), Playwright e2e; GitHub Actions (typecheck, lint, test, migration drift) | |

> The current system is APTS-certified and hosted in the State Data Centre. Using Vercel/Neon may need sign-off. Nothing above is Vercel-only, so a later move to SDC Docker stays straightforward.

---

## UI / design system — clean, modern, rounded, pill buttons

- **Tokens** (`app/globals.css` CSS variables, shadcn theme):
  - radius: cards and dialogs `rounded-2xl`, inputs/selects `rounded-xl`;
  - **all buttons `rounded-full` (pill)**, including icon buttons (circular);
  - badges and status chips are also pills;
  - soft shadows (`shadow-sm`, hover `shadow-md`) and 1px hairline borders.
- **Palette:** neutral slate surfaces, a deep police-blue primary, and semantic success/warning/danger. Status is never shown by colour alone: each pill carries an icon and a label (e.g. ✓ Accepted, ⏳ Pending, ⚠ Short by 4). This replaces the manuals' plain red/orange/green text. Light and dark mode.
- **Typography & spacing:** Inter (or Geist) with a clear type scale; generous whitespace; an 8-pt spacing grid.
- **Layout:** collapsible left sidebar with icons; a top bar with the unit name, a **role switcher as a pill segmented control**, and a profile avatar menu. Pages use a header with a title, breadcrumb and primary pill action on the right.
- **Components:**
  - KPI cards with an icon and trend, used on dashboards;
  - data tables with sticky headers, search, filter pills, column visibility and Excel export;
  - right-side **sheets** for add/edit instead of popups;
  - **stepper** for multi-step flows (plan initiate, CO proposal);
  - **stage tracker** (pill chips) on each plan;
  - toasts for success; confirm dialogs only for irreversible actions;
  - skeleton loaders and friendly empty states.
- **Special screens:**
  - **Force grid:** rank columns; each cell shows requested / available / committed as small stacked pills.
  - **Reconciliation ledger:** a progress bar per rank, plus "Accept shortfall" and "Top-up" pill buttons.
  - **Placement board:** officer pool on the left (filters: rank, age band, fitness, station), sectors → points → slots on the right; drag-and-drop; age/fitness avatars and "why" tooltips.
  - **Map views** with rounded floating panels.
- **Responsive:** UO/IO/CO screens target desktop and tablet. **OI screens, the duty pass and QR check-in are mobile-first.** Accessibility target: WCAG 2.1 AA (focus rings, contrast, keyboard drag alternative on the placement board).
- Build a `/design` showcase route early so the look can be signed off before the feature screens.

---

## Roles & AuthZ

Roles:
- SUPER_ADMIN (state masters, users, permissions);
- UNIT_OFFICER (SP/CP);
- INITIATING_OFFICER;
- COMPONENT_OFFICER;
- OFFICE_INCHARGE (SHO/station);
- **OFFICE_MANAGER and EMPLOYEE** (Office Manager module, B p70–98 and p185–189);
- PERSONNEL (duty pass, check-in);
- *DGP (phase 2).*

- `role_assignments(user_id, role, unit_id?, station_id?, plan_id?, plan_component_id?, department_id?)`. One person can hold several roles; the role switcher works like the current dropdown (A p8).
- Logins are **auto-created** when:
  - an IO names a CO or the Overall Incharge (A p102);
  - a UO sets a station's Office Incharge (A p18).
- `permissions` + `role_permissions`, editable by SUPER_ADMIN (B p149–152). Examples: `plan.initiate`, `force.distribute`, `force.accept_shortfall`, `placement.edit_own_component`, `placement.override`, `plan.publish`, `masters.*.write`, `export.excel`, `office.tasks.verify`.
- Every Server Action / Route Handler calls `authorize(session, permission, resource)` (permission + scope). Reads go through scoped query helpers in `lib/authz/scoped.ts`. Every mutation writes `audit_log` in the same transaction.
- Security: OTP rate limiting and lockout, session idle timeout, session list with revoke, logout confirmation (A p218–219), CSP and security headers, audited Excel exports, age derived from DOB.

---

## New workflow (old → new)

| Step | Today | New |
|---|---|---|
| 1 Initiate | IO: dates/times, details, place, components, Overall Incharge, COs, reporting schedule (Accommodation / Briefing / Spot Briefing / Rehearsal / Final Duty with ranks) | Same, plus **Reuse** of a completed plan (up to components or up to SHO, B p50–53). An alert goes to each CO with a login link (B p27) |
| 2 Propose | CO: sectors, points (library/map), ranks, **teams**, sector incharge/liaison (max 1), shifts × batches, merge, logistics/equipment, instructions, images, preferences (unit/station/person) | Same, plus each point gets a **priority** and a **duty profile** (intensity High/Med/Low, static/mobile, gender requirement). Library points carry defaults |
| 3 Consolidate | IO resolves officers preferred by several components, returns components, sends to UO (irreversible). UO can nudge pending COs on WhatsApp (B p29–31) | Same nudges and selective return (B p32–33), but the **IO can edit counts inline** without a return loop. If the IO also holds the UO role for that unit, the hand-off is skipped |
| 4 Distribute | UO must make every rank total exactly match before sending | Grid **pre-filled** (preferences → availability → nearest) and editable. **Can be sent with a gap**. Deadline set per round |
| 5 Station response | OI Accept / Readjust; auto-accept at the deadline | OI per rank: **commit** (may be less, with a reason code) and **optionally name the officers in the same step**. Auto-accept at the deadline stays (configurable) |
| 6 Shortfall | Readjust → back to IO → COs → IO → UO → redistribute | **Reconciliation ledger** per rank (Required / Requested / Committed / Named / Gap). **Accept shortfall** (one click, reason audited) or **Top-up** to other stations, running in parallel. Never goes back |
| 7 Nominal roll | UO "Request Nominal Roll" once all stations are green; all must submit first | Implicit once a station commits. Names flow into the plan pool **as they arrive**. The OI can edit until publish (A p200–203). An alert goes to the UO when a roll is sent (B p210) |
| 8 Placement | Auto-allocation; same-rank swap only before a timer; auto-final | **Placement board.** "Suggest" builds an age/fitness/priority-aware draft with reasons. The CO edits their component freely; the IO overrides across components and locks. Unfilled slots are visible; the CO may mark low-priority slots "dropped" |
| 9 Publish | Notifications sent automatically | Only on explicit **Publish** (CO marks a component ready → IO publishes). Versioned snapshot; a re-publish **notifies only the officers whose posting changed** |
| 10 Execute | ID cards + QR, check-in/out, live map, duty pass, scheme book, accommodation, equipment | All kept, generated from the published version (see the checklist) |

**State machines** (`lib/workflow/`):
- **Plan:** `DRAFT → INITIATED → PROPOSED → SOURCING → PLACEMENT → PUBLISHED → LIVE → COMPLETED` (+ `CANCELLED`). Stages gate actions but don't block each other.
- **Component:** `PENDING → SUBMITTED ⇄ RETURNED → READY → PUBLISHED`.
- **Force request** (`initial | top_up`): `SENT → COMMITTED | PARTIAL | DECLINED | AUTO_ACCEPTED → NAMED`.

Each transition is one transaction: guards + authz + `plan_events` + `audit_log` + outbox.

---

## Suggestion engine (`lib/services/suggest.ts`)

It only creates draft assignments (`source = suggested`).

- **Hard constraints:** same rank (substitution only with an IO override) · gender requirement · `light_duty_only` officers never on High intensity · available · not already placed · in the plan's named pool.
- **Soft score (weights configurable per unit):** CO preference · age vs intensity (High → younger; static/Low → older; officers above a configurable age, default 50, are flagged on High points) · home-station distance · seniority for incharge/liaison slots · keeping same-station officers together in a sector.
- **Order:** greedy, slots sorted by priority then intensity. With too few officers, the lowest-priority slots are the ones left open.
- Each pick stores its reasons, shown as a tooltip.

---

## Data model (Drizzle, `lib/db/schema/`)

**Org & masters:**
- `units` (drag-reorder, B p100) · `divisions` · `stations` (code, lat/lng, display_order drag-reorder (A p16), incharge_person_id) · `ranks` (category General/AR/APSP, seniority) · `departments`
- `persons` (gen_no, rank, station, gender, **dob**, phone, photo, signature, `availability`, **`fitness`**, skills) · `users` + Better Auth tables · `role_assignments` · `permissions`, `role_permissions`
- `components` · `point_library` (lat/lng, default priority/intensity)
- `equipment_types`, `equipment_stock` (station, total/working/not-working, custodian)
- `accommodations` (category Hotel/School/College/Dormitory/Function Hall, capacity, gender, lat/lng, station)
- `id_card_headers` · `instructions` · `vehicles` (station, number, officer, availability) · `teams` + `team_composition` · `shifts` · `transfer_requests` · `unit_profile` (profile, logo, signature)

**Plan:**
- `plans` · `plan_windows` (tstzrange, multi-date) · `plan_reporting_schedule`
- `plan_components` (CO, component incharge, status)
- `sectors` (shifts/batches, instructions, images) · `sector_teams`
- `points` (priority, intensity, mobility, gender_req)
- **`slots`**: one row per required position (rank, batch, role_type, status open/filled/dropped) · `slot_points` (merged points)
- `preferences` · `plan_equipment_requirements` (component/sector, type, qty)

**Sourcing:** `force_requests` (to_station, kind, parent, status, deadline) · `force_request_lines` (requested, committed, reason) · `shortfall_acceptances` · `v_plan_rank_ledger`. Station "available" = free persons − outstanding committed-but-unnamed counts on overlapping requests.

**People & placement:** `plan_personnel` (`EXCLUDE USING gist (person_id WITH =, duty_window WITH &&)`) · `assignments` (slot, person, status, source, locked, reasons, **version**; partial unique indexes enforce one active assignment per slot and per person).

**Execution:**
- `plan_publications` (versioned snapshot) · `checkins` · `live_alerts`
- `id_card_prints`
- `accommodation_allotments` (person, accommodation, from/to)
- `equipment_allocations` (plan, station, type, qty, issued/returned)

**Office Manager:**
- `tasks` (category, title, description, priority High/Medium/Low/Fixed-date, deadline, attachments, status, source appointment/meeting) · `task_assignees` · `task_closures` (remarks, files, verified_by)
- `meetings` (type, date/time, venue, link, MOM) · `meeting_participants` (department/person, attended)
- `appointments` (category, visitor, date/time, location, purpose, allotted_to, task_id) · `visitors`
- `notes` (colour)

**Infra:** `notifications_outbox` · `plan_events` · `audit_log`

---

## App structure

```
app/(auth)/login, verify
app/(app)/layout.tsx                 sidebar + role-switcher pill + avatar menu
  dashboard                          role-aware KPI cards + tables
  plans/ (ongoing | completed | other-unit [phase 2] | new)
  plans/[planId]/                    overview + stage tracker
    components/[pcId]/propose        CO stepper: sectors → points/map → ranks/teams/batches/merge → logistics → preferences → preview
    consolidate                      IO
    sourcing                         UO force grid + ledger + top-up
    placement                        CO/IO placement board + Suggest + Publish
    accommodation | equipment        allotment (auto + manual) / distribution
    id-cards | live | scheme         ID cards, live monitoring map, scheme-book PDF
  station/requests/[id]              OI commit + nominal roll (mobile-first)
  station/equipment | station/duty-pass
  office/ tasks | meetings | appointments | reports | analysis | notes
  masters/*                          all masters (map views, Excel import/export, abstracts)
  admin/ users | roles | permissions
  design                             UI showcase (dev only)
app/c/[token]                        QR check-in/out (signed token + geolocation)
app/api/auth/[...all] | api/cron/tick
lib/ db auth authz workflow services pdf qr excel notify
components/ ui force-grid ledger placement-board map stage-tracker kpi-card data-table
```

---

## Delivery phases

1. **Foundation + design system:** scaffold Next.js/TS/Tailwind/shadcn, theme tokens (pill buttons, rounded surfaces), app shell, `/design` showcase, Drizzle + Neon, CI, seed (demo district: 2 divisions, 8 stations, ~400 persons with varied ages/fitness). Commit this plan as `docs/PLAN.md`.
2. **AuthN + AuthZ:** OTP login (photo + unit on verify), sessions, role switcher, scopes, User Access / Roles / Allocate Permissions screens, audit log, TOTP, logout confirm.
3. **Masters:** all masters in the checklist, with Excel import/export, abstracts, map views, drag ordering, availability toggles, transfer requests.
4. **Plan → Propose → Consolidate:** initiate (+ reuse, reporting schedule, CO alerts), CO stepper (incl. teams, logistics), IO consolidation, nudges, selective return.
5. **Sourcing + reconciliation** *(fixes problem 1)*: distribution grid, station commit + names, deadlines, ledger, accept shortfall, top-up, alerts.
6. **Placement + Publish** *(fixes problem 2)*: plan pool, suggestion engine, placement board, IO override, conflict handling, versioned publish, diff notifications.
7. **Execution:**
   - ID cards: component/sector filter, header + colour theme, 1 or 6 per page, QR, report download.
   - QR check-in/out, live monitoring (pins, summaries, absentee Excel, officer search) and live alerts.
   - Duty pass, scheme book PDF, completed-plan views.
   - **Accommodation allotment** (auto + manual, stay dates, apply to all, view location).
   - **Equipment distribution** (UO allocates from station stock → OI "Distributed Equipment").
8. **Office Manager module:**
   - Tasks: create, all, verify/close with remarks, dashboard.
   - Meetings: calendar, add with WhatsApp reminder, MOM, prior meetings, send MOM, meetings to attend.
   - Appointments: all, add, allotments → task, visitors.
   - MIS reports: pending-age buckets 0–5 / 6–15 / 16–45 / 46–90 / 90+ days, action taken, completed.
   - Person-wise analysis (completion %, average response time); notes; employee views.
9. **Hardening:** load test (~3,000-slot plan), security review, backups/PITR, runbook.

**Phase 2 (after v1):**
- DGP login and Unit-wise Distribution Plan (B p217–223);
- "Send to Chief Officer" (B p34–35);
- Other Unit Requirement / Other Unit Distribution Plan (A p98, B p54–56).

All of these reuse `force_requests` with `to_unit_id`, the same ledger and the same top-up logic.

---

## Feature coverage checklist (every feature in both manuals)

| Module | Features | Phase |
|---|---|---|
| Login | Mobile + OTP, photo and unit shown, role dropdown, logout with confirm | 2 |
| Dashboard | Stations/Offices, Police Persons, Plans in Pipeline, Completed Plans, all searchable | 3–4 |
| Admin | User Access (list/add users), Roles, Allocate Permissions (module-level) | 2 |
| Masters | Police Ranks; State Police Units (drag reorder); Stations/Offices (add/edit/delete, map, Street View*, drag order, OI assignment → auto login); Police Persons (abstract, add/edit/delete, photo/signature, availability toggle); Components; Equipment (types +, abstract, working/not-working, custodian); Deployment Points Library (Excel upload, map/satellite/Street View*); Accommodation (categories, abstract); ID Card Headers; Instructions Library; Vehicles; Teams (composition); Shifts; Unit Profile (profile/logo/signature); Requests to Transfer (OI raises → UO approves → station updated); Excel download everywhere | 3 |
| Initiate (IO/UO) | Single or multi-date, times, name/description, place, image, components, Overall Incharge, COs (auto login), reporting schedule (5 types), edit before proposal, CO alert with login link, Reuse plan | 4 |
| CO proposal | Status cards (Total/Completed/Pending/Rejected), sectors, points (library/map/±), ranks (General/AR/APSP), teams, sector incharge + liaison (max 1), shifts × batches, merge (one SI over many points), logistics/equipment qty, instructions + images, zero-rank validation, preview, component incharge, preferences at unit/station/person level, add/edit/delete sector, delete extra preferences, readjust on return, view plan | 4 |
| IO consolidation | Proposed plan view, multi-component preference resolution, selective return/reject, WhatsApp nudge to pending COs, send to UO (*simplified*) | 4 |
| UO / OI distribution | Provisional distribution grid, deadlines (editable), Accept/Readjust, auto-accept at deadline, rank adjustment, other station (*replaced by ledger + accept shortfall + top-up*) | 5 |
| Nominal roll | OI selects officers (search by name/phone/Gen No), preferred persons locked, edit until final, alert to UO (*simplified: no separate request step*) | 5 |
| Allocation | Force allocation, draft duty allocation swaps, final distribution (*replaced by suggestion + placement board + publish*); Final Force Distribution view | 6 |
| ID cards | Component/sector/CO/incharge filters, header + colour palette, 1 or 6 per page, QR, print, report download | 7 |
| Live | Live monitoring summaries (component/sector, present/absent, check-in/out/pending), absentee Excel, pins green/orange/red, officer search, live alerts | 7 |
| Documents | Duty pass (OI and personnel), scheme book preview + PDF, completed plan views (final duty allocation / proposed plan) | 7 |
| Accommodation | Bandobast-wise list, category capacity, auto allocate, per-officer allotment, stay from/to, apply to all, view location, confirm | 7 |
| Equipment | Logistics requirements → allocation from stations → OI "Distributed Equipment" | 7 |
| Office Manager | Tasks (create/all/verify/close/dashboard), Meetings (calendar/add/MOM/prior/WhatsApp/to-attend), Appointments (all/add/allotments/visitors), MIS reports (pending buckets, action taken, completed), person-wise analysis, notes, employee task and meeting views | 8 |
| Notifications | WhatsApp/SMS: plan initiated, nudges, force requests, roll submitted, published duty (point, time, location, reporting schedule), changes, meetings | 5–8 |
| DGP / other units | Unit-wise distribution, send to units, other-unit requirement | Phase 2 |

\* Street View requires the optional Google Maps key.

**Described in Manual B's "Scope / Objectives" pages (p8–13) as aspirations, with no screens. Not in v1; flagged for later:** real-time vehicle GPS tracking, digital signatures/approvals, a separate officer mobile app (v1 is mobile-responsive instead), post-event feedback and ratings, training and skill tracking, AI forecasting of force requirements. The data model (audit log, shortfall reason codes, check-ins) is designed so these can be added.

---

## Verification

- **Vitest (real Postgres):**
  - workflow transitions and guards;
  - ledger maths;
  - suggestion constraints: light-duty/over-age never on High intensity, gender, rank;
  - the exclusion constraint blocks double-booking;
  - authz scopes: an OI cannot see another station; a CO is limited to their component; an IO can override;
  - Office Manager pending-bucket report maths.
- **Playwright e2e (seeded district):**
  1. IO initiates a plan with 2 components.
  2. COs propose with mixed intensity and teams.
  3. IO consolidates.
  4. UO distributes. Station A commits less.
  5. **Accept shortfall** for one rank and **top-up** Station B for another. Assert the plan never returns to the IO or COs.
  6. Stations submit names.
  7. **Suggest**: assert the age/fitness rules.
  8. A CO drags an officer; the IO moves one across components.
  9. **Outbox empty before Publish.** After Publish, one message per officer. A re-publish only messages changed officers.
  10. Accommodation auto-allocation.
  11. ID-card QR → check-in → the live pin turns green.
  12. Office Manager: create task → close → verify → appears in reports.
- **Visual:**
  - the `/design` page and key screens screenshotted at desktop and phone widths (pill buttons, rounded surfaces, light/dark);
  - an accessibility pass with axe in Playwright.
- **Manual:** `pnpm dev` on a Neon branch; walk each role through the role switcher.

---

### Where the 12-step scenario is tested (as built)

| Step | Covered by |
|---|---|
| 1–5 IO initiates → CO proposes → IO inline edit → UO distributes → OI commits less and names officers → UO accepts the shortfall (no return to IO/CO) | `tests/e2e/plans.spec.ts` (browser), `tests/db/plans.test.ts`, `tests/db/sourcing.test.ts` |
| 6 Suggest respects age / fitness / gender | `tests/unit/placement*.test.ts`, `tests/db/placement.test.ts` |
| 7 CO drags an officer (and undo, "Place in…"); IO moves across components | `tests/e2e/plans.spec.ts`, `tests/db/placement.test.ts` |
| 8 Nothing queued before Publish; re-publish notifies only changed officers | `tests/e2e/plans.spec.ts`, `tests/db/placement.test.ts` |
| 9 ID-card QR → check-in → live count | `tests/e2e/plans.spec.ts`, `tests/db/execution.test.ts` |
| 10 Accommodation auto-allocation | `tests/e2e/plans.spec.ts`, `tests/db/execution.test.ts` |
| 11 Office task → action → verify → reports | `tests/e2e/office.spec.ts`, `tests/db/office.test.ts` |
| 12 DGP escalation fills a gap from another district | `tests/e2e/dgp.spec.ts`, `tests/db/dgp.test.ts` |

## Execution order after approval

Work on branch `claude/adoring-hopper-j6th1c`. Phase 1 first: commit `docs/PLAN.md`, scaffold, theme, `/design` showcase, seed. Push and share screenshots of the design system for sign-off, then do Phase 2 (login + roles) and pause for review before building the masters.
