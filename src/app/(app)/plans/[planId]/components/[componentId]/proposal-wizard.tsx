"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, ImagePlus, Library, Loader2, Lock, MapPin, Plus, Save, Send, Trash2, TriangleAlert, Undo2, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { WizardLayout } from "@/components/layout/wizard-layout";
import { MapView } from "@/components/map/map-view";
import { PersonPicker, type PersonOption } from "@/components/pickers/person-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { buildSlots, requiredByRank, validateProposal } from "@/lib/workflow/slots";
import { saveProposalAction, searchUnitPersonsAction, submitProposalAction, uploadSectorImageAction } from "./actions";
import type { PointInput, SectorInput } from "./schema";

type Req = PointInput["requirements"][number];
export type PrefState = {
  key: string;
  kind: "unit" | "station" | "person";
  unitId: string | null;
  stationId: string | null;
  person: PersonOption | null;
  pointKey: string | null;
  rankId: string | null;
  count: number | null;
  note: string | null;
};
export type ProposalState = { sectors: SectorInput[]; logisticsNote: string; equipment: { equipmentTypeId: string; quantity: number; note: string | null }[]; preferences: PrefState[] };
export type ProposalOptions = {
  ranks: { id: string; code: string; name: string; category: string }[];
  shifts: { id: string; name: string; startTime: string; endTime: string }[];
  library: { id: string; name: string; lat: number; lng: number; defaultPriority: number; defaultIntensity: "high" | "medium" | "low"; defaultMobility: "static" | "mobile"; genderReq: "any" | "male" | "female"; description: string | null }[];
  teams: { id: string; name: string; composition: { rankCode: string; count: number }[] }[];
  equipmentTypes: { id: string; name: string }[];
  stations: { id: string; name: string }[];
  units: { id: string; name: string }[];
};

const STEPS = [
  { label: "Sectors", description: "Shifts, batches, instructions" },
  { label: "Points", description: "Duty points per sector" },
  { label: "Men required", description: "Ranks per point and batch" },
  { label: "Logistics", description: "Equipment, vehicles" },
  { label: "Preferences", description: "Preferred stations / officers" },
  { label: "Preview & submit", description: "Check and send to IO" },
];
const PRIORITY = [
  { v: 1, label: "P1 Critical", tone: "danger" },
  { v: 2, label: "P2 High", tone: "warning" },
  { v: 3, label: "P3 Normal", tone: "info" },
  { v: 4, label: "P4 Low", tone: "neutral" },
] as const;
const MERGES = ["A", "B", "C", "D", "E"];
const DEFAULT_RANK_COLUMNS = ["SI", "ASI", "HC", "PC"];

let seq = 0;
const key = () => `n${Date.now().toString(36)}${++seq}`;

export function ProposalWizard({
  componentId,
  planTitle,
  componentName,
  editable,
  status,
  returnComment,
  initial,
  options,
}: {
  componentId: string;
  planTitle: string;
  componentName: string;
  editable: boolean;
  status: string;
  returnComment: string | null;
  initial: ProposalState;
  options: ProposalOptions;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(editable ? 0 : 5);
  const [state, setState] = React.useState(initial);
  const [dirty, setDirty] = React.useState(false);
  const [pending, start] = React.useTransition();
  const update = React.useCallback((fn: (s: ProposalState) => ProposalState) => {
    setState(fn);
    setDirty(true);
  }, []);

  const rankById = React.useMemo(() => new Map(options.ranks.map((r) => [r.id, r])), [options.ranks]);
  const rankByCode = React.useMemo(() => new Map(options.ranks.map((r) => [r.code, r])), [options.ranks]);

  const save = async (): Promise<boolean> => {
    if (!editable || !dirty) return true;
    const r = await saveProposalAction(componentId, {
      sectors: state.sectors,
      logisticsNote: state.logisticsNote || null,
      equipment: state.equipment.filter((e) => e.equipmentTypeId && e.quantity > 0),
      preferences: state.preferences
        .filter((p) => (p.kind === "unit" ? p.unitId : p.kind === "station" ? p.stationId : p.person))
        .map((p) => ({ kind: p.kind, unitId: p.unitId, stationId: p.stationId, personId: p.person?.id ?? null, pointKey: p.pointKey, rankId: p.rankId, count: p.count, note: p.note })),
    });
    if (!r.ok) {
      const first = Object.entries(r.fieldErrors ?? {})[0];
      toast.error(first ? `${r.error} (${describePath(first[0], state)}: ${first[1]})` : r.error);
      return false;
    }
    setDirty(false);
    return true;
  };

  const go = (to: number) =>
    start(async () => {
      if (!(await save())) return;
      setStep(to);
    });

  // Live totals and checks (same functions the server uses).
  const flat = React.useMemo(() => flatten(state), [state]);
  const slots = React.useMemo(() => buildSlots(flat.sectors, flat.points, flat.requirements), [flat]);
  const totals = React.useMemo(() => requiredByRank(slots), [slots]);
  const problems = React.useMemo(() => validateProposal(flat.sectors, flat.points, flat.requirements), [flat]);

  return (
    <div className="flex flex-col gap-3">
      {!editable && (
        <div className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-2.5 text-sm shadow-soft">
          <Lock className="size-4 text-muted-foreground" />
          {status === "submitted" || status === "accepted" ? "Submitted to the Initiating Officer — read only. Ask them to return it if you need changes." : "This proposal can't be edited now."}
        </div>
      )}
      {status === "returned" && returnComment && (
        <div className="flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning-soft px-4 py-2.5 text-sm text-warning-soft-foreground">
          <Undo2 className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">Returned by the Initiating Officer:</span> {returnComment}
          </span>
        </div>
      )}
      <WizardLayout
        steps={STEPS}
        current={step}
        onSelect={(i) => go(i)}
        footer={
          <>
            <Button variant="ghost" disabled={step === 0 || pending} onClick={() => go(step - 1)}>
              <ChevronLeft /> <span className="sr-only sm:not-sr-only">Back</span>
            </Button>
            <div className="flex items-center gap-2">
              <span className="tabular hidden text-sm text-muted-foreground sm:inline">
                <span className="font-semibold text-foreground">{slots.length}</span> men
              </span>
              {editable && step < 5 && (
                <Button variant="outline" disabled={pending || !dirty} onClick={() => go(step)}>
                  <Save /> <span className="sr-only sm:not-sr-only">{dirty ? "Save draft" : "Saved"}</span>
                </Button>
              )}
              {step < 5 ? (
                <Button disabled={pending} onClick={() => go(step + 1)}>
                  {pending && <Loader2 className="animate-spin" />} Next <ChevronRight />
                </Button>
              ) : editable ? (
                <Button
                  disabled={pending || problems.length > 0}
                  onClick={() =>
                    start(async () => {
                      if (!(await save())) return;
                      const r = await submitProposalAction(componentId);
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      toast.success(`Submitted — ${r.data.slots} men proposed`, { description: r.data.allIn ? "All components are in; the IO can consolidate now." : undefined });
                      router.refresh();
                    })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" /> : <Send />} Submit to Initiating Officer
                </Button>
              ) : null}
            </div>
          </>
        }
      >
        <fieldset disabled={!editable} className="min-w-0">
          {step === 0 && <SectorsStep state={state} update={update} options={options} />}
          {step === 1 && <PointsStep state={state} update={update} options={options} />}
          {step === 2 && <MenStep state={state} update={update} options={options} rankById={rankById} rankByCode={rankByCode} />}
          {step === 3 && <LogisticsStep state={state} update={update} options={options} />}
          {step === 4 && <PreferencesStep state={state} update={update} options={options} />}
          {step === 5 && <PreviewStep state={state} totals={totals} problems={problems} rankById={rankById} planTitle={planTitle} componentName={componentName} men={slots.length} />}
        </fieldset>
      </WizardLayout>
    </div>
  );
}

function describePath(path: string, s: ProposalState): string {
  const m = path.match(/^sectors\.(\d+)(?:\.points\.(\d+))?/);
  if (!m) return path;
  const sec = s.sectors[Number(m[1])];
  const pt = m[2] !== undefined ? sec?.points[Number(m[2])] : undefined;
  return pt ? `${sec?.name || "Sector"} › ${pt.name || "point"}` : sec?.name || "Sector";
}

export function flatten(s: ProposalState) {
  const sectors = s.sectors.map((x) => ({ id: x.key, name: x.name || "Unnamed sector", planComponentId: "c", batches: x.batches, inchargeRankId: x.inchargeRankId, liaisonRankId: x.liaisonRankId }));
  const points = s.sectors.flatMap((x) => x.points.map((p) => ({ id: p.key, name: p.name || "Unnamed point", sectorId: x.key, priority: p.priority, intensity: p.intensity, genderReq: p.genderReq })));
  const requirements = s.sectors.flatMap((x) => x.points.flatMap((p) => p.requirements.map((r) => ({ pointId: p.key, batch: r.batch, rankId: r.rankId, count: r.count, mergeGroup: r.mergeGroup ?? null }))));
  return { sectors, points, requirements };
}

type StepProps = { state: ProposalState; update: (fn: (s: ProposalState) => ProposalState) => void; options: ProposalOptions };

const patchSector = (s: ProposalState, k: string, p: Partial<SectorInput>): ProposalState => ({ ...s, sectors: s.sectors.map((x) => (x.key === k ? { ...x, ...p } : x)) });
const patchPoint = (s: ProposalState, sk: string, pk: string, p: Partial<PointInput>): ProposalState => ({
  ...s,
  sectors: s.sectors.map((x) => (x.key === sk ? { ...x, points: x.points.map((y) => (y.key === pk ? { ...y, ...p } : y)) } : x)),
});

function RankSelect({ value, onChange, ranks, label, allowNone = true }: { value: string | null; onChange: (v: string | null) => void; ranks: ProposalOptions["ranks"]; label: string; allowNone?: boolean }) {
  return (
    <Select value={value ?? "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : v)}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value="__none__">None</SelectItem>}
        {ranks.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.code} — {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SectorsStep({ state, update, options }: StepProps) {
  const officerRanks = options.ranks.filter((r) => !["HC", "PC", "HG", "HC(AR)", "PC(AR)", "HC(APSP)", "PC(APSP)"].includes(r.code));
  const add = () =>
    update((s) => ({
      ...s,
      sectors: [...s.sectors, { key: key(), name: `Sector ${s.sectors.length + 1}`, shiftId: options.shifts[0]?.id ?? null, batches: 1, instructions: null, imageUrl: null, inchargeRankId: officerRanks.find((r) => r.code === "SI")?.id ?? null, liaisonRankId: null, points: [] }],
    }));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Divide your component into sectors. Each batch is one relay of officers (e.g. 2 batches = two shifts of men).</p>
        <Button size="sm" onClick={add}>
          <Plus /> Add sector
        </Button>
      </div>
      {state.sectors.length === 0 && (
        <button type="button" onClick={add} className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground hover:bg-accent/40">
          No sectors yet — <span className="font-medium text-primary">add the first sector</span>
        </button>
      )}
      <div className="grid gap-3 xl:grid-cols-2">
        {state.sectors.map((sec, i) => (
          <Card key={sec.key}>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-end gap-2 sm:col-span-2">
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor={`sn-${sec.key}`}>Sector {i + 1} name</Label>
                  <Input id={`sn-${sec.key}`} value={sec.name} onChange={(e) => update((s) => patchSector(s, sec.key, { name: e.target.value }))} />
                </div>
                <Button variant="ghost" size="icon" aria-label={`Delete ${sec.name}`} onClick={() => update((s) => ({ ...s, sectors: s.sectors.filter((x) => x.key !== sec.key), preferences: s.preferences.filter((p) => !sec.points.some((pt) => pt.key === p.pointKey)) }))}>
                  <Trash2 />
                </Button>
              </div>
              <div className="grid gap-1.5">
                <Label>Shift</Label>
                <Select value={sec.shiftId ?? "__none__"} onValueChange={(v) => update((s) => patchSector(s, sec.key, { shiftId: v === "__none__" ? null : v }))}>
                  <SelectTrigger aria-label="Shift">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Whole duty window</SelectItem>
                    {options.shifts.map((sh) => (
                      <SelectItem key={sh.id} value={sh.id}>
                        {sh.name} ({sh.startTime.slice(0, 5)}–{sh.endTime.slice(0, 5)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Batches</Label>
                <ToggleGroup type="single" value={String(sec.batches)} onValueChange={(v) => v && update((s) => patchSector(s, sec.key, { batches: Number(v) }))} aria-label="Batches" className="w-fit">
                  {[1, 2, 3, 4].map((n) => (
                    <ToggleGroupItem key={n} value={String(n)} className="px-3.5">
                      {n}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <div className="grid gap-1.5">
                <Label>Sector incharge rank</Label>
                <RankSelect value={sec.inchargeRankId} onChange={(v) => update((s) => patchSector(s, sec.key, { inchargeRankId: v }))} ranks={officerRanks} label="Sector incharge rank" />
              </div>
              <div className="grid gap-1.5">
                <Label>Liaison officer rank</Label>
                <RankSelect value={sec.liaisonRankId} onChange={(v) => update((s) => patchSector(s, sec.key, { liaisonRankId: v }))} ranks={officerRanks} label="Liaison officer rank" />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor={`si-${sec.key}`}>Instructions</Label>
                <Textarea id={`si-${sec.key}`} rows={2} value={sec.instructions ?? ""} onChange={(e) => update((s) => patchSector(s, sec.key, { instructions: e.target.value }))} placeholder="Printed on duty passes of this sector" />
              </div>
              <SectorImage url={sec.imageUrl ?? null} onChange={(u) => update((s) => patchSector(s, sec.key, { imageUrl: u }))} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SectorImage({ url, onChange }: { url: string | null; onChange: (u: string | null) => void }) {
  const [pending, start] = React.useTransition();
  return (
    <div className="flex items-center gap-3 sm:col-span-2">
      <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/40">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded image
          <img src={url} alt="Sector map" className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="size-4 text-muted-foreground" aria-hidden />
        )}
      </div>
      <Input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="h-9 py-1"
        aria-label="Sector image"
        disabled={pending}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          start(async () => {
            const fd = new FormData();
            fd.set("image", f);
            const r = await uploadSectorImageAction(fd);
            if (r.ok) onChange(r.data.url);
            else toast.error(r.error);
          });
        }}
      />
      {url && (
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          Remove
        </Button>
      )}
    </div>
  );
}

function SectorChips({ state, current, onChange, counts }: { state: ProposalState; current: string; onChange: (k: string) => void; counts?: (k: string) => number }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Sectors">
      {state.sectors.map((s) => (
        <button
          key={s.key}
          type="button"
          role="tab"
          aria-selected={current === s.key}
          onClick={() => onChange(s.key)}
          className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm", current === s.key ? "border-primary/40 bg-accent font-medium text-accent-foreground" : "bg-card hover:bg-accent/50")}
        >
          {s.name || "Unnamed"}
          <span className="tabular text-xs text-muted-foreground">{counts ? counts(s.key) : s.points.length}</span>
        </button>
      ))}
    </div>
  );
}

function useSectorSelection(state: ProposalState) {
  const [current, setCurrent] = React.useState(state.sectors[0]?.key ?? "");
  const exists = state.sectors.some((s) => s.key === current);
  return [exists ? current : (state.sectors[0]?.key ?? ""), setCurrent] as const;
}

function NoSectors() {
  return <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Add a sector first (step 1).</p>;
}

function PointsStep({ state, update, options }: StepProps) {
  const [current, setCurrent] = useSectorSelection(state);
  const [picking, setPicking] = React.useState<string | null>(null);
  const sec = state.sectors.find((s) => s.key === current);
  if (!sec) return <NoSectors />;
  const used = new Set(state.sectors.flatMap((s) => s.points.map((p) => p.libraryPointId)).filter(Boolean));
  const addPoint = (p: Partial<PointInput>) =>
    update((s) => patchSector(s, sec.key, { points: [...sec.points, { key: key(), name: "", libraryPointId: null, lat: null, lng: null, priority: 3, intensity: "medium", mobility: "static", genderReq: "any", requirements: [], ...p }] }));
  const pickingPoint = sec.points.find((p) => p.key === picking);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectorChips state={state} current={current} onChange={setCurrent} />
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Library /> From library
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
              <DropdownMenuLabel>Deployment points library</DropdownMenuLabel>
              {options.library
                .filter((l) => !used.has(l.id))
                .map((l) => (
                  <DropdownMenuItem
                    key={l.id}
                    onSelect={() => addPoint({ name: l.name, libraryPointId: l.id, lat: l.lat, lng: l.lng, priority: l.defaultPriority, intensity: l.defaultIntensity, mobility: l.defaultMobility, genderReq: l.genderReq })}
                  >
                    <Badge tone={PRIORITY[l.defaultPriority - 1]!.tone}>P{l.defaultPriority}</Badge>
                    <span className="truncate">{l.name}</span>
                  </DropdownMenuItem>
                ))}
              {options.library.filter((l) => !used.has(l.id)).length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">All library points are used.</p>}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => addPoint({})}>
            <Plus /> New point
          </Button>
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-0">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_0.9fr_0.9fr_0.8fr_0.8fr_auto] gap-2 border-b px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:grid">
            <span>Point</span>
            <span>Priority</span>
            <span>Intensity</span>
            <span>Mobility</span>
            <span>Gender</span>
            <span className="w-16" />
          </div>
          <ul className="divide-y">
            {sec.points.map((p) => (
              <li key={p.key} className="grid gap-2 px-3 py-2 md:grid-cols-[minmax(0,1.6fr)_0.9fr_0.9fr_0.8fr_0.8fr_auto] md:items-center">
                <div className="flex items-center gap-1.5">
                  <Input value={p.name} aria-label="Point name" placeholder="Point name" onChange={(e) => update((s) => patchPoint(s, sec.key, p.key, { name: e.target.value }))} className="h-9" />
                  {p.libraryPointId && <Library className="size-3.5 shrink-0 text-muted-foreground" aria-label="From library" />}
                </div>
                <MiniSelect value={String(p.priority)} onChange={(v) => update((s) => patchPoint(s, sec.key, p.key, { priority: Number(v) }))} label="Priority" items={PRIORITY.map((x) => ({ v: String(x.v), l: x.label }))} />
                <MiniSelect value={p.intensity} onChange={(v) => update((s) => patchPoint(s, sec.key, p.key, { intensity: v as "high" }))} label="Intensity" items={[{ v: "high", l: "High" }, { v: "medium", l: "Medium" }, { v: "low", l: "Low" }]} />
                <MiniSelect value={p.mobility} onChange={(v) => update((s) => patchPoint(s, sec.key, p.key, { mobility: v as "static" }))} label="Mobility" items={[{ v: "static", l: "Static" }, { v: "mobile", l: "Mobile" }]} />
                <MiniSelect value={p.genderReq} onChange={(v) => update((s) => patchPoint(s, sec.key, p.key, { genderReq: v as "any" }))} label="Gender" items={[{ v: "any", l: "Any" }, { v: "female", l: "Women" }, { v: "male", l: "Men" }]} />
                <span className="flex justify-end gap-0.5">
                  <Button variant="ghost" size="icon-sm" aria-label={`Location of ${p.name || "point"}`} onClick={() => setPicking(p.key)} className={cn(p.lat === null && "text-warning")}>
                    <MapPin />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${p.name || "point"}`} onClick={() => update((s) => ({ ...patchSector(s, sec.key, { points: sec.points.filter((x) => x.key !== p.key) }), preferences: s.preferences.filter((x) => x.pointKey !== p.key) }))}>
                    <Trash2 />
                  </Button>
                </span>
              </li>
            ))}
            {sec.points.length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">No points in this sector yet. Add from the library or create a new point.</li>}
          </ul>
        </Card>
        <MapView className="hidden h-[420px] xl:block" points={sec.points.filter((p) => p.lat !== null && p.lng !== null).map((p) => ({ id: p.key, lat: p.lat!, lng: p.lng!, label: p.name || "Point", color: p.priority === 1 ? "danger" : p.priority === 2 ? "warning" : "primary" }))} onSelect={(id) => setPicking(id)} />
      </div>

      <Dialog open={!!pickingPoint} onOpenChange={(o) => !o && setPicking(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Location — {pickingPoint?.name || "point"}</DialogTitle>
            <DialogDescription>Click on the map to place the point.</DialogDescription>
          </DialogHeader>
          {pickingPoint && (
            <MapView
              className="h-80"
              points={pickingPoint.lat !== null && pickingPoint.lng !== null ? [{ id: "p", lat: pickingPoint.lat, lng: pickingPoint.lng, label: pickingPoint.name || "Point" }] : sec.points.filter((p) => p.lat !== null).map((p) => ({ id: p.key, lat: p.lat!, lng: p.lng!, label: p.name, color: "neutral" as const }))}
              onPick={(lat, lng) => update((s) => patchPoint(s, sec.key, pickingPoint.key, { lat, lng }))}
            />
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniSelect({ value, onChange, label, items }: { value: string; onChange: (v: string) => void; label: string; items: { v: string; l: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={label} className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.v} value={i.v}>
            {i.l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MenStep({ state, update, options, rankById, rankByCode }: StepProps & { rankById: Map<string, ProposalOptions["ranks"][number]>; rankByCode: Map<string, ProposalOptions["ranks"][number]> }) {
  const [current, setCurrent] = useSectorSelection(state);
  const [batch, setBatch] = React.useState(1);
  const sec = state.sectors.find((s) => s.key === current);
  const used = React.useMemo(() => {
    const ids = new Set(state.sectors.flatMap((s) => s.points.flatMap((p) => p.requirements.filter((r) => r.count > 0).map((r) => r.rankId))));
    return ids;
  }, [state.sectors]);
  const [extra, setExtra] = React.useState<string[]>([]);
  if (!sec) return <NoSectors />;
  const b = Math.min(batch, sec.batches);
  // Default ranks always show; other ranks appear once used or added (and stay while editing).
  const columns = [...new Set([...DEFAULT_RANK_COLUMNS.map((c) => rankByCode.get(c)?.id).filter((x): x is string => !!x), ...used, ...extra])].sort(
    (a, z) => options.ranks.findIndex((r) => r.id === a) - options.ranks.findIndex((r) => r.id === z),
  );
  const get = (p: PointInput, rankId: string) => p.requirements.find((r) => r.batch === b && r.rankId === rankId)?.count ?? 0;
  const mergeOf = (p: PointInput) => p.requirements.find((r) => r.batch === b && r.mergeGroup)?.mergeGroup ?? null;
  /** Apply a change to the point's requirements using the latest state (never a stale render). */
  const editReqs = (pointKey: string, fn: (reqs: Req[], cur: PointInput) => Req[]) =>
    update((s) => {
      const cur = s.sectors.find((x) => x.key === sec.key)?.points.find((y) => y.key === pointKey);
      return cur ? patchPoint(s, sec.key, pointKey, { requirements: fn(cur.requirements, cur) }) : s;
    });
  const setCount = (p: PointInput, rankId: string, count: number) =>
    editReqs(p.key, (reqs, cur) => {
      const others = reqs.filter((r) => !(r.batch === b && r.rankId === rankId));
      return count > 0 ? [...others, { batch: b, rankId, count, mergeGroup: mergeOf(cur), teamId: null }] : others;
    });
  const setMerge = (p: PointInput, m: string | null) => editReqs(p.key, (reqs) => reqs.map((r) => (r.batch === b ? { ...r, mergeGroup: m } : r)));
  const applyTeam = (p: PointInput, teamId: string) => {
    const t = options.teams.find((x) => x.id === teamId);
    if (!t) return;
    editReqs(p.key, (reqs0, cur) => {
      let reqs = [...reqs0];
      for (const c of t.composition) {
        const rk = rankByCode.get(c.rankCode);
        if (!rk) continue;
        const ex = reqs.find((r) => r.batch === b && r.rankId === rk.id);
        reqs = ex ? reqs.map((r) => (r === ex ? { ...r, count: r.count + c.count } : r)) : [...reqs, { batch: b, rankId: rk.id, count: c.count, mergeGroup: mergeOf(cur), teamId: t.id }];
      }
      return reqs;
    });
    setExtra((e) => [...new Set([...e, ...t.composition.map((c) => rankByCode.get(c.rankCode)?.id).filter((x): x is string => !!x)])]);
  };
  const colTotal = (rankId: string) => sec.points.reduce((a, p) => a + get(p, rankId), 0);
  const addable = options.ranks.filter((r) => !columns.includes(r.id));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectorChips state={state} current={current} onChange={setCurrent} counts={(k) => state.sectors.find((s) => s.key === k)!.points.reduce((a, p) => a + p.requirements.reduce((x, r) => x + r.count, 0), 0)} />
        <div className="flex items-center gap-2">
          {sec.batches > 1 && (
            <ToggleGroup type="single" value={String(b)} onValueChange={(v) => v && setBatch(Number(v))} aria-label="Batch">
              {Array.from({ length: sec.batches }, (_, i) => (
                <ToggleGroupItem key={i} value={String(i + 1)}>
                  Batch {i + 1}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          <Select value="" onValueChange={(v) => setExtra((e) => [...e, v])}>
            <SelectTrigger size="sm" className="h-9 w-36 rounded-full" aria-label="Add rank column">
              <SelectValue placeholder="+ Add rank" />
            </SelectTrigger>
            <SelectContent>
              {addable.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {sec.points.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Add points to this sector first (step 2).</p>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[11px] tracking-wide text-muted-foreground uppercase">
                <th className="px-3 py-2 text-left font-medium">Point</th>
                {columns.map((c) => (
                  <th key={c} className="px-1 py-2 text-center font-medium">
                    {rankById.get(c)?.code}
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-medium">Merge</th>
                <th className="px-2 py-2 text-center font-medium">Team</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sec.points.map((p) => {
                const total = columns.reduce((a, c) => a + get(p, c), 0);
                return (
                  <tr key={p.key}>
                    <td className="max-w-56 px-3 py-1.5">
                      <span className="block truncate font-medium">{p.name || "Unnamed point"}</span>
                      <span className="text-[11px] text-muted-foreground">
                        P{p.priority} · {p.intensity}
                        {p.genderReq !== "any" ? ` · ${p.genderReq === "female" ? "women" : "men"}` : ""}
                      </span>
                    </td>
                    {columns.map((c) => (
                      <td key={c} className="px-1 py-1.5 text-center">
                        <input
                          inputMode="numeric"
                          aria-label={`${rankById.get(c)?.code} at ${p.name}`}
                          value={get(p, c) || ""}
                          placeholder="0"
                          onChange={(e) => setCount(p, c, Math.min(5000, Number(e.target.value.replace(/\D/g, "")) || 0))}
                          className="tabular h-8 w-12 rounded-lg border border-input bg-card text-center text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1.5 text-center">
                      <select
                        aria-label={`Merge group for ${p.name}`}
                        value={mergeOf(p) ?? ""}
                        onChange={(e) => setMerge(p, e.target.value || null)}
                        className="h-8 rounded-lg border border-input bg-card px-1.5 text-sm"
                      >
                        <option value="">—</option>
                        {MERGES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <select aria-label={`Add a team at ${p.name}`} value="" onChange={(e) => e.target.value && applyTeam(p, e.target.value)} className="h-8 max-w-28 rounded-lg border border-input bg-card px-1.5 text-sm">
                        <option value="">+ Team</option>
                        {options.teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={cn("tabular px-3 py-1.5 text-right font-semibold", total === 0 && "text-destructive")}>{total}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40 text-sm">
                <td className="px-3 py-2 font-medium">Batch {b} total</td>
                {columns.map((c) => (
                  <td key={c} className="tabular px-1 py-2 text-center font-semibold">
                    {colTotal(c) || ""}
                  </td>
                ))}
                <td colSpan={2} />
                <td className="tabular px-3 py-2 text-right font-semibold">{columns.reduce((a, c) => a + colTotal(c), 0)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        <UsersRound className="mr-1 inline size-3.5" />
        Merge: points with the same letter in this batch share officers (the group needs its largest count). The sector incharge and liaison officer are added automatically.
      </p>
    </div>
  );
}

function LogisticsStep({ state, update, options }: StepProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Equipment needed</CardTitle>
            <CardDescription>The Unit Officer draws these from station stock.</CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={options.equipmentTypes.length === 0} onClick={() => update((s) => ({ ...s, equipment: [...s.equipment, { equipmentTypeId: options.equipmentTypes.find((t) => !s.equipment.some((e) => e.equipmentTypeId === t.id))?.id ?? "", quantity: 1, note: null }] }))}>
            <Plus /> Add
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {state.equipment.map((e, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_auto] gap-2">
              <Select value={e.equipmentTypeId} onValueChange={(v) => update((s) => ({ ...s, equipment: s.equipment.map((x, j) => (j === i ? { ...x, equipmentTypeId: v } : x)) }))}>
                <SelectTrigger aria-label="Equipment">
                  <SelectValue placeholder="Equipment" />
                </SelectTrigger>
                <SelectContent>
                  {options.equipmentTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input inputMode="numeric" aria-label="Quantity" value={e.quantity} onChange={(ev) => update((s) => ({ ...s, equipment: s.equipment.map((x, j) => (j === i ? { ...x, quantity: Number(ev.target.value.replace(/\D/g, "")) || 0 } : x)) }))} />
              <Button variant="ghost" size="icon" aria-label="Remove equipment" onClick={() => update((s) => ({ ...s, equipment: s.equipment.filter((_, j) => j !== i) }))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {state.equipment.length === 0 && <p className="text-sm text-muted-foreground">No equipment requested.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Vehicles & other arrangements</CardTitle>
          <CardDescription>Buses, barricading, food, lighting — anything the IO should know.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea rows={7} aria-label="Logistics note" value={state.logisticsNote} onChange={(e) => update((s) => ({ ...s, logisticsNote: e.target.value }))} placeholder="e.g. 2 buses from CAR at 05:00; 40 barricades at the ghat road" />
        </CardContent>
      </Card>
    </div>
  );
}

function PreferencesStep({ state, update, options }: StepProps) {
  const points = state.sectors.flatMap((s) => s.points.map((p) => ({ key: p.key, label: `${s.name} › ${p.name || "point"}` })));
  const add = (kind: PrefState["kind"]) => update((s) => ({ ...s, preferences: [...s.preferences, { key: key(), kind, unitId: null, stationId: null, person: null, pointKey: null, rankId: null, count: null, note: null }] }));
  const patch = (k: string, p: Partial<PrefState>) => update((s) => ({ ...s, preferences: s.preferences.map((x) => (x.key === k ? { ...x, ...p } : x)) }));
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>Preferences (optional)</CardTitle>
          <CardDescription>Preferred stations or units fill your requirement first when force is sourced. Preferred officers are locked to your points.</CardDescription>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => add("station")}>
            <Plus /> Station
          </Button>
          <Button size="sm" variant="outline" onClick={() => add("unit")}>
            <Plus /> Unit
          </Button>
          <Button size="sm" variant="outline" onClick={() => add("person")}>
            <Plus /> Officer
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {state.preferences.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No preferences. That&apos;s fine — the Unit Officer distributes by availability and distance.</p>}
        {state.preferences.map((p) => (
          <div key={p.key} className="grid gap-2 rounded-2xl border p-2 md:grid-cols-[5.5rem_1.4fr_1.2fr_0.7fr_4.5rem_auto] md:items-center">
            <Badge tone={p.kind === "person" ? "primary" : "info"} className="w-fit">
              {p.kind === "person" ? "Officer" : p.kind === "unit" ? "Unit" : "Station"}
            </Badge>
            {p.kind === "person" ? (
              <PersonPicker value={p.person} onChange={(v) => patch(p.key, { person: v })} search={searchUnitPersonsAction} placeholder="Search officer…" />
            ) : (
              <Select value={(p.kind === "unit" ? p.unitId : p.stationId) ?? ""} onValueChange={(v) => patch(p.key, p.kind === "unit" ? { unitId: v } : { stationId: v })}>
                <SelectTrigger aria-label={p.kind === "unit" ? "Unit" : "Station"}>
                  <SelectValue placeholder={p.kind === "unit" ? "Choose unit" : "Choose station"} />
                </SelectTrigger>
                <SelectContent>
                  {(p.kind === "unit" ? options.units : options.stations).map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={p.pointKey ?? "__any__"} onValueChange={(v) => patch(p.key, { pointKey: v === "__any__" ? null : v })}>
              <SelectTrigger aria-label="For point">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Any point</SelectItem>
                {points.map((x) => (
                  <SelectItem key={x.key} value={x.key}>
                    {x.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {p.kind !== "person" ? (
              <>
                <Select value={p.rankId ?? "__any__"} onValueChange={(v) => patch(p.key, { rankId: v === "__any__" ? null : v })}>
                  <SelectTrigger aria-label="Rank">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any rank</SelectItem>
                    {options.ranks.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input inputMode="numeric" aria-label="How many" placeholder="No." value={p.count ?? ""} onChange={(e) => patch(p.key, { count: Number(e.target.value.replace(/\D/g, "")) || null })} />
              </>
            ) : (
              <span className="text-xs text-muted-foreground md:col-span-2">Locked to this point in placement</span>
            )}
            <Button variant="ghost" size="icon-sm" aria-label="Remove preference" onClick={() => update((s) => ({ ...s, preferences: s.preferences.filter((x) => x.key !== p.key) }))}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PreviewStep({ state, totals, problems, rankById, planTitle, componentName, men }: { state: ProposalState; totals: Map<string, number>; problems: { where: string; message: string }[]; rankById: Map<string, ProposalOptions["ranks"][number]>; planTitle: string; componentName: string; men: number }) {
  const ordered = [...totals.entries()].sort((a, b) => (rankById.get(a[0]) ? 0 : 1) - (rankById.get(b[0]) ? 0 : 1));
  return (
    <div className="flex flex-col gap-3">
      {problems.length > 0 ? (
        <div className="flex gap-2 rounded-2xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-soft-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Fix before submitting</p>
            <ul className="list-disc pl-4">
              {problems.map((p, i) => (
                <li key={i}>
                  <span className="font-medium">{p.where}:</span> {p.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success-soft p-3 text-sm text-success-soft-foreground">
          <CheckCircle2 className="size-4" /> Looks complete. Submitting sends it to the Initiating Officer.
        </div>
      )}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>
              {componentName} · {men} men
            </CardTitle>
            <CardDescription>{planTitle}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ordered.map(([rankId, n]) => (
              <Badge key={rankId} tone="primary" className="h-7 px-3">
                {rankById.get(rankId)?.code} <span className="tabular font-semibold">{n}</span>
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {state.sectors.map((s) => (
            <div key={s.key} className="rounded-2xl border">
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium">{s.name}</span>
                <Badge tone="neutral">
                  {s.batches} batch{s.batches > 1 ? "es" : ""}
                </Badge>
                {s.inchargeRankId && <Badge tone="info">Incharge {rankById.get(s.inchargeRankId)?.code}</Badge>}
                {s.liaisonRankId && <Badge tone="info">Liaison {rankById.get(s.liaisonRankId)?.code}</Badge>}
              </div>
              <ul className="divide-y text-sm">
                {s.points.map((p) => (
                  <li key={p.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
                    <span className="min-w-40 flex-1 font-medium">{p.name || "Unnamed point"}</span>
                    <Badge tone={PRIORITY[p.priority - 1]!.tone}>P{p.priority}</Badge>
                    <span className="flex flex-wrap gap-1">
                      {p.requirements
                        .filter((r) => r.count > 0)
                        .sort((a, z) => a.batch - z.batch)
                        .map((r, i) => (
                          <Badge key={i} tone="neutral" className="tabular">
                            {s.batches > 1 ? `B${r.batch} ` : ""}
                            {rankById.get(r.rankId)?.code} {r.count}
                            {r.mergeGroup ? ` ⟷${r.mergeGroup}` : ""}
                          </Badge>
                        ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {(state.equipment.length > 0 || state.logisticsNote) && (
            <p className="text-sm text-muted-foreground">
              Logistics: {state.equipment.length} equipment line{state.equipment.length === 1 ? "" : "s"}
              {state.logisticsNote ? ` · ${state.logisticsNote}` : ""}
            </p>
          )}
          {state.preferences.length > 0 && <p className="text-sm text-muted-foreground">Preferences: {state.preferences.length}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
