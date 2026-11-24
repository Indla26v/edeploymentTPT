import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowRight, CalendarDays, Clock, Inbox, MapPin } from "lucide-react";

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
import { listStationRequests, type StationRequestRow } from "@/lib/queries/sourcing";

export const metadata: Metadata = { title: "Force requests" };

export default function RequestsPage() {
  return (
    <ListPage title="Force requests" description="Commit the men you can give and name the officers.">
      <Suspense fallback={<Skeleton className="h-[420px] rounded-2xl" />}>
        <Requests />
      </Suspense>
    </ListPage>
  );
}

function cta(r: StationRequestRow): { label: string; urgent: boolean } {
  if (r.status === "sent") return { label: "Reply", urgent: true };
  const committed = r.lines.reduce((a, l) => a + (l.committed ?? 0), 0);
  const named = r.lines.reduce((a, l) => a + l.named, 0);
  if (committed > named && ["sourcing", "placement"].includes(r.plan.status)) return { label: `Name ${committed - named} officers`, urgent: true };
  return { label: "View", urgent: false };
}

async function Requests() {
  await connection();
  const user = await requireUser();
  if (!can(user, "force.respond") || user.activeRole !== "OFFICE_INCHARGE") return <AccessDenied />;
  const rows = await listStationRequests(user);
  if (rows.length === 0) return <EmptyState icon={Inbox} title="No force requests" description="When the Unit Officer asks your station for men, the request appears here." />;
  const sorted = [...rows].sort((a, b) => Number(cta(b).urgent) - Number(cta(a).urgent) || +a.deadlineAt - +b.deadlineAt);
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {sorted.map((r) => {
        const c = cta(r);
        const requested = r.lines.reduce((a, l) => a + l.requested, 0);
        return (
          <li key={r.id}>
            <Card className="h-full gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.plan.title}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3" /> {fmtRange(r.plan.startsAt, r.plan.endsAt)}
                    </span>
                    {r.plan.venue && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" /> {r.plan.venue}
                      </span>
                    )}
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
                  {requested} men
                </Badge>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2">
                <span className={`flex items-center gap-1 text-xs ${r.status === "sent" ? "font-medium text-warning-soft-foreground" : "text-muted-foreground"}`} title={fmtDateTime(r.deadlineAt)}>
                  <Clock className="size-3.5" /> {r.status === "sent" ? `Reply ${fmtRelative(r.deadlineAt)}` : `Replied ${r.respondedAt ? fmtRelative(r.respondedAt) : ""}`}
                </span>
                <Button size="sm" variant={c.urgent ? "default" : "soft"} asChild>
                  <Link href={`/station/requests/${r.id}`}>
                    {c.label} <ArrowRight />
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
