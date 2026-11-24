import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { CalendarDays, Download, Ticket } from "lucide-react";

import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { ListPage } from "@/components/layout/page-layouts";
import { StatusPill, type Status } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { fmtRange } from "@/lib/format";
import { listDutyPassPlans } from "@/lib/queries/execution";

export const metadata: Metadata = { title: "Duty passes" };

export default function DutyPassPage() {
  return (
    <ListPage title="Duty passes" description="Posting, reporting time and instructions for each published bandobast.">
      <Suspense fallback={<Skeleton className="h-[320px] rounded-2xl" />}>
        <Passes />
      </Suspense>
    </ListPage>
  );
}

async function Passes() {
  await connection();
  const user = await requireUser();
  if (!can(user, "dutypass.view")) return <AccessDenied />;
  const rows = await listDutyPassPlans(user);
  if (rows.length === 0) return <EmptyState icon={Ticket} title="No duty passes yet" description="Duty passes appear here once a bandobast with your officers is published." />;
  const oi = user.activeRole === "OFFICE_INCHARGE";
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((p) => (
        <li key={p.id}>
          <Card className="h-full gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{p.title}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="size-3" /> {fmtRange(p.startsAt, p.endsAt)}
                  {p.venue ? ` · ${p.venue}` : ""}
                </p>
              </div>
              <StatusPill status={p.status as Status} />
            </div>
            <Button className="mt-auto h-11" asChild>
              <a href={`/api/plans/${p.id}/duty-passes`} target="_blank" rel="noreferrer">
                <Download /> {oi ? `Duty passes (${p.count} officers)` : "My duty pass"}
              </a>
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  );
}
