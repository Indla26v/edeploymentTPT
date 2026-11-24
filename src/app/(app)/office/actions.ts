"use server";

import { refresh } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { UserError, can } from "@/lib/authz/authorize";
import { appointments, departments, meetingParticipants, meetings, notes, taskAssignees, taskAttachments, taskUpdates, tasks } from "@/lib/db/schema";
import { assertStaff, officeUnit } from "@/lib/office/server";
import { mutate, type ActionResult } from "@/lib/server/mutate";
import { notifyUser, queueMessage } from "@/lib/server/notify";
import { saveImage } from "@/lib/storage";
import { getDb } from "@/lib/db";

const id = z.string().uuid();
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);
const iso = z.string().datetime({ offset: true, message: "Enter a date and time" });

type Tx = Parameters<Parameters<typeof mutate>[0]["run"]>[0]["tx"];
type User = Parameters<Parameters<typeof mutate>[0]["run"]>[0]["user"];

async function loadTask(tx: Tx, user: User, taskId: string) {
  const [t] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update").limit(1);
  if (!t || t.unitId !== officeUnit(user)) throw new UserError("That task no longer exists.");
  const assignees = await tx.select().from(taskAssignees).where(eq(taskAssignees.taskId, t.id));
  return { t, assignees };
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

const taskSchema = z.object({
  title: z.string().trim().min(3, "Enter the task").max(200),
  description: optText(4000),
  departmentId: id.nullable(),
  newDepartment: optText(80),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .transform((v) => v || null),
  assigneeIds: z.array(id).min(1, "Assign the task to someone").max(50),
});
export type TaskInput = z.input<typeof taskSchema>;

export async function createTaskAction(input: TaskInput) {
  return mutate({
    permission: "office.tasks.manage",
    schema: taskSchema,
    input,
    message: "Task created and assigned",
    run: async ({ tx, user, data, audit }) => {
      const unitId = officeUnit(user);
      await assertStaff(tx, unitId, data.assigneeIds);
      let departmentId = data.departmentId;
      if (data.newDepartment) {
        const [d] = await tx.insert(departments).values({ unitId, name: data.newDepartment }).onConflictDoUpdate({ target: [departments.unitId, departments.name], set: { name: data.newDepartment } }).returning({ id: departments.id });
        departmentId = d!.id;
      }
      const [t] = await tx.insert(tasks).values({ unitId, title: data.title, description: data.description, departmentId, priority: data.priority, dueDate: data.dueDate, createdBy: user.id }).returning({ id: tasks.id });
      await tx.insert(taskAssignees).values(data.assigneeIds.map((u) => ({ taskId: t!.id, userId: u })));
      for (const u of data.assigneeIds) {
        if (u === user.id) continue;
        await notifyUser(tx, u, { title: `New task: ${data.title}`, body: data.dueDate ? `Due ${data.dueDate}` : undefined, href: `/office/tasks?task=${t!.id}`, kind: "action" });
        await queueMessage(tx, { template: "task.assigned", toUserId: u, payload: { title: data.title, due: data.dueDate } });
      }
      await audit({ action: "task.create", entity: "task", entityId: t!.id, after: data });
      refresh();
      return { id: t!.id };
    },
  });
}

/** Assignee reports what was done. The Office Manager then verifies and closes (or reopens). */
export async function actionTakenAction(taskId: string, note: string) {
  return mutate({
    permission: "office.tasks.work",
    schema: z.object({ note: z.string().trim().min(3, "Describe the action taken").max(2000) }),
    input: { note },
    message: "Action recorded — sent for verification",
    run: async ({ tx, user, data, audit }) => {
      const { t, assignees } = await loadTask(tx, user, taskId);
      const me = assignees.find((a) => a.userId === user.id);
      if (!me) throw new UserError("Only the people this task is assigned to can report action.");
      if (t.status === "closed") throw new UserError("This task is already closed.");
      const now = new Date();
      await tx.insert(taskUpdates).values({ taskId: t.id, userId: user.id, kind: "action_taken", note: data.note, createdAt: now });
      if (!me.respondedAt) await tx.update(taskAssignees).set({ respondedAt: now }).where(and(eq(taskAssignees.taskId, t.id), eq(taskAssignees.userId, user.id)));
      await tx.update(tasks).set({ status: "action_taken" }).where(eq(tasks.id, t.id));
      if (t.createdBy && t.createdBy !== user.id) await notifyUser(tx, t.createdBy, { title: `Action taken: ${t.title}`, body: data.note.slice(0, 140), href: `/office/tasks?task=${t.id}`, kind: "action" });
      await audit({ action: "task.action_taken", entity: "task", entityId: t.id, after: data });
      refresh();
    },
  });
}

export async function commentTaskAction(taskId: string, note: string) {
  return mutate({
    permission: "office.tasks.work",
    schema: z.object({ note: z.string().trim().min(1).max(2000) }),
    input: { note },
    message: "Comment added",
    run: async ({ tx, user, data }) => {
      const { t, assignees } = await loadTask(tx, user, taskId);
      if (!assignees.some((a) => a.userId === user.id) && !can(user, "office.tasks.manage")) throw new UserError("You aren't on this task.");
      await tx.insert(taskUpdates).values({ taskId: t.id, userId: user.id, kind: "comment", note: data.note });
      refresh();
    },
  });
}

/** Office Manager verifies: close with remarks, or reopen with what's still needed. */
export async function verifyTaskAction(taskId: string, input: { decision: "close" | "reopen"; remarks: string }) {
  return mutate({
    permission: "office.tasks.manage",
    schema: z.object({ decision: z.enum(["close", "reopen"]), remarks: z.string().trim().min(3, "Add remarks").max(2000) }),
    input,
    message: input.decision === "close" ? "Verified and closed" : "Reopened — assignees have been told",
    run: async ({ tx, user, data, audit }) => {
      const { t, assignees } = await loadTask(tx, user, taskId);
      if (t.status === "closed" && data.decision === "close") throw new UserError("Already closed.");
      const now = new Date();
      await tx.insert(taskUpdates).values({ taskId: t.id, userId: user.id, kind: data.decision === "close" ? "closed" : "reopened", note: data.remarks, createdAt: now });
      await tx
        .update(tasks)
        .set(data.decision === "close" ? { status: "closed", closedAt: now, closedBy: user.id } : { status: "reopened", closedAt: null, closedBy: null })
        .where(eq(tasks.id, t.id));
      for (const a of assignees) if (a.userId !== user.id) await notifyUser(tx, a.userId, { title: `${data.decision === "close" ? "Closed" : "Reopened"}: ${t.title}`, body: data.remarks, href: `/office/tasks?task=${t.id}`, kind: data.decision === "close" ? "success" : "action" });
      await audit({ action: `task.${data.decision}`, entity: "task", entityId: t.id, after: data });
      refresh();
    },
  });
}

export async function addTaskAttachmentAction(taskId: string, formData: FormData): Promise<ActionResult<void>> {
  const user = await requireUser();
  if (!can(user, "office.tasks.work")) return { ok: false, error: "You don't have permission to do this." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image." };
  let url: string;
  try {
    url = await saveImage(file, "tasks");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  return mutate({
    permission: "office.tasks.work",
    schema: z.object({}),
    input: {},
    message: "Attachment added",
    run: async ({ tx, user }) => {
      const { t } = await loadTask(tx, user, taskId);
      await tx.insert(taskAttachments).values({ taskId: t.id, url, name: file.name.slice(0, 120), uploadedBy: user.id });
      refresh();
    },
  });
}

// ─── Meetings ─────────────────────────────────────────────────────────────────

const meetingSchema = z
  .object({
    title: z.string().trim().min(3, "Enter the meeting title").max(200),
    agenda: optText(4000),
    location: optText(200),
    startsAt: iso,
    endsAt: iso,
    remindMinutes: z.number().int().min(5).max(2880).nullable(),
    participantIds: z.array(id).min(1, "Add participants").max(100),
  })
  .refine((m) => new Date(m.endsAt) > new Date(m.startsAt), { path: ["endsAt"], message: "End must be after the start" });
export type MeetingInput = z.input<typeof meetingSchema>;

export async function saveMeetingAction(meetingId: string | null, input: MeetingInput) {
  return mutate({
    permission: "office.meetings.manage",
    schema: meetingSchema,
    input,
    message: meetingId ? "Meeting updated" : "Meeting scheduled — participants have been told",
    run: async ({ tx, user, data, audit }) => {
      const unitId = officeUnit(user);
      await assertStaff(tx, unitId, data.participantIds);
      const cols = { title: data.title, agenda: data.agenda, location: data.location, startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt), remindMinutes: data.remindMinutes };
      let mid = meetingId;
      if (mid) {
        const [m] = await tx.select().from(meetings).where(eq(meetings.id, mid)).limit(1);
        if (!m || m.unitId !== unitId) throw new UserError("That meeting no longer exists.");
        await tx.update(meetings).set({ ...cols, remindedAt: m.startsAt.getTime() !== cols.startsAt.getTime() ? null : m.remindedAt }).where(eq(meetings.id, mid));
        await tx.delete(meetingParticipants).where(eq(meetingParticipants.meetingId, mid));
      } else {
        const [m] = await tx.insert(meetings).values({ ...cols, unitId, organizerId: user.id }).returning({ id: meetings.id });
        mid = m!.id;
      }
      await tx.insert(meetingParticipants).values([...new Set(data.participantIds)].map((u) => ({ meetingId: mid!, userId: u })));
      if (!meetingId) for (const u of data.participantIds) if (u !== user.id) await notifyUser(tx, u, { title: `Meeting: ${data.title}`, body: data.location ?? undefined, href: "/office/meetings", kind: "info" });
      await audit({ action: meetingId ? "meeting.update" : "meeting.create", entity: "meeting", entityId: mid, after: data });
      refresh();
      return { id: mid! };
    },
  });
}

export async function meetingStatusAction(meetingId: string, status: "held" | "cancelled" | "scheduled") {
  return mutate({
    permission: "office.meetings.manage",
    schema: z.object({ status: z.enum(["held", "cancelled", "scheduled"]) }),
    input: { status },
    message: status === "cancelled" ? "Meeting cancelled" : "Saved",
    run: async ({ tx, user, data, audit }) => {
      const [m] = await tx.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
      if (!m || m.unitId !== officeUnit(user)) throw new UserError("That meeting no longer exists.");
      await tx.update(meetings).set({ status: data.status }).where(eq(meetings.id, m.id));
      if (data.status === "cancelled") {
        const ps = await tx.select().from(meetingParticipants).where(eq(meetingParticipants.meetingId, m.id));
        for (const p of ps) if (p.userId !== user.id) await notifyUser(tx, p.userId, { title: `Cancelled: ${m.title}`, href: "/office/meetings", kind: "alert" });
      }
      await audit({ action: `meeting.${data.status}`, entity: "meeting", entityId: m.id });
      refresh();
    },
  });
}

/** Save the minutes; with send = true they go to every participant. */
export async function saveMomAction(meetingId: string, input: { mom: string; send: boolean; attendedIds: string[] }) {
  return mutate({
    permission: "office.meetings.manage",
    schema: z.object({ mom: z.string().trim().min(3, "Write the minutes").max(20000), send: z.boolean(), attendedIds: z.array(id) }),
    input,
    message: input.send ? "Minutes sent to participants" : "Minutes saved",
    run: async ({ tx, user, data, audit }) => {
      const [m] = await tx.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
      if (!m || m.unitId !== officeUnit(user)) throw new UserError("That meeting no longer exists.");
      await tx.update(meetings).set({ mom: data.mom, status: "held", ...(data.send ? { momSentAt: new Date() } : {}) }).where(eq(meetings.id, m.id));
      const ps = await tx.select().from(meetingParticipants).where(eq(meetingParticipants.meetingId, m.id));
      await tx.update(meetingParticipants).set({ attended: false }).where(eq(meetingParticipants.meetingId, m.id));
      if (data.attendedIds.length) await tx.update(meetingParticipants).set({ attended: true }).where(and(eq(meetingParticipants.meetingId, m.id), inArray(meetingParticipants.userId, data.attendedIds)));
      if (data.send) {
        for (const p of ps) {
          if (p.userId === user.id) continue;
          await notifyUser(tx, p.userId, { title: `Minutes: ${m.title}`, body: data.mom.slice(0, 160), href: "/office/meetings", kind: "info" });
          await queueMessage(tx, { template: "meeting.mom", toUserId: p.userId, payload: { title: m.title } });
        }
      }
      await audit({ action: data.send ? "meeting.mom_send" : "meeting.mom_save", entity: "meeting", entityId: m.id });
      refresh();
    },
  });
}

// ─── Appointments ─────────────────────────────────────────────────────────────

const apptSchema = z.object({
  visitorName: z.string().trim().min(2, "Enter the visitor's name").max(120),
  visitorPhone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[6-9]\d{9}$/.test(v), "Enter a 10-digit mobile number"),
  purpose: z.string().trim().min(3, "Enter the purpose").max(500),
  scheduledAt: iso,
  notes: optText(2000),
});
export type AppointmentInput = z.input<typeof apptSchema>;

export async function saveAppointmentAction(appointmentId: string | null, input: AppointmentInput) {
  return mutate({
    permission: "office.appointments.manage",
    schema: apptSchema,
    input,
    message: appointmentId ? "Appointment updated" : "Appointment added",
    run: async ({ tx, user, data, audit }) => {
      const unitId = officeUnit(user);
      const cols = { ...data, scheduledAt: new Date(data.scheduledAt) };
      let aid = appointmentId;
      if (aid) {
        const [a] = await tx.select().from(appointments).where(eq(appointments.id, aid)).limit(1);
        if (!a || a.unitId !== unitId) throw new UserError("That appointment no longer exists.");
        await tx.update(appointments).set(cols).where(eq(appointments.id, aid));
      } else {
        const [a] = await tx.insert(appointments).values({ ...cols, unitId, createdBy: user.id }).returning({ id: appointments.id });
        aid = a!.id;
      }
      await audit({ action: appointmentId ? "appointment.update" : "appointment.create", entity: "appointment", entityId: aid, after: data });
      refresh();
      return { id: aid! };
    },
  });
}

export async function appointmentStatusAction(appointmentId: string, status: "met" | "no_show" | "cancelled" | "scheduled") {
  return mutate({
    permission: "office.appointments.manage",
    schema: z.object({ status: z.enum(["met", "no_show", "cancelled", "scheduled"]) }),
    input: { status },
    message: "Saved",
    run: async ({ tx, user, data, audit }) => {
      const [a] = await tx.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
      if (!a || a.unitId !== officeUnit(user)) throw new UserError("That appointment no longer exists.");
      await tx.update(appointments).set({ status: data.status }).where(eq(appointments.id, a.id));
      await audit({ action: `appointment.${data.status}`, entity: "appointment", entityId: a.id });
      refresh();
    },
  });
}

/** Allot a visitor's request to a staff member — becomes a task assigned to them. */
export async function allotAppointmentAction(appointmentId: string, input: { userId: string; dueDate: string | null; instructions: string | null }) {
  return mutate({
    permission: "office.appointments.manage",
    schema: z.object({ userId: id, dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), instructions: optText(2000) }),
    input,
    message: "Allotted — a task was created",
    run: async ({ tx, user, data, audit }) => {
      const unitId = officeUnit(user);
      const [a] = await tx.select().from(appointments).where(eq(appointments.id, appointmentId)).for("update").limit(1);
      if (!a || a.unitId !== unitId) throw new UserError("That appointment no longer exists.");
      if (a.taskId) throw new UserError("Already allotted.");
      await assertStaff(tx, unitId, [data.userId]);
      const [t] = await tx
        .insert(tasks)
        .values({ unitId, title: `${a.purpose} — ${a.visitorName}`, description: [data.instructions, a.visitorPhone ? `Visitor mobile: ${a.visitorPhone}` : null].filter(Boolean).join("\n") || null, priority: "normal", dueDate: data.dueDate, appointmentId: a.id, createdBy: user.id })
        .returning({ id: tasks.id });
      await tx.insert(taskAssignees).values({ taskId: t!.id, userId: data.userId });
      await tx.update(appointments).set({ allottedTo: data.userId, taskId: t!.id, status: a.status === "scheduled" ? "met" : a.status }).where(eq(appointments.id, a.id));
      if (data.userId !== user.id) await notifyUser(tx, data.userId, { title: `New task from a visitor: ${a.purpose}`, href: `/office/tasks?task=${t!.id}`, kind: "action" });
      await audit({ action: "appointment.allot", entity: "appointment", entityId: a.id, after: { ...data, taskId: t!.id } });
      refresh();
      return { taskId: t!.id };
    },
  });
}

// ─── Notes (personal) ─────────────────────────────────────────────────────────

const noteSchema = z.object({ title: optText(120), body: z.string().trim().min(1, "Write something").max(10000), color: z.enum(["yellow", "blue", "green", "pink", "gray"]), pinned: z.boolean() });

export async function saveNoteAction(noteId: string | null, input: z.input<typeof noteSchema>) {
  return mutate({
    permission: "office.notes",
    schema: noteSchema,
    input,
    run: async ({ tx, user, data }) => {
      if (noteId) {
        const r = await tx.update(notes).set(data).where(and(eq(notes.id, noteId), eq(notes.userId, user.id))).returning({ id: notes.id });
        if (!r.length) throw new UserError("That note no longer exists.");
        refresh();
        return { id: noteId };
      }
      const [n] = await tx.insert(notes).values({ ...data, userId: user.id }).returning({ id: notes.id });
      refresh();
      return { id: n!.id };
    },
  });
}

export async function deleteNoteAction(noteId: string) {
  return mutate({
    permission: "office.notes",
    schema: z.object({}),
    input: {},
    message: "Note deleted",
    run: async ({ tx, user }) => {
      await tx.delete(notes).where(and(eq(notes.id, noteId), eq(notes.userId, user.id)));
      refresh();
    },
  });
}

export async function staffOptionsAction() {
  const user = await requireUser();
  const { officeStaff } = await import("@/lib/office/server");
  return officeStaff(getDb(), officeUnit(user));
}

export async function taskDetailAction(taskId: string) {
  const user = await requireUser();
  if (!can(user, "office.tasks.work") && !can(user, "office.tasks.manage")) return null;
  const { getTaskDetail } = await import("@/lib/queries/office");
  return getTaskDetail(user, taskId);
}
