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
import { scopedRoster } from "@/lib/queries/execution";
import { ExecNav } from "../execution/exec-nav";
import { StageButtons } from "../execution/stage-buttons";
import { LiveBoard } from "./live-board";

export const metadata: Metadata = { title: "Live monitoring" };

export default function LivePage(props: PageProps<"/plans/[planId]/live">) {
  return (
    <Suspense fallback={<Skeleton className="h-[600px] rounded-2xl" />}>
      <Live {...props} />
    </Suspense>
  );
}

async function Live({ params }: PageProps<"/plans/[planId]/live">) {
  await connection();
  const { planId } = await params;
  const user = await requireUser();
  if (!can(user, "execution.live")) return <AccessDenied />;
  const res = await guarded(() => scopedRoster(user, planId));
  if (!res.ok) return <AccessDenied message={res.message} />;
  const { plan, rows } = res.data;
  if (!["published", "live", "completed"].includes(plan.status)) return <AccessDenied message="Live monitoring starts once the duty allocation is published." />;
  const lead = ["UNIT_OFFICER", "INITIATING_OFFICER"].includes(user.activeRole);
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title={`Live · ${plan.title}`} breadcrumb={[{ label: "Plans", href: "/plans" }, { label: plan.code, href: `/plans/${plan.id}` }]} status={<StatusPill status={plan.status as Status} />} actions={lead ? <StageButtons planId={plan.id} status={plan.status} /> : undefined} />
      <ExecNav planId={plan.id} active="live" show={{ accommodation: can(user, "execution.accommodation"), equipment: user.activeRole === "UNIT_OFFICER", documents: can(user, "execution.idcards") }} />
      <LiveBoard
        planId={plan.id}
        canMark={lead || user.activeRole === "COMPONENT_OFFICER"}
        live={["published", "live"].includes(plan.status)}
        rows={rows.map((r) => ({ id: r.id, name: r.name, rank: r.rank, genNo: r.genNo, phone: r.phone, station: r.station, posting: r.posting, sector: r.sector, sectorId: r.sectorId, component: r.component, componentId: r.componentId, batch: r.batch, batches: r.batches, lat: r.lat, lng: r.lng, status: r.status, lastAt: r.lastAt?.toISOString() ?? null, flagged: r.flagged, distanceM: r.distanceM }))}
      />
    </div>
  );
}
