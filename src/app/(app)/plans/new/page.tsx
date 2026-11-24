import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { getInitiateOptions } from "@/lib/queries/plans";
import { InitiateWizard } from "../_components/initiate-wizard";
import { EMPTY_PLAN } from "../_components/wizard-data";

export const metadata: Metadata = { title: "Initiate plan" };

export default function NewPlanPage() {
  return (
    <ListPage title="Initiate plan" breadcrumb={[{ label: "Plans", href: "/plans" }]} description="Set up the bandobast and send it to the Component Officers.">
      <Suspense fallback={<Skeleton className="h-[520px] rounded-2xl" />}>
        <NewPlan />
      </Suspense>
    </ListPage>
  );
}

async function NewPlan() {
  await connection();
  const user = await requireUser();
  if (!can(user, "plans.initiate")) return <AccessDenied />;
  return <InitiateWizard initial={EMPTY_PLAN} options={await getInitiateOptions(user)} />;
}
