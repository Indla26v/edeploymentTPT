"use client";

import * as React from "react";
import { ArrowRight, Clock, Loader2, MinusCircle, PackagePlus, Send, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime, fmtRelative, fromLocalInput, toLocalInput } from "@/lib/format";
import { ledgerTotals } from "@/lib/sourcing/ledger";
import type { SourcingData } from "@/lib/queries/sourcing";
import { cn } from "@/lib/utils";
import { acceptShortfallAction, cancelRequestAction, proceedToPlacementAction, sendRequestsAction } from "./actions";

const REASONS = ["Men on other bandobast", "On leave / training", "Law & order duty at stations", "Court / VIP duty", "Other"];

export function SourcingBoard({ data, canAct }: { data: SourcingData; canAct: boolean }) {
  const [pending, start] = React.useTransition();
  const [accepting, setAccepting] = React.useState<SourcingData["ledger"][number] | null>(null);
  const [topUp, setTopUp] = React.useState<string[] | null>(null);
  const totals = ledgerTotals(data.ledger);
  const outstanding = data.ledger.reduce((a, r) => a + r.outstanding, 0);
  const needTotal = Object.values(data.need).reduce((a, b) => a + b, 0);
  const first = data.requests.length === 0;
  const live = data.plan.status === "sourcing";
  const ready = live && totals.settled && outstanding === 0;
  // Short = gap not covered by requests still awaiting a reply.
  const realShort = data.ledger.reduce((a, r) => a + Math.max(0, r.gap - r.outstanding), 0);

  if (first && canAct && live) {
    return <Distribution data={data} kind="initial" rankIds={Object.keys(data.need).filter((r) => data.need[r]! > 0)} onDone={() => {}} inline />;
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Reconciliation ledger</CardTitle>
            <CardDescription>Accept what stations gave, or top up in parallel. The plan never goes back to the IO or COs.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {totals.settled ? (
              <StatusPill status="accepted" label={outstanding ? `Settled · ${outstanding} awaiting reply` : "All ranks settled"} />
            ) : realShort > 0 ? (
              <StatusPill status="short" count={realShort} />
            ) : (
              <StatusPill status="pending" label={`${outstanding} awaiting reply`} />
            )}
            {canAct && live && needTotal > 0 && (
              <Button size="sm" variant="outline" onClick={() => setTopUp(Object.keys(data.need).filter((r) => data.need[r]! > 0))}>
                <PackagePlus /> Request more
              </Button>
            )}
            {canAct && live && (
              <Button
                size="sm"
                disabled={!ready || pending}
                title={ready ? undefined : "Settle every rank and wait for pending replies first"}
                onClick={() =>
                  start(async () => {
                    const r = await proceedToPlacementAction(data.plan.id);
                    if (r.ok) toast.success("Sourcing closed — on to placement");
                    else toast.error(r.error);
                  })
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />} Proceed to placement
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 lg:grid-cols-2">
          {data.ledger.map((r) => (
            <div key={r.rankId} className="rounded-2xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Badge tone="solid" className="min-w-12 justify-center py-1">
                    {r.rankCode}
                  </Badge>
                  <p className="tabular text-sm leading-tight">
                    <span className="font-semibold">{Math.min(r.committed, r.required)}</span>
                    <span className="text-muted-foreground"> of {r.required} committed</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.named} named
                      {r.outstanding ? ` · ${r.outstanding} awaiting reply` : ""}
                      {r.acceptedShortfall ? ` · ${r.acceptedShortfall} short accepted` : ""}
                    </span>
                  </p>
                </div>
                {r.state === "settled" && r.acceptedShortfall === 0 && <StatusPill status="accepted" label="Settled" />}
                {r.state === "settled" && r.acceptedShortfall > 0 && <StatusPill status="shortfall_accepted" />}
                {r.state === "over" && <StatusPill status="accepted" label={`${r.surplus} extra`} />}
                {r.state === "awaiting_topup" && <StatusPill status="sent" label={`Top-up awaited (${r.pendingTopUp})`} />}
                {r.state === "short" && (r.gap > r.outstanding ? <StatusPill status="short" count={r.gap - r.outstanding} /> : <StatusPill status="pending" label="Awaiting replies" />)}
              </div>
              <Progress className="mt-2.5 h-1.5" value={r.fillRatio * 100} tone={r.state === "short" ? "warning" : r.state === "awaiting_topup" ? "primary" : "success"} aria-label={`${r.rankCode} filled`} />
              {canAct && live && r.gap > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button size="sm" variant="soft" onClick={() => setAccepting(r)}>
                    <MinusCircle /> Accept shortfall
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setTopUp([r.rankId])}>
                    <PackagePlus /> Top-up from other stations
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Responses data={data} canAct={canAct && live} />

      <AcceptDialog planId={data.plan.id} row={accepting} onClose={() => setAccepting(null)} />
      <Sheet open={!!topUp} onOpenChange={(o) => !o && setTopUp(null)}>
        <SheetContent className="sm:max-w-3xl">
          {topUp && <Distribution data={data} kind="top_up" rankIds={topUp} onDone={() => setTopUp(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Responses({ data, canAct }: { data: SourcingData; canAct: boolean }) {
  const [pending, start] = React.useTransition();
  const ranks = [...new Map(data.requests.flatMap((r) => r.lines.map((l) => [l.rankId, { id: l.rankId, code: l.rank, seniority: l.seniority }] as const))).values()].sort((a, b) => a.seniority - b.seniority);
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <p className="font-semibold">Station replies</p>
        <p className="text-xs text-muted-foreground">Each cell: committed / requested · named</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-2 text-left font-medium">Station</th>
              {ranks.map((r) => (
                <th key={r.id} className="px-2 py-2 text-center font-medium">
                  {r.code}
                </th>
              ))}
              <th className="px-2 py-2 text-left font-medium">Reply</th>
              <th className="px-4 py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.requests.map((q) => {
              const req = q.lines.reduce((a, l) => a + l.requested, 0);
              const com = q.lines.reduce((a, l) => a + (l.committed ?? 0), 0);
              return (
                <tr key={q.id} className={cn(q.status === "cancelled" && "opacity-50")}>
                  <td className="px-4 py-2">
                    <p className="font-medium">{q.station}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {q.kind === "top_up" ? "Top-up" : `Round ${q.round}`} · sent {fmtDateTime(q.sentAt)}
                    </p>
                  </td>
                  {ranks.map((r) => {
                    const l = q.lines.find((x) => x.rankId === r.id);
                    if (!l) return <td key={r.id} />;
                    const short = l.committed !== null && l.committed < l.requested;
                    return (
                      <td key={r.id} className="px-2 py-2 text-center">
                        <span className={cn("tabular inline-flex min-w-14 justify-center rounded-full px-2 py-0.5 text-sm font-semibold", l.committed === null ? "bg-muted text-muted-foreground" : short ? "bg-warning-soft text-warning-soft-foreground" : "bg-success-soft text-success-soft-foreground")}>
                          {l.committed ?? "–"}/{l.requested}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">{l.named} named</span>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2">
                    <div className="flex flex-col items-start gap-0.5">
                      {q.status === "sent" ? (
                        <StatusPill status="pending" label={`Due ${fmtRelative(q.deadlineAt)}`} />
                      ) : q.status === "partial" ? (
                        <StatusPill status="short" count={req - com} />
                      ) : q.status === "committed" ? (
                        <StatusPill status="accepted" label="Full" />
                      ) : (
                        <StatusPill status={q.status === "auto_accepted" ? "auto_accepted" : q.status === "declined" ? "declined" : "draft"} label={q.status === "cancelled" ? "Withdrawn" : undefined} />
                      )}
                      {(q.shortReason || q.lines.find((l) => l.reason)?.reason) && <span className="max-w-48 truncate text-[11px] text-muted-foreground">{q.shortReason ?? q.lines.find((l) => l.reason)?.reason}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canAct && q.status === "sent" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const r = await cancelRequestAction(q.id);
                            if (r.ok) toast.success(r.message ?? "Withdrawn");
                            else toast.error(r.error);
                          })
                        }
                      >
                        <Undo2 /> Withdraw
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AcceptDialog({ planId, row, onClose }: { planId: string; row: SourcingData["ledger"][number] | null; onClose: () => void }) {
  const [count, setCount] = React.useState(0);
  const [reason, setReason] = React.useState(REASONS[0]!);
  const [pending, start] = React.useTransition();
  const [prev, setPrev] = React.useState<string | null>(null);
  if ((row?.rankId ?? null) !== prev) {
    setPrev(row?.rankId ?? null);
    setCount(row?.gap ?? 0);
  }
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Proceed with fewer {row?.rankCode}?</DialogTitle>
          <DialogDescription>
            The plan continues with the {row?.rankCode} stations gave ({row ? Math.min(row.committed, row.required) : 0} of {row?.required}). Component Officers leave their lowest-priority points short in placement. Nothing is sent back for re-application.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
          <div className="grid gap-1.5">
            <Label htmlFor="accept-count">Accept short</Label>
            <Input id="accept-count" inputMode="numeric" value={count} onChange={(e) => setCount(Number(e.target.value.replace(/\D/g, "")) || 0)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Reason (kept in the audit log)</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger aria-label="Reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={pending || count <= 0}
            onClick={() =>
              start(async () => {
                if (!row) return;
                const r = await acceptShortfallAction(planId, { rankId: row.rankId, count, reason });
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success(`Continuing with ${Math.min(row.committed, row.required)} ${row.rankCode}`, { description: `${r.data.accepted} short accepted · ${reason}` });
                onClose();
              })
            }
          >
            <MinusCircle /> Accept and continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Stations × ranks grid, pre-filled by the distribution engine. Used for the first round and for top-ups. */
function Distribution({ data, kind, rankIds, onDone, inline = false }: { data: SourcingData; kind: "initial" | "top_up"; rankIds: string[]; onDone: () => void; inline?: boolean }) {
  const ranks = data.ledger.filter((r) => rankIds.includes(r.rankId));
  const initial = React.useMemo(() => {
    const g: Record<string, Record<string, number>> = {};
    for (const [sid, cells] of Object.entries(data.suggestion.grid)) for (const [rid, n] of Object.entries(cells)) if (rankIds.includes(rid)) (g[sid] ??= {})[rid] = n;
    return g;
  }, [data.suggestion.grid, rankIds]);
  const [grid, setGrid] = React.useState(initial);
  const [deadline, setDeadline] = React.useState(() => toLocalInput(new Date(Date.now() + (kind === "top_up" ? 3 : 6) * 3600e3)));
  const [note, setNote] = React.useState("");
  const [pending, start] = React.useTransition();
  const stations = [...data.stations].sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
  const colTotal = (rid: string) => Object.values(grid).reduce((a, g) => a + (g[rid] ?? 0), 0);
  const total = ranks.reduce((a, r) => a + colTotal(r.rankId), 0);
  const set = (sid: string, rid: string, n: number) => setGrid((g) => ({ ...g, [sid]: { ...g[sid], [rid]: n } }));

  const send = () =>
    start(async () => {
      const iso = fromLocalInput(deadline);
      if (!iso) {
        toast.error("Set a reply deadline");
        return;
      }
      const r = await sendRequestsAction(data.plan.id, {
        deadlineAt: iso,
        note: note || null,
        kind,
        grid: Object.entries(grid).map(([stationId, cells]) => ({ stationId, lines: Object.entries(cells).map(([rankId, requested]) => ({ rankId, requested })) })),
      });
      if (!r.ok) {
        toast.error(r.fieldErrors?.deadlineAt ?? r.error);
        return;
      }
      toast.success(`${r.data.men} men requested`, { description: "Office Incharges have been alerted." });
      onDone();
    });

  const body = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Sparkles className="size-4 text-primary" />
        <span className="text-muted-foreground">Pre-filled: preferred stations first, then nearest with free men (25% kept back at each station). Edit any number.</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ranks.map((r) => {
          const need = data.need[r.rankId] ?? 0;
          const got = colTotal(r.rankId);
          return (
            <Badge key={r.rankId} tone={got >= need ? "success" : "warning"} className="tabular h-7 px-3">
              {r.rankCode} {got}/{need}
              {got < need ? ` · gap ${need - got}` : ""}
            </Badge>
          );
        })}
      </div>
      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="px-3 py-2 text-left font-medium">Station</th>
              {ranks.map((r) => (
                <th key={r.rankId} className="px-1 py-2 text-center font-medium">
                  {r.rankCode}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {stations.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-1.5">
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-1.5 text-[11px] text-muted-foreground">{s.distanceKm !== null ? `${s.distanceKm} km` : ""}</span>
                </td>
                {ranks.map((r) => {
                  const free = s.free[r.rankId] ?? 0;
                  const v = grid[s.id]?.[r.rankId] ?? 0;
                  return (
                    <td key={r.rankId} className="px-1 py-1.5 text-center">
                      <input
                        inputMode="numeric"
                        aria-label={`${r.rankCode} from ${s.name}`}
                        value={v || ""}
                        placeholder="0"
                        disabled={free === 0 && v === 0}
                        onChange={(e) => set(s.id, r.rankId, Math.min(5000, Number(e.target.value.replace(/\D/g, "")) || 0))}
                        className={cn("tabular h-8 w-12 rounded-lg border border-input bg-card text-center text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-40", v > free && "border-warning")}
                      />
                      <span className="block text-[10px] text-muted-foreground">{free} free</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor={`deadline-${kind}`} className="flex items-center gap-1">
            <Clock className="size-3.5" /> Reply by
          </Label>
          <Input id={`deadline-${kind}`} type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">No reply by then = full strength assumed.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`note-${kind}`}>Note to stations (optional)</Label>
          <Textarea id={`note-${kind}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reporting place, uniform, kit…" />
        </div>
      </div>
    </div>
  );

  if (inline) {
    return (
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Distribute force to stations</CardTitle>
            <CardDescription>
              {data.ledger.reduce((a, r) => a + r.required, 0)} men required. Send now — even with a gap; you can top up or accept a shortfall later.
            </CardDescription>
          </div>
          <Button disabled={pending || total === 0} onClick={send}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />} Request {total} men
          </Button>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    );
  }
  return (
    <>
      <SheetHeader>
        <SheetTitle>{kind === "top_up" ? "Top-up" : "Request more"}</SheetTitle>
        <SheetDescription>Runs in parallel — stations that already committed keep going.</SheetDescription>
      </SheetHeader>
      <SheetBody>{body}</SheetBody>
      <SheetFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={pending || total === 0} onClick={send}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />} Send {total}
        </Button>
      </SheetFooter>
    </>
  );
}

