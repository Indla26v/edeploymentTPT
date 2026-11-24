import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { fmtRange } from "@/lib/format";
import { guarded } from "@/lib/plans/guard";
import { getStationRequest } from "@/lib/queries/sourcing";
import { RespondForm } from "./respond-form";

export const metadata: Metadata = { title: "Force request" };

export default function RequestPage(props: PageProps<"/station/requests/[requestId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[520px] rounded-2xl" />}>
      <Request {...props} />
    </Suspense>
  );
}

async function Request({ params }: PageProps<"/station/requests/[requestId]">) {
  await connection();
  const { requestId } = await params;
  const user = await requireUser();
  if (!can(user, "force.respond")) return <AccessDenied />;
  const res = await guarded(() => getStationRequest(user, requestId));
  if (!res.ok) return <AccessDenied message={res.message} />;
  const d = res.data;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <PageHeader title={d.plan.title} breadcrumb={[{ label: "Force requests", href: "/station/requests" }]} description={`${fmtRange(d.range?.start, d.range?.end)}${d.plan.venue ? ` · ${d.plan.venue}` : ""}`} />
      <RespondForm key={`${d.request.id}-${d.request.status}`} data={d} />
    </div>
  );
}
