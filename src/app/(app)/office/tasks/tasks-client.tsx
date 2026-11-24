"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlarmClock, CheckCheck, CircleDot, Hourglass, ImagePlus, Loader2, MessageSquare, Plus, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";

import { DataTable, SortHeader } from "@/components/data-table";
import { KpiCard } from "@/components/kpi-card";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate, fmtDateTime, fmtRelative } from "@/lib/format";
import type { TaskRow } from "@/lib/queries/office";
import { actionTakenAction, addTaskAttachmentAction, commentTaskAction, createTaskAction, taskDetailAction, verifyTaskAction } from "../actions";

const STATUS = {
  open: { pill: "pending", label: "Open" },
  action_taken: { pill: "submitted", label: "Action taken" },
  reopened: { pill: "returned", label: "Reopened" },
  closed: { pill: "completed", label: "Closed" },
} as const;
const PRIORITY_TONE = { urgent: "danger", high: "warning", normal: "neutral", low: "neutral" } as const;
const overdue = (t: TaskRow) => !!t.dueDate && t.status !== "closed" && new Date(`${t.dueDate}T23:59:59+05:30`) < new Date();

type Opts = { staff: { id: string; name: string }[]; departments: { id: string; name: string }[] };

export function TasksClient({ rows, options, manager, me }: { rows: TaskRow[]; options: Opts; manager: boolean; me: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [creating, setCreating] = React.useState(false);
  const openId = params.get("task");
  const open = rows.find((r) => r.id === openId) ?? null;
  const setOpen = (id: string | null) => router.replace(id ? `?task=${id}` : "?", { scroll: false });
  const count = (s: keyof typeof STATUS) => rows.filter((r) => r.status === s).length;

  const columns: ColumnDef<TaskRow, unknown>[] = [
    {
      accessorKey: "title",
      header: ({ column }) => <SortHeader label="Task" column={column} />,
      cell: ({ row: { original: t } }) => (
        <button type="button" onClick={() => setOpen(t.id)} className="block max-w-96 text-left leading-tight hover:underline">
          <span className="block truncate font-medium">{t.title}</span>
          <span className="text-[11px] text-muted-foreground">
            {t.department ?? "No department"}
            {t.appointmentId ? " · from a visitor" : ""}
          </span>
        </button>
      ),
    },
    { accessorKey: "priority", header: "Priority", cell: ({ row: { original: t } }) => <Badge tone={PRIORITY_TONE[t.priority]} className="capitalize">{t.priority}</Badge> },
    { id: "assignees", header: "Assigned to", cell: ({ row: { original: t } }) => <span className="line-clamp-1 max-w-48 text-sm">{t.assignees.map((a) => a.name).join(", ")}</span> },
    {
      accessorKey: "dueDate",
      header: ({ column }) => <SortHeader label="Due" column={column} />,
      cell: ({ row: { original: t } }) => (t.dueDate ? <Badge tone={overdue(t) ? "danger" : "neutral"}>{fmtDate(t.dueDate)}</Badge> : <span className="text-muted-foreground">—</span>),
    },
    { accessorKey: "status", header: "Status", cell: ({ row: { original: t } }) => <StatusPill status={STATUS[t.status].pill} label={STATUS[t.status].label} /> },
    { accessorKey: "createdAt", header: ({ column }) => <SortHeader label="Age" column={column} />, cell: ({ row: { original: t } }) => <span className="tabular text-xs text-muted-foreground">{fmtRelative(t.createdAt)}</span> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Open" value={count("open") + count("reopened")} icon={CircleDot} tone="info" hint={`${count("reopened")} reopened`} />
        <KpiCard label={manager ? "Awaiting your verification" : "Awaiting verification"} value={count("action_taken")} icon={Hourglass} tone="warning" />
        <KpiCard label="Overdue" value={rows.filter(overdue).length} icon={AlarmClock} tone="danger" />
        <KpiCard label="Closed" value={count("closed")} icon={CheckCheck} tone="success" />
      </div>
      <DataTable
        data={rows}
        columns={columns}
        storageKey="office-tasks"
        searchPlaceholder="Task, department, person…"
        searchText={(t) => `${t.title} ${t.department ?? ""} ${t.assignees.map((a) => a.name).join(" ")}`}
        filters={[
          { id: "status", options: (Object.keys(STATUS) as (keyof typeof STATUS)[]).map((s) => ({ value: s, label: STATUS[s].label, count: count(s) })), match: (t, v) => t.status === v },
          ...(manager ? [] : [{ id: "mine", options: [{ value: "me", label: "Waiting on me", count: rows.filter((r) => r.status !== "closed" && r.status !== "action_taken").length }], match: (t: TaskRow) => t.status !== "closed" && t.status !== "action_taken" }]),
        ]}
        actions={
          manager && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> New task
            </Button>
          )
        }
        emptyMessage={manager ? "No tasks yet. Create one and assign it to your staff." : "Nothing assigned to you."}
        mobileCard={(t) => (
          <button type="button" onClick={() => setOpen(t.id)} className="flex w-full items-center justify-between gap-2 text-left">
            <span className="min-w-0">
              <span className="block truncate font-medium">{t.title}</span>
              <span className="text-xs text-muted-foreground">{t.dueDate ? `Due ${fmtDate(t.dueDate)}` : t.department}</span>
            </span>
            <StatusPill status={STATUS[t.status].pill} label={STATUS[t.status].label} />
          </button>
        )}
      />
      <NewTaskSheet open={creating} onOpenChange={setCreating} options={options} />
      <TaskSheet key={open?.id ?? "none"} task={open} onClose={() => setOpen(null)} manager={manager} me={me} />
    </div>
  );
}

function NewTaskSheet({ open, onOpenChange, options }: { open: boolean; onOpenChange: (o: boolean) => void; options: Opts }) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [dept, setDept] = React.useState("none");
  const [newDept, setNewDept] = React.useState("");
  const [priority, setPriority] = React.useState<"low" | "normal" | "high" | "urgent">("normal");
  const [due, setDue] = React.useState("");
  const [who, setWho] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New task</SheetTitle>
          <SheetDescription>Assignees are told in the app and by message.</SheetDescription>
        </SheetHeader>
        <SheetBody className="grid gap-3.5">
          <div className="grid gap-1.5">
            <Label htmlFor="t-title">Task</Label>
            <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-desc">Details</Label>
            <Textarea id="t-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Department</Label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger aria-label="Department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {options.departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="new">+ New department…</SelectItem>
                </SelectContent>
              </Select>
              {dept === "new" && <Input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="Department name" aria-label="New department name" />}
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as "normal")}>
                <SelectTrigger aria-label="Priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["low", "normal", "high", "urgent"] as const).map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="t-due">Due date</Label>
              <Input id="t-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Assign to</Label>
            <ul className="max-h-56 divide-y overflow-y-auto rounded-2xl border">
              {options.staff.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm">
                    <Checkbox checked={who.includes(s.id)} onCheckedChange={(c) => setWho((w) => (c ? [...w, s.id] : w.filter((x) => x !== s.id)))} aria-label={s.name} />
                    {s.name}
                  </label>
                </li>
              ))}
            </ul>
            {errors.assigneeIds && <p className="text-xs text-destructive">{errors.assigneeIds}</p>}
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await createTaskAction({ title, description, departmentId: dept === "none" || dept === "new" ? null : dept, newDepartment: dept === "new" ? newDept : null, priority, dueDate: due || null, assigneeIds: who });
                if (!r.ok) {
                  setErrors(r.fieldErrors ?? {});
                  toast.error(r.error);
                  return;
                }
                toast.success(r.message ?? "Created");
                setTitle("");
                setDescription("");
                setWho([]);
                setDue("");
                setErrors({});
                onOpenChange(false);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Send />} Create and assign
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

type Detail = Awaited<ReturnType<typeof taskDetailAction>>;
const KIND_LABEL = { comment: "Comment", action_taken: "Action taken", closed: "Verified & closed", reopened: "Reopened" } as const;

function TaskSheet({ task, onClose, manager, me }: { task: TaskRow | null; onClose: () => void; manager: boolean; me: string }) {
  const [detail, setDetail] = React.useState<Detail>(null);
  const [note, setNote] = React.useState("");
  const [pending, start] = React.useTransition();
  const load = React.useCallback((id: string) => void taskDetailAction(id).then(setDetail), []);
  React.useEffect(() => {
    if (task) load(task.id);
  }, [task, load]);
  if (!task) return <Sheet open={false} />;
  const mine = task.assignees.some((a) => a.userId === me);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Saved");
      setNote("");
      load(task.id);
    });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="pr-6">{task.title}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={STATUS[task.status].pill} label={STATUS[task.status].label} />
            <Badge tone={PRIORITY_TONE[task.priority]} className="capitalize">
              {task.priority}
            </Badge>
            {task.dueDate && <Badge tone={overdue(task) ? "danger" : "neutral"}>Due {fmtDate(task.dueDate)}</Badge>}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-3">
          {task.description && <p className="rounded-2xl bg-muted p-3 text-sm whitespace-pre-line">{task.description}</p>}
          <p className="text-xs text-muted-foreground">
            By {task.creator ?? "—"} · {fmtDateTime(task.createdAt)} · Assigned to {task.assignees.map((a) => a.name).join(", ")}
          </p>
          {detail?.files.length ? (
            <div className="flex flex-wrap gap-2">
              {detail.files.map((f) => (
                <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block size-16 overflow-hidden rounded-xl border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploaded attachment */}
                  <img src={f.url} alt={f.name} className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          ) : null}
          <ol className="relative flex flex-col gap-2.5 border-l pl-4">
            {detail?.updates.map((u) => (
              <li key={u.id} className="text-sm">
                <span className={`absolute -left-[5px] mt-1.5 size-2.5 rounded-full ${u.kind === "closed" ? "bg-success" : u.kind === "reopened" ? "bg-warning" : u.kind === "action_taken" ? "bg-primary" : "bg-muted-foreground/50"}`} aria-hidden />
                <p className="font-medium">
                  {KIND_LABEL[u.kind]} <span className="text-xs font-normal text-muted-foreground">· {u.by} · {fmtDateTime(u.createdAt)}</span>
                </p>
                {u.note && <p className="whitespace-pre-line text-muted-foreground">{u.note}</p>}
              </li>
            ))}
            {detail && detail.updates.length === 0 && <li className="text-sm text-muted-foreground">No updates yet.</li>}
            {!detail && <li className="text-sm text-muted-foreground">Loading…</li>}
          </ol>
          {task.status !== "closed" && (mine || manager) && (
            <div className="grid gap-2">
              <Label htmlFor="t-note">{mine && !manager ? "What was done?" : manager ? "Remarks" : "Comment"}</Label>
              <Textarea id="t-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              <label className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <ImagePlus className="size-3.5" /> Attach a photo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const fd = new FormData();
                    fd.set("file", f);
                    run(() => addTaskAttachmentAction(task.id, fd));
                  }}
                />
              </label>
            </div>
          )}
        </SheetBody>
        {task.status !== "closed" && (mine || manager) && (
          <SheetFooter className="flex-wrap">
            <Button variant="ghost" disabled={pending || !note.trim()} onClick={() => run(() => commentTaskAction(task.id, note))}>
              <MessageSquare /> Comment
            </Button>
            {mine && (
              <Button variant={manager ? "outline" : "default"} disabled={pending || note.trim().length < 3} onClick={() => run(() => actionTakenAction(task.id, note))}>
                <Send /> Report action taken
              </Button>
            )}
            {manager && (
              <>
                <Button variant="outline" disabled={pending || note.trim().length < 3} onClick={() => run(() => verifyTaskAction(task.id, { decision: "reopen", remarks: note }))}>
                  <RotateCcw /> Reopen
                </Button>
                <Button disabled={pending || note.trim().length < 3} onClick={() => run(() => verifyTaskAction(task.id, { decision: "close", remarks: note }))}>
                  <CheckCheck /> Verify & close
                </Button>
              </>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
