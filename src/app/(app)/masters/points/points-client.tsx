"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Ellipsis, FileUp, List, Loader2, Map as MapIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DataTable, SortHeader } from "@/components/data-table";
import { EntityFields, type FormValues } from "@/components/masters/entity-form";
import { ImportSheet } from "@/components/masters/import-sheet";
import { MapView, StreetViewLink } from "@/components/map/map-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { FieldDef, Option } from "@/lib/masters/defs";
import { deletePointAction, importPointsAction, savePointAction } from "./actions";

export type PointRow = {
  id: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  stationId: string | null;
  station: string | null;
  defaultPriority: number;
  defaultIntensity: "high" | "medium" | "low";
  defaultMobility: "static" | "mobile";
  genderReq: "any" | "male" | "female";
  isActive: boolean;
};

export const PRIORITY: Record<number, { label: string; tone: "danger" | "warning" | "info" | "neutral" }> = {
  1: { label: "P1 Critical", tone: "danger" },
  2: { label: "P2 High", tone: "warning" },
  3: { label: "P3 Normal", tone: "info" },
  4: { label: "P4 Low", tone: "neutral" },
};
const MAP_COLOR = { 1: "danger", 2: "warning", 3: "primary", 4: "neutral" } as const;

export function PointsClient({ rows, stations, canManage }: { rows: PointRow[]; stations: Option[]; canManage: boolean }) {
  const [view, setView] = React.useState<"list" | "map">("list");
  const [editing, setEditing] = React.useState<PointRow | "new" | null>(null);
  const [values, setValues] = React.useState<FormValues>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [deleting, setDeleting] = React.useState<PointRow | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [pending, start] = React.useTransition();

  const fields: FieldDef[] = [
    { name: "name", label: "Point name", type: "text", required: true, placeholder: "Benz Circle junction" },
    { name: "stationId", label: "Station limits", type: "select", options: [{ value: "", label: "— None —" }, ...stations] },
    {
      name: "defaultPriority",
      label: "Default priority",
      type: "select",
      options: Object.entries(PRIORITY).map(([v, p]) => ({ value: v, label: p.label })),
    },
    {
      name: "defaultIntensity",
      label: "Duty intensity",
      type: "select",
      options: [
        { value: "high", label: "High — long standing, crowd" },
        { value: "medium", label: "Medium" },
        { value: "low", label: "Low — rest-friendly" },
      ],
      help: "Suggestions send younger, fit officers to high-intensity points.",
    },
    {
      name: "defaultMobility",
      label: "Mobility",
      type: "select",
      options: [
        { value: "static", label: "Static" },
        { value: "mobile", label: "Mobile / patrol" },
      ],
    },
    {
      name: "genderReq",
      label: "Gender requirement",
      type: "select",
      options: [
        { value: "any", label: "Any" },
        { value: "female", label: "Women officers" },
        { value: "male", label: "Men officers" },
      ],
    },
    { name: "description", label: "Description", type: "textarea", wide: true },
    { name: "location", label: "Location", type: "latlng", wide: true, required: true },
    { name: "isActive", label: "Active", type: "boolean" },
  ];

  const open = (row: PointRow | "new") => {
    setEditing(row);
    setErrors({});
    setValues(
      row === "new"
        ? { name: "", stationId: "", defaultPriority: "3", defaultIntensity: "medium", defaultMobility: "static", genderReq: "any", description: "", location: { lat: null, lng: null }, isActive: true }
        : { ...row, stationId: row.stationId ?? "", defaultPriority: String(row.defaultPriority), description: row.description ?? "", location: { lat: row.lat, lng: row.lng } },
    );
  };

  const columns: ColumnDef<PointRow, unknown>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <SortHeader label="Point" column={column} />,
      cell: ({ row: { original: p } }) => (
        <div className="leading-tight">
          <p className="font-medium">
            {p.name} {!p.isActive && <Badge tone="neutral">Inactive</Badge>}
          </p>
          {p.description && <p className="max-w-80 truncate text-xs text-muted-foreground">{p.description}</p>}
        </div>
      ),
    },
    { accessorKey: "defaultPriority", header: ({ column }) => <SortHeader label="Priority" column={column} />, cell: ({ row: { original: p } }) => <Badge tone={PRIORITY[p.defaultPriority]!.tone}>{PRIORITY[p.defaultPriority]!.label}</Badge> },
    {
      accessorKey: "defaultIntensity",
      header: "Intensity · mobility",
      cell: ({ row: { original: p } }) => (
        <span className="flex flex-nowrap gap-1 whitespace-nowrap">
          <Badge tone={p.defaultIntensity === "high" ? "danger" : p.defaultIntensity === "medium" ? "warning" : "success"}>{p.defaultIntensity[0]!.toUpperCase() + p.defaultIntensity.slice(1)}</Badge>
          <Badge tone="neutral">{p.defaultMobility}</Badge>
          {p.genderReq !== "any" && <Badge tone="info">{p.genderReq === "female" ? "Women" : "Men"}</Badge>}
        </span>
      ),
    },
    { accessorKey: "station", header: ({ column }) => <SortHeader label="Station limits" column={column} />, cell: ({ getValue }) => (getValue() as string) ?? <span className="text-muted-foreground">—</span> },
    { id: "location", header: "Location", cell: ({ row: { original: p } }) => <StreetViewLink lat={p.lat} lng={p.lng} /> },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row: { original: p } }) =>
        canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => open(p)}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  const toolbar = (
    <>
      <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as "list" | "map")} aria-label="View">
        <ToggleGroupItem value="list">
          <List /> List
        </ToggleGroupItem>
        <ToggleGroupItem value="map">
          <MapIcon /> Map
        </ToggleGroupItem>
      </ToggleGroup>
      <Button variant="outline" size="sm" asChild>
        <a href="/api/export/points" download>
          <Download /> Excel
        </a>
      </Button>
      {canManage && (
        <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
          <FileUp /> Import
        </Button>
      )}
      {canManage && (
        <Button size="sm" onClick={() => open("new")}>
          <Plus /> Add point
        </Button>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      {view === "map" ? (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto flex flex-wrap gap-1.5 text-xs">
              {Object.entries(PRIORITY).map(([k, p]) => (
                <Badge key={k} tone={p.tone}>
                  {p.label}
                </Badge>
              ))}
            </span>
            {toolbar}
          </div>
          <MapView
            className="h-[calc(100dvh-13rem)] min-h-96"
            points={rows.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, label: p.name, sub: `${PRIORITY[p.defaultPriority]!.label} · ${p.defaultIntensity} intensity`, color: MAP_COLOR[p.defaultPriority as 1] }))}
            onSelect={(id) => {
              const p = rows.find((r) => r.id === id);
              if (p && canManage) open(p);
            }}
          />
        </>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          storageKey="points"
          searchPlaceholder="Point, station, description…"
          searchText={(p) => `${p.name} ${p.station ?? ""} ${p.description ?? ""}`}
          filters={[
            { id: "priority", options: [1, 2, 3, 4].map((n) => ({ value: String(n), label: PRIORITY[n]!.label, count: rows.filter((r) => r.defaultPriority === n).length })), match: (p, v) => String(p.defaultPriority) === v },
          ]}
          actions={toolbar}
          emptyMessage={
            <span className="flex flex-col items-center gap-2">
              No deployment points yet. Add the points you deploy to again and again, or import them from Excel.
              {canManage && (
                <Button size="sm" onClick={() => open("new")}>
                  <Plus /> Add point
                </Button>
              )}
            </span>
          }
          mobileCard={(p) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.defaultIntensity} intensity · {p.defaultMobility}
                  {p.station ? ` · ${p.station}` : ""}
                </p>
              </div>
              <Badge tone={PRIORITY[p.defaultPriority]!.tone}>P{p.defaultPriority}</Badge>
            </div>
          )}
        />
      )}

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editing === "new" ? "Add deployment point" : `Edit ${editing?.name ?? ""}`}</SheetTitle>
            <SheetDescription>These defaults are copied into plans; Component Officers can change them per plan.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <EntityFields fields={fields} values={values} onChange={(n, v) => setValues((c) => ({ ...c, [n]: v }))} errors={errors} options={{ stations, ranks: [] }} files={{}} onFile={() => {}} />
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const loc = (values.location ?? {}) as { lat: number | null; lng: number | null };
                  const r = await savePointAction(editing && editing !== "new" ? editing.id : null, {
                    name: String(values.name ?? ""),
                    description: String(values.description ?? ""),
                    stationId: String(values.stationId ?? ""),
                    location: { lat: loc.lat as number, lng: loc.lng as number },
                    defaultPriority: Number(values.defaultPriority ?? 3),
                    defaultIntensity: values.defaultIntensity as "medium",
                    defaultMobility: values.defaultMobility as "static",
                    genderReq: values.genderReq as "any",
                    isActive: !!values.isActive,
                  });
                  if (!r.ok) {
                    setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k.split(".")[0]!, v])));
                    toast.error(r.error);
                    return;
                  }
                  toast.success(r.message ?? "Saved");
                  setEditing(null);
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />} Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>Plans that already use this point keep their copy.</DialogDescription>
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
                  if (!deleting) return;
                  const r = await deletePointAction(deleting.id);
                  setDeleting(null);
                  if (r.ok) toast.success(r.message ?? "Deleted");
                  else toast.error(r.error);
                })
              }
            >
              <Trash2 /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportSheet open={importing} onOpenChange={setImporting} title="Import deployment points" templateHref="/api/templates/points" action={importPointsAction} />
    </div>
  );
}
