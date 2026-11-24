"use client";

import * as React from "react";
import { BedDouble, CalendarRange, Loader2, MapPin, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { StreetViewLink } from "@/components/map/map-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { autoAllotAction, setAllotmentAction, setStayDatesAction } from "../execution/actions";

type Lodging = { id: string; name: string; category: string; capacity: number; genderAllowed: "any" | "male" | "female"; contactName: string | null; contactPhone: string | null; lat: number | null; lng: number | null };
type Officer = { id: string; name: string; rank: string; gender: "male" | "female"; station: string; posting: string };
type Allot = { personId: string; accommodationId: string; fromDate: string; toDate: string };

export function AccommodationBoard({ planId, lodgings, officers, allotments, defaultFrom, defaultTo, canEdit }: { planId: string; lodgings: Lodging[]; officers: Officer[]; allotments: Allot[]; defaultFrom: string; defaultTo: string; canEdit: boolean }) {
  const [from, setFrom] = React.useState(allotments[0]?.fromDate ?? defaultFrom);
  const [to, setTo] = React.useState(allotments[0]?.toDate ?? defaultTo);
  const [filter, setFilter] = React.useState<string>("all");
  const [pending, start] = React.useTransition();
  const byPerson = new Map(allotments.map((a) => [a.personId, a]));
  const used = (id: string) => allotments.filter((a) => a.accommodationId === id).length;
  const unhoused = officers.filter((o) => !byPerson.has(o.id));
  const shown = officers.filter((o) => (filter === "all" ? true : filter === "none" ? !byPerson.has(o.id) : byPerson.get(o.id)?.accommodationId === filter));
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(ok ?? r.message ?? "Saved");
      else toast.error(r.error);
    });

  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <Card className="flex-row flex-wrap items-end gap-3 p-3">
          <div className="grid gap-1.5">
            <Label htmlFor="stay-from">Check-in</Label>
            <Input id="stay-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="stay-to">Check-out</Label>
            <Input id="stay-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
          </div>
          <Button
            disabled={pending || unhoused.length === 0}
            onClick={() =>
              start(async () => {
                const r = await autoAllotAction(planId, { fromDate: from, toDate: to });
                if (!r.ok) return void toast.error(r.error);
                toast.success(`Allotted ${r.data.allotted} officers`, { description: r.data.unhoused ? `${r.data.unhoused} without a place — add capacity in Masters › Accommodation.` : "Everyone has a place." });
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Wand2 />} Auto-allot {unhoused.length || ""}
          </Button>
          <Button variant="outline" disabled={pending || allotments.length === 0} onClick={() => run(() => setStayDatesAction(planId, { personId: null, fromDate: from, toDate: to }))}>
            <CalendarRange /> Apply dates to all
          </Button>
          <p className="ml-auto text-xs text-muted-foreground">Women first into women-only lodgings; capacity is never exceeded.</p>
        </Card>
      )}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {lodgings.map((l) => (
          <Card key={l.id} className="gap-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{l.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {l.category.replace("_", " ")}
                  {l.contactPhone ? ` · ${l.contactPhone}` : ""}
                </p>
              </div>
              {l.genderAllowed !== "any" && <Badge tone="info">{l.genderAllowed === "female" ? "Women" : "Men"}</Badge>}
            </div>
            <Progress value={(used(l.id) / l.capacity) * 100} tone={used(l.id) >= l.capacity ? "warning" : "success"} className="h-1.5" aria-label={`${l.name} occupancy`} />
            <div className="flex items-center justify-between text-xs">
              <span className="tabular">
                <span className="font-semibold">{used(l.id)}</span> / {l.capacity} beds
              </span>
              {l.lat !== null && l.lng !== null ? <StreetViewLink lat={l.lat} lng={l.lng} /> : <MapPin className="size-3.5 text-muted-foreground" />}
            </div>
          </Card>
        ))}
      </div>
      <Card className="gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <BedDouble className="size-4" /> Officers
          </p>
          <Badge tone={unhoused.length ? "warning" : "success"}>{unhoused.length ? `${unhoused.length} without lodging` : "Everyone housed"}</Badge>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger size="sm" className="ml-auto h-9 w-56 rounded-full" aria-label="Show">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All officers ({officers.length})</SelectItem>
              <SelectItem value="none">Without lodging ({unhoused.length})</SelectItem>
              {lodgings.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name} ({used(l.id)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ul className="divide-y rounded-2xl border">
          {shown.map((o) => {
            const a = byPerson.get(o.id);
            return (
              <li key={o.id} className="grid items-center gap-2 px-3 py-1.5 text-sm sm:grid-cols-[minmax(0,1fr)_16rem_10rem]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Badge tone="primary">{o.rank}</Badge>
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate font-medium">{o.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {o.gender === "female" ? "F" : "M"} · {o.station} · {o.posting}
                    </span>
                  </span>
                </span>
                <Select value={a?.accommodationId ?? "none"} disabled={!canEdit || pending} onValueChange={(v) => run(() => setAllotmentAction(planId, { personId: o.id, accommodationId: v === "none" ? null : v }))}>
                  <SelectTrigger size="sm" className="h-9" aria-label={`Lodging for ${o.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No lodging</SelectItem>
                    {lodgings
                      .filter((l) => l.genderAllowed === "any" || l.genderAllowed === o.gender)
                      .map((l) => (
                        <SelectItem key={l.id} value={l.id} disabled={used(l.id) >= l.capacity && a?.accommodationId !== l.id}>
                          {l.name} · {l.capacity - used(l.id)} free
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <span className="tabular text-xs text-muted-foreground">{a ? `${a.fromDate.slice(5)} → ${a.toDate.slice(5)}` : "—"}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
