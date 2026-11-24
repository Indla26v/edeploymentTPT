import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { listEquipment, listStations } from "@/lib/queries/masters";
import { EquipmentClient } from "./equipment-client";

export const metadata: Metadata = { title: "Equipment" };

export default function EquipmentPage() {
  return (
    <ListPage title="Equipment" breadcrumb={[{ label: "Masters" }]} description="Equipment held by each station, working condition and custodian.">
      <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
        <EquipmentData />
      </Suspense>
    </ListPage>
  );
}

async function EquipmentData() {
  await connection();
  const user = await requireUser();
  if (!can(user, "masters.view")) return <AccessDenied />;
  const [{ types, stock }, stations] = await Promise.all([listEquipment(user), listStations(user)]);
  return <EquipmentClient types={types} stock={stock} stations={stations.map((s) => ({ value: s.id, label: s.name }))} canManage={can(user, "masters.equipment.manage")} />;
}
