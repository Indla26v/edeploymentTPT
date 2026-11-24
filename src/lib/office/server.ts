import "server-only";

import { and, eq, inArray, isNull, lte, gt, sql } from "drizzle-orm";

import type { DbOrTx } from "../auth/accounts";
import type { CurrentUser } from "../auth/session";
import { UserError } from "../authz/authorize";
import { meetingParticipants, meetings, roleAssignments, users } from "../db/schema";
import { fmtDateTime } from "../format";
import { notifyUser, queueMessage } from "../server/notify";

export function officeUnit(user: CurrentUser): string {
  if (!user.unitId) throw new UserError("Switch to a unit role to use the office module.");
  return user.unitId;
}

/** Office staff of a unit: users holding the Office Manager or Employee role there. */
export async function officeStaff(db: DbOrTx, unitId: string) {
  const rows = await db
    .selectDistinct({ id: users.id, name: users.name, username: users.username })
    .from(roleAssignments)
    .innerJoin(users, eq(users.id, roleAssignments.userId))
    .where(and(eq(roleAssignments.unitId, unitId), inArray(roleAssignments.role, ["OFFICE_MANAGER", "EMPLOYEE"]), eq(roleAssignments.isActive, true), eq(users.isActive, true)));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function assertStaff(db: DbOrTx, unitId: string, ids: string[]) {
  if (!ids.length) return;
  const staff = new Set((await officeStaff(db, unitId)).map((s) => s.id));
  if (ids.some((i) => !staff.has(i))) throw new UserError("Choose office staff of this unit.");
}

/** Queue meeting reminders that are due (once per meeting). */
export async function remindMeetings(db: DbOrTx, now = new Date()): Promise<number> {
  const due = await db
    .update(meetings)
    .set({ remindedAt: now })
    .where(and(eq(meetings.status, "scheduled"), isNull(meetings.remindedAt), sql`${meetings.remindMinutes} is not null`, lte(sql`${meetings.startsAt} - make_interval(mins => ${meetings.remindMinutes})`, now), gt(meetings.startsAt, now)))
    .returning({ id: meetings.id, title: meetings.title, startsAt: meetings.startsAt, location: meetings.location });
  for (const m of due) {
    const ps = await db.select({ userId: meetingParticipants.userId }).from(meetingParticipants).where(eq(meetingParticipants.meetingId, m.id));
    for (const p of ps) {
      await notifyUser(db, p.userId, { title: `Meeting at ${fmtDateTime(m.startsAt)}: ${m.title}`, body: m.location ?? undefined, href: "/office/meetings", kind: "alert" });
      await queueMessage(db, { template: "meeting.reminder", channel: "whatsapp", toUserId: p.userId, payload: { title: m.title, at: m.startsAt.toISOString(), location: m.location } });
    }
  }
  return due.length;
}
