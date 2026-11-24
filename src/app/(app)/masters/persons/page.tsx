import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { asc } from "drizzle-orm";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/lib/db";
import { stations } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { stationScope, unitScope } from "@/lib/authz/scoped";
import { listPersons, listRanks } from "@/lib/queries/masters";
import { and } from "drizzle-orm";
import { PersonsClient } from "./persons-client";

export const metadata: Metadata = { title: "Police persons" };

export default function PersonsPage() {
  return (
    <ListPage title="Police persons" breadcrumb={[{ label: "Masters" }]} description="Officers available for deployment. Availability and fitness feed straight into force sourcing and placement.">
      <Suspense fallback={<Skeleton className="h-[520px] rounded-2xl" />}>
        <PersonsData />
      </Suspense>
    </ListPage>
  );
}

async function PersonsData() {
  await connection();
  const user = await requireUser();
  if (!can(user, "masters.view") && !can(user, "masters.persons.manage")) return <AccessDenied />;
  const [rows, ranks, st] = await Promise.all([
    listPersons(user),
    listRanks(),
    getDb()
      .select({ value: stations.id, label: stations.name })
      .from(stations)
      .where(and(unitScope(user, stations.unitId), stationScope(user, stations.id)))
      .orderBy(asc(stations.displayOrder)),
  ]);
  return (
    <PersonsClient
      rows={rows}
      ranks={ranks.map((r) => ({ value: r.id, label: `${r.code} — ${r.name}` }))}
      stations={st}
      canManage={can(user, "masters.persons.manage")}
      canTransfer={can(user, "transfers.request")}
      lockStation={user.activeRole === "OFFICE_INCHARGE"}
    />
  );
}
