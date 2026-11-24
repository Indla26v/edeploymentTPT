import "server-only";

import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { CurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { getDb } from "@/lib/db";
import { appointments, departments, meetingParticipants, meetings, notes, taskAssignees, taskAttachments, taskUpdates, tasks, users } from "@/lib/db/schema";
import { misSummary, personWise } from "@/lib/office/mis";
import { officeStaff, officeUnit } from "@/lib/office/server";

const creator = alias(users, "creator");

/** Tasks of the unit (Office Manager) or assigned to me (employee). */
export async function listTasks(user: CurrentUser) {
  const db = getDb();
  const unitId = officeUnit(user);
  const manager = can(user, "office.tasks.manage");
  const rows = await db
    .select({ t: tasks, department: departments.name, creator: creator.name })
    .from(tasks)
    .leftJoin(departments, eq(departments.id, tasks.departmentId))
    .leftJoin(creator, eq(creator.id, tasks.createdBy))
    .where(and(eq(tasks.unitId, unitId), manager ? sql`true` : sql`${tasks.id} in (select task_id from task_assignees where user_id = ${user.id})`))
    .orderBy(desc(tasks.createdAt));
  const ids = rows.map((r) => r.t.id);
  const ass = ids.length ? await db.select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId, respondedAt: taskAssignees.respondedAt, name: users.name }).from(taskAssignees).innerJoin(users, eq(users.id, taskAssignees.userId)).where(inArray(taskAssignees.taskId, ids)) : [];
  return rows.map((r) => ({ ...r.t, department: r.department, creator: r.creator, assignees: ass.filter((a) => a.taskId === r.t.id) }));
}

export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

export async function getTaskDetail(user: CurrentUser, taskId: string) {
  const db = getDb();
  const [t] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.unitId, officeUnit(user)))).limit(1);
  if (!t) return null;
  const [updates, files] = await Promise.all([
    db.select({ id: taskUpdates.id, kind: taskUpdates.kind, note: taskUpdates.note, createdAt: taskUpdates.createdAt, by: users.name }).from(taskUpdates).leftJoin(users, eq(users.id, taskUpdates.userId)).where(eq(taskUpdates.taskId, t.id)).orderBy(asc(taskUpdates.createdAt)),
    db.select().from(taskAttachments).where(eq(taskAttachments.taskId, t.id)),
  ]);
  return { updates, files };
}

export async function officeOptions(user: CurrentUser) {
  const db = getDb();
  const unitId = officeUnit(user);
  const [staff, depts] = await Promise.all([officeStaff(db, unitId), db.select({ id: departments.id, name: departments.name }).from(departments).where(eq(departments.unitId, unitId)).orderBy(asc(departments.name))]);
  return { staff, departments: depts };
}

/** Meetings in a date window; employees see only meetings they're invited to. */
export async function listMeetings(user: CurrentUser, from: Date, to: Date) {
  const db = getDb();
  const unitId = officeUnit(user);
  const manager = can(user, "office.meetings.manage");
  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.unitId, unitId), gte(meetings.startsAt, from), lt(meetings.startsAt, to), manager ? sql`true` : sql`${meetings.id} in (select meeting_id from meeting_participants where user_id = ${user.id})`))
    .orderBy(asc(meetings.startsAt));
  const ids = rows.map((m) => m.id);
  const ps = ids.length ? await db.select({ meetingId: meetingParticipants.meetingId, userId: meetingParticipants.userId, attended: meetingParticipants.attended, name: users.name }).from(meetingParticipants).innerJoin(users, eq(users.id, meetingParticipants.userId)).where(inArray(meetingParticipants.meetingId, ids)) : [];
  return rows.map((m) => ({ ...m, participants: ps.filter((p) => p.meetingId === m.id) }));
}

export type MeetingRow = Awaited<ReturnType<typeof listMeetings>>[number];

export async function listAppointments(user: CurrentUser) {
  const db = getDb();
  return db
    .select({ a: appointments, allottedName: users.name, taskStatus: tasks.status })
    .from(appointments)
    .leftJoin(users, eq(users.id, appointments.allottedTo))
    .leftJoin(tasks, eq(tasks.id, appointments.taskId))
    .where(eq(appointments.unitId, officeUnit(user)))
    .orderBy(desc(appointments.scheduledAt));
}

export async function listNotes(user: CurrentUser) {
  return getDb().select().from(notes).where(eq(notes.userId, user.id)).orderBy(desc(notes.pinned), desc(notes.updatedAt));
}

/** MIS: pending buckets + person-wise analysis for the unit's tasks (optionally since a date). */
export async function getMis(user: CurrentUser, since: Date | null, now = new Date()) {
  const db = getDb();
  const unitId = officeUnit(user);
  const rows = await db.select().from(tasks).where(and(eq(tasks.unitId, unitId), since ? gte(tasks.createdAt, since) : sql`true`));
  const ass = rows.length ? await db.select().from(taskAssignees).where(inArray(taskAssignees.taskId, rows.map((r) => r.id))) : [];
  const mis = rows.map((t) => ({ id: t.id, status: t.status, createdAt: t.createdAt, closedAt: t.closedAt, dueDate: t.dueDate, assignees: ass.filter((a) => a.taskId === t.id).map((a) => ({ userId: a.userId, respondedAt: a.respondedAt })) }));
  const staff = await officeStaff(db, unitId);
  const people = personWise(mis).map((p) => ({ ...p, name: staff.find((s) => s.id === p.userId)?.name ?? "Former staff" }));
  const byDept = await db.execute<{ name: string | null; open: number; closed: number }>(sql`
    select d.name, count(*) filter (where t.status <> 'closed')::int open, count(*) filter (where t.status = 'closed')::int closed
    from tasks t left join departments d on d.id = t.department_id where t.unit_id = ${unitId} ${since ? sql`and t.created_at >= ${since.toISOString()}::timestamptz` : sql``}
    group by d.name order by 2 desc`);
  return { summary: misSummary(mis, now), people, byDepartment: byDept.rows };
}
