"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { closeEscalationAction, distributeToUnitsAction } from "../../actions";

type Line = { rankId: string; rank: string; requested: number };
type Unit = { id: string; name: string; type: string; free: Record<string, number> };
type Sent = { id: string; station: string; status: string; lines: { rankId: string; rank: string; requested: number; committed: number | null; named: number }[] };

export function DistributeUnits({ escalationId, status, lines, units, prefill, sent }: { escalationId: string; status: string; lines: Line[]; units: Unit[]; prefill: Record<string, Record<string, number>>; sent: Sent[] }) {
  const router = useRouter();
  const [grid, setGrid] = React.useState(prefill);
  const [deadline, setDeadline] = React.useState(() => toLocalInput(new Date(Date.now() + 4 * 3600e3)));
  const [pending, start] = React.useTransition();
  const col = (r: string) => Object.values(grid).reduce((a, g) => a + (g[r] ?? 0), 0);
  const open = status === "open";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {lines.map((l) => (
          <Badge key={l.rankId} tone={col(l.rankId) >= l.requested ? "success" : "warning"} className="tabular h-7 px-3">
            {l.rank} {open ? `${col(l.rankId)}/` : ""}
            {l.requested}
          </Badge>
        ))}
      </div>
      {open ? (
        <Card className="gap-3 p-0">
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="px-3 py-2 text-left font-medium">Unit</th>
                  {lines.map((l) => (
                    <th key={l.rankId} className="px-2 py-2 text-center font-medium">
                      {l.rank}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {units.map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{u.name}</span> <span className="text-[11px] text-muted-foreground capitalize">{u.type}</span>
                    </td>
                    {lines.map((l) => {
                      const free = u.free[l.rankId] ?? 0;
                      const v = grid[u.id]?.[l.rankId] ?? 0;
                      return (
                        <td key={l.rankId} className="px-2 py-1.5 text-center">
                          <input
                            inputMode="numeric"
                            aria-label={`${l.rank} from ${u.name}`}
                            value={v || ""}
                            placeholder="0"
                            disabled={free === 0 && v === 0}
                            onChange={(e) => setGrid((g) => ({ ...g, [u.id]: { ...g[u.id], [l.rankId]: Math.min(5000, Number(e.target.value.replace(/\D/g, "")) || 0) } }))}
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
          <div className="flex flex-wrap items-end gap-2 border-t px-3 py-3">
            <div className="grid gap-1.5">
              <Label htmlFor="dgp-deadline">Reply by</Label>
              <Input id="dgp-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-56" />
            </div>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await closeEscalationAction(escalationId);
                  if (r.ok) router.push("/dgp/requirements");
                  else toast.error(r.error);
                })
              }
            >
              <X /> Close without sending
            </Button>
            <Button
              className="ml-auto"
              disabled={pending || lines.every((l) => col(l.rankId) === 0)}
              onClick={() =>
                start(async () => {
                  const iso = fromLocalInput(deadline);
                  if (!iso) return void toast.error("Set a date and time");
                  const r = await distributeToUnitsAction(escalationId, { deadlineAt: iso, grid: Object.entries(grid).map(([unitId, cells]) => ({ unitId, lines: Object.entries(cells).map(([rankId, requested]) => ({ rankId, requested })) })) });
                  if (!r.ok) return void toast.error(r.fieldErrors?.deadlineAt ?? r.error);
                  toast.success(`${r.data.men} men asked from ${r.data.units} unit${r.data.units > 1 ? "s" : ""}`);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Send />} Send to units
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[11px] tracking-wide text-muted-foreground uppercase">
                <th className="px-3 py-2 text-left font-medium">Unit</th>
                <th className="px-3 py-2 text-left font-medium">Committed / asked · named</th>
                <th className="px-3 py-2 text-left font-medium">Reply</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sent.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium">{r.station}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {r.lines.map((l) => (
                        <Badge key={l.rankId} tone="neutral" className="tabular">
                          {l.rank} {l.committed ?? "–"}/{l.requested} · {l.named}
                        </Badge>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={r.status === "sent" ? "pending" : r.status === "partial" ? "short" : r.status === "committed" ? "accepted" : r.status === "auto_accepted" ? "auto_accepted" : "declined"} label={r.status === "sent" ? "Awaiting reply" : r.status === "committed" ? "Full" : undefined} />
                  </td>
                </tr>
              ))}
              {sent.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-muted-foreground">
                    Closed without distribution.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
