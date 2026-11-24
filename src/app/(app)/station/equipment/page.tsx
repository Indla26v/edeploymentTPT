import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Package } from "lucide-react";

import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { ListPage } from "@/components/layout/page-layouts";
import { StatusPill } from "@/components/status-pill";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { fmtDateTime } from "@/lib/format";
import { listStationEquipment } from "@/lib/queries/execution";
import { IssueButtons } from "./issue-buttons";

export const metadata: Metadata = { title: "Distributed equipment" };

export default function StationEquipmentPage() {
  return (
    <ListPage title="Distributed equipment" description="Equipment the Unit Officer drew from your station: hand it over, then record what comes back.">
      <Suspense fallback={<Skeleton className="h-[360px] rounded-2xl" />}>
        <Items />
      </Suspense>
    </ListPage>
  );
}

async function Items() {
  await connection();
  const user = await requireUser();
  if (!can(user, "execution.equipment") || user.activeRole !== "OFFICE_INCHARGE") return <AccessDenied />;
  const rows = await listStationEquipment(user);
  if (rows.length === 0) return <EmptyState icon={Package} title="Nothing drawn from your station" description="When the Unit Officer allocates your station's equipment to a bandobast, it shows here." />;
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {rows.map(({ a, type, plan }) => (
        <li key={a.id}>
          <Card className="flex-row flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {a.quantity} × {type}
              </p>
              <p className="truncate text-xs text-muted-foreground">{plan}</p>
              <p className="text-[11px] text-muted-foreground">
                {a.returnedAt ? `Returned ${a.returnedQty} · ${fmtDateTime(a.returnedAt)}` : a.issuedAt ? `Issued ${fmtDateTime(a.issuedAt)}` : "Waiting to be issued"}
              </p>
            </div>
            {a.returnedAt ? <StatusPill status="completed" label={a.returnedQty < a.quantity ? `${a.quantity - a.returnedQty} not back` : "Returned"} /> : <IssueButtons id={a.id} quantity={a.quantity} issued={!!a.issuedAt} returned={!!a.returnedAt} />}
          </Card>
        </li>
      ))}
    </ul>
  );
}
