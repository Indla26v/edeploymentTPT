"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDateTime, fmtRelative, fromLocalInput, toLocalInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { distributeOwnStationsAction, respondUnitAction } from "../../actions";

const REASONS = ["Men on own bandobast", "Law & order situation", "On leave / training", "Election / VIP duty", "Other"];

type Line = { rankId: string; rank: string; requested: number; committed: number | null; reason: string | null; named: number };
type Req = { id: string; status: string; deadlineAt: Date; respondedAt: Date | null; note: string | null; lines: Line[] };
type Child = { id: string; station: string; status: string; lines: Line[] };
type Station = { id: string; name: string; free: Record<string, number> };

const pill = (s: string) => (s === "sent" ? <StatusPill status="pending" label="Awaiting reply" /> : <StatusPill status={s === "partial" ? "short" : s === "committed" ? "accepted" : s === "auto_accepted" ? "auto_accepted" : s === "cancelled" ? "cancelled" : "declined"} label={s === "partial" ? "Short" : s === "committed" ? "Full" : undefined} />);

export function UnitReply({ request: r, stations, childRequests, planOpen }: { request: Req; stations: Station[]; childRequests: Child[]; planOpen: boolean }) {
  return r.status === "sent" ? <ReplyCard r={r} /> : <Distribute r={r} stations={stations} childRequests={childRequests} planOpen={planOpen} />;
}

function ReplyCard({ r }: { r: Req }) {
  const router = useRouter();
  const [counts, setCounts] = React.useState<Record<string, number>>(() => Object.fromEntries(r.lines.map((l) => [l.rankId, l.requested])));
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>How many can your unit give?</CardTitle>
        <CardDescription className="flex items-center gap-1">
          <Clock className="size-3.5" /> Reply by {fmtDateTime(r.deadlineAt)} ({fmtRelative(r.deadlineAt)}). No reply = full strength assumed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {r.note && <p className="rounded-xl bg-muted px-3 py-2 text-sm">“{r.note}”</p>}
        {r.lines.map((l) => {
          const v = counts[l.rankId] ?? 0;
          return (
            <div key={l.rankId} className="flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-2.5">
                <Badge tone="solid" className="min-w-12 justify-center py-1">
                  {l.rank}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Asked for <span className="tabular font-semibold text-foreground">{l.requested}</span>
                </span>
              </div>
              <input
                inputMode="numeric"
                aria-label={`${l.rank} your unit can give`}
                value={v}
                onChange={(e) => setCounts((c) => ({ ...c, [l.rankId]: Math.min(l.requested, Number(e.target.value.replace(/\D/g, "")) || 0) }))}
                className="tabular h-10 w-20 rounded-xl border border-input bg-card text-center text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
              />
              {v < l.requested && (
                <Select value={reasons[l.rankId] ?? ""} onValueChange={(x) => setReasons((p) => ({ ...p, [l.rankId]: x }))}>
                  <SelectTrigger className="w-full sm:w-56" aria-label={`Reason for fewer ${l.rank}`}>
                    <SelectValue placeholder="Why fewer?" />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS.map((x) => (
                      <SelectItem key={x} value={x}>
                        {x}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}
        <div className="flex justify-end pt-1">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await respondUnitAction(r.id, { lines: r.lines.map((l) => ({ rankId: l.rankId, committed: counts[l.rankId] ?? 0, reason: (counts[l.rankId] ?? 0) < l.requested ? reasons[l.rankId] || null : null })) });
                if (!res.ok) return void toast.error(res.error);
                toast.success("Reply sent — now ask your stations for the men");
                router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Send />} Send reply
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Distribute({ r, stations, childRequests, planOpen }: { r: Req; stations: Station[]; childRequests: Child[]; planOpen: boolean }) {
  const router = useRouter();
  const lines = r.lines.map((l) => {
    const limit = l.committed ?? (r.status === "auto_accepted" ? l.requested : 0);
    const asked = childRequests.filter((c) => c.status !== "cancelled").reduce((a, c) => a + (c.lines.find((x) => x.rankId === l.rankId)?.requested ?? 0), 0);
    const named = childRequests.reduce((a, c) => a + (c.lines.find((x) => x.rankId === l.rankId)?.named ?? 0), 0);
    return { ...l, limit, asked, named, left: Math.max(0, limit - asked) };
  });
  const [grid, setGrid] = React.useState<Record<string, Record<string, number>>>(() => prefill(lines, stations));
  const [deadline, setDeadline] = React.useState(() => toLocalInput(new Date(Date.now() + 3 * 3600e3)));
  const [pending, start] = React.useTransition();
  const col = (rk: string) => Object.values(grid).reduce((a, g) => a + (g[rk] ?? 0), 0);
  const anyLeft = lines.some((l) => l.left > 0);

  return (
    <div className="flex flex-col gap-3">
      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Your commitment</p>
          <span className="text-xs text-muted-foreground">{r.respondedAt ? `Replied ${fmtDateTime(r.respondedAt)}` : "Deadline passed — full strength assumed"}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {lines.map((l) => (
            <div key={l.rankId} className="rounded-xl border px-3 py-2">
              <div className="flex items-center justify-between">
                <Badge tone="solid">{l.rank}</Badge>
                <span className="tabular text-sm">
                  <span className="font-semibold">{l.limit}</span>
                  <span className="text-muted-foreground">/{l.requested}</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground tabular">
                {l.asked} asked from stations · {l.named} named{l.left ? ` · ${l.left} to ask` : ""}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {planOpen && anyLeft && (
        <Card className="gap-0 p-0">
          <div className="border-b px-4 py-3">
            <p className="font-medium">Ask your stations</p>
            <p className="text-xs text-muted-foreground">Their officers&apos; names go straight to the requesting plan.</p>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-2 text-left font-medium">Station</th>
                  {lines.map((l) => (
                    <th key={l.rankId} className="px-2 py-2 text-center font-medium">
                      {l.rank} <span className={cn("tabular normal-case", col(l.rankId) > l.left ? "text-destructive" : "text-muted-foreground")}>{col(l.rankId)}/{l.left}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {stations.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-1.5 font-medium">{s.name}</td>
                    {lines.map((l) => {
                      const free = s.free[l.rankId] ?? 0;
                      const v = grid[s.id]?.[l.rankId] ?? 0;
                      return (
                        <td key={l.rankId} className="px-2 py-1.5 text-center">
                          <input
                            inputMode="numeric"
                            aria-label={`${l.rank} from ${s.name}`}
                            value={v || ""}
                            placeholder="0"
                            disabled={l.left === 0}
                            onChange={(e) => setGrid((g) => ({ ...g, [s.id]: { ...g[s.id], [l.rankId]: Math.min(5000, Number(e.target.value.replace(/\D/g, "")) || 0) } }))}
                            className={cn("tabular h-8 w-14 rounded-lg border border-input bg-card text-center text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-40", v > free && "border-warning")}
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
          <div className="flex flex-wrap items-end gap-2 border-t px-4 py-3">
            <div className="grid gap-1.5">
              <Label htmlFor="unit-deadline">Stations reply by</Label>
              <Input id="unit-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-56" />
            </div>
            <Button
              className="ml-auto"
              disabled={pending || lines.every((l) => col(l.rankId) === 0) || lines.some((l) => col(l.rankId) > l.left)}
              onClick={() =>
                start(async () => {
                  const iso = fromLocalInput(deadline);
                  if (!iso) return void toast.error("Set a date and time");
                  const res = await distributeOwnStationsAction(r.id, { deadlineAt: iso, grid: Object.entries(grid).map(([stationId, cells]) => ({ stationId, lines: Object.entries(cells).map(([rankId, requested]) => ({ rankId, requested })) })) });
                  if (!res.ok) return void toast.error(res.fieldErrors?.deadlineAt ?? res.error);
                  toast.success("Requests sent to your stations");
                  setGrid({});
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Send />} Send to stations
            </Button>
          </div>
        </Card>
      )}

      {childRequests.length > 0 && (
        <Card className="p-0">
          <div className="border-b px-4 py-3 font-medium">Station replies</div>
          <ul className="divide-y">
            {childRequests.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                <span className="min-w-32 font-medium">{c.station}</span>
                <span className="flex flex-1 flex-wrap gap-1">
                  {c.lines.map((l) => (
                    <Badge key={l.rankId} tone="neutral" className="tabular">
                      {l.rank} {l.committed ?? "–"}/{l.requested} · {l.named} named
                    </Badge>
                  ))}
                </span>
                {pill(c.status)}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Fill each rank's remaining commitment from the stations with the most free men, keeping one in four at the station. */
function prefill(lines: { rankId: string; left: number }[], stations: Station[]) {
  const g: Record<string, Record<string, number>> = {};
  for (const l of lines) {
    let need = l.left;
    for (const s of [...stations].sort((a, b) => (b.free[l.rankId] ?? 0) - (a.free[l.rankId] ?? 0))) {
      if (need <= 0) break;
      const take = Math.min(need, Math.floor((s.free[l.rankId] ?? 0) * 0.75));
      if (take > 0) {
        g[s.id] = { ...g[s.id], [l.rankId]: take };
        need -= take;
      }
    }
  }
  return g;
}
