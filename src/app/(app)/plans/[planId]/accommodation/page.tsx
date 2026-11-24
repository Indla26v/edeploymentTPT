import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { StatusPill, type Status } from "@/components/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { toLocalInput } from "@/lib/format";
import { guarded } from "@/lib/plans/guard";
import { getAccommodationData } from "@/lib/queries/execution";
import { ExecNav } from "../execution/exec-nav";
import { AccommodationBoard } from "./accommodation-board";

export const metadata: Metadata = { title: "Accommodation" };

export default function AccommodationPage(props: PageProps<"/plans/[planId]/accommodation">) {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
      <Accommodation {...props} />
    </Suspense>
  );
}

async function Accommodation({ params }: PageProps<"/plans/[planId]/accommodation">) {
  await connection();
  const { planId } = await params;
  const user = await requireUser();
  if (!can(user, "execution.accommodation")) return <AccessDenied />;
  const res = await guarded(() => getAccommodationData(user, planId));
  if (!res.ok) return <AccessDenied message={res.message} />;
  const d = res.data;
  if (!["published", "live", "completed"].includes(d.plan.status)) return <AccessDenied message="Allot lodging once the duty allocation is published." />;
  const day = (x: Date | null) => (x ? toLocalInput(x).slice(0, 10) : new Date().toISOString().slice(0, 10));
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title={`Accommodation · ${d.plan.title}`} breadcrumb={[{ label: "Plans", href: "/plans" }, { label: d.plan.code, href: `/plans/${d.plan.id}` }]} status={<StatusPill status={d.plan.status as Status} />} />
      <ExecNav planId={d.plan.id} active="accommodation" show={{ equipment: user.activeRole === "UNIT_OFFICER", documents: can(user, "execution.idcards"), live: can(user, "execution.live") }} />
      <AccommodationBoard
        planId={d.plan.id}
        canEdit={d.plan.status !== "completed"}
        defaultFrom={day(d.startsAt)}
        defaultTo={day(d.endsAt)}
        lodgings={d.lodgings.map((l) => ({ id: l.id, name: l.name, category: l.category, capacity: l.capacity, genderAllowed: l.genderAllowed, contactName: l.contactName, contactPhone: l.contactPhone, lat: l.lat, lng: l.lng }))}
        officers={d.rows.map((r) => ({ id: r.id, name: r.name, rank: r.rank, gender: r.gender, station: r.station, posting: r.posting }))}
        allotments={d.allotments.map((a) => ({ personId: a.personId, accommodationId: a.accommodationId, fromDate: a.fromDate, toDate: a.toDate }))}
      />
    </div>
  );
}
