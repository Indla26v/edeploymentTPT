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
import { getEquipmentData } from "@/lib/queries/execution";
import { ExecNav } from "../execution/exec-nav";
import { EquipmentBoard } from "./equipment-board";

export const metadata: Metadata = { title: "Equipment distribution" };

export default function EquipmentPage(props: PageProps<"/plans/[planId]/equipment">) {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
      <Equipment {...props} />
    </Suspense>
  );
}

async function Equipment({ params }: PageProps<"/plans/[planId]/equipment">) {
  await connection();
  const { planId } = await params;
  const user = await requireUser();
  if (!can(user, "execution.equipment") || user.activeRole !== "UNIT_OFFICER") return <AccessDenied />;
  const res = await guarded(() => getEquipmentData(user, planId));
  if (!res.ok) return <AccessDenied message={res.message} />;
  const d = res.data;
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title={`Equipment · ${d.plan.title}`} breadcrumb={[{ label: "Plans", href: "/plans" }, { label: d.plan.code, href: `/plans/${d.plan.id}` }]} status={<StatusPill status={d.plan.status as Status} />} />
      {["published", "live", "completed"].includes(d.plan.status) && <ExecNav planId={d.plan.id} active="equipment" show={{ accommodation: can(user, "execution.accommodation"), documents: can(user, "execution.idcards"), live: can(user, "execution.live") }} />}
      <EquipmentBoard
        planId={d.plan.id}
        canEdit={["placement", "published", "live"].includes(d.plan.status)}
        types={d.types}
        need={d.need}
        free={d.free}
        allocations={d.allocations.map(({ a, station, type }) => ({ id: a.id, equipmentTypeId: a.equipmentTypeId, type, station, quantity: a.quantity, issuedAt: a.issuedAt?.toISOString() ?? null, returnedQty: a.returnedQty, returnedAt: a.returnedAt?.toISOString() ?? null }))}
      />
    </div>
  );
}
