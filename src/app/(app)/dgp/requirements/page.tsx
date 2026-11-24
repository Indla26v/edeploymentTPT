import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowRight, CalendarDays, Landmark } from "lucide-react";

import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { ListPage } from "@/components/layout/page-layouts";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { fmtDateTime, fmtRange, fmtRelative } from "@/lib/format";
import { listEscalations } from "@/lib/queries/interdistrict";

export const metadata: Metadata = { title: "Unit-wise distribution" };

export default function DgpRequirementsPage() {
  return (
    <ListPage title="Unit-wise distribution" breadcrumb={[{ label: "Chief Office" }]} description="Gaps units couldn't fill from their own stations — distribute them across other units.">
      <Suspense fallback={<Skeleton className="h-[360px] rounded-2xl" />}>
        <List />
      </Suspense>
    </ListPage>
  );
}

async function List() {
  await connection();
  const user = await requireUser();
  if (!can(user, "dgp.distribute")) return <AccessDenied />;
  const rows = await listEscalations();
  if (!rows.length) return <EmptyState icon={Landmark} title="No requests from units" description="When a Unit Officer sends a gap to the Chief Office, it appears here." />;
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((e) => (
        <li key={e.id} className="min-w-0">
          <Card className="h-full gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{e.plan}</p>
                <p className="text-xs text-muted-foreground">{e.fromUnit}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="size-3" /> {fmtRange(e.startsAt, e.endsAt)}
                  {e.venue ? ` · ${e.venue}` : ""}
                </p>
              </div>
              <StatusPill status={e.status === "open" ? "pending" : e.status === "distributed" ? "sent" : "completed"} label={e.status === "open" ? "To distribute" : e.status === "distributed" ? "Distributed" : "Closed"} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {e.lines.map((l) => (
                <Badge key={l.rankId} tone="neutral" className="tabular h-7 px-3 text-sm">
                  {l.rank} <span className="font-semibold">{l.requested}</span>
                </Badge>
              ))}
            </div>
            {e.note && <p className="line-clamp-2 text-xs text-muted-foreground">“{e.note}”</p>}
            <div className="mt-auto flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground" title={fmtDateTime(e.deadlineAt)}>
                Needed {fmtRelative(e.deadlineAt)}
              </span>
              <Button size="sm" variant={e.status === "open" ? "default" : "soft"} asChild>
                <Link href={`/dgp/requirements/${e.id}`}>
                  {e.status === "open" ? "Distribute" : "View"} <ArrowRight />
                </Link>
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
