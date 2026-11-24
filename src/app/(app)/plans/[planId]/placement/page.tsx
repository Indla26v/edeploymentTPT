import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { StatusPill, type Status } from "@/components/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { getDb } from "@/lib/db";
import { canSeePlacement, editableComponents, loadPlacement } from "@/lib/placement/server";
import { guarded } from "@/lib/plans/guard";
import { loadPlan } from "@/lib/plans/server";
import { PlacementBoard, type BoardData } from "./board";

export const metadata: Metadata = { title: "Placement" };

export default function PlacementPage(props: PageProps<"/plans/[planId]/placement">) {
  return (
    <Suspense fallback={<Skeleton className="h-[640px] rounded-2xl" />}>
      <Placement {...props} />
    </Suspense>
  );
}

async function Placement({ params }: PageProps<"/plans/[planId]/placement">) {
  await connection();
  const { planId } = await params;
  const user = await requireUser();
  if (!can(user, "plans.view")) return <AccessDenied />;
  const res = await guarded(async () => {
    const plan = await loadPlan(getDb(), user, planId);
    return { plan, p: await loadPlacement(getDb(), plan.id) };
  });
  if (!res.ok) return <AccessDenied message={res.message} />;
  const { plan, p } = res.data;
  if (!canSeePlacement(user, p)) return <AccessDenied />;
  if (!["placement", "published", "live", "completed"].includes(plan.status)) return <AccessDenied message="Placement opens after force sourcing is closed." />;
  const editable = ["placement", "published"].includes(plan.status) ? editableComponents(user, p) : new Set<string>();
  // A CO sees their own components; IO / UO see all.
  const visible = user.activeRole === "COMPONENT_OFFICER" ? p.components.filter((c) => c.coUserId === user.id) : p.components;
  const ids = new Set(visible.map((c) => c.id));
  const coNames = new Map<string, string | null>();
  const data: BoardData = {
    plan: { id: plan.id, title: plan.title, status: plan.status, placementVersion: plan.placementVersion, publishedVersion: plan.publishedVersion },
    components: visible.map((c) => ({ id: c.id, name: c.name, coName: coNames.get(c.id) ?? null, ready: !!c.placementReadyAt, editable: editable.has(c.id) })),
    sectors: p.sectors.filter((s) => ids.has(s.planComponentId)),
    points: p.points.filter((x) => ids.has(x.planComponentId)).map(({ lat: _lat, lng: _lng, planComponentId: _c, ...rest }) => rest),
    slots: p.slots.filter((s) => ids.has(s.planComponentId)),
    officers: p.officers,
    assignments: p.assignments.map((a) => ({ slotId: a.slotId, personId: a.personId, source: a.source, locked: a.locked, reasons: a.reasons, warnings: a.warnings, planComponentId: a.planComponentId })),
    isIo: user.activeRole === "INITIATING_OFFICER" && can(user, "placement.override"),
    canPublish: can(user, "plans.publish") && user.activeRole === "INITIATING_OFFICER" && ["placement", "published"].includes(plan.status),
  };
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title={`Placement · ${plan.title}`} breadcrumb={[{ label: "Plans", href: "/plans" }, { label: plan.code, href: `/plans/${plan.id}` }]} status={<StatusPill status={plan.status as Status} />} />
      <PlacementBoard data={data} />
    </div>
  );
}
