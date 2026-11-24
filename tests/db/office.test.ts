import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

import "../support/act-as";
import { actAs, ok } from "../support/plan-fixtures";
import { eq, like, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import "../../scripts/env";
import { seed } from "../../scripts/seed";
import { createDb, type Db } from "@/lib/db/client";
import { notificationsOutbox, taskAssignees, tasks, users } from "@/lib/db/schema";
import { remindMeetings } from "@/lib/office/server";
import { actionTakenAction, allotAppointmentAction, createTaskAction, saveAppointmentAction, saveMeetingAction, saveMomAction, verifyTaskAction } from "@/app/(app)/office/actions";
import { getMis } from "@/lib/queries/office";
import { actor } from "../support/act-as";

describe.skipIf(!url)("office manager", () => {
  let db: Db;
  let end: () => Promise<void>;
  let staff1 = "";
  let om = "";
  const uid = async (u: string) => (await db.select({ id: users.id }).from(users).where(eq(users.username, u)))[0]!.id;

  beforeAll(async () => {
    const c = createDb(url!, { max: 2 });
    db = c.db;
    end = () => c.pool.end();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(url!);
    staff1 = await uid("staff1");
    om = await uid("om");
  }, 60_000);
  afterAll(async () => end?.());

  it("task flow: OM assigns → employee reports action → OM reopens → action again → OM verifies and closes", async () => {
    await actAs(db, "om");
    expect(await createTaskAction({ title: "Prepare returns", priority: "high", departmentId: null, newDepartment: "Accounts", assigneeIds: [await uid("sp")] })).toMatchObject({ ok: false, error: expect.stringMatching(/office staff/) });
    const { id } = ok(await createTaskAction({ title: "Prepare monthly crime returns", priority: "high", departmentId: null, newDepartment: "Crime", dueDate: "2026-12-05", assigneeIds: [staff1] }));
    expect(await actionTakenAction(id, "done")).toMatchObject({ ok: false, error: expect.stringMatching(/assigned to/) }); // OM isn't an assignee
    await actAs(db, "staff1");
    expect(await verifyTaskAction(id, { decision: "close", remarks: "ok" })).toMatchObject({ ok: false, error: expect.stringMatching(/permission/) });
    ok(await actionTakenAction(id, "Draft prepared and shared"));
    const [a1] = await db.select().from(taskAssignees).where(eq(taskAssignees.taskId, id));
    expect(a1!.respondedAt).toBeTruthy();
    await actAs(db, "om");
    ok(await verifyTaskAction(id, { decision: "reopen", remarks: "Add station-wise totals" }));
    expect((await db.select().from(tasks).where(eq(tasks.id, id)))[0]!.status).toBe("reopened");
    await actAs(db, "staff1");
    ok(await actionTakenAction(id, "Totals added"));
    // First response time is kept.
    expect((await db.select().from(taskAssignees).where(eq(taskAssignees.taskId, id)))[0]!.respondedAt).toEqual(a1!.respondedAt);
    await actAs(db, "om");
    ok(await verifyTaskAction(id, { decision: "close", remarks: "Verified" }));
    const mis = await getMis(actor.current!, null);
    expect(mis.summary).toMatchObject({ completed: 1, pending: 0 });
    expect(mis.people.find((p) => p.userId === staff1)).toMatchObject({ assigned: 1, completed: 1, completionPct: 100 });
  });

  it("meeting reminders are queued once, before the start", async () => {
    await actAs(db, "om");
    const start = new Date(Date.now() + 60 * 60e3);
    ok(await saveMeetingAction(null, { title: "Crime review", agenda: null, location: "Conference hall", startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 3600e3).toISOString(), remindMinutes: 30, participantIds: [staff1, om] }));
    expect(await db.transaction((tx) => remindMeetings(tx, new Date(start.getTime() - 45 * 60e3)))).toBe(0); // too early
    expect(await db.transaction((tx) => remindMeetings(tx, new Date(start.getTime() - 20 * 60e3)))).toBe(1);
    expect(await db.transaction((tx) => remindMeetings(tx, new Date(start.getTime() - 10 * 60e3)))).toBe(0); // only once
    const q = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(notificationsOutbox).where(like(notificationsOutbox.template, "meeting.reminder"));
    expect(q[0]!.n).toBe(2);
  });

  it("minutes are sent to participants; appointments can be allotted as a task", async () => {
    await actAs(db, "om");
    const s = new Date(Date.now() - 2 * 3600e3);
    const { id } = ok(await saveMeetingAction(null, { title: "Weekly", agenda: null, location: null, startsAt: s.toISOString(), endsAt: new Date(s.getTime() + 3600e3).toISOString(), remindMinutes: null, participantIds: [staff1] }));
    ok(await saveMomAction(id, { mom: "1. Returns by Friday", send: true, attendedIds: [staff1] }));
    expect((await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(notificationsOutbox).where(like(notificationsOutbox.template, "meeting.mom")))[0]!.n).toBe(1);
    const a = ok(await saveAppointmentAction(null, { visitorName: "Ravi Kumar", visitorPhone: "9876543210", purpose: "Passport verification", scheduledAt: new Date().toISOString(), notes: null }));
    const { taskId } = ok(await allotAppointmentAction(a.id, { userId: staff1, dueDate: null, instructions: "Verify address" }));
    const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(t!.title).toMatch(/Passport verification — Ravi Kumar/);
    expect(await allotAppointmentAction(a.id, { userId: staff1, dueDate: null, instructions: null })).toMatchObject({ ok: false, error: expect.stringMatching(/Already/) });
  });
});
