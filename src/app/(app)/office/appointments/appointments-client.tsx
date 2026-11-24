"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarPlus, Ellipsis, Loader2, Pencil, UserCheck, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";

import { DataTable, SortHeader } from "@/components/data-table";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime, fromLocalInput, toLocalInput } from "@/lib/format";
import { allotAppointmentAction, appointmentStatusAction, saveAppointmentAction } from "../actions";

export type ApptRow = { id: string; visitorName: string; visitorPhone: string | null; purpose: string; scheduledAt: string; status: "scheduled" | "met" | "no_show" | "cancelled"; notes: string | null; allottedName: string | null; taskId: string | null; taskStatus: string | null };
/** Next half hour, as a datetime-local value. */
function nextHalfHour() {
  return toLocalInput(new Date(Math.ceil(Date.now() / 1800e3) * 1800e3));
}

const PILL = { scheduled: ["pending", "Scheduled"], met: ["accepted", "Met"], no_show: ["overdue", "No show"], cancelled: ["cancelled", "Cancelled"] } as const;

export function AppointmentsClient({ rows, staff }: { rows: ApptRow[]; staff: { id: string; name: string }[] }) {
  const [editing, setEditing] = React.useState<ApptRow | "new" | null>(null);
  const [allotting, setAllotting] = React.useState<ApptRow | null>(null);
  const [pending, start] = React.useTransition();
  const todayKey = toLocalInput(new Date()).slice(0, 10);
  const status = (a: ApptRow, s: ApptRow["status"]) =>
    start(async () => {
      const r = await appointmentStatusAction(a.id, s);
      if (r.ok) toast.success(r.message ?? "Saved");
      else toast.error(r.error);
    });
  const columns: ColumnDef<ApptRow, unknown>[] = [
    { accessorKey: "scheduledAt", header: ({ column }) => <SortHeader label="When" column={column} />, cell: ({ getValue }) => <span className="tabular text-sm whitespace-nowrap">{fmtDateTime(getValue() as string)}</span> },
    {
      accessorKey: "visitorName",
      header: ({ column }) => <SortHeader label="Visitor" column={column} />,
      cell: ({ row: { original: a } }) => (
        <span className="leading-tight">
          <span className="block font-medium">{a.visitorName}</span>
          <span className="tabular text-[11px] text-muted-foreground">{a.visitorPhone ?? ""}</span>
        </span>
      ),
    },
    { accessorKey: "purpose", header: "Purpose", cell: ({ getValue }) => <span className="line-clamp-2 max-w-72 text-sm">{getValue() as string}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row: { original: a } }) => <StatusPill status={PILL[a.status][0]} label={PILL[a.status][1]} /> },
    {
      id: "allot",
      header: "Allotted to",
      cell: ({ row: { original: a } }) =>
        a.allottedName ? (
          <span className="flex items-center gap-1.5 text-sm">
            {a.allottedName} {a.taskStatus && <Badge tone={a.taskStatus === "closed" ? "success" : "neutral"}>{a.taskStatus === "closed" ? "done" : "task open"}</Badge>}
          </span>
        ) : (
          <Button size="sm" variant="soft" onClick={() => setAllotting(a)}>
            <UserRoundPlus /> Allot
          </Button>
        ),
    },
    {
      id: "menu",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row: { original: a } }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${a.visitorName}`} disabled={pending}>
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => status(a, "met")}>
              <UserCheck /> Mark met
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => status(a, "no_show")}>No show</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEditing(a)}>
              <Pencil /> Edit / reschedule
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => status(a, "cancelled")}>
              Cancel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  const visitors = [...new Map(rows.map((r) => [`${r.visitorName}|${r.visitorPhone ?? ""}`, r])).values()].map((v) => ({ ...v, visits: rows.filter((r) => r.visitorName === v.visitorName && r.visitorPhone === v.visitorPhone).length }));
  const table = (data: ApptRow[], key: string) => (
    <DataTable
      data={data}
      columns={columns}
      storageKey={`appts-${key}`}
      searchPlaceholder="Visitor, mobile, purpose…"
      searchText={(a) => `${a.visitorName} ${a.visitorPhone ?? ""} ${a.purpose}`}
      actions={
        <Button size="sm" onClick={() => setEditing("new")}>
          <CalendarPlus /> New appointment
        </Button>
      }
      emptyMessage="No appointments."
      mobileCard={(a) => (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate font-medium">{a.visitorName}</span>
            <span className="text-xs text-muted-foreground">
              {fmtDateTime(a.scheduledAt)} · {a.purpose}
            </span>
          </span>
          <StatusPill status={PILL[a.status][0]} label={PILL[a.status][1]} />
        </div>
      )}
    />
  );
  return (
    <>
      <Tabs defaultValue="today" className="gap-3">
        <TabsList>
          <TabsTrigger value="today">Today ({rows.filter((r) => r.scheduledAt.slice(0, 10) === todayKey || toLocalInput(r.scheduledAt).slice(0, 10) === todayKey).length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="visitors">Visitors</TabsTrigger>
        </TabsList>
        <TabsContent value="today">{table(rows.filter((r) => toLocalInput(r.scheduledAt).slice(0, 10) === todayKey), "today")}</TabsContent>
        <TabsContent value="upcoming">{table(rows.filter((r) => new Date(r.scheduledAt) > new Date() && r.status === "scheduled").reverse(), "upcoming")}</TabsContent>
        <TabsContent value="all">{table(rows, "all")}</TabsContent>
        <TabsContent value="visitors">
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {visitors.map((v) => (
              <li key={`${v.visitorName}${v.visitorPhone}`} className="flex items-center justify-between rounded-2xl border bg-card p-3 shadow-soft">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{v.visitorName}</span>
                  <span className="tabular text-xs text-muted-foreground">{v.visitorPhone ?? "No mobile"}</span>
                </span>
                <Badge tone="neutral">
                  {v.visits} visit{v.visits > 1 ? "s" : ""}
                </Badge>
              </li>
            ))}
            {visitors.length === 0 && <li className="text-sm text-muted-foreground">No visitors yet.</li>}
          </ul>
        </TabsContent>
      </Tabs>
      <ApptSheet key={editing === "new" ? "new" : (editing?.id ?? "none")} editing={editing} onClose={() => setEditing(null)} />
      <AllotDialog appt={allotting} onClose={() => setAllotting(null)} staff={staff} />
    </>
  );
}

function ApptSheet({ editing, onClose }: { editing: ApptRow | "new" | null; onClose: () => void }) {
  const base = editing && editing !== "new" ? editing : null;
  const [f, setF] = React.useState(() =>
    base ? { name: base.visitorName, phone: base.visitorPhone ?? "", purpose: base.purpose, at: toLocalInput(base.scheduledAt), notes: base.notes ?? "" } : { name: "", phone: "", purpose: "", at: nextHalfHour(), notes: "" },
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  return (
    <Sheet open={!!editing} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{base ? "Edit appointment" : "New appointment"}</SheetTitle>
          <SheetDescription>Visitors to the Unit Officer&apos;s office.</SheetDescription>
        </SheetHeader>
        <SheetBody className="grid gap-3.5">
          {(
            [
              ["name", "Visitor name", "text"],
              ["phone", "Mobile", "tel"],
              ["at", "Date and time", "datetime-local"],
            ] as const
          ).map(([k, label, type]) => (
            <div key={k} className="grid gap-1.5">
              <Label htmlFor={`a-${k}`}>{label}</Label>
              <Input id={`a-${k}`} type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-invalid={!!errors[k === "name" ? "visitorName" : k === "phone" ? "visitorPhone" : "scheduledAt"]} />
              {errors[k === "name" ? "visitorName" : k === "phone" ? "visitorPhone" : "scheduledAt"] && <p className="text-xs text-destructive">{errors[k === "name" ? "visitorName" : k === "phone" ? "visitorPhone" : "scheduledAt"]}</p>}
            </div>
          ))}
          <div className="grid gap-1.5">
            <Label htmlFor="a-purpose">Purpose</Label>
            <Textarea id="a-purpose" rows={2} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} aria-invalid={!!errors.purpose} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="a-notes">Notes</Label>
            <Textarea id="a-notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
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
                const r = await saveAppointmentAction(base?.id ?? null, { visitorName: f.name, visitorPhone: f.phone, purpose: f.purpose, scheduledAt: fromLocalInput(f.at) ?? "", notes: f.notes });
                if (!r.ok) {
                  setErrors(r.fieldErrors ?? {});
                  return void toast.error(r.error);
                }
                toast.success(r.message ?? "Saved");
                onClose();
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />} Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function AllotDialog({ appt, onClose, staff }: { appt: ApptRow | null; onClose: () => void; staff: { id: string; name: string }[] }) {
  const [who, setWho] = React.useState("");
  const [due, setDue] = React.useState("");
  const [text, setText] = React.useState("");
  const [pending, start] = React.useTransition();
  return (
    <Dialog open={!!appt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Allot: {appt?.purpose}</DialogTitle>
          <DialogDescription>Creates a task for the staff member, linked to this visitor.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Select value={who} onValueChange={setWho}>
            <SelectTrigger aria-label="Staff">
              <SelectValue placeholder="Choose staff" />
            </SelectTrigger>
            <SelectContent>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} />
          <Textarea rows={3} aria-label="Instructions" placeholder="Instructions" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={!who || pending}
            onClick={() =>
              start(async () => {
                if (!appt) return;
                const r = await allotAppointmentAction(appt.id, { userId: who, dueDate: due || null, instructions: text || null });
                if (!r.ok) return void toast.error(r.error);
                toast.success(r.message ?? "Allotted");
                onClose();
              })
            }
          >
            <UserRoundPlus /> Allot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
