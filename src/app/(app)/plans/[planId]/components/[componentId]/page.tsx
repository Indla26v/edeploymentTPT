import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { StatusPill, type Status } from "@/components/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { guarded } from "@/lib/plans/guard";
import { getProposal } from "@/lib/queries/plans";
import { coCanEdit } from "@/lib/workflow/plan";
import { ProposalWizard, type ProposalState } from "./proposal-wizard";

export const metadata: Metadata = { title: "Component proposal" };

export default function ProposalPage(props: PageProps<"/plans/[planId]/components/[componentId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[560px] rounded-2xl" />}>
      <Proposal {...props} />
    </Suspense>
  );
}

async function Proposal({ params }: PageProps<"/plans/[planId]/components/[componentId]">) {
  await connection();
  const { componentId } = await params;
  const user = await requireUser();
  if (!can(user, "plans.view")) return <AccessDenied />;
  const res = await guarded(() => getProposal(user, componentId));
  if (!res.ok) return <AccessDenied message={res.message} />;
  const d = res.data;
  const initial: ProposalState = {
    sectors: d.sectors.map((s) => ({
      key: s.id,
      name: s.name,
      shiftId: s.shiftId,
      batches: s.batches,
      instructions: s.instructions,
      imageUrl: s.imageUrl,
      inchargeRankId: s.inchargeRankId,
      liaisonRankId: s.liaisonRankId,
      points: d.points
        .filter((p) => p.sectorId === s.id)
        .map((p) => ({
          key: p.id,
          name: p.name,
          libraryPointId: p.libraryPointId,
          lat: p.lat,
          lng: p.lng,
          priority: p.priority,
          intensity: p.intensity,
          mobility: p.mobility,
          genderReq: p.genderReq,
          requirements: d.requirements.filter((r) => r.pointId === p.id).map((r) => ({ batch: r.batch, rankId: r.rankId, count: r.count, teamId: r.teamId, mergeGroup: r.mergeGroup })),
        })),
    })),
    logisticsNote: d.component.logisticsNote ?? "",
    equipment: d.equipment.map((e) => ({ equipmentTypeId: e.equipmentTypeId, quantity: e.quantity, note: e.note })),
    preferences: d.preferences.map((p) => ({
      key: p.id,
      kind: p.kind,
      unitId: p.unitId,
      stationId: p.stationId,
      person: p.personId ? { id: p.personId, name: p.personName ?? "", rank: p.personRank ?? "", genNo: p.personGenNo ?? "", station: p.personStation ?? "", phone: p.personPhone } : null,
      pointKey: p.pointId,
      rankId: p.rankId,
      count: p.count,
      note: p.note,
    })),
  };
  const editable = d.isCo && coCanEdit(d.plan.status, d.component.status);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={d.component.name}
        breadcrumb={[{ label: "Plans", href: "/plans" }, { label: d.plan.title, href: `/plans/${d.plan.id}` }]}
        status={<StatusPill status={d.component.status as Status} />}
        description={d.plan.proposalDueAt && editable ? `Proposal due ${fmtDateTime(d.plan.proposalDueAt)} (${fmtRelative(d.plan.proposalDueAt)})` : undefined}
      />
      <ProposalWizard
        key={d.component.id}
        componentId={d.component.id}
        planTitle={d.plan.title}
        componentName={d.component.name}
        editable={editable}
        status={d.component.status}
        returnComment={d.component.returnComment}
        initial={initial}
        options={d.options}
      />
    </div>
  );
}
