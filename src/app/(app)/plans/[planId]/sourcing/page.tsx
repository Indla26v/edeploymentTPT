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
import { fmtRange } from "@/lib/format";
import { guarded } from "@/lib/plans/guard";
import { getSourcing } from "@/lib/queries/sourcing";
import { planStages, type PlanStatus } from "@/lib/workflow/plan";
import { SourcingBoard } from "./sourcing-board";

export const metadata: Metadata = { title: "Force sourcing" };

export default function SourcingPage(props: PageProps<"/plans/[planId]/sourcing">) {
  return (
    <Suspense fallback={<Skeleton className="h-[600px] rounded-2xl" />}>
      <Sourcing {...props} />
    </Suspense>
  );
}

async function Sourcing({ params }: PageProps<"/plans/[planId]/sourcing">) {
  await connection();
  const { planId } = await params;
  const user = await requireUser();
  if (!can(user, "plans.view")) return <AccessDenied />;
  const res = await guarded(() => getSourcing(user, planId));
  if (!res.ok) return <AccessDenied message={res.message} />;
  const data = res.data;
  const status = data.plan.status as PlanStatus;
  const short = data.ledger.reduce((a, r) => a + Math.max(0, r.gap - r.outstanding), 0);
  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={`Force sourcing · ${data.plan.title}`}
        breadcrumb={[{ label: "Plans", href: "/plans" }, { label: data.plan.code, href: `/plans/${planId}` }]}
        status={<StatusPill status={status as Status} />}
        description={`${fmtRange(data.windows[0]?.startsAt, data.windows.at(-1)?.endsAt)}${data.plan.venue ? ` · ${data.plan.venue}` : ""}`}
      />
      <StageTracker stages={planStages(status).map((s) => (s.key === "sourcing" && status === "sourcing" && short ? { ...s, state: "attention" as const, note: `Short by ${short}` } : s))} />
      <SourcingBoard data={data} canAct={can(user, "force.distribute") && user.activeRole === "UNIT_OFFICER"} canEscalate={can(user, "force.escalate") && user.activeRole === "UNIT_OFFICER"} />
    </div>
  );
}
