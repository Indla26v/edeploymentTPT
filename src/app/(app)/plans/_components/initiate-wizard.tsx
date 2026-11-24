"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Copy, ImagePlus, ListPlus, Loader2, Plus, Save, Send, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { WizardLayout } from "@/components/layout/wizard-layout";
import { MapView, StreetViewLink } from "@/components/map/map-view";
import { PersonPicker, type PersonOption } from "@/components/pickers/person-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fromLocalInput } from "@/lib/format";
import { checkSendToCos } from "@/lib/workflow/plan";
import { reusePlanAction, savePlanDetailsAction, savePlanImageAction, savePlanTeamAction, saveReportingScheduleAction, searchOfficersAction, sendToCosAction } from "../actions";

export type WizardWindow = { label: string; date: string; start: string; end: string };
export type WizardComponent = { key: string; id: string | null; componentId: string | null; name: string; co: PersonOption | null; incharge: PersonOption | null; status?: string };
export type WizardSchedule = { key: string; kind: "reporting" | "briefing" | "deployment" | "relief" | "de_induction"; rankId: string; at: string; place: string };
export type WizardInitial = {
  id: string | null;
  status: string;
  code: string | null;
  details: { title: string; eventType: string; venue: string; description: string; lat: number | null; lng: number | null; proposalDueAt: string; windows: WizardWindow[] };
  overall: PersonOption | null;
  components: WizardComponent[];
  schedule: WizardSchedule[];
  imageUrl: string | null;
};
export type WizardOptions = { components: { id: string; name: string }[]; ranks: { id: string; code: string; name: string }[]; reusable: { id: string; code: string; title: string; status: string }[] };

const EVENT_TYPES = ["Festival", "VIP visit", "Election", "Procession", "Public meeting", "Sports event", "Exam", "Other"];
const KIND_LABEL: Record<WizardSchedule["kind"], string> = { reporting: "Reporting", briefing: "Briefing", deployment: "Deployment", relief: "Relief", de_induction: "De-induction" };
const STEPS = [
  { label: "Details & dates", description: "Name, place, duty dates" },
  { label: "Components", description: "Component Officers" },
  { label: "Reporting schedule", description: "When and where to report" },
  { label: "Image", description: "Optional cover image" },
  { label: "Review & send", description: "Send to Component Officers" },
];

let keySeq = 0;
const newKey = () => `k${++keySeq}`;

function windowIso(w: WizardWindow) {
  const startsAt = fromLocalInput(`${w.date}T${w.start}`);
  let endsAt = fromLocalInput(`${w.date}T${w.end}`);
  if (startsAt && endsAt && endsAt <= startsAt) endsAt = new Date(new Date(endsAt).getTime() + 24 * 3600e3).toISOString(); // overnight
  return { startsAt, endsAt };
}

export function InitiateWizard({ initial, options, initialStep = 0 }: { initial: WizardInitial; options: WizardOptions; initialStep?: number }) {
  const router = useRouter();
  const [step, setStep] = React.useState(initial.id ? initialStep : 0);
  const [d, setD] = React.useState(initial.details);
  const [overall, setOverall] = React.useState(initial.overall);
  const [comps, setComps] = React.useState<WizardComponent[]>(initial.components.length ? initial.components : [{ key: newKey(), id: null, componentId: null, name: "", co: null, incharge: null }]);
  const [schedule, setSchedule] = React.useState(initial.schedule);
  const [imageUrl, setImageUrl] = React.useState(initial.imageUrl);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [logins, setLogins] = React.useState<{ name: string; username: string; tempPassword: string }[]>([]);
  const [pending, start] = React.useTransition();
  const planId = initial.id;
  const isDraft = initial.status === "draft";

  const saveStep = async (s: number): Promise<boolean> => {
    setErrors({});
    if (s === 0) {
      const windows = d.windows.map((w) => ({ label: w.label || null, ...windowIso(w) }));
      if (windows.some((w) => !w.startsAt || !w.endsAt)) {
        setErrors({ windows: "Fill the date, start and end time of every duty date." });
        return false;
      }
      const r = await savePlanDetailsAction(planId, {
        title: d.title,
        eventType: d.eventType,
        venue: d.venue,
        description: d.description,
        location: { lat: d.lat, lng: d.lng },
        proposalDueAt: fromLocalInput(d.proposalDueAt),
        windows: windows as { label: string | null; startsAt: string; endsAt: string }[],
      });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return false;
      }
      if (!planId) {
        toast.success("Draft created — you can come back to it any time");
        router.replace(`/plans/${r.data.id}/setup?step=1`);
        return false;
      }
      return true;
    }
    if (!planId) return false;
    if (s === 1) {
      const r = await savePlanTeamAction(planId, {
        overallInchargePersonId: overall?.id ?? null,
        components: comps.filter((c) => c.name.trim() || c.co).map((c) => ({ id: c.id, componentId: c.componentId, name: c.name, coPersonId: c.co?.id ?? null, inchargePersonId: c.incharge?.id ?? null })),
      });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return false;
      }
      if (r.data.logins.length) setLogins(r.data.logins);
      router.refresh();
      return true;
    }
    if (s === 2) {
      const rows = schedule.map((x) => ({ kind: x.kind, rankId: x.rankId || null, at: fromLocalInput(x.at) ?? "", place: x.place }));
      const r = await saveReportingScheduleAction(planId, { rows });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return false;
      }
      return true;
    }
    return true;
  };

  const go = (to: number) =>
    start(async () => {
      if (to > step || to === step) {
        const ok = await saveStep(step);
        if (!ok) return;
        if (to === step) toast.success("Saved");
      }
      setStep(to);
      if (planId) window.history.replaceState(null, "", `/plans/${planId}/setup?step=${to}`);
    });

  const check = checkSendToCos({ windows: d.windows.length, components: comps.filter((c) => c.name.trim()).map((c) => ({ name: c.name, hasCo: !!c.co })) });

  return (
    <>
      <WizardLayout
        steps={STEPS}
        current={step}
        onSelect={planId ? (i) => go(i) : undefined}
        footer={
          <>
            <Button variant="ghost" disabled={step === 0 || pending} onClick={() => go(step - 1)}>
              <ChevronLeft /> <span className="sr-only sm:not-sr-only">Back</span>
            </Button>
            <div className="flex items-center gap-2">
              {step < 4 && (
                <Button variant="outline" disabled={pending} onClick={() => go(step)}>
                  <Save /> <span className="sr-only sm:not-sr-only">Save draft</span>
                </Button>
              )}
              {step < 4 ? (
                <Button disabled={pending} onClick={() => go(step + 1)}>
                  {pending ? <Loader2 className="animate-spin" /> : null} {step === 0 && !planId ? "Create draft" : "Next"} <ChevronRight />
                </Button>
              ) : isDraft ? (
                <Button
                  disabled={pending || !check.ok}
                  onClick={() =>
                    start(async () => {
                      const r = await sendToCosAction(planId!);
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      toast.success("Sent — Component Officers have been alerted");
                      router.push(`/plans/${planId}`);
                    })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" /> : <Send />} Send to Component Officers
                </Button>
              ) : (
                <Button onClick={() => router.push(`/plans/${planId}`)}>
                  <CheckCircle2 /> Done
                </Button>
              )}
            </div>
          </>
        }
      >
        {step === 0 && <DetailsStep d={d} setD={setD} errors={errors} reusable={options.reusable} showReuse={!planId} />}
        {step === 1 && <ComponentsStep comps={comps} setComps={setComps} overall={overall} setOverall={setOverall} options={options} errors={errors} />}
        {step === 2 && <ScheduleStep rows={schedule} setRows={setSchedule} ranks={options.ranks} firstWindow={d.windows[0]} errors={errors} />}
        {step === 3 && planId && <ImageStep planId={planId} imageUrl={imageUrl} setImageUrl={setImageUrl} />}
        {step === 4 && <ReviewStep d={d} overall={overall} comps={comps} schedule={schedule} ranks={options.ranks} problems={check.ok ? [] : check.problems} isDraft={isDraft} />}
      </WizardLayout>

      <Dialog open={logins.length > 0} onOpenChange={(o) => !o && setLogins([])}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Logins created for Component Officers</DialogTitle>
            <DialogDescription>Share these privately. Each officer must change the password at first sign-in. They won&apos;t be shown again.</DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-2xl border text-sm">
            {logins.map((l) => (
              <li key={l.username} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{l.username}</span>
                </span>
                <span className="flex items-center gap-1 font-mono font-semibold">
                  {l.tempPassword}
                  <Button variant="ghost" size="icon-sm" aria-label={`Copy password for ${l.name}`} onClick={() => void navigator.clipboard?.writeText(`${l.username} / ${l.tempPassword}`)}>
                    <Copy />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, htmlFor, error, help, children, className }: { label: string; htmlFor?: string; error?: string; help?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

function DetailsStep({ d, setD, errors, reusable, showReuse }: { d: WizardInitial["details"]; setD: React.Dispatch<React.SetStateAction<WizardInitial["details"]>>; errors: Record<string, string>; reusable: WizardOptions["reusable"]; showReuse: boolean }) {
  const set = <K extends keyof WizardInitial["details"]>(k: K, v: WizardInitial["details"][K]) => setD((c) => ({ ...c, [k]: v }));
  const [showMap, setShowMap] = React.useState(false);
  const setWindow = (i: number, patch: Partial<WizardWindow>) => set("windows", d.windows.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  return (
    <div className="flex flex-col gap-4">
      {showReuse && reusable.length > 0 && <ReuseStrip reusable={reusable} />}
      <Card>
        <CardHeader>
          <CardTitle>Bandobast details</CardTitle>
          <CardDescription>Component Officers see these when they propose.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Bandobast name" htmlFor="title" error={errors.title} className="sm:col-span-2">
            <Input id="title" value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Dasara Utsavalu 2026" aria-invalid={!!errors.title} />
          </Field>
          <Field label="Event type" htmlFor="eventType" error={errors.eventType}>
            <Select value={d.eventType} onValueChange={(v) => set("eventType", v)}>
              <SelectTrigger id="eventType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Venue" htmlFor="venue" error={errors.venue}>
            <Input id="venue" value={d.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Temple / ground / route" />
          </Field>
          <Field label="Venue location" help="Used for the map and nearest-station sourcing." className="sm:col-span-2">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input inputMode="decimal" aria-label="Latitude" placeholder="Latitude" value={d.lat ?? ""} onChange={(e) => set("lat", e.target.value === "" ? null : Number(e.target.value))} />
              <Input inputMode="decimal" aria-label="Longitude" placeholder="Longitude" value={d.lng ?? ""} onChange={(e) => set("lng", e.target.value === "" ? null : Number(e.target.value))} />
              <Button type="button" variant="outline" className="h-10" onClick={() => setShowMap((v) => !v)}>
                {showMap ? "Hide map" : "Pick on map"}
              </Button>
            </div>
            {showMap && (
              <MapView
                className="h-60"
                points={d.lat !== null && d.lng !== null ? [{ id: "v", lat: d.lat, lng: d.lng, label: d.venue || "Venue" }] : []}
                onPick={(lat, lng) => setD((c) => ({ ...c, lat, lng }))}
              />
            )}
            {d.lat !== null && d.lng !== null && <StreetViewLink lat={d.lat} lng={d.lng} />}
          </Field>
          <Field label="Description" htmlFor="desc" className="sm:col-span-2">
            <Textarea id="desc" rows={3} value={d.description} onChange={(e) => set("description", e.target.value)} placeholder="Expected crowd, VIPs, special arrangements…" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Duty dates</CardTitle>
            <CardDescription>Add one row per day or duty window. An end time before the start means overnight.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const last = d.windows.at(-1);
              const next = last?.date ? new Date(new Date(`${last.date}T00:00:00Z`).getTime() + 86400e3).toISOString().slice(0, 10) : "";
              set("windows", [...d.windows, { label: `Day ${d.windows.length + 1}`, date: next, start: last?.start ?? "06:00", end: last?.end ?? "22:00" }]);
            }}
          >
            <CalendarPlus /> Add date
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {d.windows.map((w, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-2xl border p-2 sm:grid-cols-[1fr_1.2fr_0.8fr_0.8fr_auto] sm:items-center sm:border-0 sm:p-0">
              <Input aria-label={`Label for date ${i + 1}`} value={w.label} onChange={(e) => setWindow(i, { label: e.target.value })} placeholder="Label" />
              <Input aria-label={`Date ${i + 1}`} type="date" value={w.date} onChange={(e) => setWindow(i, { date: e.target.value })} />
              <Input aria-label={`Start time ${i + 1}`} type="time" value={w.start} onChange={(e) => setWindow(i, { start: e.target.value })} />
              <Input aria-label={`End time ${i + 1}`} type="time" value={w.end} onChange={(e) => setWindow(i, { end: e.target.value })} />
              <Button variant="ghost" size="icon-sm" aria-label={`Remove date ${i + 1}`} disabled={d.windows.length === 1} onClick={() => set("windows", d.windows.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {(errors.windows || errors["windows.0.endsAt"]) && <p className="text-xs text-destructive">{errors.windows ?? errors["windows.0.endsAt"]}</p>}
          <Field label="Proposals due by" htmlFor="due" help="Component Officers are reminded before this time." className="mt-2 sm:max-w-xs">
            <Input id="due" type="datetime-local" value={d.proposalDueAt} onChange={(e) => set("proposalDueAt", e.target.value)} />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}

function ReuseStrip({ reusable }: { reusable: WizardOptions["reusable"] }) {
  const router = useRouter();
  const [src, setSrc] = React.useState("");
  const [depth, setDepth] = React.useState<"components" | "proposals">("components");
  const [pending, start] = React.useTransition();
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed bg-card/60 p-3 lg:flex-row lg:items-center">
      <p className="text-sm font-medium lg:mr-2">Start from a previous plan?</p>
      <Select value={src} onValueChange={setSrc}>
        <SelectTrigger className="h-9 lg:w-72" aria-label="Previous plan">
          <SelectValue placeholder="Choose a plan" />
        </SelectTrigger>
        <SelectContent>
          {reusable.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.code} · {p.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ToggleGroup type="single" value={depth} onValueChange={(v) => v && setDepth(v as "components")} aria-label="Copy depth" className="flex-wrap">
        <ToggleGroupItem value="components">Up to components</ToggleGroupItem>
        <ToggleGroupItem value="proposals">Up to proposals</ToggleGroupItem>
      </ToggleGroup>
      <Button
        size="sm"
        variant="soft"
        disabled={!src || pending}
        onClick={() =>
          start(async () => {
            const r = await reusePlanAction(src, depth);
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            toast.success("Copied — set the new dates");
            router.push(`/plans/${r.data.id}/setup?step=0`);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Copy />} Copy plan
      </Button>
    </div>
  );
}

function ComponentsStep({
  comps,
  setComps,
  overall,
  setOverall,
  options,
  errors,
}: {
  comps: WizardComponent[];
  setComps: React.Dispatch<React.SetStateAction<WizardComponent[]>>;
  overall: PersonOption | null;
  setOverall: (p: PersonOption | null) => void;
  options: WizardOptions;
  errors: Record<string, string>;
}) {
  const patch = (key: string, p: Partial<WizardComponent>) => setComps((cs) => cs.map((c) => (c.key === key ? { ...c, ...p } : c)));
  const unused = options.components.filter((m) => !comps.some((c) => c.componentId === m.id || c.name === m.name));
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Overall Incharge</CardTitle>
          <CardDescription>The senior officer in charge of the whole bandobast.</CardDescription>
        </CardHeader>
        <CardContent className="sm:max-w-md">
          <PersonPicker value={overall} onChange={setOverall} search={searchOfficersAction} placeholder="Search officers…" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Components & Component Officers</CardTitle>
            <CardDescription>Each Component Officer proposes sectors, points and men for their component. A login is created if they don&apos;t have one.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setComps((cs) => [...cs, { key: newKey(), id: null, componentId: null, name: "", co: null, incharge: null }])}>
            <Plus /> Add component
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="hidden grid-cols-[1.1fr_1.2fr_1.2fr_auto] gap-2 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:grid">
            <span>Component</span>
            <span>Component Officer</span>
            <span>Component incharge (optional)</span>
            <span className="w-8" />
          </div>
          {comps.map((c, i) => (
            <div key={c.key} className="grid gap-2 rounded-2xl border p-2 md:grid-cols-[1.1fr_1.2fr_1.2fr_auto] md:items-center md:border-0 md:p-0">
              <div className="flex gap-1.5">
                <Input value={c.name} onChange={(e) => patch(c.key, { name: e.target.value, componentId: null })} placeholder="e.g. Traffic" aria-label={`Component ${i + 1} name`} list="component-masters" />
              </div>
              <PersonPicker value={c.co} onChange={(p) => patch(c.key, { co: p })} search={searchOfficersAction} placeholder="Component Officer…" invalid={!!c.name && !c.co} />
              <PersonPicker value={c.incharge} onChange={(p) => patch(c.key, { incharge: p })} search={searchOfficersAction} placeholder="Incharge…" />
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${c.name || `component ${i + 1}`}`} disabled={comps.length === 1 || (c.status !== undefined && c.status !== "assigned")} onClick={() => setComps((cs) => cs.filter((x) => x.key !== c.key))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <datalist id="component-masters">
            {options.components.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
          {unused.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <ListPlus className="size-3.5" /> Quick add:
              {unused.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="rounded-full border bg-card px-2.5 py-1 text-foreground hover:bg-accent"
                  onClick={() =>
                    setComps((cs) => {
                      const blank = cs.find((x) => !x.name && !x.co);
                      return blank ? cs.map((x) => (x.key === blank.key ? { ...x, name: m.name, componentId: m.id } : x)) : [...cs, { key: newKey(), id: null, componentId: m.id, name: m.name, co: null, incharge: null }];
                    })
                  }
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
          {(errors.components || errors._) && <p className="text-xs text-destructive">{errors.components ?? errors._}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function ScheduleStep({ rows, setRows, ranks, firstWindow, errors }: { rows: WizardSchedule[]; setRows: React.Dispatch<React.SetStateAction<WizardSchedule[]>>; ranks: WizardOptions["ranks"]; firstWindow?: WizardWindow; errors: Record<string, string> }) {
  const patch = (key: string, p: Partial<WizardSchedule>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const standard = () => {
    if (!firstWindow?.date) return toast.error("Add the duty dates first.");
    const base = new Date(`${firstWindow.date}T${firstWindow.start}:00+05:30`).getTime();
    const end = new Date(`${firstWindow.date}T${firstWindow.end}:00+05:30`).getTime();
    const at = (t: number) => {
      const s = new Date(t + 5.5 * 3600e3).toISOString();
      return s.slice(0, 16);
    };
    setRows([
      { key: newKey(), kind: "reporting", rankId: "", at: at(base - 2 * 3600e3), place: "District Police Office" },
      { key: newKey(), kind: "briefing", rankId: "", at: at(base - 1 * 3600e3), place: "District Police Office" },
      { key: newKey(), kind: "deployment", rankId: "", at: at(base), place: "Respective points" },
      { key: newKey(), kind: "relief", rankId: "", at: at(end > base ? end : end + 86400e3), place: "Respective points" },
    ]);
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Reporting schedule</CardTitle>
          <CardDescription>Printed on duty passes. Leave rank as &quot;All ranks&quot; unless a rank reports separately.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={standard}>
            Fill standard schedule
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { key: newKey(), kind: "reporting", rankId: "", at: "", place: "" }])}>
            <Plus /> Add row
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rows.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No schedule yet. Use “Fill standard schedule” for reporting → briefing → deployment → relief.</p>}
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-2 gap-2 rounded-2xl border p-2 md:grid-cols-[0.9fr_0.9fr_1.1fr_1.4fr_auto] md:items-center md:border-0 md:p-0">
            <Select value={r.kind} onValueChange={(v) => patch(r.key, { kind: v as WizardSchedule["kind"] })}>
              <SelectTrigger aria-label={`Type of row ${i + 1}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={r.rankId || "__all__"} onValueChange={(v) => patch(r.key, { rankId: v === "__all__" ? "" : v })}>
              <SelectTrigger aria-label={`Rank of row ${i + 1}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All ranks</SelectItem>
                {ranks.map((rk) => (
                  <SelectItem key={rk.id} value={rk.id}>
                    {rk.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="datetime-local" aria-label={`Time of row ${i + 1}`} value={r.at} onChange={(e) => patch(r.key, { at: e.target.value })} aria-invalid={!!errors[`rows.${i}.at`]} />
            <Input aria-label={`Place of row ${i + 1}`} value={r.place} onChange={(e) => patch(r.key, { place: e.target.value })} placeholder="Place" aria-invalid={!!errors[`rows.${i}.place`]} />
            <Button variant="ghost" size="icon-sm" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        {Object.keys(errors).some((k) => k.startsWith("rows")) && <p className="text-xs text-destructive">Every row needs a time and a place.</p>}
      </CardContent>
    </Card>
  );
}

function ImageStep({ planId, imageUrl, setImageUrl }: { planId: string; imageUrl: string | null; setImageUrl: (u: string | null) => void }) {
  const [pending, start] = React.useTransition();
  const upload = (file: File | null) =>
    start(async () => {
      const fd = new FormData();
      if (file) fd.set("image", file);
      const r = await savePlanImageAction(planId, fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setImageUrl(r.data.imageUrl);
      toast.success(r.message ?? "Saved");
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cover image (optional)</CardTitle>
        <CardDescription>A route map or venue photo for the scheme book and the plan page.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex aspect-video w-full max-w-md items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-muted/40">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded image
            <img src={imageUrl} alt="Plan cover" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="size-8 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload cover image" disabled={pending} onChange={(e) => upload(e.target.files?.[0] ?? null)} />
          {imageUrl && (
            <Button variant="ghost" size="sm" className="w-fit" disabled={pending} onClick={() => upload(null)}>
              Remove image
            </Button>
          )}
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewStep({ d, overall, comps, schedule, ranks, problems, isDraft }: { d: WizardInitial["details"]; overall: PersonOption | null; comps: WizardComponent[]; schedule: WizardSchedule[]; ranks: WizardOptions["ranks"]; problems: string[]; isDraft: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {problems.length > 0 ? (
        <div className="flex gap-2 rounded-2xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-soft-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Before sending</p>
            <ul className="list-disc pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        isDraft && (
          <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success-soft p-3 text-sm text-success-soft-foreground">
            <CheckCircle2 className="size-4" /> Ready. Each Component Officer gets an in-app alert and a message.
          </div>
        )
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{d.title || "Untitled plan"}</CardTitle>
            <CardDescription>
              {d.eventType}
              {d.venue ? ` · ${d.venue}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d.windows.map((w, i) => (
              <p key={i} className="flex items-center gap-2">
                <Badge tone="neutral">{w.label || `Day ${i + 1}`}</Badge>
                <span className="tabular">
                  {w.date} · {w.start}–{w.end}
                </span>
              </p>
            ))}
            <p className="text-muted-foreground">Overall Incharge: {overall ? `${overall.rank} ${overall.name}` : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Components ({comps.filter((c) => c.name).length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {comps
                .filter((c) => c.name)
                .map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="font-medium">{c.name}</span>
                    <span className="truncate text-muted-foreground">{c.co ? `${c.co.rank} ${c.co.name}` : <span className="text-destructive">No Component Officer</span>}</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
        {schedule.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Reporting schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {schedule.map((s) => (
                  <li key={s.key} className="flex gap-2">
                    <Badge tone="info">{KIND_LABEL[s.kind]}</Badge>
                    <span className="tabular">{s.at.replace("T", " ")}</span>
                    <span className="truncate text-muted-foreground">
                      {s.place} · {ranks.find((r) => r.id === s.rankId)?.code ?? "All ranks"}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
