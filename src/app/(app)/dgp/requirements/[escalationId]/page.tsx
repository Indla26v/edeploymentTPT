import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { fmtRange } from "@/lib/format";
import { guarded } from "@/lib/plans/guard";
import { getEscalation } from "@/lib/queries/interdistrict";
import { DistributeUnits } from "./distribute-units";

export const metadata: Metadata = { title: "Distribute to units" };

export default function EscalationPage(props: PageProps<"/dgp/requirements/[escalationId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
      <Escalation {...props} />
    </Suspense>
  );
}

async function Escalation({ params }: PageProps<"/dgp/requirements/[escalationId]">) {
  await connection();
  const { escalationId } = await params;
  const user = await requireUser();
  if (!can(user, "dgp.distribute")) return <AccessDenied />;
  const res = await guarded(() => getEscalation(escalationId));
  if (!res.ok) return <AccessDenied message={res.message} />;
  const { escalation: e, supply, prefill, sent } = res.data;
  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={e.plan}
        breadcrumb={[{ label: "Unit-wise distribution", href: "/dgp/requirements" }]}
        status={<StatusPill status={e.status === "open" ? "pending" : e.status === "distributed" ? "sent" : "completed"} label={e.status === "open" ? "To distribute" : e.status === "distributed" ? "Distributed" : "Closed"} />}
        description={`${e.fromUnit} · ${fmtRange(e.startsAt, e.endsAt)}${e.venue ? ` · ${e.venue}` : ""}${e.note ? ` · “${e.note}”` : ""}`}
      />
      <DistributeUnits escalationId={e.id} status={e.status} lines={e.lines} units={supply} prefill={prefill} sent={sent} />
    </div>
  );
}
