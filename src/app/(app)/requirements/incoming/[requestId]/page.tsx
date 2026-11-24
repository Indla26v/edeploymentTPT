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
import { getIncomingUnitRequest } from "@/lib/queries/interdistrict";
import { UnitReply } from "./unit-reply";

export const metadata: Metadata = { title: "Request from another unit" };

export default function IncomingRequestPage(props: PageProps<"/requirements/incoming/[requestId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
      <Incoming {...props} />
    </Suspense>
  );
}

async function Incoming({ params }: PageProps<"/requirements/incoming/[requestId]">) {
  await connection();
  const { requestId } = await params;
  const user = await requireUser();
  if (!can(user, "force.respond_unit") || user.activeRole !== "UNIT_OFFICER") return <AccessDenied />;
  const res = await guarded(() => getIncomingUnitRequest(user, requestId));
  if (!res.ok) return <AccessDenied message={res.message} />;
  const { request: r, stations, children } = res.data;
  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={r.plan.title}
        breadcrumb={[{ label: "Other unit requirements", href: "/requirements/incoming" }]}
        status={r.status === "sent" ? <StatusPill status="pending" label="Awaiting reply" /> : <StatusPill status={r.status === "partial" ? "short" : r.status === "committed" ? "accepted" : r.status === "auto_accepted" ? "auto_accepted" : "declined"} label={r.status === "partial" ? "Short" : r.status === "committed" ? "Committed" : undefined} />}
        description={`For ${r.plan.fromUnit} · ${fmtRange(r.plan.startsAt, r.plan.endsAt)}${r.plan.venue ? ` · ${r.plan.venue}` : ""}`}
      />
      <UnitReply request={r} stations={stations} childRequests={children} planOpen={["sourcing", "placement"].includes(r.plan.status)} />
    </div>
  );
}
