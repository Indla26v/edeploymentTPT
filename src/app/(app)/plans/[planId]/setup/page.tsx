import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { StatusPill, type Status } from "@/components/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { guarded } from "@/lib/plans/guard";
import { getInitiateOptions, getPlanDetail } from "@/lib/queries/plans";
import { PLANNING_STATUSES, type PlanStatus } from "@/lib/workflow/plan";
import { InitiateWizard } from "../../_components/initiate-wizard";
import { toWizard } from "../../_components/wizard-data";

export const metadata: Metadata = { title: "Plan setup" };

export default function SetupPage(props: PageProps<"/plans/[planId]/setup">) {
  return (
    <Suspense fallback={<Skeleton className="h-[560px] rounded-2xl" />}>
      <Setup {...props} />
    </Suspense>
  );
}

async function Setup({ params, searchParams }: PageProps<"/plans/[planId]/setup">) {
  await connection();
  const [{ planId }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  if (!can(user, "plans.initiate")) return <AccessDenied />;
  const res = await guarded(() => Promise.all([getPlanDetail(user, planId), getInitiateOptions(user)]));
  if (!res.ok) return <AccessDenied message={res.message} />;
  const [detail, options] = res.data;
  if (!PLANNING_STATUSES.includes(detail.plan.status as PlanStatus)) return <AccessDenied message="This plan has gone for force sourcing; its setup can't be edited any more." />;
  const step = Math.min(4, Math.max(0, Number(sp.step ?? 0) || 0));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={detail.plan.title}
        breadcrumb={[{ label: "Plans", href: "/plans" }, { label: detail.plan.code, href: `/plans/${planId}` }]}
        status={<StatusPill status={detail.plan.status as Status} />}
      />
      <InitiateWizard key={planId} initial={toWizard(detail)} options={{ ...options, reusable: [] }} initialStep={step} />
    </div>
  );
}
