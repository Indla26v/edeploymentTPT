import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { listPlans } from "@/lib/queries/plans";
import { PlansList } from "../plans-list";

export const metadata: Metadata = { title: "Completed plans" };

export default function CompletedPlansPage() {
  return (
    <ListPage title="Completed plans" breadcrumb={[{ label: "Plans", href: "/plans" }]} description="Finished bandobasts — reuse one to start a new plan quickly.">
      <Suspense fallback={<Skeleton className="h-[420px] rounded-2xl" />}>
        <Completed />
      </Suspense>
    </ListPage>
  );
}

async function Completed() {
  await connection();
  const user = await requireUser();
  if (!can(user, "plans.view")) return <AccessDenied />;
  return <PlansList rows={await listPlans(user, "completed")} role={user.activeRole} canInitiate={false} />;
}
