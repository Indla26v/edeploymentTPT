import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { listDivisions, listStations } from "@/lib/queries/masters";
import { StationsClient } from "./stations-client";

export const metadata: Metadata = { title: "Stations & offices" };

export default function StationsPage() {
  return (
    <ListPage title="Stations & offices" breadcrumb={[{ label: "Masters" }]} description="Police stations and offices, their location and Office Incharge.">
      <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
        <StationsData />
      </Suspense>
    </ListPage>
  );
}

async function StationsData() {
  await connection();
  const user = await requireUser();
  if (!can(user, "masters.view")) return <AccessDenied />;
  const [rows, divisions] = await Promise.all([listStations(user), listDivisions(user)]);
  return <StationsClient rows={rows} divisions={divisions.map((d) => ({ value: d.id, label: d.name }))} canManage={can(user, "masters.stations.manage")} />;
}
