import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Building2, Database, HeartPulse, UserCheck, Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getUnitDashboard } from "@/lib/queries/dashboard";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const DEMO_UNIT_CODE = "DEMO-DIST";

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        description="Force strength, availability and stations for your unit. Plan pipeline cards appear once the plan workflow lands (phase 4)."
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData />
      </Suspense>
    </div>
  );
}

async function DashboardData() {
  await connection();
  let data: Awaited<ReturnType<typeof getUnitDashboard>>;
  try {
    data = await getUnitDashboard(DEMO_UNIT_CODE);
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
    return <EmptyState icon={Database} title="No data yet" description="Run pnpm db:seed to load the demo district." />;
  }

  const { totals, byRank, stations } = data;
  const availablePct = totals.persons ? Math.round((totals.available / totals.persons) * 100) : 0;

  return (
    <div className="space-y-4">
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
