"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, CalendarDays, FilePlus2, MapPin } from "lucide-react";

import { DataTable, SortHeader } from "@/components/data-table";
import { StatusPill, type Status } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Role } from "@/lib/authz/roles";
import { fmtDateTime, fmtRange, fmtRelative } from "@/lib/format";
import type { PlanListRow } from "@/lib/queries/plans";

function nextStep(r: PlanListRow, role: Role): { label: string; href: string } {
  if (role === "COMPONENT_OFFICER" && r.myComponentId) {
    const mine = r.myComponentStatus;
    return { label: mine === "submitted" || mine === "accepted" ? "View proposal" : mine === "returned" ? "Fix and resubmit" : "Propose", href: `/plans/${r.id}/components/${r.myComponentId}` };
  }
  if (r.status === "draft") return { label: "Continue setup", href: `/plans/${r.id}/setup` };
  if ((r.status === "proposing" || r.status === "consolidating") && role === "INITIATING_OFFICER") return { label: "Consolidate", href: `/plans/${r.id}/consolidate` };
  return { label: "Open", href: `/plans/${r.id}` };
}

export function PlansList({ rows, role, canInitiate }: { rows: PlanListRow[]; role: Role; canInitiate: boolean }) {
  const columns: ColumnDef<PlanListRow, unknown>[] = [
    {
      accessorKey: "title",
      header: ({ column }) => <SortHeader label="Plan" column={column} />,
      cell: ({ row: { original: r } }) => (
        <Link href={`/plans/${r.id}`} className="block leading-tight hover:underline">
          <span className="block font-medium">{r.title}</span>
          <span className="text-[11px] text-muted-foreground">
            <span className="font-mono">{r.code}</span> · {r.eventType}
            {r.venue ? ` · ${r.venue}` : ""}
          </span>
        </Link>
      ),
    },
    {
      accessorKey: "startsAt",
      header: ({ column }) => <SortHeader label="Dates" column={column} />,
      cell: ({ row: { original: r } }) => <span className="tabular text-sm whitespace-nowrap">{fmtRange(r.startsAt, r.endsAt)}</span>,
    },
    { accessorKey: "status", header: "Stage", cell: ({ row: { original: r } }) => <StatusPill status={r.status as Status} /> },
    {
      id: "proposals",
      header: "Proposals",
      cell: ({ row: { original: r } }) =>
        r.componentsTotal ? (
          <div className="flex w-36 items-center gap-2">
            <Progress value={(r.componentsIn / r.componentsTotal) * 100} tone={r.componentsReturned ? "warning" : "success"} className="h-1.5" aria-label="Proposals in" />
            <span className="tabular text-xs whitespace-nowrap text-muted-foreground">
              {r.componentsIn}/{r.componentsTotal}
              {r.componentsReturned ? <span className="text-warning-soft-foreground"> · {r.componentsReturned} ret.</span> : null}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    { accessorKey: "required", header: ({ column }) => <SortHeader label="Men" column={column} />, cell: ({ getValue }) => <span className="tabular font-semibold">{(getValue() as number) || "—"}</span> },
    {
      id: "due",
      header: "Due",
      cell: ({ row: { original: r } }) =>
        r.proposalDueAt && (r.status === "proposing" || r.status === "draft") ? (
          <span className="text-xs whitespace-nowrap" title={fmtDateTime(r.proposalDueAt)}>
            <Badge tone={new Date(r.proposalDueAt) < new Date() ? "danger" : "neutral"}>{fmtRelative(r.proposalDueAt)}</Badge>
          </span>
        ) : null,
    },
    {
      id: "action",
      header: () => <span className="sr-only">Next step</span>,
      cell: ({ row: { original: r } }) => {
        const s = nextStep(r, role);
        return (
          <Button size="sm" variant={s.label === "Open" ? "ghost" : "soft"} asChild>
            <Link href={s.href}>
              {s.label} <ArrowRight />
            </Link>
          </Button>
        );
      },
    },
  ];

  return (
    <DataTable
      data={rows}
      columns={columns}
      storageKey="plans"
      searchPlaceholder="Plan, code, venue…"
      searchText={(r) => `${r.title} ${r.code} ${r.venue ?? ""} ${r.eventType}`}
      filters={[
        {
          id: "stage",
          options: (["draft", "proposing", "consolidating", "sourcing"] as const)
            .map((s) => ({ value: s, label: { draft: "Draft", proposing: "Proposals", consolidating: "Consolidating", sourcing: "Sourcing" }[s], count: rows.filter((r) => r.status === s).length }))
            .filter((o) => o.count > 0),
          match: (r, v) => r.status === v,
        },
      ]}
      emptyMessage={
        <span className="flex flex-col items-center gap-2">
          {role === "COMPONENT_OFFICER" ? "No plans need your proposal right now." : "No ongoing plans."}
          {canInitiate && (
            <Button size="sm" asChild>
              <Link href="/plans/new">
                <FilePlus2 /> Initiate plan
              </Link>
            </Button>
          )}
        </span>
      }
      mobileCard={(r) => {
        const s = nextStep(r, role);
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.title}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="size-3" /> {fmtRange(r.startsAt, r.endsAt)}
                  {r.venue && (
                    <>
                      <MapPin className="ml-1 size-3" /> <span className="truncate">{r.venue}</span>
                    </>
                  )}
                </p>
              </div>
              <StatusPill status={r.status as Status} />
            </div>
            <Button size="sm" variant="soft" className="self-start" asChild>
              <Link href={s.href}>
                {s.label} <ArrowRight />
              </Link>
            </Button>
          </div>
        );
      }}
    />
  );
}
