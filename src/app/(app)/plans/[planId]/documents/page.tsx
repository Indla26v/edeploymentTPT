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
import { getDocumentsData } from "@/lib/queries/execution";
import { ExecNav } from "../execution/exec-nav";
import { DocumentsPanel } from "./documents-panel";

export const metadata: Metadata = { title: "ID cards & documents" };

export default function DocumentsPage(props: PageProps<"/plans/[planId]/documents">) {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
      <Documents {...props} />
    </Suspense>
  );
}

async function Documents({ params }: PageProps<"/plans/[planId]/documents">) {
  await connection();
  const { planId } = await params;
  const user = await requireUser();
  if (!can(user, "execution.idcards")) return <AccessDenied />;
  const res = await guarded(() => getDocumentsData(user, planId));
  if (!res.ok) return <AccessDenied message={res.message} />;
  const d = res.data;
  if (!["published", "live", "completed"].includes(d.plan.status)) return <AccessDenied message="Documents are available once the duty allocation is published." />;
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title={`Documents · ${d.plan.title}`} breadcrumb={[{ label: "Plans", href: "/plans" }, { label: d.plan.code, href: `/plans/${d.plan.id}` }]} status={<StatusPill status={d.plan.status as Status} />} description={`Published roster v${d.version}`} />
      <ExecNav planId={d.plan.id} active="documents" show={{ accommodation: can(user, "execution.accommodation"), equipment: user.activeRole === "UNIT_OFFICER", live: can(user, "execution.live") }} />
      <DocumentsPanel planId={d.plan.id} total={d.rows.length} components={d.components} sectors={d.sectors} stations={d.stations} headers={d.headers} />
    </div>
  );
}
