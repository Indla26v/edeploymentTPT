import { timingSafeEqual } from "node:crypto";

import { getDb } from "@/lib/db";
import { absentAlerts } from "@/lib/execution/alerts";
import { remindMeetings } from "@/lib/office/server";
import { drainOutbox } from "@/lib/server/outbox";
import { autoAcceptDue, remindDue } from "@/lib/sourcing/server";

/**
 * Periodic tick: auto-accept overdue force requests, send reminders, absentee alerts on live plans,
 * then drain the message outbox.
 * Protected by CRON_SECRET (Vercel Cron sends it as a Bearer token). Run locally with `pnpm cron:tick`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = getDb();
  const now = new Date();
  const autoAccepted = await db.transaction((tx) => autoAcceptDue(tx, now));
  const reminded = await db.transaction((tx) => remindDue(tx, now));
  const absent = await db.transaction((tx) => absentAlerts(tx, now));
  const meetingReminders = await db.transaction((tx) => remindMeetings(tx, now));
  const outbox = await drainOutbox(db, 200, now);
  return Response.json({ ok: true, at: now.toISOString(), autoAccepted, reminded, absent, meetingReminders, outbox });
}
