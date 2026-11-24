import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { NotificationsMenu } from "./notifications-menu";

export async function NotificationsBell({ userId }: { userId: string }) {
  const db = getDb();
  const [items, [count]] = await Promise.all([
    db
      .select({ id: notifications.id, title: notifications.title, body: notifications.body, href: notifications.href, kind: notifications.kind, readAt: notifications.readAt, createdAt: notifications.createdAt })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(8),
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  ]);
  return (
    <NotificationsMenu
      unread={count?.n ?? 0}
      items={items.map((i) => ({ ...i, read: !!i.readAt, createdAt: i.createdAt.toISOString(), readAt: undefined }))}
    />
  );
}
