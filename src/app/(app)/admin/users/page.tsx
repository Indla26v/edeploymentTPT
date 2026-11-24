import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { assignableRoles } from "@/lib/authz/assignable";
import { grantableScopes, listUsers } from "@/lib/queries/users";
import { UsersClient } from "./users-client";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <ListPage title="Users" breadcrumb={[{ label: "Administration" }]} description="Logins, roles and access. New users get a one-time password and must change it at first sign-in.">
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <UsersData />
      </Suspense>
    </ListPage>
  );
}

async function UsersData() {
  await connection();
  const user = await requireUser();
  if (!can(user, "admin.users.manage")) return <AccessDenied />;
  const [rows, scopes] = await Promise.all([listUsers(user), grantableScopes(user)]);
  return <UsersClient rows={rows} scopes={scopes} grantable={assignableRoles(user.activeRole)} selfId={user.id} />;
}
