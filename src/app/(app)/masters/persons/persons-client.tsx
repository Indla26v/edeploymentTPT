"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRightLeft, BarChart3, Download, Ellipsis, HeartPulse, KeyRound, Loader2, Pencil, Trash2, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { DataTable, SortHeader } from "@/components/data-table";
import { EntityFields, initialValues, toFormData, type FormValues } from "@/components/masters/entity-form";
import { ImportSheet } from "@/components/masters/import-sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { Option } from "@/lib/masters/defs";
import type { PersonListRow } from "@/lib/queries/masters";
import { initials } from "@/lib/utils";
import { importPersonsAction, removePersonAction, savePersonAction, updatePersonStatusAction } from "./actions";
import { AVAILABILITY, personFields } from "./fields";

const AVAIL_LABEL = Object.fromEntries(AVAILABILITY.map((a) => [a.value, a.label]));

export function PersonsClient({
  rows,
  ranks,
  stations,
  canManage,
  canTransfer,
  lockStation,
}: {
  rows: PersonListRow[];
  ranks: Option[];
  stations: Option[];
  canManage: boolean;
  canTransfer: boolean;
  lockStation: boolean;
}) {
  const fields = React.useMemo(() => personFields(ranks, stations, lockStation), [ranks, stations, lockStation]);
  const [editing, setEditing] = React.useState<PersonListRow | "new" | null>(null);
  const [values, setValues] = React.useState<FormValues>({});
  const [files, setFiles] = React.useState<Record<string, File | "__remove__" | undefined>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [removing, setRemoving] = React.useState<PersonListRow | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [showAbstract, setShowAbstract] = React.useState(false);
  const [pending, start] = React.useTransition();

  const open = (row: PersonListRow | "new") => {
    setEditing(row);
    const base = row === "new" ? null : (row as unknown as Record<string, unknown>);
    const v = initialValues(fields, base);
    if (row === "new" && stations.length === 1) v.stationId = stations[0]!.value;
    setValues(v);
    setFiles({});
    setErrors({});
  };

  const abstract = React.useMemo(() => {
    const m = new Map<string, { total: number; available: number; seniority: number }>();
    rows.forEach((r) => {
      const cur = m.get(r.rank) ?? { total: 0, available: 0, seniority: r.rankSeniority };
      cur.total++;
      if (r.availability === "available") cur.available++;
      m.set(r.rank, cur);
    });
    return [...m.entries()].sort((a, b) => a[1].seniority - b[1].seniority);
  }, [rows]);

  const setStatus = (id: string, patch: { availability?: string; fitness?: string }) =>
    start(async () => {
      const r = await updatePersonStatusAction({ id, ...(patch as { availability?: "available"; fitness?: "fit" }) });
      if (!r.ok) toast.error(r.error);
    });

  const columns: ColumnDef<PersonListRow, unknown>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <SortHeader label="Officer" column={column} />,
      cell: ({ row: { original: p } }) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
            <AvatarFallback className={p.gender === "female" ? "bg-info-soft text-info-soft-foreground" : undefined}>{initials(p.name)}</AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <p className="font-medium">{p.name}</p>
            <p className="text-xs text-muted-foreground">Gen No. {p.genNo}</p>
          </div>
        </div>
      ),
    },
    { accessorKey: "rankSeniority", header: ({ column }) => <SortHeader label="Rank" column={column} />, cell: ({ row }) => <Badge tone="primary">{row.original.rank}</Badge> },
    { accessorKey: "station", header: ({ column }) => <SortHeader label="Station" column={column} /> },
    { accessorKey: "age", header: ({ column }) => <SortHeader label="Age" column={column} />, cell: ({ row }) => <span className="tabular">{row.original.age}</span> },
    {
      accessorKey: "fitness",
      header: "Fitness",
      cell: ({ row: { original: p } }) =>
        p.fitness === "fit" ? (
          <Badge tone="success">Fit</Badge>
        ) : (
          <Badge tone="warning">
            <HeartPulse /> Light duty
          </Badge>
        ),
    },
    { accessorKey: "phone", header: "Mobile", cell: ({ row }) => <span className="tabular text-xs text-muted-foreground">{row.original.phone}</span> },
    {
      accessorKey: "availability",
      header: "Available",
      cell: ({ row: { original: p } }) =>
        canManage ? (
          <div className="flex items-center gap-2">
            <Switch checked={p.availability === "available"} disabled={pending} aria-label={`Availability of ${p.name}`} onCheckedChange={(v) => setStatus(p.id, { availability: v ? "available" : "other" })} />
            {p.availability !== "available" && <span className="text-xs text-muted-foreground">{AVAIL_LABEL[p.availability]}</span>}
          </div>
        ) : (
          <Badge tone={p.availability === "available" ? "success" : "neutral"}>{AVAIL_LABEL[p.availability]}</Badge>
        ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row: { original: p } }) =>
        canManage || canTransfer ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canManage && (
                <DropdownMenuItem onSelect={() => open(p)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
              )}
              {canManage && (
                <DropdownMenuItem onSelect={() => setStatus(p.id, { fitness: p.fitness === "fit" ? "light_duty_only" : "fit" })}>
                  <HeartPulse /> {p.fitness === "fit" ? "Mark light duty" : "Mark fit"}
                </DropdownMenuItem>
              )}
              {canTransfer && (
                <DropdownMenuItem asChild>
                  <Link href={`/masters/transfers?person=${p.id}`}>
                    <ArrowRightLeft /> Request transfer
                  </Link>
                </DropdownMenuItem>
              )}
              {canManage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(p)}>
                    <Trash2 /> Remove
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  const topRanks = abstract.slice(0, 8).map(([code, a]) => ({ value: code, label: code, count: a.total }));

  return (
    <div className="flex flex-col gap-3">
      {showAbstract && (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-card p-3 shadow-soft">
          {abstract.map(([code, a]) => (
            <span key={code} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm">
              <Badge tone="primary">{code}</Badge>
              <span className="tabular font-semibold">{a.available}</span>
              <span className="tabular text-xs text-muted-foreground">/ {a.total}</span>
            </span>
          ))}
        </div>
      )}
      <DataTable
        data={rows}
        columns={columns}
        storageKey="persons"
        searchPlaceholder="Name, Gen No, mobile, station…"
        searchText={(p) => `${p.name} ${p.genNo} ${p.phone ?? ""} ${p.station} ${p.rank}`}
        filters={[
          { id: "ranks", options: topRanks, match: (p, v) => p.rank === v },
          {
            id: "status",
            options: [
              { value: "available", label: "Available" },
              { value: "unavailable", label: "Not available" },
              { value: "light", label: "Light duty" },
              { value: "women", label: "Women" },
            ],
            match: (p, v) => (v === "available" ? p.availability === "available" : v === "unavailable" ? p.availability !== "available" : v === "light" ? p.fitness === "light_duty_only" : p.gender === "female"),
          },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowAbstract((v) => !v)}>
              <BarChart3 /> {showAbstract ? "Hide abstract" : "Abstract"}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/export/persons" download>
                <Download /> Excel
              </a>
            </Button>
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload /> Import
              </Button>
            )}
            {canManage && (
              <Button size="sm" onClick={() => open("new")}>
                <UserPlus /> Add officer
              </Button>
            )}
          </>
        }
        mobileCard={(p) => (
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
              <AvatarFallback>{initials(p.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1" onClick={canManage ? () => open(p) : undefined}>
              <p className="truncate font-medium">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {p.rank} · {p.station} · age {p.age}
              </p>
            </div>
            {canManage ? (
              <Switch checked={p.availability === "available"} aria-label={`Availability of ${p.name}`} onCheckedChange={(v) => setStatus(p.id, { availability: v ? "available" : "other" })} />
            ) : (
              <Badge tone={p.availability === "available" ? "success" : "neutral"}>{AVAIL_LABEL[p.availability]}</Badge>
            )}
          </div>
        )}
        emptyMessage="No officers yet. Add one or import from Excel."
      />

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editing === "new" ? "Add officer" : `Edit ${editing?.name ?? ""}`}</SheetTitle>
            <SheetDescription>
              {editing && editing !== "new" && editing.hasLogin ? (
                <span className="inline-flex items-center gap-1">
                  <KeyRound className="size-3.5" /> This officer has a login.
                </span>
              ) : (
                "Details used for deployment, ID cards and duty passes."
              )}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <form
              id="person-form"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await savePersonAction(editing && editing !== "new" ? editing.id : null, toFormData(fields, values, files));
                  if (!r.ok) {
                    setErrors(r.fieldErrors ?? {});
                    toast.error(r.error);
                    return;
                  }
                  toast.success(r.message ?? "Saved");
                  setEditing(null);
                });
              }}
            >
              <EntityFields
                fields={fields}
                values={values}
                onChange={(n, v) => setValues((cur) => ({ ...cur, [n]: v }))}
                errors={errors}
                options={{ stations, ranks }}
                files={files}
                onFile={(n, f) => setFiles((cur) => ({ ...cur, [n]: f }))}
              />
            </form>
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="person-form" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Save officer
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>They disappear from lists and can no longer sign in. Past bandobast records keep their name.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  if (!removing) return;
                  const r = await removePersonAction(removing.id);
                  setRemoving(null);
                  if (r.ok) toast.success(r.message ?? "Removed");
                  else toast.error(r.error);
                })
              }
            >
              <Trash2 /> Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportSheet open={importOpen} onOpenChange={setImportOpen} title="Import police persons" templateHref="/api/templates/persons" action={importPersonsAction} />
    </div>
  );
}
