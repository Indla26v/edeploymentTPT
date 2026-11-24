import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { StageTracker } from "@/components/stage-tracker";
import { StatusPill, type Status } from "@/components/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { guarded } from "@/lib/plans/guard";
import { getConsolidation } from "@/lib/queries/plans";
import { planStages, type PlanStatus } from "@/lib/workflow/plan";
import { ConsolidateBoard } from "./consolidate-board";

export const metadata: Metadata = { title: "Consolidate plan" };

export default function ConsolidatePage(props: PageProps<"/plans/[planId]/consolidate">) {
  return (
    <Suspense fallback={<Skeleton className="h-[600px] rounded-2xl" />}>
      <Consolidate {...props} />
    </Suspense>
  );
}

async function Consolidate({ params }: PageProps<"/plans/[planId]/consolidate">) {
  await connection();
  const { planId } = await params;
  const user = await requireUser();
  if (!can(user, "plans.consolidate")) return <AccessDenied />;
  const res = await guarded(() => getConsolidation(user, planId));
  if (!res.ok) return <AccessDenied message={res.message} />;
  const data = res.data;
  const status = data.plan.status as PlanStatus;
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title={`Consolidate · ${data.plan.title}`} breadcrumb={[{ label: "Plans", href: "/plans" }, { label: data.plan.code, href: `/plans/${planId}` }]} status={<StatusPill status={status as Status} />} />
      <StageTracker stages={planStages(status, { returned: data.components.filter((c) => c.status === "returned").length, pendingComponents: data.components.filter((c) => !["submitted", "accepted", "returned"].includes(c.status)).length })} />
      <ConsolidateBoard data={data} isUo={user.roles.includes("UNIT_OFFICER")} />
    </div>
  );
}
