"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Loader2, MapPin, Send, Users, X } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fmtDateTime, fmtTime, fromLocalInput, toLocalInput } from "@/lib/format";
import type { MeetingRow } from "@/lib/queries/office";
import { cn } from "@/lib/utils";
import { meetingStatusAction, saveMeetingAction, saveMomAction } from "../actions";

/** The next half hour plus an hour — a sensible default start. */
function nextSlot() {
  return new Date(Math.ceil(Date.now() / 1800e3) * 1800e3 + 3600e3);
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Calendar day key in IST. */
const dayKey = (d: Date | string) => toLocalInput(d).slice(0, 10);
const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekStart = (key: string) => {
  const dow = (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(key, -dow);
};

export function MeetingsClient({ meetings, anchor, view, staff, manager, me }: { meetings: MeetingRow[]; anchor: string; view: "month" | "week"; staff: { id: string; name: string }[]; manager: boolean; me: string }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<MeetingRow | "new" | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const open = meetings.find((m) => m.id === openId) ?? null;
  const today = dayKey(new Date());
  const go = (a: string, v = view) => router.push(`?view=${v}&date=${a}`, { scroll: false });

  const days: string[] = [];
  if (view === "month") {
    const first = `${anchor.slice(0, 7)}-01`;
    let d = weekStart(first);
    while (days.length < 42) {
      days.push(d);
      d = addDays(d, 1);
    }
    if (days.slice(35).every((x) => x.slice(0, 7) !== anchor.slice(0, 7))) days.splice(35);
  } else {
    const s = weekStart(anchor);
    for (let i = 0; i < 7; i++) days.push(addDays(s, i));
  }
  const byDay = new Map<string, MeetingRow[]>();
  for (const m of meetings) byDay.set(dayKey(m.startsAt), [...(byDay.get(dayKey(m.startsAt)) ?? []), m]);
  const title = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${anchor}T00:00:00Z`));
  const upcoming = meetings.filter((m) => new Date(m.endsAt) >= new Date() && m.status !== "cancelled").slice(0, 6);
  const prior = meetings.filter((m) => new Date(m.endsAt) < new Date()).reverse();

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-2 rounded-2xl border bg-card p-3 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon-sm" aria-label="Previous" onClick={() => go(view === "month" ? addDays(`${anchor.slice(0, 7)}-01`, -1) : addDays(anchor, -7))}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => go(today)}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next" onClick={() => go(view === "month" ? addDays(`${anchor.slice(0, 7)}-28`, 7) : addDays(anchor, 7))}>
            <ChevronRight />
          </Button>
          <p className="font-semibold">{title}</p>
          <ToggleGroup type="single" value={view} onValueChange={(v) => v && go(anchor, v as "month")} aria-label="View" className="ml-auto">
            <ToggleGroupItem value="month">Month</ToggleGroupItem>
            <ToggleGroupItem value="week">Week</ToggleGroupItem>
          </ToggleGroup>
          {manager && (
            <Button size="sm" onClick={() => setEditing("new")}>
              <CalendarPlus /> New meeting
            </Button>
          )}
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border text-xs">
          {WEEKDAYS.map((w) => (
            <div key={w} className="bg-muted/60 px-2 py-1 font-medium text-muted-foreground">
              {w}
            </div>
          ))}
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const outside = view === "month" && d.slice(0, 7) !== anchor.slice(0, 7);
            return (
              <div key={d} className={cn("flex flex-col gap-0.5 bg-card p-1", view === "month" ? "min-h-[5.5rem]" : "min-h-72", outside && "bg-background text-muted-foreground")}>
                <span className={cn("tabular inline-flex size-6 items-center justify-center self-start rounded-full", d === today && "bg-primary font-semibold text-primary-foreground")}>{Number(d.slice(8))}</span>
                {list.slice(0, view === "month" ? 3 : 20).map((m) => (
                  <button key={m.id} type="button" onClick={() => setOpenId(m.id)} className={cn("truncate rounded-md px-1.5 py-0.5 text-left text-[11px]", m.status === "cancelled" ? "bg-muted text-muted-foreground line-through" : "bg-accent text-accent-foreground hover:bg-primary/15")}>
                    <span className="tabular">{fmtTime(m.startsAt)}</span> {m.title}
                  </button>
                ))}
                {list.length > 3 && view === "month" && <span className="px-1 text-[10px] text-muted-foreground">+{list.length - 3} more</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <MeetingList title={manager ? "Upcoming" : "Meetings to attend"} list={upcoming} onOpen={setOpenId} empty="Nothing scheduled." />
        <MeetingList title="Prior meetings" list={prior.slice(0, 8)} onOpen={setOpenId} empty="No past meetings in this period." />
      </div>
      <MeetingSheet key={editing === "new" ? "new" : (editing?.id ?? "none")} editing={editing} onClose={() => setEditing(null)} staff={staff} me={me} />
      <MeetingDetail meeting={open} onClose={() => setOpenId(null)} manager={manager} onEdit={(m) => (setOpenId(null), setEditing(m))} />
    </div>
  );
}

function MeetingList({ title, list, onOpen, empty }: { title: string; list: MeetingRow[]; onOpen: (id: string) => void; empty: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3 shadow-soft">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {list.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => onOpen(m.id)} className="flex w-full flex-col rounded-xl border px-3 py-2 text-left hover:bg-accent/40">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{m.title}</span>
                {m.momSentAt ? <Badge tone="success">MOM sent</Badge> : m.status === "cancelled" ? <Badge tone="neutral">Cancelled</Badge> : null}
              </span>
              <span className="tabular text-xs text-muted-foreground">
                {fmtDateTime(m.startsAt)}
                {m.location ? ` · ${m.location}` : ""}
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="text-xs text-muted-foreground">{empty}</li>}
      </ul>
    </div>
  );
}

function MeetingSheet({ editing, onClose, staff, me }: { editing: MeetingRow | "new" | null; onClose: () => void; staff: { id: string; name: string }[]; me: string }) {
  const base = editing && editing !== "new" ? editing : null;
  const [form, setForm] = React.useState(() => {
    if (base) return { title: base.title, agenda: base.agenda ?? "", location: base.location ?? "", start: toLocalInput(base.startsAt), end: toLocalInput(base.endsAt), remind: String(base.remindMinutes ?? "none"), who: base.participants.map((p) => p.userId) };
    const s = nextSlot();
    return { title: "", agenda: "", location: "", start: toLocalInput(s), end: toLocalInput(new Date(s.getTime() + 3600e3)), remind: "30", who: [me] };
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  return (
    <Sheet open={!!editing} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{base ? "Edit meeting" : "New meeting"}</SheetTitle>
          <SheetDescription>Participants get an in-app alert and a reminder before it starts.</SheetDescription>
        </SheetHeader>
        <SheetBody className="grid gap-3.5">
          <div className="grid gap-1.5">
            <Label htmlFor="m-title">Title</Label>
            <Input id="m-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-invalid={!!errors.title} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="m-start">Starts</Label>
              <Input id="m-start" type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="m-end">Ends</Label>
              <Input id="m-end" type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} aria-invalid={!!errors.endsAt} />
              {errors.endsAt && <p className="text-xs text-destructive">{errors.endsAt}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="m-loc">Location</Label>
              <Input id="m-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Reminder</Label>
              <Select value={form.remind} onValueChange={(v) => setForm({ ...form, remind: v })}>
                <SelectTrigger aria-label="Reminder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No reminder</SelectItem>
                  {[15, 30, 60, 120, 1440].map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m < 60 ? `${m} min before` : m === 1440 ? "1 day before" : `${m / 60} h before`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="m-agenda">Agenda</Label>
            <Textarea id="m-agenda" rows={3} value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Participants</Label>
            <ul className="max-h-48 divide-y overflow-y-auto rounded-2xl border">
              {staff.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm">
                    <Checkbox checked={form.who.includes(s.id)} onCheckedChange={(c) => setForm({ ...form, who: c ? [...form.who, s.id] : form.who.filter((x) => x !== s.id) })} aria-label={s.name} />
                    {s.name}
                  </label>
                </li>
              ))}
            </ul>
            {errors.participantIds && <p className="text-xs text-destructive">{errors.participantIds}</p>}
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveMeetingAction(base?.id ?? null, { title: form.title, agenda: form.agenda, location: form.location, startsAt: fromLocalInput(form.start) ?? "", endsAt: fromLocalInput(form.end) ?? "", remindMinutes: form.remind === "none" ? null : Number(form.remind), participantIds: form.who });
                if (!r.ok) {
                  setErrors(r.fieldErrors ?? {});
                  toast.error(r.error);
                  return;
                }
                toast.success(r.message ?? "Saved");
                onClose();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <CalendarPlus />} {base ? "Save" : "Schedule"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function MeetingDetail({ meeting, onClose, manager, onEdit }: { meeting: MeetingRow | null; onClose: () => void; manager: boolean; onEdit: (m: MeetingRow) => void }) {
  const [mom, setMom] = React.useState("");
  const [attended, setAttended] = React.useState<string[]>([]);
  const [pending, start] = React.useTransition();
  const [prev, setPrev] = React.useState<string | null>(null);
  if ((meeting?.id ?? null) !== prev) {
    setPrev(meeting?.id ?? null);
    setMom(meeting?.mom ?? "");
    setAttended(meeting?.participants.filter((p) => p.attended !== false).map((p) => p.userId) ?? []);
  }
  if (!meeting) return <Sheet open={false} />;
  const started = new Date(meeting.startsAt) <= new Date();
  const save = (send: boolean) =>
    start(async () => {
      const r = await saveMomAction(meeting.id, { mom, send, attendedIds: attended });
      if (r.ok) toast.success(r.message ?? "Saved");
      else toast.error(r.error);
    });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="pr-6">{meeting.title}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" /> {fmtDateTime(meeting.startsAt)} – {fmtTime(meeting.endsAt)}
            </span>
            {meeting.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" /> {meeting.location}
              </span>
            )}
            {meeting.status === "cancelled" && <StatusPill status="cancelled" />}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-3">
          {meeting.agenda && <p className="rounded-2xl bg-muted p-3 text-sm whitespace-pre-line">{meeting.agenda}</p>}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Users className="size-4" /> Participants {manager && started ? "— tick who attended" : ""}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {meeting.participants.map((p) =>
                manager && started ? (
                  <li key={p.userId}>
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm">
                      <Checkbox checked={attended.includes(p.userId)} onCheckedChange={(c) => setAttended((a) => (c ? [...a, p.userId] : a.filter((x) => x !== p.userId)))} aria-label={`${p.name} attended`} />
                      {p.name}
                    </label>
                  </li>
                ) : (
                  <li key={p.userId}>
                    <Badge tone={p.attended ? "success" : "neutral"}>{p.name}</Badge>
                  </li>
                ),
              )}
            </ul>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mom">Minutes of meeting</Label>
            {manager ? <Textarea id="mom" rows={8} value={mom} onChange={(e) => setMom(e.target.value)} placeholder={started ? "Decisions, action points, owners…" : "Write the minutes after the meeting starts."} disabled={!started} /> : <p className="min-h-16 rounded-2xl border p-3 text-sm whitespace-pre-line">{meeting.mom ?? "Minutes not shared yet."}</p>}
            {meeting.momSentAt && <p className="text-xs text-muted-foreground">Sent to participants {fmtDateTime(meeting.momSentAt)}</p>}
          </div>
        </SheetBody>
        {manager && (
          <SheetFooter className="flex-wrap">
            {meeting.status !== "cancelled" && !started && (
              <>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await meetingStatusAction(meeting.id, "cancelled");
                      if (r.ok) toast.success(r.message ?? "Cancelled");
                      else toast.error(r.error);
                    })
                  }
                >
                  <X /> Cancel meeting
                </Button>
                <Button variant="outline" onClick={() => onEdit(meeting)}>
                  Edit
                </Button>
              </>
            )}
            {started && (
              <>
                <Button variant="outline" disabled={pending || mom.trim().length < 3} onClick={() => save(false)}>
                  Save minutes
                </Button>
                <Button disabled={pending || mom.trim().length < 3} onClick={() => save(true)}>
                  {pending ? <Loader2 className="animate-spin" /> : <Send />} Send minutes
                </Button>
              </>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
