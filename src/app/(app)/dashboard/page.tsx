import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight, BellRing, Building2, Database, HeartPulse, UserCheck, Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { ROLE_LABEL } from "@/lib/authz/roles";
import { getAttention, getStateOverview, getUnitDashboard } from "@/lib/queries/dashboard";
import { can, scopeStationIds } from "@/lib/authz/authorize";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard" description="Force strength, availability and stations for your unit." />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData />
      </Suspense>
    </div>
  );
}

async function DashboardData() {
  await connection();
  const user = await requireUser();
  if (!user.unitId) return <StateOverview />;
  let data: Awaited<ReturnType<typeof getUnitDashboard>>;
  let attention: Awaited<ReturnType<typeof getAttention>>;
  const stationIds = scopeStationIds(user);
  try {
    [data, attention] = await Promise.all([getUnitDashboard(user.unitId, stationIds), getAttention(user, user.unitId, stationIds)]);
  } catch (err) {
    console.error("dashboard query failed", err);
    return (
      <EmptyState
        icon={Database}
        title="Database not reachable"
        description="Check DATABASE_URL, then run pnpm db:migrate and pnpm db:seed."
      />
    );
  }
  if (!data) {
    return <EmptyState icon={Database} title={`No data for ${ROLE_LABEL[user.activeRole]}`} description="Your unit has no stations or officers yet." />;
  }

  const { totals, byRank, stations } = data;
  const availablePct = totals.persons ? Math.round((totals.available / totals.persons) * 100) : 0;

  const actions: { label: string; href: string; tone: "warning" | "info" }[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (attention.myProposals) actions.push({ label: `${plural(attention.myProposals, "proposal", "proposals")} to submit`, href: "/plans", tone: "warning" });
  if (attention.toConsolidate) actions.push({ label: `${plural(attention.toConsolidate, "plan", "plans")} ready to consolidate`, href: "/plans", tone: "warning" });
  if (attention.toSource) actions.push({ label: `${plural(attention.toSource, "plan needs", "plans need")} force sourcing`, href: "/plans", tone: "warning" });
  if (attention.drafts) actions.push({ label: `${plural(attention.drafts, "draft plan", "draft plans")} not sent yet`, href: "/plans", tone: "info" });
  if (attention.pendingTransfers && can(user, "transfers.approve")) actions.push({ label: `${attention.pendingTransfers} transfer request${attention.pendingTransfers > 1 ? "s" : ""} to review`, href: "/masters/transfers", tone: "warning" });
  else if (attention.pendingTransfers && can(user, "transfers.request")) actions.push({ label: `${attention.pendingTransfers} transfer request${attention.pendingTransfers > 1 ? "s" : ""} awaiting approval`, href: "/masters/transfers", tone: "info" });
  if (attention.stationsWithoutIncharge && can(user, "masters.stations.manage")) actions.push({ label: `${attention.stationsWithoutIncharge} station${attention.stationsWithoutIncharge > 1 ? "s" : ""} without an Office Incharge`, href: "/masters/stations", tone: "warning" });
  if (attention.points === 0 && can(user, "masters.points.manage")) actions.push({ label: "Add your deployment points library", href: "/masters/points", tone: "info" });

  return (
    <div className="space-y-4">
      {actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-4 py-2.5 shadow-soft">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <BellRing className="size-4 text-warning" aria-hidden /> Needs attention
          </span>
          {actions.map((a) => (
            <Link key={a.href + a.label} href={a.href} className="rounded-full focus-visible:ring-2 focus-visible:ring-ring">
              <Badge tone={a.tone} className="h-7 px-3 text-xs hover:brightness-95">
                {a.label} <ArrowRight className="size-3" aria-hidden />
              </Badge>
            </Link>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Police stations / offices" value={totals.stations} icon={Building2} />
        <KpiCard label="Police persons" value={totals.persons} icon={Users} tone="info" hint={`${formatNumber(totals.women)} women officers`} />
        <KpiCard label="Available for deployment" value={totals.available} icon={UserCheck} tone="success" hint={`${availablePct}% of strength`} />
        <KpiCard label="Light duty only" value={totals.lightDuty} icon={HeartPulse} tone="warning" hint="Kept off high-intensity points" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Rank abstract</CardTitle>
            <CardDescription>Available of total, by rank.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {byRank.map((r) => (
                <li key={r.code} className="grid h-7 grid-cols-[76px_1fr_auto] items-center gap-2.5 text-sm">
                  <Badge tone={r.category === "general" ? "primary" : r.category === "ar" ? "neutral" : "warning"} className="w-full justify-center">
                    {r.code}
                  </Badge>
                  <Progress value={(r.available / r.total) * 100} tone="success" aria-label={`${r.code} availability`} className="h-1.5" />
                  <span className="tabular min-w-16 text-right whitespace-nowrap text-muted-foreground">
                    <span className="font-semibold text-foreground">{r.available}</span> / {r.total}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Police stations / offices</CardTitle>
            <CardDescription>Office Incharge and strength of each station.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Station / office</TableHead>
                  <TableHead className="hidden md:table-cell">Division</TableHead>
                  <TableHead className="hidden sm:table-cell">Office Incharge</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stations.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{s.division}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {s.inchargeName ? (
                        <span className="flex items-center gap-2">
                          <Badge tone="primary">{s.inchargeRank}</Badge>
                          {s.inchargeName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      <span className="font-semibold">{s.available}</span>
                      <span className="text-muted-foreground"> / {s.strength}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <Skeleton className="h-[520px] rounded-2xl" />
        <Skeleton className="h-[520px] rounded-2xl" />
      </div>
    </div>
  );
}

async function StateOverview() {
  const rows = await getStateOverview();
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>State police units</CardTitle>
        <CardDescription>Strength and availability by unit.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Unit</TableHead>
              <TableHead className="hidden sm:table-cell">Stations / offices</TableHead>
              <TableHead className="text-right">Available</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="tabular hidden sm:table-cell">{u.stations}</TableCell>
                <TableCell className="tabular text-right">
                  <span className="font-semibold">{u.available}</span>
                  <span className="text-muted-foreground"> / {u.persons}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
