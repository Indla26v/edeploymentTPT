import { notifications, notificationsOutbox } from "../db/schema";
import type { DbOrTx } from "../auth/accounts";

/** In-app notification (header bell). Call inside the mutation's transaction. */
export async function notifyUser(
  db: DbOrTx,
  userId: string,
  n: { title: string; body?: string; href?: string; kind?: "info" | "action" | "alert" | "success" },
) {
  await db.insert(notifications).values({ userId, title: n.title, body: n.body ?? null, href: n.href ?? null, kind: n.kind ?? "info" });
}

/**
 * Queue an outbound SMS / WhatsApp message. Nothing is sent here: the cron tick drains the outbox through the
 * configured provider (console in development). Writing in the same transaction means a rolled-back change
 * never sends a message.
 */
export async function queueMessage(
  db: DbOrTx,
  m: { template: string; payload?: Record<string, unknown>; toUserId?: string | null; toPhone?: string | null; channel?: "sms" | "whatsapp" },
) {
  await db.insert(notificationsOutbox).values({
    template: m.template,
    payload: m.payload ?? {},
    toUserId: m.toUserId ?? null,
    toPhone: m.toPhone ?? null,
    channel: m.channel ?? "sms",
  });
}
