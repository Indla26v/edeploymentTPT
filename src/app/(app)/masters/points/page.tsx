import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { listPoints, listStations } from "@/lib/queries/masters";
import { PointsClient } from "./points-client";

export const metadata: Metadata = { title: "Deployment points" };

export default function PointsPage() {
  return (
    <ListPage title="Deployment points" breadcrumb={[{ label: "Masters" }]} description="Reusable duty points with a default priority, intensity and gender requirement.">
      <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
        <PointsData />
      </Suspense>
    </ListPage>
  );
}

async function PointsData() {
  await connection();
  const user = await requireUser();
  if (!can(user, "masters.view")) return <AccessDenied />;
  const [rows, stations] = await Promise.all([listPoints(user), listStations(user)]);
  return <PointsClient rows={rows} stations={stations.map((s) => ({ value: s.id, label: s.name }))} canManage={can(user, "masters.points.manage")} />;
}
