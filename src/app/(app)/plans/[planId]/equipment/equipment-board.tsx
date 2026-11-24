"use client";

import * as React from "react";
import { Loader2, PackagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { allocateEquipmentAction, removeAllocationAction } from "../execution/actions";

type Need = { equipmentTypeId: string; component: string; quantity: number; note: string | null; planComponentId: string };
type Alloc = { id: string; equipmentTypeId: string; type: string; station: string; quantity: number; issuedAt: string | null; returnedQty: number; returnedAt: string | null };
type Free = { station_id: string; station: string; type_id: string; working: number; free: number };

export function EquipmentBoard({ planId, types, need, allocations, free, canEdit }: { planId: string; types: { id: string; name: string }[]; need: Need[]; allocations: Alloc[]; free: Free[]; canEdit: boolean }) {
  const [type, setType] = React.useState(need[0]?.equipmentTypeId ?? types[0]?.id ?? "");
  const [station, setStation] = React.useState("");
  const [qty, setQty] = React.useState(1);
  const [pending, start] = React.useTransition();
  const needed = (t: string) => need.filter((n) => n.equipmentTypeId === t).reduce((a, n) => a + n.quantity, 0);
  const allocated = (t: string) => allocations.filter((a) => a.equipmentTypeId === t).reduce((a, n) => a + n.quantity, 0);
  const options = free.filter((f) => f.type_id === type && f.free > 0).sort((a, b) => b.free - a.free);
  const pick = options.find((o) => o.station_id === station);
  const shownTypes = types.filter((t) => needed(t.id) || allocated(t.id));

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shownTypes.map((t) => {
            const n = needed(t.id);
            const a = allocated(t.id);
            return (
              <Card key={t.id} className="gap-1.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{t.name}</p>
                  <Badge tone={a >= n ? "success" : "warning"} className="tabular">
                    {a}/{n || "—"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {need
                    .filter((x) => x.equipmentTypeId === t.id)
                    .map((x) => `${x.component}: ${x.quantity}`)
                    .join(" · ") || "Not requested by a CO"}
                </p>
              </Card>
            );
          })}
          {shownTypes.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground sm:col-span-3">No equipment was requested in the proposals. You can still draw items for the plan.</p>}
        </div>
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[11px] tracking-wide text-muted-foreground uppercase">
                <th className="px-3 py-2 text-left font-medium">Equipment</th>
                <th className="px-3 py-2 text-left font-medium">From station</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {allocations.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-1.5 font-medium">{a.type}</td>
                  <td className="px-3 py-1.5">{a.station}</td>
                  <td className="tabular px-3 py-1.5 text-right">{a.quantity}</td>
                  <td className="px-3 py-1.5">{a.returnedAt ? <StatusPill status="completed" label={`Returned ${a.returnedQty}`} /> : a.issuedAt ? <StatusPill status="sent" label="Issued" /> : <StatusPill status="pending" label="To issue" />}</td>
                  <td className="px-3 py-1.5 text-right">
                    {canEdit && !a.issuedAt && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${a.type} from ${a.station}`}
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const r = await removeAllocationAction(a.id);
                            if (r.ok) toast.success(r.message ?? "Removed");
                            else toast.error(r.error);
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {allocations.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                    Nothing allocated yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
      {canEdit && (
        <Card className="h-fit gap-3 p-4">
          <p className="font-medium">Draw from station stock</p>
          <div className="grid gap-1.5">
            <Label>Equipment</Label>
            <Select value={type} onValueChange={(v) => (setType(v), setStation(""))}>
              <SelectTrigger aria-label="Equipment">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {needed(t.id) ? ` — needs ${Math.max(0, needed(t.id) - allocated(t.id))} more` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Station</Label>
            <Select value={station} onValueChange={setStation}>
              <SelectTrigger aria-label="Station">
                <SelectValue placeholder={options.length ? "Choose station" : "No station has free stock"} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.station_id} value={o.station_id}>
                    {o.station} · {o.free} free
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="eq-qty">Quantity</Label>
            <input id="eq-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(Number(e.target.value.replace(/\D/g, "")) || 0)} className="tabular h-10 rounded-xl border border-input bg-card px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
            {pick && <p className="text-xs text-muted-foreground">{pick.free} working free at {pick.station} — stock never goes below zero.</p>}
          </div>
          <Button
            disabled={pending || !station || qty < 1}
            onClick={() =>
              start(async () => {
                const comp = need.find((n) => n.equipmentTypeId === type)?.planComponentId ?? null;
                const r = await allocateEquipmentAction(planId, { equipmentTypeId: type, stationId: station, quantity: qty, planComponentId: comp });
                if (r.ok) toast.success(r.message ?? "Allocated");
                else toast.error(r.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <PackagePlus />} Allocate
          </Button>
        </Card>
      )}
    </div>
  );
}
