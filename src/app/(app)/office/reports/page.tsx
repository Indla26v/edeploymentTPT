import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { AlarmClock, CheckCheck, Hourglass, ListTodo } from "lucide-react";

import { AccessDenied } from "@/components/access-denied";
import { KpiCard } from "@/components/kpi-card";
import { ListPage } from "@/components/layout/page-layouts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { BUCKETS } from "@/lib/office/mis";
import { getMis } from "@/lib/queries/office";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Office reports" };

const PERIODS = [
  { key: "all", label: "All time", days: null },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "30", label: "Last 30 days", days: 30 },
] as const;

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400e3);
}

export default function ReportsPage(props: PageProps<"/office/reports">) {
  return (
    <ListPage title="MIS reports" breadcrumb={[{ label: "Office" }]} description="Pending tasks by age, action taken, completed, and person-wise performance.">
      <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
        <Reports {...props} />
      </Suspense>
    </ListPage>
  );
}

async function Reports({ searchParams }: PageProps<"/office/reports">) {
  await connection();
  const sp = await searchParams;
  const user = await requireUser();
  if (!can(user, "office.reports.view")) return <AccessDenied />;
  if (!user.unitId) return <AccessDenied message="Switch to a unit role to see office reports." />;
  const period = PERIODS.find((p) => p.key === sp.period) ?? PERIODS[0];
  const since = period.days ? daysAgo(period.days) : null;
  const { summary, people, byDepartment } = await getMis(user, since);
  const maxBucket = Math.max(1, ...Object.values(summary.buckets));
  return (
    <div className="flex flex-col gap-3">
      <nav className="flex gap-1.5" aria-label="Period">
        {PERIODS.map((p) => (
          <Link key={p.key} href={`?period=${p.key}`} aria-current={p.key === period.key ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-full border px-3 text-sm", p.key === period.key ? "border-primary/40 bg-accent font-medium" : "bg-card hover:bg-accent/50")}>
            {p.label}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Pending" value={summary.pending} icon={ListTodo} tone="info" hint={`of ${summary.total} tasks`} />
        <KpiCard label="Action taken" value={summary.actionTaken} icon={Hourglass} tone="warning" hint="Awaiting verification" />
        <KpiCard label="Completed" value={summary.completed} icon={CheckCheck} tone="success" />
        <KpiCard label="Overdue" value={summary.overdue} icon={AlarmClock} tone="danger" />
      </div>
      <div className="grid gap-3 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pending by age</CardTitle>
            <CardDescription>Open, reopened and action-taken tasks, by days since creation.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {BUCKETS.map((b) => (
              <div key={b.key} className="grid grid-cols-[96px_1fr_36px] items-center gap-2 text-sm">
                <span className="text-muted-foreground">{b.label}</span>
                <Progress value={(summary.buckets[b.key] / maxBucket) * 100} tone={b.min > 45 ? "warning" : "primary"} className="h-2" aria-label={`${b.label} pending`} />
                <span className="tabular text-right font-semibold">{summary.buckets[b.key]}</span>
              </div>
            ))}
            <p className="mt-2 text-xs font-medium text-muted-foreground">By department</p>
            {byDepartment.map((d) => (
              <div key={d.name ?? "none"} className="flex items-center justify-between text-sm">
                <span>{d.name ?? "No department"}</span>
                <span className="flex gap-1">
                  <Badge tone="info">{d.open} open</Badge>
                  <Badge tone="success">{d.closed} done</Badge>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Person-wise analysis</CardTitle>
            <CardDescription>Completion rate and average time to first action.</CardDescription>
          </CardHeader>
          <CardContent className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="py-2 text-left font-medium">Staff</th>
                  <th className="py-2 text-right font-medium">Assigned</th>
                  <th className="py-2 text-right font-medium">Completed</th>
                  <th className="w-40 py-2 pl-4 text-left font-medium">Completion</th>
                  <th className="py-2 text-right font-medium">Avg response</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {people.map((p) => (
                  <tr key={p.userId}>
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="tabular py-2 text-right">{p.assigned}</td>
                    <td className="tabular py-2 text-right">{p.completed}</td>
                    <td className="py-2 pl-4">
                      <span className="flex items-center gap-2">
                        <Progress value={p.completionPct} tone={p.completionPct >= 75 ? "success" : p.completionPct >= 40 ? "warning" : "danger"} className="h-1.5" aria-label={`${p.name} completion`} />
                        <span className="tabular w-10 text-right text-xs">{p.completionPct}%</span>
                      </span>
                    </td>
                    <td className="tabular py-2 text-right">{p.avgResponseHours === null ? "—" : p.avgResponseHours < 48 ? `${p.avgResponseHours} h` : `${Math.round(p.avgResponseHours / 24)} d`}</td>
                  </tr>
                ))}
                {people.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      No tasks in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
