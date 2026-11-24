import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { listTransfers, listUnitStationOptions } from "@/lib/queries/masters";
import { TransfersClient } from "./transfers-client";

export const metadata: Metadata = { title: "Transfer requests" };

export default function TransfersPage() {
  return (
    <ListPage title="Transfer requests" breadcrumb={[{ label: "Masters" }]} description="Office Incharges raise transfers; the Unit Officer approves them.">
      <Suspense fallback={<Skeleton className="h-[400px] rounded-2xl" />}>
        <TransfersData />
      </Suspense>
    </ListPage>
  );
}

async function TransfersData() {
  await connection();
  const user = await requireUser();
  if (!can(user, "transfers.request") && !can(user, "transfers.approve")) return <AccessDenied />;
  // Target stations: every station of the unit, not just the Office Incharge's own.
  const [rows, stations] = await Promise.all([listTransfers(user), listUnitStationOptions(user)]);
  return <TransfersClient rows={rows} stations={stations} canRequest={can(user, "transfers.request")} canApprove={can(user, "transfers.approve")} />;
}
