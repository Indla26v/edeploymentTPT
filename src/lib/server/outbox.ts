import "server-only";

import { and, asc, eq, lte } from "drizzle-orm";

import type { DbOrTx } from "../auth/accounts";
import { notificationsOutbox, users } from "../db/schema";

/**
 * Message delivery adapter. Only the console adapter exists until an SMS / WhatsApp provider is configured
 * (OUTBOX_PROVIDER); nothing leaves the system without one.
 */
export type OutboxMessage = { id: string; channel: string; template: string; payload: unknown; toPhone: string | null; toName: string | null };
type Adapter = (m: OutboxMessage) => Promise<void>;

const consoleAdapter: Adapter = async (m) => {
  if (process.env.NODE_ENV !== "test") console.info(`[outbox:${m.channel}] ${m.template} → ${m.toName ?? m.toPhone ?? "unknown"}`, JSON.stringify(m.payload));
};

function adapter(): Adapter {
  switch (process.env.OUTBOX_PROVIDER) {
    case undefined:
    case "":
    case "console":
      return consoleAdapter;
    default:
      throw new Error(`Outbox provider "${process.env.OUTBOX_PROVIDER}" is not implemented yet.`);
  }
}

/** Sends due messages (retrying failures with backoff). Returns counts. */
export async function drainOutbox(db: DbOrTx, limit = 100, now = new Date()): Promise<{ sent: number; failed: number }> {
  const send = adapter();
  const rows = await db
    .select({ id: notificationsOutbox.id, channel: notificationsOutbox.channel, template: notificationsOutbox.template, payload: notificationsOutbox.payload, toPhone: notificationsOutbox.toPhone, attemptCount: notificationsOutbox.attemptCount, toName: users.name })
    .from(notificationsOutbox)
    .leftJoin(users, eq(users.id, notificationsOutbox.toUserId))
    .where(and(eq(notificationsOutbox.status, "pending"), lte(notificationsOutbox.nextAttemptAt, now)))
    .orderBy(asc(notificationsOutbox.createdAt))
    .limit(limit);
  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await send(r);
      await db.update(notificationsOutbox).set({ status: "sent", sentAt: now, attemptCount: r.attemptCount + 1 }).where(eq(notificationsOutbox.id, r.id));
      sent++;
    } catch (e) {
      const attempts = r.attemptCount + 1;
      await db
        .update(notificationsOutbox)
        .set({ attemptCount: attempts, lastError: (e as Error).message.slice(0, 500), status: attempts >= 5 ? "failed" : "pending", nextAttemptAt: new Date(now.getTime() + 2 ** attempts * 60e3) })
        .where(eq(notificationsOutbox.id, r.id));
      failed++;
    }
  }
  return { sent, failed };
}
