/**
 * Rich demo data on top of `pnpm db:seed`: one bandobast mid-way through force sourcing (with a short
 * station and a gap sent to the Chief Office), one completed bandobast (published, attended), and
 * office-manager samples. Everything goes through the real Server Actions, so audit trails, events and
 * notifications look exactly as they would in use.
 *
 * Run with `pnpm db:seed:demo` (wipes the database first). Local databases only unless ALLOW_REMOTE=1.
 */
import { expect, it } from "vitest";

import "../env";
import "../../tests/support/act-as";
import { actAs, ok, planInPlacement, planInSourcing } from "../../tests/support/plan-fixtures";
import { and, eq, sql } from "drizzle-orm";

import { seed } from "../seed";
import { createDb } from "@/lib/db/client";
import { attendance, forceRequests, persons, plans, stations, users } from "@/lib/db/schema";
import { escalateAction, sendRequestsAction } from "@/app/(app)/plans/[planId]/sourcing/actions";
import { respondAction, saveRollAction } from "@/app/(app)/station/requests/actions";
import { publishAction, suggestAction } from "@/app/(app)/plans/[planId]/placement/actions";
import { autoAllotAction, markAttendanceAction, setPlanStageAction } from "@/app/(app)/plans/[planId]/execution/actions";
import { actionTakenAction, createTaskAction, saveAppointmentAction, saveMeetingAction, saveMomAction, saveNoteAction, verifyTaskAction } from "@/app/(app)/office/actions";
import { getRoster } from "@/lib/execution/server";

const url = process.env.DATABASE_URL!;
const DAY = 86400e3;
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
/** An IST wall-clock time `offsetDays` from today, as an ISO instant. */
const ist = (offsetDays: number, hhmm: string) => new Date(`${isoDay(offsetDays)}T${hhmm}:00+05:30`).toISOString();

it("loads the demo data", async () => {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to load demo data in production.");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.ALLOW_REMOTE !== "1") throw new Error(`Refusing to load demo data into ${host}; set ALLOW_REMOTE=1 if you mean it.`);

  await seed(url);
  const { db, pool } = createDb(url, { max: 2 });
  try {
    const uid = async (username: string) => (await db.select({ id: users.id }).from(users).where(eq(users.username, username)))[0]!.id;
    const station = async (code: string) => (await db.select().from(stations).where(eq(stations.code, code)))[0]!;

    // ── 1. Completed bandobast, ten days ago: published, attended, lodged ──────────────────────────
    const done = await planInPlacement(db, { title: "Nagula Chavithi Utsav 2026", day: isoDay(-10), pc: 8, hc: 2 });
    await actAs(db, "dsp1");
    let v = (await db.select().from(plans).where(eq(plans.id, done.planId)))[0]!.placementVersion;
    ok(await suggestAction(done.planId, { componentId: done.componentId, expectedVersion: v }));
    await actAs(db, "addlsp");
    v = (await db.select().from(plans).where(eq(plans.id, done.planId)))[0]!.placementVersion;
    ok(await publishAction(done.planId, { expectedVersion: v }));
    await actAs(db, "sp", "UNIT_OFFICER");
    ok(await autoAllotAction(done.planId, { fromDate: isoDay(-11), toDate: isoDay(-10) }));
    ok(await setPlanStageAction(done.planId, "live"));
    const roster = (await getRoster(db, done.planId)).rows;
    for (const [i, r] of roster.entries()) {
      if (i === roster.length - 1) continue; // one officer never reported
      ok(await markAttendanceAction(done.planId, { personId: r.id, event: "check_in" }));
      if (i % 3 === 0) ok(await markAttendanceAction(done.planId, { personId: r.id, event: "check_out" }));
    }
    // Recorded "now"; move them into the bandobast window (reporting 09:30 IST, check-outs after 17:00).
    await db.execute(sql`update ${attendance} set at = (${isoDay(-10)}::date + time '09:15' + (random() * interval '25 minutes')) at time zone 'Asia/Kolkata' where plan_id = ${done.planId} and event = 'check_in'`);
    await db.execute(sql`update ${attendance} set at = (${isoDay(-10)}::date + time '17:30' + (random() * interval '40 minutes')) at time zone 'Asia/Kolkata' where plan_id = ${done.planId} and event = 'check_out'`);
    ok(await setPlanStageAction(done.planId, "completed"));

    // ── 2. Bandobast a week out, mid-way through force sourcing ───────────────────────────────────
    const mid = await planInSourcing(db, { title: "Karthika Deepotsavam 2026", day: isoDay(7), pc: 12, hc: 4 });
    const t1 = await station("PS-T1");
    const t2 = await station("PS-T2");
    const r = mid.rank;
    await actAs(db, "sp", "UNIT_OFFICER");
    ok(
      await sendRequestsAction(mid.planId, {
        deadlineAt: new Date(Date.now() + 6 * 3600e3).toISOString(),
        note: "Festival crowd at the river ghat; send fit men.",
        kind: "initial",
        grid: [
          { stationId: t1.id, lines: [{ rankId: r.get("PC")!, requested: 6 }, { rankId: r.get("HC")!, requested: 2 }, { rankId: r.get("SI")!, requested: 1 }] },
          { stationId: t2.id, lines: [{ rankId: r.get("PC")!, requested: 6 }, { rankId: r.get("HC")!, requested: 2 }] },
        ],
      }),
    );
    // Town I PS gives 4 of 6 PC and names everyone; Town II PS hasn't replied yet.
    const [req] = await db.select().from(forceRequests).where(and(eq(forceRequests.planId, mid.planId), eq(forceRequests.targetStationId, t1.id)));
    await actAs(db, "sho.town1");
    ok(await respondAction(req!.id, { lines: [{ rankId: r.get("PC")!, committed: 4, reason: "Station law & order duty" }, { rankId: r.get("HC")!, committed: 2, reason: null }, { rankId: r.get("SI")!, committed: 1, reason: null }], shortReason: null }));
    const named: string[] = [];
    for (const [code, n] of [["PC", 4], ["HC", 2], ["SI", 1]] as const) {
      const rows = await db
        .select({ id: persons.id })
        .from(persons)
        .where(and(eq(persons.stationId, t1.id), eq(persons.rankId, r.get(code)!), eq(persons.availability, "available"), sql`${persons.id} <> ${t1.inchargePersonId}`, sql`${persons.id} not in (select person_id from plan_personnel where plan_id = ${mid.planId})`))
        .orderBy(sql`${persons.genNo} desc`)
        .limit(n);
      named.push(...rows.map((x) => x.id));
    }
    ok(await saveRollAction(req!.id, named));
    // The UO sends the uncovered gap (2 PC) to the Chief Office, so the DGP has something to distribute.
    await actAs(db, "sp", "UNIT_OFFICER");
    ok(await escalateAction(mid.planId, { note: "District strength committed to the ghat and town; need 2 PC.", deadlineAt: new Date(Date.now() + 24 * 3600e3).toISOString() }));

    // ── 3. Office manager samples ──────────────────────────────────────────────────────────────────
    await actAs(db, "om");
    const staff1 = await uid("staff1");
    const om = await uid("om");
    const t = [
      ok(await createTaskAction({ title: "Compile monthly crime review figures", description: "Station-wise figures for the SP's review meeting.", departmentId: null, newDepartment: "Crime", priority: "high", dueDate: isoDay(2), assigneeIds: [staff1] })),
      ok(await createTaskAction({ title: "Update the duty roster register", description: null, departmentId: null, newDepartment: "Administration", priority: "normal", dueDate: isoDay(-3), assigneeIds: [staff1] })),
      ok(await createTaskAction({ title: "Reply to the Collectorate on festival arrangements", description: "Draft for the SP's signature.", departmentId: null, newDepartment: "Administration", priority: "urgent", dueDate: isoDay(1), assigneeIds: [staff1, om] })),
    ];
    await actAs(db, "staff1");
    ok(await actionTakenAction(t[1]!.id, "Register updated for the month; signed by the SI."));
    ok(await actionTakenAction(t[2]!.id, "Draft placed in the SP's file."));
    await actAs(db, "om");
    ok(await verifyTaskAction(t[1]!.id, { decision: "close", remarks: "Checked. Thank you." }));
    const held = ok(await saveMeetingAction(null, { title: "Weekly crime review", agenda: "Pending cases, festival arrangements", location: "SP's chamber", startsAt: ist(-2, "11:00"), endsAt: ist(-2, "12:00"), remindMinutes: 30, participantIds: [staff1] }));
    ok(await saveMomAction(held.id, { mom: "1. Pending cases to be reviewed station-wise.\n2. Festival bandobast scheme to be ready by Friday.", send: true, attendedIds: [staff1] }));
    ok(await saveMeetingAction(null, { title: "Festival bandobast briefing", agenda: "Points, reporting times, equipment", location: "Conference hall", startsAt: ist(1, "10:30"), endsAt: ist(1, "11:30"), remindMinutes: 60, participantIds: [staff1] }));
    ok(await saveAppointmentAction(null, { visitorName: "Ravi Kumar (demo)", visitorPhone: "9876500001", purpose: "Petition regarding a land dispute", scheduledAt: ist(0, "15:00"), notes: null }));
    ok(await saveNoteAction(null, { title: "Festival", body: "Confirm barricade count with Traffic PS.", color: "yellow", pinned: true }));
    ok(await saveNoteAction(null, { title: null, body: "Ask Accounts for the TA bills of last month's bandobast.", color: "blue", pinned: false }));

    const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(plans);
    expect(n!.n).toBe(2);
    console.log(`Demo data loaded: completed plan ${done.planId}, sourcing plan ${mid.planId}.`);
  } finally {
    await pool.end();
  }
});
