import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { asc } from "drizzle-orm";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/lib/db";
import { permissions, rolePermissions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import type { Role } from "@/lib/authz/roles";
import { PermissionMatrix } from "./matrix";

export const metadata: Metadata = { title: "Roles & permissions" };

export default function RolesPage() {
  return (
    <ListPage
      title="Roles & permissions"
      breadcrumb={[{ label: "Administration" }]}
      description="Which modules each role can use. Scope (unit, station, plan) always comes from the user's role assignment."
    >
      <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
        <Matrix />
      </Suspense>
    </ListPage>
  );
}

async function Matrix() {
  await connection();
  const user = await requireUser();
  if (!can(user, "admin.roles.manage")) return <AccessDenied />;
  const db = getDb();
  const [perms, grants] = await Promise.all([db.select().from(permissions).orderBy(asc(permissions.module)), db.select().from(rolePermissions)]);
  const order = new Map<string, number>();
  const { PERMISSIONS } = await import("@/lib/authz/permissions");
  PERMISSIONS.forEach((p, i) => order.set(p.key, i));
  perms.sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));
  return <PermissionMatrix permissions={perms} grants={grants.map((g) => ({ role: g.role as Role, key: g.permissionKey }))} />;
}
