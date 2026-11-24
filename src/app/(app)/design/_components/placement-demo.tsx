"use client";

import * as React from "react";
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
import { Armchair, Eraser, Flame, Footprints, Gauge, GripVertical, HeartPulse, MapPin, Send, Sparkles, TriangleAlert, Venus, X } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterPill } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  checkPlacement,
  suggestPlacements,
  type Officer,
  type PointProfile,
  type Slot,
  type Warning,
} from "@/lib/placement/rules";
import { cn, initials } from "@/lib/utils";
import { SAMPLE_POINTS, SAMPLE_POOL, SAMPLE_SLOTS } from "../_data";

type Assignment = { officerId: string; source: "manual" | "suggested"; reasons: string[]; warnings: Warning[] };

const PRIORITY: Record<number, { label: string; tone: "danger" | "warning" | "neutral" | "info" }> = {
  1: { label: "P1 · Critical", tone: "danger" },
  2: { label: "P2 · High", tone: "warning" },
  3: { label: "P3 · Normal", tone: "neutral" },
  4: { label: "P4 · Low", tone: "info" },
};

const officerById = new Map(SAMPLE_POOL.map((o) => [o.id, o]));
const pointById = new Map(SAMPLE_POINTS.map((p) => [p.id, p]));

function OfficerCard({
  officer,
  compact = false,
  dragging = false,
  handleProps,
  extra,
}: {
  officer: Officer;
  compact?: boolean;
  dragging?: boolean;
  handleProps?: React.HTMLAttributes<HTMLButtonElement>;
  extra?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-2xl border border-border/70 bg-card p-2 pr-3 shadow-soft transition-shadow",
        dragging && "rotate-1 shadow-lifted ring-2 ring-primary/40",
      )}
    >
      <button
        type="button"
        className="inline-flex cursor-grab touch-none items-center rounded-full p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        aria-label={`Drag ${officer.name}`}
        {...handleProps}
      >
        <GripVertical className="size-4" />
      </button>
      <Avatar className={cn(compact ? "size-8" : "size-9")}>
        <AvatarFallback className={cn(officer.gender === "female" && "bg-info-soft text-info-soft-foreground")}>{initials(officer.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium">{officer.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          age <span className="tabular">{officer.age}</span> · {officer.stationName}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {officer.fitness === "light_duty_only" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-warning-soft text-warning-soft-foreground" aria-label="Light duty only">
                <HeartPulse className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>Light duty only — never on high-intensity points</TooltipContent>
          </Tooltip>
        )}
        <Badge tone="primary">{officer.rankCode}</Badge>
        {extra}
      </div>
    </div>
  );
}

function DraggableOfficer({ officer, fromSlot, extra }: { officer: Officer; fromSlot?: string; extra?: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: fromSlot ? `slot-officer:${fromSlot}` : `pool-officer:${officer.id}`,
    data: { officerId: officer.id, fromSlot },
  });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <OfficerCard officer={officer} compact={!!fromSlot} handleProps={{ ...attributes, ...listeners }} extra={extra} />
    </div>
  );
}

function SlotDrop({
  slot,
  assignment,
  onClear,
}: {
  slot: Slot;
  assignment?: Assignment;
  onClear: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${slot.id}`, data: { slotId: slot.id } });
  const officer = assignment ? officerById.get(assignment.officerId) : undefined;

  return (
    <div
      ref={setNodeRef}
      className={cn("rounded-2xl transition-all", isOver && "ring-2 ring-primary/50 ring-offset-2 ring-offset-card")}
    >
      {officer && assignment ? (
        <div className="space-y-1.5">
          <DraggableOfficer
            officer={officer}
            fromSlot={slot.id}
            extra={
              <>
                {assignment.source === "suggested" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground" aria-label="Why this officer">
                        <Sparkles className="size-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="mb-1 font-medium">Suggested because</p>
                      <ul className="list-disc space-y-0.5 pl-4">
                        {(assignment.reasons.length ? assignment.reasons : ["Best available match"]).map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                )}
                <button
                  type="button"
                  onClick={onClear}
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
                  aria-label={`Remove ${officer.name} from this slot`}
                >
                  <X className="size-3.5" />
                </button>
              </>
            }
          />
          {assignment.warnings.map((w) => (
            <p key={w.code} className="flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs text-warning-soft-foreground">
              <TriangleAlert className="size-3.5 shrink-0" /> {w.message}
            </p>
          ))}
        </div>
      ) : (
        <div className="flex h-[54px] items-center justify-between rounded-2xl border-2 border-dashed border-border px-4 text-sm text-muted-foreground">
          <span>Open {slot.rankCode} slot</span>
          <span className="text-xs">Drop an officer here</span>
        </div>
      )}
    </div>
  );
}

function PointCard({
  point,
  slots,
  assignments,
  onClear,
}: {
  point: PointProfile & { purpose: string };
  slots: Slot[];
  assignments: Record<string, Assignment>;
  onClear: (slotId: string) => void;
}) {
  const filled = slots.filter((s) => assignments[s.id]).length;
  const pr = PRIORITY[point.priority]!;
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="size-4 text-primary" aria-hidden /> {point.name}
        </CardTitle>
        <CardDescription>{point.purpose}</CardDescription>
        <CardAction>
          <span className="tabular rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
            {filled}/{slots.length}
          </span>
        </CardAction>
        <div className="col-span-full mt-2 flex flex-wrap gap-1.5">
          <Badge tone={pr.tone}>{pr.label}</Badge>
          {point.intensity === "high" ? (
            <Badge tone="danger">
              <Flame /> High intensity
            </Badge>
          ) : point.intensity === "medium" ? (
            <Badge tone="warning">
              <Gauge /> Medium intensity
            </Badge>
          ) : (
            <Badge tone="success">
              <Gauge /> Low intensity
            </Badge>
          )}
          <Badge tone="neutral">
            {point.mobility === "mobile" ? <Footprints /> : <Armchair />}
            {point.mobility === "mobile" ? "Mobile" : "Static"}
          </Badge>
          {point.genderReq === "female" && (
            <Badge tone="info">
              <Venus /> Women only
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 px-5">
        {slots.map((s) => (
          <SlotDrop key={s.id} slot={s} assignment={assignments[s.id]} onClear={() => onClear(s.id)} />
        ))}
      </CardContent>
    </Card>
  );
}

function PoolDrop({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool" });
  return (
    <div ref={setNodeRef} className={cn("space-y-2 rounded-2xl p-1 transition-colors", isOver && "bg-accent/60")}>
      {children}
    </div>
  );
}

export function PlacementDemo() {
  const [assignments, setAssignments] = React.useState<Record<string, Assignment>>({});
  const [activeOfficer, setActiveOfficer] = React.useState<Officer | null>(null);
  const [rankFilter, setRankFilter] = React.useState<string | null>(null);
  const [publishOpen, setPublishOpen] = React.useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const placedIds = new Set(Object.values(assignments).map((a) => a.officerId));
  const pool = SAMPLE_POOL.filter((o) => !placedIds.has(o.id) && (!rankFilter || o.rankCode === rankFilter));
  const filledCount = Object.keys(assignments).length;

  function place(officerId: string, slotId: string, fromSlot?: string) {
    const officer = officerById.get(officerId)!;
    const slot = SAMPLE_SLOTS.find((s) => s.id === slotId)!;
    const point = pointById.get(slot.pointId)!;
    const check = checkPlacement(officer, slot, point);
    if (!check.ok) {
      toast.error("Can't place here", { description: check.violations.map((v) => v.message).join(" · ") });
      return;
    }
    setAssignments((cur) => {
      const next = { ...cur };
      const displaced = next[slotId];
      if (fromSlot) delete next[fromSlot];
      next[slotId] = { officerId, source: "manual", reasons: ["Placed by Component Officer"], warnings: check.warnings };
      // Swap: the displaced officer moves to the slot the dragged officer came from, if allowed
      if (displaced && fromSlot) {
        const dOfficer = officerById.get(displaced.officerId)!;
        const fSlot = SAMPLE_SLOTS.find((s) => s.id === fromSlot)!;
        const fCheck = checkPlacement(dOfficer, fSlot, pointById.get(fSlot.pointId)!);
        if (fCheck.ok) next[fromSlot] = { ...displaced, source: "manual", warnings: fCheck.warnings };
      }
      return next;
    });
    if (check.warnings.length) toast.warning(check.warnings[0]!.message, { description: "Allowed, but flagged for review before publish." });
  }

  function onDragStart(e: DragStartEvent) {
    const id = e.active.data.current?.officerId as string | undefined;
    setActiveOfficer(id ? (officerById.get(id) ?? null) : null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveOfficer(null);
    const officerId = e.active.data.current?.officerId as string | undefined;
    const fromSlot = e.active.data.current?.fromSlot as string | undefined;
    if (!officerId || !e.over) return;
    if (e.over.id === "pool") {
      if (fromSlot) setAssignments((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== fromSlot)));
      return;
    }
    const slotId = e.over.data.current?.slotId as string | undefined;
    if (slotId && slotId !== fromSlot) place(officerId, slotId, fromSlot);
  }

  function suggest() {
    const keep = Object.entries(assignments)
      .filter(([, a]) => a.source === "manual")
      .map(([slotId, a]) => ({ slotId, officerId: a.officerId }));
    const { suggestions, unfilledSlotIds } = suggestPlacements({ slots: SAMPLE_SLOTS, points: SAMPLE_POINTS, officers: SAMPLE_POOL, keep });
    setAssignments((cur) => {
      const next: Record<string, Assignment> = Object.fromEntries(Object.entries(cur).filter(([, a]) => a.source === "manual"));
      for (const s of suggestions) next[s.slotId] = { officerId: s.officerId, source: "suggested", reasons: s.reasons, warnings: s.warnings };
      return next;
    });
    toast.success(`Suggested ${suggestions.length} placements`, {
      description: unfilledSlotIds.length
        ? `${unfilledSlotIds.length} low-priority slot(s) left open. Review and adjust before publishing.`
        : "Every slot filled. Review and adjust before publishing — nothing has been sent.",
    });
  }

  const openSlotsFor = (o: Officer) =>
    SAMPLE_SLOTS.filter((s) => !assignments[s.id] && checkPlacement(o, s, pointById.get(s.pointId)!).ok);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveOfficer(null)}>
      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <Card className="h-fit gap-4 py-5 lg:sticky lg:top-24">
          <CardHeader className="px-5">
            <CardTitle>Officer pool</CardTitle>
            <CardDescription>Named on nominal rolls. Drag onto a slot, or use “Place in…”.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5">
            <div className="flex flex-wrap gap-1.5">
              <FilterPill active={rankFilter === null} onClick={() => setRankFilter(null)}>
                All
              </FilterPill>
              {["HC", "PC"].map((r) => (
                <FilterPill key={r} active={rankFilter === r} onClick={() => setRankFilter(r)}>
                  {r}
                </FilterPill>
              ))}
            </div>
            <PoolDrop>
              {pool.length === 0 && <p className="rounded-2xl bg-muted/60 p-4 text-center text-sm text-muted-foreground">Everyone is placed.</p>}
              {pool.map((o) => {
                const open = openSlotsFor(o);
                return (
                  <DraggableOfficer
                    key={o.id}
                    officer={o}
                    extra={
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="size-6" aria-label={`Place ${o.name} in…`}>
                            <MapPin className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                          <DropdownMenuLabel>Place {o.name.split(" ")[0]} in…</DropdownMenuLabel>
                          {open.length === 0 && <DropdownMenuItem disabled>No open slot this officer can take</DropdownMenuItem>}
                          {open.map((s) => (
                            <DropdownMenuItem key={s.id} onSelect={() => place(o.id, s.id)}>
                              {pointById.get(s.pointId)!.name} · {s.rankCode}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                  />
                );
              })}
            </PoolDrop>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-3 pl-5 shadow-soft">
            <p className="tabular text-sm">
              <span className="font-semibold">{filledCount}</span>
              <span className="text-muted-foreground"> of {SAMPLE_SLOTS.length} slots filled · nothing is sent until you publish</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="soft" onClick={suggest}>
                <Sparkles /> Suggest placement
              </Button>
              <Button variant="ghost" onClick={() => setAssignments({})} disabled={filledCount === 0}>
                <Eraser /> Clear
              </Button>
              <Button onClick={() => setPublishOpen(true)} disabled={filledCount === 0}>
                <Send /> Publish
              </Button>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {SAMPLE_POINTS.map((p) => (
              <PointCard
                key={p.id}
                point={p}
                slots={SAMPLE_SLOTS.filter((s) => s.pointId === p.id)}
                assignments={assignments}
                onClear={(slotId) => setAssignments((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== slotId)))}
              />
            ))}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>{activeOfficer ? <OfficerCard officer={activeOfficer} dragging /> : null}</DragOverlay>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish duty allocation?</DialogTitle>
            <DialogDescription>
              {filledCount} officers will get their duty point, timing and location by SMS / WhatsApp now. If you change a posting later, only the
              affected officers are messaged again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Not yet</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button onClick={() => toast.success("Published version 1", { description: `${filledCount} duty messages queued` })}>
                <Send /> Publish now
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}
