"use client";

import * as React from "react";
import { CircleCheck, MinusCircle, PackagePlus, Send } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clampShortfallAcceptance, computeLedgerRow, ledgerTotals, type RankLedgerInput } from "@/lib/sourcing/ledger";
import { cn } from "@/lib/utils";
import { SAMPLE_LEDGER, SAMPLE_RESPONSES, TOPUP_CANDIDATES } from "../_data";

const REASONS = ["Men on other bandobast", "On leave", "Law & order duty at station", "Training / court duty", "Other"];

function ForceGrid() {
  const ranks = ["SI", "HC", "PC"] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Station responses</CardTitle>
        <CardDescription>Each cell: committed of requested, with the station&apos;s free strength underneath.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Station</TableHead>
              {ranks.map((r) => (
                <TableHead key={r} className="text-center">
                  {r}
                </TableHead>
              ))}
              <TableHead>Response</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SAMPLE_RESPONSES.map((s) => (
              <TableRow key={s.station}>
                <TableCell>
                  <p className="font-medium">{s.station}</p>
                  <p className="text-xs text-muted-foreground">{s.division} division</p>
                </TableCell>
                {ranks.map((r) => {
                  const c = s.cells[r];
                  const short = c.committed !== null && c.committed < c.requested;
                  return (
                    <TableCell key={r} className="text-center">
                      <div className="inline-flex flex-col items-center gap-1">
                        <span
                          className={cn(
                            "tabular inline-flex min-w-16 justify-center rounded-full px-2.5 py-1 text-sm font-semibold",
                            short ? "bg-warning-soft text-warning-soft-foreground" : "bg-success-soft text-success-soft-foreground",
                          )}
                        >
                          {c.committed ?? "–"} / {c.requested}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{c.available} free</span>
                      </div>
                    </TableCell>
                  );
                })}
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    {s.status === "short" ? (
                      <StatusPill status="short" count={Object.values(s.cells).reduce((a, c) => a + (c.requested - (c.committed ?? 0)), 0)} />
                    ) : (
                      <StatusPill status={s.status} />
                    )}
                    {s.reason && <span className="text-xs text-muted-foreground">{s.reason}</span>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function SourcingDemo() {
  const [inputs, setInputs] = React.useState<RankLedgerInput[]>(SAMPLE_LEDGER);
  const rows = inputs.map(computeLedgerRow);
  const totals = ledgerTotals(rows);

  const [acceptRank, setAcceptRank] = React.useState<string | null>(null);
  const [acceptCount, setAcceptCount] = React.useState(0);
  const [acceptReason, setAcceptReason] = React.useState(REASONS[0]!);
  const [topUpRank, setTopUpRank] = React.useState<string | null>(null);
  const [topUpCounts, setTopUpCounts] = React.useState<Record<string, number>>({});

  const update = (rank: string, fn: (r: RankLedgerInput) => RankLedgerInput) =>
    setInputs((cur) => cur.map((r) => (r.rankCode === rank ? fn(r) : r)));

  const acceptRow = rows.find((r) => r.rankCode === acceptRank);
  const topUpRow = rows.find((r) => r.rankCode === topUpRank);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
      <ForceGrid />
      <Card>
        <CardHeader>
          <CardTitle>Reconciliation ledger</CardTitle>
          <CardDescription>Accept what stations gave, or top up in parallel. The plan never goes back for re-application.</CardDescription>
          <CardAction>
            {totals.settled ? <StatusPill status="accepted" label="All ranks settled" /> : <StatusPill status="short" count={totals.gap} />}
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((r) => (
            <div key={r.rankCode} className="rounded-2xl border border-border/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Badge tone="solid" className="min-w-10 py-1">
                    {r.rankCode}
                  </Badge>
                  <p className="tabular text-sm">
                    <span className="font-semibold">{Math.min(r.committed, r.required)}</span>
                    <span className="text-muted-foreground"> of {r.required} committed</span>
                    {r.acceptedShortfall > 0 && <span className="text-muted-foreground"> · {r.acceptedShortfall} accepted short</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.state === "settled" && r.acceptedShortfall === 0 && <StatusPill status="accepted" label="Settled" />}
                  {r.state === "settled" && r.acceptedShortfall > 0 && <StatusPill status="shortfall_accepted" />}
                  {r.state === "awaiting_topup" && <StatusPill status="sent" label={`Top-up awaited (${r.pendingTopUp})`} />}
                  {r.state === "short" && <StatusPill status="short" count={r.gap} />}
                </div>
              </div>
              <Progress
                className="mt-3"
                value={r.fillRatio * 100}
                tone={r.state === "short" ? "warning" : r.state === "awaiting_topup" ? "primary" : "success"}
                aria-label={`${r.rankCode} fill`}
              />
              {(r.state === "short" || r.state === "awaiting_topup") && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={() => {
                      setAcceptRank(r.rankCode);
                      setAcceptCount(r.gap);
                    }}
                  >
                    <MinusCircle /> Accept shortfall
                  </Button>
                  {r.state === "short" ? (
                    <Button size="sm" variant="outline" onClick={() => setTopUpRank(r.rankCode)}>
                      <PackagePlus /> Top-up from other stations
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        update(r.rankCode, (x) => ({ ...x, committed: x.committed + (x.pendingTopUp ?? 0), pendingTopUp: 0 }));
                        toast.success(`Top-up received for ${r.rankCode}`, { description: "Stations committed the full top-up." });
                      }}
                    >
                      <CircleCheck /> Simulate station reply
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Accept shortfall */}
      <Dialog open={!!acceptRank} onOpenChange={(o) => !o && setAcceptRank(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proceed with fewer {acceptRank}?</DialogTitle>
            <DialogDescription>
              The plan continues with the strength stations gave. Component Officers will see the unfilled {acceptRank} slots and decide which
              low-priority points stay short. Nothing is sent back for re-application.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="accept-count">Accept short</Label>
              <Input
                id="accept-count"
                type="number"
                min={1}
                max={acceptRow?.gap}
                value={acceptCount}
                onChange={(e) => setAcceptCount(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Reason (recorded in audit log)</Label>
              <Select value={acceptReason} onValueChange={setAcceptReason}>
                <SelectTrigger>
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
              onClick={() => {
                if (!acceptRow) return;
                const n = clampShortfallAcceptance(acceptRow, acceptCount);
                if (n === 0) {
                  toast.error("Enter a whole number up to the current gap");
                  return;
                }
                update(acceptRow.rankCode, (x) => ({ ...x, acceptedShortfall: x.acceptedShortfall + n, pendingTopUp: 0 }));
                toast.success(`Plan continues with ${acceptRow.committed} ${acceptRow.rankCode}`, { description: `${n} short accepted · ${acceptReason}` });
                setAcceptRank(null);
              }}
            >
              <MinusCircle /> Accept and continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top-up */}
      <Sheet open={!!topUpRank} onOpenChange={(o) => !o && (setTopUpRank(null), setTopUpCounts({}))}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Top-up {topUpRank}</SheetTitle>
            <SheetDescription>
              Gap of {topUpRow?.gap ?? 0}. Stations nearest to the bandobast with free {topUpRank} are listed first. This runs in parallel; stations that already
              committed keep going.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-3">
            {TOPUP_CANDIDATES.map((c) => {
              const free = topUpRank ? (c.available[topUpRank] ?? 0) : 0;
              return (
                <div key={c.station} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 p-3.5">
                  <div>
                    <p className="font-medium">{c.station}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.division} · {c.distanceKm} km · <span className="tabular">{free}</span> free
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={free}
                    aria-label={`Request from ${c.station}`}
                    className="w-20 text-center"
                    value={topUpCounts[c.station] ?? 0}
                    onChange={(e) => setTopUpCounts((cur) => ({ ...cur, [c.station]: Math.max(0, Math.min(free, Number(e.target.value))) }))}
                  />
                </div>
              );
            })}
            <p className="tabular px-1 text-sm text-muted-foreground">
              Requesting {Object.values(topUpCounts).reduce((a, b) => a + b, 0)} of {topUpRow?.gap ?? 0}
            </p>
          </SheetBody>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline">Cancel</Button>
            </SheetClose>
            <Button
              onClick={() => {
                const total = Object.values(topUpCounts).reduce((a, b) => a + b, 0);
                if (!topUpRow || total === 0) {
                  toast.error("Enter how many to request from at least one station");
                  return;
                }
                update(topUpRow.rankCode, (x) => ({ ...x, requested: x.requested + total, pendingTopUp: total }));
                toast.success(`Top-up sent for ${total} ${topUpRow.rankCode}`, { description: "Stations have until 18:30 to respond." });
                setTopUpRank(null);
                setTopUpCounts({});
              }}
            >
              <Send /> Send top-up request
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
