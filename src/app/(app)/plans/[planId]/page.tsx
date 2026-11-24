import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowRight, ClipboardList, Layers, Pencil, Users } from "lucide-react";

import { AccessDenied } from "@/components/access-denied";
import { DetailPage, SummaryStrip } from "@/components/layout/page-layouts";
import { StageTracker } from "@/components/stage-tracker";
import { StatusPill, type Status } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { fmtDateTime, fmtRange, fmtRelative } from "@/lib/format";
import { guarded } from "@/lib/plans/guard";
import { getPlanDetail } from "@/lib/queries/plans";
import { PLANNING_STATUSES, planStages, type PlanStatus } from "@/lib/workflow/plan";
import { ComponentActions } from "./component-actions";

export const metadata: Metadata = { title: "Plan" };

const KIND_LABEL: Record<string, string> = { reporting: "Reporting", briefing: "Briefing", deployment: "Deployment", relief: "Relief", de_induction: "De-induction" };

export default function PlanPage(props: PageProps<"/plans/[planId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[560px] rounded-2xl" />}>
      <Plan {...props} />
    </Suspense>
  );
}

async function Plan({ params }: PageProps<"/plans/[planId]">) {
  await connection();
  const { planId } = await params;
  const user = await requireUser();
  if (!can(user, "plans.view")) return <AccessDenied />;
  const res = await guarded(() => getPlanDetail(user, planId));
  if (!res.ok) return <AccessDenied message={res.message} />;
  const { plan, windows, schedule, components, events, overall } = res.data;
  const status = plan.status as PlanStatus;
  const isIo = user.activeRole === "INITIATING_OFFICER" && can(user, "plans.consolidate");
  const mine = components.find((c) => c.coUserId === user.id);
  const counts = {
    total: components.length,
    done: components.filter((c) => c.status === "submitted" || c.status === "accepted").length,
    returned: components.filter((c) => c.status === "returned").length,
  };
  const pending = counts.total - counts.done - counts.returned;
  const men = components.reduce((a, c) => a + (c.required || c.draftRequired), 0);

  return (
    <DetailPage
      title={plan.title}
      breadcrumb={[{ label: "Plans", href: "/plans" }, { label: plan.code }]}
      status={<StatusPill status={status as Status} />}
      actions={
        <>
          {can(user, "plans.initiate") && PLANNING_STATUSES.includes(status) && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/plans/${plan.id}/setup`}>
                <Pencil /> Edit setup
              </Link>
            </Button>
          )}
          {isIo && (status === "proposing" || status === "consolidating") && (
            <Button size="sm" asChild>
              <Link href={`/plans/${plan.id}/consolidate`}>
                <Layers /> Consolidate
              </Link>
            </Button>
          )}
          {["sourcing", "placement", "published", "live", "completed"].includes(status) && (
            <Button size="sm" variant={status === "sourcing" && can(user, "force.distribute") && user.activeRole === "UNIT_OFFICER" ? "default" : "outline"} asChild>
              <Link href={`/plans/${plan.id}/sourcing`}>
                <Users /> {status === "sourcing" && can(user, "force.distribute") && user.activeRole === "UNIT_OFFICER" ? "Distribute force" : "Sourcing"}
              </Link>
            </Button>
          )}
          {mine && (
            <Button size="sm" asChild>
              <Link href={`/plans/${plan.id}/components/${mine.id}`}>
                <ClipboardList /> My proposal
              </Link>
            </Button>
          )}
        </>
      }
      summary={
        <div className="flex flex-col gap-3">
          <StageTracker stages={planStages(status, { returned: counts.returned, pendingComponents: pending })} />
          <SummaryStrip
            items={[
              { label: "Dates", value: fmtRange(windows[0]?.startsAt, windows.at(-1)?.endsAt) },
              { label: "Event", value: `${plan.eventType}${plan.venue ? ` · ${plan.venue}` : ""}` },
              { label: "Overall Incharge", value: overall ? `${overall.rank} ${overall.name}` : "—" },
              { label: "Proposals in", value: `${counts.done} of ${counts.total}` },
              { label: "Men required", value: men ? men.toLocaleString("en-IN") : "—" },
              ...(plan.proposalDueAt && (status === "proposing" || status === "draft") ? [{ label: "Proposals due", value: `${fmtDateTime(plan.proposalDueAt)} (${fmtRelative(plan.proposalDueAt)})` }] : []),
            ]}
          />
        </div>
      }
    >
      <Tabs defaultValue="components" className="gap-3">
        <TabsList>
          <TabsTrigger value="components">Components</TabsTrigger>
          <TabsTrigger value="schedule">Dates & schedule</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>
        <TabsContent value="components" className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral" className="h-7 px-3">
              Total {counts.total}
            </Badge>
            <Badge tone="success" className="h-7 px-3">
              Completed {counts.done}
            </Badge>
            <Badge tone="warning" className="h-7 px-3">
              Pending {pending}
            </Badge>
            <Badge tone="danger" className="h-7 px-3">
              Returned {counts.returned}
            </Badge>
          </div>
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Component</TableHead>
                  <TableHead className="hidden sm:table-cell">Component Officer</TableHead>
                  <TableHead className="hidden md:table-cell">Sectors · points</TableHead>
                  <TableHead className="text-right">Men</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {components.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.name}
                      <p className="text-xs font-normal text-muted-foreground sm:hidden">{c.coName ? `${c.coRank} ${c.coName}` : "No CO"}</p>
                      {c.status === "returned" && c.returnComment && <p className="max-w-64 truncate text-xs font-normal text-warning-soft-foreground">“{c.returnComment}”</p>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {c.coName ? (
                        <span className="flex items-center gap-1.5">
                          <Badge tone="primary">{c.coRank}</Badge>
                          <span className="leading-tight">
                            <span className="block">{c.coName}</span>
                            <span className="tabular block text-[11px] text-muted-foreground">{c.coPhone}</span>
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-destructive">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular hidden text-muted-foreground md:table-cell">
                      {c.sectors} · {c.points}
                    </TableCell>
                    <TableCell className="tabular text-right font-semibold">{c.required || c.draftRequired || "—"}</TableCell>
                    <TableCell>
                      <StatusPill status={c.status as Status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {isIo && (status === "proposing" || status === "consolidating") ? (
                        <ComponentActions id={c.id} name={c.name} status={c.status} />
                      ) : c.coUserId === user.id ? (
                        <Button size="sm" variant="soft" asChild>
                          <Link href={`/plans/${plan.id}/components/${c.id}`}>
                            Open <ArrowRight />
                          </Link>
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                {components.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      <Users className="mx-auto mb-1 size-5" /> No components yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="schedule">
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Duty dates</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {windows.map((w, i) => (
                    <li key={w.id} className="flex items-center gap-2">
                      <Badge tone="neutral">{w.label ?? `Day ${i + 1}`}</Badge>
                      <span className="tabular">
                        {fmtDateTime(w.startsAt)} – {fmtDateTime(w.endsAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Reporting schedule</CardTitle>
              </CardHeader>
              <CardContent>
                {schedule.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {schedule.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-2">
                        <Badge tone="info">{KIND_LABEL[s.kind]}</Badge>
                        <span className="tabular">{fmtDateTime(s.at)}</span>
                        <span className="text-muted-foreground">
                          {s.place} · {s.rank ?? "All ranks"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No reporting schedule.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="timeline">
          <Card>
            <CardContent>
              <ol className="relative space-y-3 border-l pl-4">
                {events.map((e) => (
                  <li key={e.id} className="text-sm">
                    <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-primary/70" aria-hidden />
                    <p>{e.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDateTime(e.createdAt)}
                      {e.actor ? ` · ${e.actor}` : ""}
                    </p>
                  </li>
                ))}
                {events.length === 0 && <li className="text-sm text-muted-foreground">Nothing yet.</li>}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DetailPage>
  );
}
