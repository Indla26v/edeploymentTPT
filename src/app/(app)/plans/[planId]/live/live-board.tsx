"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Download, LogOut, MapPinned, Search, TriangleAlert, UserX } from "lucide-react";
import { toast } from "sonner";

import { KpiCard } from "@/components/kpi-card";
import { MapView } from "@/components/map/map-view";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterPill } from "@/components/ui/toggle-group";
import type { AttendanceStatus } from "@/lib/execution/server";
import { fmtTime } from "@/lib/format";
import { markAttendanceAction } from "../execution/actions";

export type LiveRow = {
  id: string;
  name: string;
  rank: string;
  genNo: string;
  phone: string | null;
  station: string;
  posting: string;
  sector: string;
  sectorId: string;
  component: string;
  componentId: string;
  batch: number;
  batches: number;
  lat: number | null;
  lng: number | null;
  status: AttendanceStatus;
  lastAt: string | null;
  flagged: boolean;
  distanceM: number | null;
};

const LABEL: Record<AttendanceStatus, string> = { present: "Present", absent: "Absent", pending: "Not yet due", checked_out: "Checked out" };
const PILL = { present: "accepted", absent: "overdue", pending: "pending", checked_out: "completed" } as const;

export function LiveBoard({ planId, rows, canMark, live }: { planId: string; rows: LiveRow[]; canMark: boolean; live: boolean }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<AttendanceStatus | null>(null);
  const [component, setComponent] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [pending, start] = React.useTransition();
  React.useEffect(() => {
    const t = setInterval(() => !document.hidden && router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [router]);

  const scoped = rows.filter((r) => component === "all" || r.componentId === component);
  const count = (s: AttendanceStatus) => scoped.filter((r) => r.status === s).length;
  const shown = scoped.filter((r) => (!status || r.status === status) && (!q || `${r.name} ${r.genNo} ${r.phone ?? ""} ${r.posting}`.toLowerCase().includes(q.toLowerCase())));
  const comps = [...new Map(rows.map((r) => [r.componentId, r.component])).entries()];
  const sectors = [...new Map(scoped.map((r) => [r.sectorId, { name: r.sector, component: r.component }])).entries()].map(([id, v]) => {
    const rs = scoped.filter((r) => r.sectorId === id);
    return { id, ...v, total: rs.length, present: rs.filter((r) => r.status === "present").length, absent: rs.filter((r) => r.status === "absent").length };
  });
  // Pins per posting: red if anyone absent, orange if pending, green when all present.
  const byPoint = new Map<string, LiveRow[]>();
  for (const r of scoped) if (r.lat !== null && r.lng !== null) byPoint.set(`${r.lat},${r.lng}`, [...(byPoint.get(`${r.lat},${r.lng}`) ?? []), r]);
  const pins = [...byPoint.entries()].map(([k, rs]) => {
    const [lat, lng] = k.split(",").map(Number);
    const color = rs.some((r) => r.status === "absent") ? "danger" : rs.some((r) => r.status === "pending") ? "warning" : rs.every((r) => r.status === "checked_out") ? "neutral" : "success";
    return { id: k, lat: lat!, lng: lng!, label: rs[0]!.posting, sub: `${rs.filter((r) => r.status === "present").length}/${rs.length} present`, color: color as "success" };
  });

  const mark = (personId: string, event: "check_in" | "check_out") =>
    start(async () => {
      const r = await markAttendanceAction(planId, { personId, event });
      if (r.ok) toast.success(r.message ?? "Saved");
      else toast.error(r.error);
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Present" value={count("present")} icon={CheckCircle2} tone="success" hint={`of ${scoped.length}`} />
        <KpiCard label="Absent" value={count("absent")} icon={UserX} tone="danger" hint="Not checked in after reporting time" />
        <KpiCard label="Not yet due" value={count("pending")} icon={Clock} tone="warning" />
        <KpiCard label="Checked out" value={count("checked_out")} icon={LogOut} />
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="min-w-0 gap-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {comps.length > 1 && (
              <Select value={component} onValueChange={setComponent}>
                <SelectTrigger size="sm" className="h-9 w-48 rounded-full" aria-label="Component">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All components</SelectItem>
                  {comps.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <label className="relative min-w-48 flex-1">
              <span className="sr-only">Search officers</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Officer, Gen No, mobile, posting…" className="h-9 w-full rounded-full border border-input bg-card pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
            </label>
            {(["absent", "present", "pending", "checked_out"] as const).map((s) => (
              <FilterPill key={s} active={status === s} onClick={() => setStatus(status === s ? null : s)}>
                {LABEL[s]} <span className="tabular opacity-70">{count(s)}</span>
              </FilterPill>
            ))}
            <Button size="sm" variant="outline" asChild className="ml-auto">
              <a href={`/api/plans/${planId}/roster?status=absent${component !== "all" ? `&component=${component}` : ""}`}>
                <Download /> Absentees
              </a>
            </Button>
          </div>
          <div className="max-h-[calc(100dvh-24rem)] min-h-64 overflow-auto rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                <tr className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="px-3 py-2 text-left font-medium">Officer</th>
                  <th className="px-3 py-2 text-left font-medium">Posting</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <Badge tone="primary">{r.rank}</Badge>
                        <span className="leading-tight">
                          <span className="block font-medium">{r.name}</span>
                          <span className="tabular block text-[11px] text-muted-foreground">
                            {r.station}
                            {r.phone ? ` · ${r.phone}` : ""}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 leading-tight">
                      <span className="block">{r.posting}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {r.sector}
                        {r.batches > 1 ? ` · B${r.batch}` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="flex flex-col items-start gap-0.5">
                        <StatusPill status={PILL[r.status]} label={LABEL[r.status]} />
                        {r.lastAt && <span className="tabular text-[11px] text-muted-foreground">{fmtTime(r.lastAt)}</span>}
                        {r.flagged && (
                          <span className="flex items-center gap-1 text-[11px] text-warning-soft-foreground">
                            <TriangleAlert className="size-3" /> {r.distanceM} m away
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {canMark && live && r.status !== "present" && (
                        <Button size="sm" variant="soft" disabled={pending} onClick={() => mark(r.id, "check_in")}>
                          Mark present
                        </Button>
                      )}
                      {canMark && live && r.status === "present" && (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => mark(r.id, "check_out")}>
                          Check out
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">
                      No officers match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="flex min-w-0 flex-col gap-3">
          <MapView className="h-80" points={pins} />
          <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <MapPinned className="size-3.5" /> Green all present · orange not yet due · red someone absent
          </p>
          <Card className="gap-1.5 p-3">
            <p className="text-sm font-medium">By sector</p>
            {sectors.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {s.name} <span className="text-xs text-muted-foreground">· {s.component}</span>
                </span>
                <span className="tabular flex shrink-0 gap-1">
                  <Badge tone="success">{s.present}</Badge>
                  {s.absent > 0 && <Badge tone="danger">{s.absent}</Badge>}
                  <Badge tone="neutral">{s.total}</Badge>
                </span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
