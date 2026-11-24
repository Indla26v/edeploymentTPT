"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { notifications, sessions } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getAuth } from "@/lib/auth/server";
import { ROLES, type Role } from "@/lib/authz/roles";
import { writeAudit } from "@/lib/server/mutate";

export async function logoutAction() {
  const user = await getCurrentUser();
  const h = await headers();
  await getAuth().api.signOut({ headers: h });
  if (user) await writeAudit(getDb(), { actorUserId: user.id, action: "logout", entity: "user", entityId: user.id });
  redirect("/login");
}

/** Switch the role the user is acting as. Authorization re-reads assignments on every request. */
export async function switchRoleAction(role: Role) {
  const user = await getCurrentUser();
  if (!user || !(ROLES as readonly string[]).includes(role) || !user.roles.includes(role)) return;
  await getDb().update(sessions).set({ activeRole: role }).where(eq(sessions.token, user.sessionToken));
  await writeAudit(getDb(), { actorUserId: user.id, actingRole: role, action: "role.switch", entity: "user", entityId: user.id });
}

export async function markNotificationsReadAction() {
  const user = await getCurrentUser();
  if (!user) return;
  await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  refresh();
}
