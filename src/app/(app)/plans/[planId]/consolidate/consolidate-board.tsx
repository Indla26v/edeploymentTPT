"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Send, TriangleAlert, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";

import { BoardLayout } from "@/components/layout/page-layouts";
import { StatusPill, type Status } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ConsolidationData } from "@/lib/queries/plans";
import { cn } from "@/lib/utils";
import { checkSendToUo, ioCanEditInline, type ComponentStatus, type PlanStatus } from "@/lib/workflow/plan";
import { ComponentActions } from "../component-actions";
import { keepPreferenceAction, sendToUoAction, setCountAction } from "./actions";

export function ConsolidateBoard({ data, isUo }: { data: ConsolidationData; isUo: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState(data.components[0]?.id ?? "");
  const [confirm, setConfirm] = React.useState(false);
  const [pending, start] = React.useTransition();
  const rankCode = React.useMemo(() => new Map(data.ranks.map((r) => [r.id, r.code])), [data.ranks]);
  const rankOrder = React.useMemo(() => new Map(data.ranks.map((r, i) => [r.id, i])), [data.ranks]);

  const byRank = new Map<string, number>();
  for (const t of data.slotTotals) byRank.set(t.rankId, (byRank.get(t.rankId) ?? 0) + t.n);
  const total = [...byRank.values()].reduce((a, b) => a + b, 0);
  const status = data.plan.status as PlanStatus;
  const check = checkSendToUo(status, data.components.map((c) => ({ name: c.name, status: c.status as ComponentStatus })), total);
  const comp = data.components.find((c) => c.id === selected);

  return (
    <>
      <BoardLayout
        sideWidth="300px"
        toolbar={
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-3 py-2 shadow-soft">
            <span className="text-sm font-medium">Men required</span>
            <span className="tabular text-lg font-semibold">{total.toLocaleString("en-IN")}</span>
            <span className="flex flex-wrap gap-1">
              {[...byRank.entries()]
                .sort((a, b) => (rankOrder.get(a[0]) ?? 0) - (rankOrder.get(b[0]) ?? 0))
                .map(([r, n]) => (
                  <Badge key={r} tone="primary" className="tabular">
                    {rankCode.get(r)} {n}
                  </Badge>
                ))}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {!check.ok && (
                <span className="hidden items-center gap-1 text-xs text-warning-soft-foreground lg:flex" title={check.problems.join("\n")}>
                  <TriangleAlert className="size-3.5" /> {check.problems[0]}
                  {check.problems.length > 1 ? ` (+${check.problems.length - 1})` : ""}
                </span>
              )}
              <Button disabled={!check.ok || pending} onClick={() => setConfirm(true)}>
                <Send /> {isUo ? "Start force sourcing" : "Send to Unit Officer"}
              </Button>
            </div>
          </div>
        }
        side={
          <div className="flex flex-col gap-2">
            {data.conflicts.length > 0 && <Conflicts data={data} />}
            {data.components.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c.id)}
                aria-pressed={selected === c.id}
                className={cn("flex flex-col gap-1.5 rounded-2xl border bg-card p-3 text-left shadow-soft transition-colors", selected === c.id ? "border-primary/50 ring-2 ring-primary/15" : "hover:bg-accent/40")}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="tabular text-sm font-semibold">{c.required || c.draftRequired || "—"}</span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">{c.coName ? `${c.coRank} ${c.coName}` : "No CO"}</span>
                  <StatusPill status={c.status as Status} className="shrink-0 text-[11px]" />
                </span>
              </button>
            ))}
          </div>
        }
      >
        {comp ? <ComponentPanel key={comp.id} data={data} compId={comp.id} rankCode={rankCode} rankOrder={rankOrder} /> : <p className="p-8 text-center text-sm text-muted-foreground">No components.</p>}
      </BoardLayout>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isUo ? "Start force sourcing?" : "Send to the Unit Officer?"}</DialogTitle>
            <DialogDescription>
              {total} men across {data.components.length} components. All proposals are accepted. After this, shortfalls are settled in sourcing — the plan does not come back to you or the Component Officers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await sendToUoAction(data.plan.id);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  setConfirm(false);
                  toast.success(r.data.selfUo ? "Force sourcing started" : "Sent to the Unit Officer");
                  router.push(`/plans/${data.plan.id}`);
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Send />} {isUo ? "Start sourcing" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Conflicts({ data }: { data: ConsolidationData }) {
  const [pending, start] = React.useTransition();
  const compName = (id: string) => data.components.find((c) => c.id === id)?.name ?? "";
  return (
    <div className="rounded-2xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-soft-foreground">
      <p className="mb-2 flex items-center gap-1.5 font-medium">
        <TriangleAlert className="size-4" /> Same officer preferred twice
      </p>
      {data.conflicts.map((list) => (
        <div key={list[0]!.personId} className="mb-2 last:mb-0">
          <p className="text-foreground">
            <Badge tone="primary">{list[0]!.rank}</Badge> {list[0]!.name} <span className="text-xs text-muted-foreground">#{list[0]!.genNo}</span>
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {list
              .filter((p) => p.status === "active")
              .map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await keepPreferenceAction(p.id);
                      if (r.ok) toast.success(r.message ?? "Done");
                      else toast.error(r.error);
                    })
                  }
                >
                  <UserRoundCheck /> Keep for {compName(p.planComponentId)}
                  {p.pointName ? ` · ${p.pointName}` : ""}
                </Button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ComponentPanel({ data, compId, rankCode, rankOrder }: { data: ConsolidationData; compId: string; rankCode: Map<string, string>; rankOrder: Map<string, number> }) {
  const comp = data.components.find((c) => c.id === compId)!;
  const editable = ioCanEditInline(data.plan.status as PlanStatus, comp.status as ComponentStatus);
  const secs = data.sectors.filter((s) => s.planComponentId === compId);
  const pts = data.points.filter((p) => p.planComponentId === compId);
  const reqs = data.requirements.filter((r) => pts.some((p) => p.id === r.pointId));
  const [extra, setExtra] = React.useState<string[]>([]);
  const ranks = [...new Set([...reqs.map((r) => r.rankId), ...extra])].sort((a, b) => (rankOrder.get(a) ?? 0) - (rankOrder.get(b) ?? 0));

  return (
    <Card className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold">
            {comp.name} <StatusPill status={comp.status as Status} />
          </p>
          <p className="text-xs text-muted-foreground">
            {comp.coName ? `${comp.coRank} ${comp.coName} · ${comp.coPhone ?? ""}` : "No Component Officer"}
            {comp.status === "returned" && comp.returnComment ? ` · Returned: “${comp.returnComment}”` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editable && (
            <select aria-label="Add rank column" value="" onChange={(e) => e.target.value && setExtra((x) => [...x, e.target.value])} className="h-8 rounded-full border border-input bg-card px-3 text-sm">
              <option value="">+ Rank</option>
              {data.ranks
                .filter((r) => !ranks.includes(r.id))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code}
                  </option>
                ))}
            </select>
          )}
          <ComponentActions id={comp.id} name={comp.name} status={comp.status} />
        </div>
      </div>
      {!editable && comp.status !== "submitted" && comp.status !== "accepted" ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {comp.status === "returned" ? "Returned — waiting for the Component Officer to resubmit." : "Waiting for the Component Officer's proposal."} You can send a reminder.
        </p>
      ) : (
        <>
          {editable && <p className="text-xs text-muted-foreground">Edit any count directly — the proposal stays with you (no return to the CO). Changes are logged on the plan timeline and the CO is informed.</p>}
          {secs.map((s) => (
            <div key={s.id} className="overflow-x-auto rounded-2xl border">
              <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-sm">
                <span className="font-medium">{s.name}</span>
                {s.batches > 1 && <Badge tone="neutral">{s.batches} batches</Badge>}
                {s.inchargeRankId && <Badge tone="info">Incharge {rankCode.get(s.inchargeRankId)}</Badge>}
                {s.liaisonRankId && <Badge tone="info">Liaison {rankCode.get(s.liaisonRankId)}</Badge>}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    <th className="px-3 py-1.5 text-left font-medium">Point</th>
                    {ranks.map((r) => (
                      <th key={r} className="px-1 py-1.5 text-center font-medium">
                        {rankCode.get(r)}
                      </th>
                    ))}
                    <th className="px-3 py-1.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pts
                    .filter((p) => p.sectorId === s.id)
                    .flatMap((p) =>
                      Array.from({ length: s.batches }, (_, i) => i + 1).map((b) => {
                        const cell = (r: string) => reqs.find((q) => q.pointId === p.id && q.batch === b && q.rankId === r);
                        const rowTotal = ranks.reduce((a, r) => a + (cell(r)?.count ?? 0), 0);
                        const merge = reqs.find((q) => q.pointId === p.id && q.batch === b && q.mergeGroup)?.mergeGroup;
                        return (
                          <tr key={`${p.id}-${b}`}>
                            <td className="px-3 py-1">
                              <span className="font-medium">{p.name}</span>
                              <span className="ml-1.5 text-[11px] text-muted-foreground">
                                P{p.priority}
                                {s.batches > 1 ? ` · B${b}` : ""}
                                {merge ? ` · merge ${merge}` : ""}
                              </span>
                            </td>
                            {ranks.map((r) => (
                              <td key={r} className="px-1 py-1 text-center">
                                <CountCell value={cell(r)?.count ?? 0} editable={editable} label={`${rankCode.get(r)} at ${p.name}${s.batches > 1 ? ` batch ${b}` : ""}`} save={(count) => setCountAction({ pointId: p.id, batch: b, rankId: r, count })} />
                              </td>
                            ))}
                            <td className="tabular px-3 py-1 text-right font-semibold">{rowTotal}</td>
                          </tr>
                        );
                      }),
                    )}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}

function CountCell({ value, editable, label, save }: { value: number; editable: boolean; label: string; save: (n: number) => Promise<{ ok: boolean; error?: string }> }) {
  const [v, setV] = React.useState(String(value || ""));
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");
  const [prev, setPrev] = React.useState(value);
  if (prev !== value) {
    setPrev(value);
    setV(String(value || ""));
  }
  if (!editable) return <span className="tabular">{value || "·"}</span>;
  const commit = async () => {
    const n = Math.min(5000, Number(v.replace(/\D/g, "")) || 0);
    if (n === value) return;
    setState("saving");
    const r = await save(n);
    if (!r.ok) {
      toast.error(r.error);
      setV(String(value || ""));
      setState("idle");
      return;
    }
    setState("saved");
    setTimeout(() => setState("idle"), 1200);
  };
  return (
    <span className="relative inline-flex">
      <input
        inputMode="numeric"
        aria-label={label}
        value={v}
        placeholder="0"
        onChange={(e) => setV(e.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        className={cn("tabular h-8 w-12 rounded-lg border border-input bg-card text-center text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25", state === "saved" && "border-success")}
      />
      {state === "saving" && <Loader2 className="absolute -right-3 top-2 size-3 animate-spin text-muted-foreground" />}
      {state === "saved" && <Check className="absolute -right-3 top-2 size-3 text-success" />}
    </span>
  );
}
