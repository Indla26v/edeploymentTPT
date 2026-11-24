import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { listTasks, officeOptions } from "@/lib/queries/office";
import { TasksClient } from "./tasks-client";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <ListPage title="Tasks" breadcrumb={[{ label: "Office" }]} description="Assign, report action taken, verify and close.">
      <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
        <Tasks />
      </Suspense>
    </ListPage>
  );
}

async function Tasks() {
  await connection();
  const user = await requireUser();
  if (!can(user, "office.tasks.work") && !can(user, "office.tasks.manage")) return <AccessDenied />;
  if (!user.unitId) return <AccessDenied message="Switch to a unit role to use the office module." />;
  const [rows, options] = await Promise.all([listTasks(user), officeOptions(user)]);
  return <TasksClient rows={rows} options={options} manager={can(user, "office.tasks.manage")} me={user.id} />;
}
