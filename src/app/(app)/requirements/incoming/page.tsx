import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowRight, CalendarDays, Clock, Inbox } from "lucide-react";

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
import { listIncomingUnitRequests } from "@/lib/queries/interdistrict";

export const metadata: Metadata = { title: "Other unit requirements" };

export default function IncomingPage() {
  return (
    <ListPage title="Other unit requirements" breadcrumb={[{ label: "Inter-district" }]} description="Men the Chief Office asked your unit to give to another district's bandobast.">
      <Suspense fallback={<Skeleton className="h-[360px] rounded-2xl" />}>
        <List />
      </Suspense>
    </ListPage>
  );
}

async function List() {
  await connection();
  const user = await requireUser();
  if (!can(user, "force.respond_unit") || user.activeRole !== "UNIT_OFFICER") return <AccessDenied />;
  const rows = await listIncomingUnitRequests(user);
  if (!rows.length) return <EmptyState icon={Inbox} title="No requests from other units" description="When the Chief Office asks your unit for men, the request appears here." />;
  const sorted = [...rows].sort((a, b) => Number(b.status === "sent") - Number(a.status === "sent") || +a.deadlineAt - +b.deadlineAt);
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {sorted.map((r) => {
        const total = r.lines.reduce((a, l) => a + l.requested, 0);
        return (
          <li key={r.id} className="min-w-0">
            <Card className="h-full gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.plan.title}</p>
                  <p className="text-xs text-muted-foreground">For {r.plan.fromUnit}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="size-3" /> {fmtRange(r.plan.startsAt, r.plan.endsAt)}
                    {r.plan.venue ? ` · ${r.plan.venue}` : ""}
                  </p>
                </div>
                {r.status === "sent" ? <StatusPill status="pending" label="Awaiting reply" /> : <StatusPill status={r.status === "partial" ? "short" : r.status === "committed" ? "accepted" : r.status === "auto_accepted" ? "auto_accepted" : "declined"} label={r.status === "partial" ? "Short" : r.status === "committed" ? "Committed" : undefined} />}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.lines.map((l) => (
                  <Badge key={l.rankId} tone="neutral" className="tabular h-7 px-3 text-sm">
                    {l.rank} <span className="font-semibold">{l.committed ?? l.requested}</span>
                    {l.committed !== null && l.committed !== l.requested ? <span className="text-muted-foreground">/{l.requested}</span> : null}
                  </Badge>
                ))}
                <Badge tone="primary" className="h-7 px-3 text-sm">
                  {total} men
                </Badge>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2">
                <span className={`flex items-center gap-1 text-xs ${r.status === "sent" ? "font-medium text-warning-soft-foreground" : "text-muted-foreground"}`} title={fmtDateTime(r.deadlineAt)}>
                  <Clock className="size-3.5" /> {r.status === "sent" ? `Reply ${fmtRelative(r.deadlineAt)}` : `Replied ${r.respondedAt ? fmtRelative(r.respondedAt) : ""}`}
                </span>
                <Button size="sm" variant={r.status === "sent" ? "default" : "soft"} asChild>
                  <Link href={`/requirements/incoming/${r.id}`}>
                    {r.status === "sent" ? "Reply" : "Open"} <ArrowRight />
                  </Link>
                </Button>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
