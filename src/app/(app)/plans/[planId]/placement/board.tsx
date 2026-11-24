"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CheckCircle2, CircleSlash, Flame, GripVertical, HeartPulse, Loader2, Lock, LockOpen, MapPin, MoveRight, RotateCcw, Search, Send, Sparkles, TriangleAlert, Undo2, Venus, X } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterPill } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { BoardOfficer, BoardSlot } from "@/lib/placement/server";
import { CONFLICT } from "@/lib/placement/publish";
import { cn } from "@/lib/utils";
import { dropSlotAction, lockAction, markReadyAction, moveAction, publishAction, suggestAction } from "./actions";

export type BoardAssignment = { slotId: string; personId: string; source: "suggested" | "manual" | "preference"; locked: boolean; reasons: string[]; warnings: string[]; planComponentId: string };
export type BoardData = {
  plan: { id: string; title: string; status: string; placementVersion: number; publishedVersion: number };
  components: { id: string; name: string; coName: string | null; ready: boolean; editable: boolean }[];
  sectors: { id: string; planComponentId: string; name: string; batches: number }[];
  points: { id: string; sectorId: string; name: string; priority: number; intensity: "high" | "medium" | "low"; mobility: "static" | "mobile"; genderReq: "any" | "male" | "female" }[];
  slots: BoardSlot[];
  officers: BoardOfficer[];
  assignments: BoardAssignment[];
  isIo: boolean;
  canPublish: boolean;
};

const PRIORITY_TONE = { 1: "danger", 2: "warning", 3: "info", 4: "neutral" } as const;
const AGE_BANDS = [
  { id: "young", label: "Under 35", test: (a: number) => a < 35 },
  { id: "mid", label: "35–49", test: (a: number) => a >= 35 && a < 50 },
  { id: "senior", label: "50+", test: (a: number) => a >= 50 },
];

function fits(o: BoardOfficer, s: BoardSlot) {
  return o.rankId === s.rankId && (s.genderReq === "any" || s.genderReq === o.gender) && !(o.fitness === "light_duty_only" && s.intensity === "high");
}

export function PlacementBoard({ data }: { data: BoardData }) {
  const router = useRouter();
  const editable = React.useMemo(() => new Set(data.components.filter((c) => c.editable).map((c) => c.id)), [data.components]);
  const [component, setComponent] = React.useState<string>(data.isIo || editable.size !== 1 ? "all" : [...editable][0]!);
  const [version, setVersion] = React.useState(data.plan.placementVersion);
  const [rows, setRows] = React.useState(data.assignments);
  const [active, setActive] = React.useState<BoardOfficer | null>(null);
  const [placing, setPlacing] = React.useState<BoardOfficer | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [rank, setRank] = React.useState<string | null>(null);
  const [band, setBand] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [lastServer, setLastServer] = React.useState(data.plan.placementVersion);

  // Take fresh server state (after our own actions or polling) — unless a drag is in progress.
  if (data.plan.placementVersion !== lastServer && !active) {
    setLastServer(data.plan.placementVersion);
    setVersion(data.plan.placementVersion);
    setRows(data.assignments);
  }
  React.useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden && !active && !busy) router.refresh();
    }, 10_000);
    return () => clearInterval(t);
  }, [router, active, busy]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const officerById = React.useMemo(() => new Map(data.officers.map((o) => [o.personId, o])), [data.officers]);
  const bySlot = new Map(rows.map((r) => [r.slotId, r]));
  const placed = new Set(rows.map((r) => r.personId));
  const inView = (cid: string) => component === "all" || component === cid;
  const viewSlots = data.slots.filter((s) => inView(s.planComponentId));
  const required = viewSlots.filter((s) => !s.dropped).length;
  const filled = viewSlots.filter((s) => bySlot.has(s.id)).length;
  const pool = data.officers.filter((o) => !placed.has(o.personId));
  const poolShown = pool.filter((o) => (!rank || o.rankId === rank) && (!band || AGE_BANDS.find((b) => b.id === band)!.test(o.age)) && (!q || `${o.name} ${o.genNo} ${o.station}`.toLowerCase().includes(q.toLowerCase())));
  const rankChips = [...new Map(data.officers.map((o) => [o.rankId, { id: o.rankId, code: o.rank, seniority: o.seniority }])).values()].sort((a, b) => a.seniority - b.seniority);
  const unpublished = data.plan.status === "published" && data.plan.placementVersion !== data.plan.publishedVersion;

  const run = async <T extends { version: number }>(fn: () => Promise<{ ok: true; data: T; message?: string } | { ok: false; error: string }>, success?: (d: T) => void) => {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error === CONFLICT ? "Someone else changed the board" : "Can't do that", { description: r.error });
        if (r.error === CONFLICT) router.refresh();
        return null;
      }
      setVersion(r.data.version);
      success?.(r.data);
      if (r.message) toast.success(r.message);
      return r.data;
    } finally {
      setBusy(false);
    }
  };

  const move = (personId: string, toSlotId: string | null, opts: { undo?: boolean } = {}) => {
    const o = officerById.get(personId)!;
    const from = rows.find((r) => r.personId === personId) ?? null;
    if (toSlotId) {
      const s = data.slots.find((x) => x.id === toSlotId)!;
      if (!fits(o, s)) {
        toast.error("Can't place here", { description: o.rankId !== s.rankId ? `Slot needs ${s.rank}; ${o.name} is ${o.rank}` : s.genderReq !== "any" && s.genderReq !== o.gender ? "This point needs women officers" : `${o.name} is on light duty — not for high-intensity points` });
        return;
      }
    }
    // Optimistic update (server result replaces it on refresh).
    setRows((cur) => {
      let next = cur.filter((r) => r.personId !== personId);
      if (toSlotId) {
        const occupant = next.find((r) => r.slotId === toSlotId);
        next = next.filter((r) => r.slotId !== toSlotId);
        const s = data.slots.find((x) => x.id === toSlotId)!;
        next.push({ slotId: toSlotId, personId, source: "manual", locked: false, reasons: [], warnings: [], planComponentId: s.planComponentId });
        if (occupant && from) next.push({ ...occupant, slotId: from.slotId, planComponentId: from.planComponentId });
      }
      return next;
    });
    void run(
      () => moveAction(data.plan.id, { personId, toSlotId, expectedVersion: version }),
      (d) => {
        if (opts.undo) return;
        toast(toSlotId ? `${o.name} placed` : `${o.name} back in the pool`, {
          description: d.swappedPersonId ? `Swapped with ${officerById.get(d.swappedPersonId)?.name}` : undefined,
          action: { label: "Undo", onClick: () => move(personId, d.fromSlotId, { undo: true }) },
        });
      },
    ).then((d) => {
      if (!d) setRows(data.assignments);
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const personId = (e.active.data.current as { personId: string } | undefined)?.personId;
    if (!personId || !e.over) return;
    const target = e.over.id === "pool" ? null : String(e.over.id).replace(/^slot:/, "");
    const from = rows.find((r) => r.personId === personId);
    if ((from?.slotId ?? null) === target) return;
    move(personId, target);
  };

  const comps = data.components.filter((c) => inView(c.id));
  const canSuggest = component === "all" ? editable.size > 0 : editable.has(component);
  const myComponent = data.components.find((c) => c.editable && !data.isIo && inView(c.id));

  return (
    <DndContext id="placement-board" sensors={sensors} onDragStart={(e: DragStartEvent) => setActive(officerById.get((e.active.data.current as { personId: string }).personId) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="flex flex-col gap-3 lg:h-[calc(100dvh-8.5rem)]">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-3 py-2 shadow-soft">
          {data.components.length > 1 && (
            <Select value={component} onValueChange={setComponent}>
              <SelectTrigger size="sm" className="h-9 w-52 rounded-full" aria-label="Component">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All components</SelectItem>
                {data.components.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.editable ? "" : " (view)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="tabular text-sm">
            <span className="font-semibold">{filled}</span>
            <span className="text-muted-foreground"> / {required} placed</span>
          </span>
          {pool.length > 0 && <Badge tone="neutral">{pool.length} in pool</Badge>}
          {unpublished && <Badge tone="warning">Unpublished changes</Badge>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />}
            {canSuggest && (
              <Button
                size="sm"
                variant="soft"
                disabled={busy}
                onClick={() => void run(() => suggestAction(data.plan.id, { componentId: component === "all" ? null : component, expectedVersion: version }), () => router.refresh())}
              >
                <Sparkles /> Suggest
              </Button>
            )}
            {myComponent && (
              <Button size="sm" variant={myComponent.ready ? "outline" : "default"} disabled={busy} onClick={() => void markReadyAction(data.plan.id, { componentId: myComponent.id, ready: !myComponent.ready }).then((r) => (r.ok ? toast.success(r.message ?? "Saved") : toast.error(r.error)))}>
                {myComponent.ready ? <RotateCcw /> : <CheckCircle2 />} {myComponent.ready ? "Reopen" : "Mark ready"}
              </Button>
            )}
            {data.canPublish && (
              <Button size="sm" disabled={busy || rows.length === 0} onClick={() => setPublishOpen(true)}>
                <Send /> {data.plan.status === "published" ? "Re-publish" : "Publish"}
              </Button>
            )}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[300px_1fr]">
          <PoolDrop>
            <div className="sticky top-0 z-10 flex flex-col gap-2 bg-background pb-2">
              <label className="relative">
                <span className="sr-only">Search pool</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pool…" className="h-9 w-full rounded-full border border-input bg-card pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
              </label>
              <div className="flex flex-wrap gap-1">
                {rankChips.map((r) => (
                  <FilterPill key={r.id} active={rank === r.id} onClick={() => setRank(rank === r.id ? null : r.id)}>
                    {r.code} <span className="tabular opacity-70">{pool.filter((o) => o.rankId === r.id).length}</span>
                  </FilterPill>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {AGE_BANDS.map((b) => (
                  <FilterPill key={b.id} active={band === b.id} onClick={() => setBand(band === b.id ? null : b.id)}>
                    {b.label}
                  </FilterPill>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {poolShown.map((o) => (
                <DraggableOfficer key={o.personId} officer={o} disabled={editable.size === 0} onPlace={() => setPlacing(o)} />
              ))}
              {poolShown.length === 0 && <p className="rounded-2xl border border-dashed p-4 text-center text-xs text-muted-foreground">{pool.length ? "No one matches the filters." : "Everyone is placed. Drag an officer here to unplace."}</p>}
            </div>
          </PoolDrop>

          <div className="min-h-0 lg:overflow-y-auto">
            <div className="flex flex-col gap-3 pb-4">
              {comps.map((c) => (
                <section key={c.id} className="flex flex-col gap-2">
                  {(component === "all" || data.components.length > 1) && (
                    <h2 className="flex items-center gap-2 px-1 text-sm font-semibold">
                      {c.name}
                      {c.ready && <StatusPill status="accepted" label="Ready" />}
                      {!c.editable && <Badge tone="neutral">View only</Badge>}
                    </h2>
                  )}
                  {data.sectors
                    .filter((s) => s.planComponentId === c.id)
                    .map((sec) => (
                      <SectorBlock key={sec.id} sector={sec} data={data} bySlot={bySlot} officerById={officerById} editable={editable.has(c.id)} isIo={data.isIo} activeOfficer={active} busy={busy}
                        onClear={(personId) => move(personId, null)}
                        onPlace={(o) => setPlacing(o)}
                        onLock={(slotId, locked) => void run(() => lockAction(data.plan.id, { slotId, locked, expectedVersion: version }))}
                        onDrop={(slotId, dropped) => void run(() => dropSlotAction(data.plan.id, { slotId, dropped, expectedVersion: version }))}
                      />
                    ))}
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>{active ? <OfficerChip officer={active} dragging /> : null}</DragOverlay>

      <PlaceInDialog
        officer={placing}
        onClose={() => setPlacing(null)}
        slots={data.slots.filter((s) => editable.has(s.planComponentId) && !s.dropped && !bySlot.has(s.id) && placing && fits(placing, s))}
        data={data}
        onChoose={(slotId) => {
          if (placing) move(placing.personId, slotId);
          setPlacing(null);
        }}
      />

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{data.plan.status === "published" ? "Re-publish the duty allocation?" : "Publish the duty allocation?"}</DialogTitle>
            <DialogDescription>
              {filled} officers placed{required > filled ? `, ${required - filled} slots open` : ""}. {data.plan.status === "published" ? "Only officers whose posting changed are notified." : "Every placed officer gets their duty in the app and by message."}
              {data.components.some((c) => !c.ready) ? ` Not marked ready: ${data.components.filter((c) => !c.ready).map((c) => c.name).join(", ")}.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              disabled={busy}
              onClick={() =>
                void run(
                  () => publishAction(data.plan.id, { expectedVersion: version }),
                  (d) => {
                    setPublishOpen(false);
                    toast.success(`Published v${(d as unknown as { version: number }).version}`, { description: `${(d as unknown as { notified: number }).notified} officers notified` });
                  },
                )
              }
            >
              {busy ? <Loader2 className="animate-spin" /> : <Send />} Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}

function PoolDrop({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool" });
  return (
    <aside ref={setNodeRef} aria-label="Pool of named officers" className={cn("min-h-0 min-w-0 rounded-2xl p-1 transition-colors lg:overflow-y-auto", isOver && "bg-accent/60")}>
      {children}
    </aside>
  );
}

function OfficerChip({ officer, dragging, handle, extra, compact }: { officer: BoardOfficer; dragging?: boolean; handle?: React.ButtonHTMLAttributes<HTMLButtonElement>; extra?: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5 rounded-xl border bg-card py-1 pr-1.5 pl-1 shadow-soft", dragging && "rotate-1 shadow-lifted ring-2 ring-primary/40", compact && "border-transparent bg-accent/40 shadow-none")}>
      <button type="button" className="inline-flex cursor-grab touch-none rounded-full p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-default" aria-label={`Drag ${officer.name}`} {...handle}>
        <GripVertical className="size-3.5" />
      </button>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13px] font-medium">{officer.name}</p>
        <p className="tabular truncate text-[11px] text-muted-foreground">
          {officer.age} yrs · {officer.gender === "female" ? "F" : "M"} · {officer.station}
        </p>
      </div>
      {officer.fitness === "light_duty_only" && <HeartPulse className="size-3.5 shrink-0 text-warning" aria-label="Light duty only" />}
      {officer.preferredSlotIds.length > 0 && <Sparkles className="size-3.5 shrink-0 text-primary" aria-label="Asked for by name" />}
      <Badge tone="primary" className="shrink-0 px-1.5 text-[11px]">
        {officer.rank}
      </Badge>
      {extra}
    </div>
  );
}

function DraggableOfficer({ officer, fromSlot, disabled, extra, onPlace }: { officer: BoardOfficer; fromSlot?: string; disabled?: boolean; extra?: React.ReactNode; onPlace?: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: fromSlot ? `slot-officer:${fromSlot}` : `pool:${officer.personId}`, data: { personId: officer.personId }, disabled });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <OfficerChip
        officer={officer}
        compact={!!fromSlot}
        handle={(disabled ? { disabled: true } : { ...attributes, ...listeners }) as React.ButtonHTMLAttributes<HTMLButtonElement>}
        extra={
          <>
            {extra}
            {!disabled && onPlace && (
              <button type="button" onClick={onPlace} className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none" aria-label={`Place ${officer.name} in…`} title="Place in…">
                <MoveRight className="size-3.5" />
              </button>
            )}
          </>
        }
      />
    </div>
  );
}

function SectorBlock({
  sector,
  data,
  bySlot,
  officerById,
  editable,
  isIo,
  activeOfficer,
  busy,
  onClear,
  onPlace,
  onLock,
  onDrop,
}: {
  sector: BoardData["sectors"][number];
  data: BoardData;
  bySlot: Map<string, BoardAssignment>;
  officerById: Map<string, BoardOfficer>;
  editable: boolean;
  isIo: boolean;
  activeOfficer: BoardOfficer | null;
  busy: boolean;
  onClear: (personId: string) => void;
  onPlace: (o: BoardOfficer) => void;
  onLock: (slotId: string, locked: boolean) => void;
  onDrop: (slotId: string, dropped: boolean) => void;
}) {
  const secSlots = data.slots.filter((s) => s.sectorId === sector.id);
  const lead = secSlots.filter((s) => s.role !== "member");
  const pts = data.points.filter((p) => p.sectorId === sector.id);
  const cell = (s: BoardSlot) => <SlotCell key={s.id} slot={s} a={bySlot.get(s.id)} officerById={officerById} editable={editable} isIo={isIo} activeOfficer={activeOfficer} busy={busy} onClear={onClear} onPlace={onPlace} onLock={onLock} onDrop={onDrop} />;
  const filled = secSlots.filter((s) => bySlot.has(s.id)).length;
  return (
    <Card className="gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{sector.name}</p>
        <span className="tabular rounded-full bg-muted px-2 py-0.5 text-xs">
          {filled}/{secSlots.filter((s) => !s.dropped).length}
        </span>
        {lead.length > 0 && (
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5">
            {lead.map((s) => (
              <div key={s.id} className="flex w-full min-w-0 items-center gap-1 sm:w-auto">
                <Badge tone="info" className="shrink-0">
                  {s.role === "sector_incharge" ? "Incharge" : "Liaison"}
                  {sector.batches > 1 ? ` B${s.batch}` : ""}
                </Badge>
                {cell(s)}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-2 2xl:grid-cols-2">
        {pts.map((p) => {
          const ps = secSlots.filter((s) => s.role === "member" && s.pointId === p.id);
          if (ps.length === 0) return null;
          return (
            <div key={p.id} className="rounded-xl border p-2">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <MapPin className="size-3.5 text-primary" aria-hidden />
                <span className="text-sm font-medium">{p.name}</span>
                <Badge tone={PRIORITY_TONE[p.priority as 1]}>P{p.priority}</Badge>
                {p.intensity === "high" && (
                  <Badge tone="danger">
                    <Flame /> High
                  </Badge>
                )}
                {p.genderReq === "female" && (
                  <Badge tone="info">
                    <Venus /> Women
                  </Badge>
                )}
              </div>
              {Array.from({ length: sector.batches }, (_, i) => i + 1).map((b) => {
                const bs = ps.filter((s) => s.batch === b);
                if (bs.length === 0) return null;
                return (
                  <div key={b} className="flex flex-col gap-1">
                    {sector.batches > 1 && <p className="pt-1 text-[11px] font-medium text-muted-foreground">Batch {b}</p>}
                    <div className="flex flex-wrap gap-1.5">{bs.map(cell)}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SlotCell({
  slot,
  a,
  officerById,
  editable,
  isIo,
  activeOfficer,
  busy,
  onClear,
  onPlace,
  onLock,
  onDrop,
}: {
  slot: BoardSlot;
  a?: BoardAssignment;
  officerById: Map<string, BoardOfficer>;
  editable: boolean;
  isIo: boolean;
  activeOfficer: BoardOfficer | null;
  busy: boolean;
  onClear: (personId: string) => void;
  onPlace: (o: BoardOfficer) => void;
  onLock: (slotId: string, locked: boolean) => void;
  onDrop: (slotId: string, dropped: boolean) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${slot.id}`, disabled: !editable || slot.dropped });
  const o = a ? officerById.get(a.personId) : undefined;
  const hint = activeOfficer && editable && !slot.dropped ? fits(activeOfficer, slot) : null;
  const canMove = editable && !(a?.locked && !isIo);
  return (
    <div ref={setNodeRef} className={cn("min-w-0 rounded-xl transition-all", a ? "w-full min-w-0 sm:w-[15.5rem]" : "w-[8.5rem] shrink-0", isOver && "ring-2 ring-primary/50", hint === true && !a && "bg-success-soft/60", hint === false && "opacity-50")}>
      {o && a ? (
        <div className="flex flex-col gap-0.5">
          <DraggableOfficer
            officer={o}
            fromSlot={slot.id}
            disabled={!canMove}
            onPlace={canMove ? () => onPlace(o) : undefined}
            extra={
              <>
                {a.source !== "manual" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground" aria-label="Why this officer" tabIndex={0}>
                        <Sparkles className="size-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="mb-1 font-medium">{a.source === "preference" ? "Asked for by the Component Officer" : "Suggested because"}</p>
                      <ul className="list-disc space-y-0.5 pl-4">
                        {(a.reasons.length ? a.reasons : ["Best available match"]).map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                )}
                {isIo && editable ? (
                  <button type="button" disabled={busy} onClick={() => onLock(slot.id, !a.locked)} className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-muted", a.locked ? "text-primary" : "text-muted-foreground")} aria-label={a.locked ? `Unlock ${o.name}` : `Lock ${o.name}`} aria-pressed={a.locked}>
                    {a.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                  </button>
                ) : a.locked ? (
                  <Lock className="size-3.5 shrink-0 text-primary" aria-label="Locked by the Initiating Officer" />
                ) : null}
                {canMove && (
                  <button type="button" onClick={() => onClear(o.personId)} className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove ${o.name} from this slot`}>
                    <X className="size-3.5" />
                  </button>
                )}
              </>
            }
          />
          {a.warnings.map((w) => (
            <p key={w} className="flex items-center gap-1 px-2 text-[11px] text-warning-soft-foreground">
              <TriangleAlert className="size-3 shrink-0" /> {w}
            </p>
          ))}
        </div>
      ) : slot.dropped ? (
        <div className="flex h-9 items-center justify-between gap-1 rounded-xl border border-dashed bg-muted/50 pr-1 pl-2.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 truncate">
            <CircleSlash className="size-3.5 shrink-0" /> {slot.rank} unfilled
          </span>
          {editable && (
            <button type="button" disabled={busy} onClick={() => onDrop(slot.id, false)} className="inline-flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-muted" aria-label={`Restore ${slot.rank} slot`} title="Restore">
              <Undo2 className="size-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-9 items-center justify-between gap-1 rounded-xl border-2 border-dashed pr-1 pl-2.5 text-xs text-muted-foreground">
          <span className="truncate">
            <span className="font-medium text-foreground">{slot.rank}</span>
            {slot.genderReq === "female" ? " ♀" : ""} open
          </span>
          {editable && (
            <button type="button" disabled={busy} onClick={() => onDrop(slot.id, true)} className="inline-flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-muted hover:text-foreground" aria-label={`Leave unfilled (${slot.rank})`} title="Leave unfilled (e.g. after a shortfall)">
              <CircleSlash className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PlaceInDialog({ officer, onClose, slots, data, onChoose }: { officer: BoardOfficer | null; onClose: () => void; slots: BoardSlot[]; data: BoardData; onChoose: (slotId: string) => void }) {
  const label = (s: BoardSlot) => {
    const sec = data.sectors.find((x) => x.id === s.sectorId);
    const pt = data.points.find((x) => x.id === s.pointId);
    const comp = data.components.find((c) => c.id === s.planComponentId);
    return `${comp?.name} › ${sec?.name} › ${pt?.name ?? (s.role === "sector_incharge" ? "Sector incharge" : "Liaison")}${(sec?.batches ?? 1) > 1 ? ` (batch ${s.batch})` : ""}`;
  };
  const unique = [...new Map(slots.map((s) => [`${s.planComponentId}|${s.sectorId}|${s.pointId}|${s.role}|${s.batch}`, s])).values()].sort((a, b) => a.priority - b.priority);
  return (
    <Dialog open={!!officer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Place {officer?.name}</DialogTitle>
          <DialogDescription>
            Open {officer?.rank} slots that suit this officer{officer?.fitness === "light_duty_only" ? " (no high-intensity points — light duty)" : ""}.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-80 divide-y overflow-y-auto rounded-2xl border">
          {unique.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onChoose(s.id)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
                <Badge tone={PRIORITY_TONE[s.priority as 1]}>P{s.priority}</Badge>
                <span className="min-w-0 flex-1 truncate">{label(s)}</span>
                {s.intensity === "high" && <Flame className="size-3.5 text-danger" aria-label="High intensity" />}
              </button>
            </li>
          ))}
          {unique.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No open slot suits this officer.</li>}
        </ul>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
