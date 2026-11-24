"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Copy, Download, Ellipsis, List, Loader2, Map as MapIcon, Pencil, Plus, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";

import { DataTable, SortHeader } from "@/components/data-table";
import { EntityFields, type FormValues } from "@/components/masters/entity-form";
import { MapView, StreetViewLink } from "@/components/map/map-view";
import { PersonPicker, type PersonOption } from "@/components/pickers/person-picker";
import { SortableList } from "@/components/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { FieldDef, Option } from "@/lib/masters/defs";
import type { StationListRow } from "@/lib/queries/masters";
import { assignInchargeAction, deleteStationAction, reorderStationsAction, saveStationAction, searchStationPersonsAction } from "./actions";

const KIND: Option[] = [
  { value: "police_station", label: "Police station" },
  { value: "office", label: "Office" },
  { value: "special_unit", label: "Special unit" },
  { value: "control_room", label: "Control room" },
];

export function StationsClient({ rows, divisions, canManage }: { rows: StationListRow[]; divisions: Option[]; canManage: boolean }) {
  const [view, setView] = React.useState<"list" | "map">("list");
  const [editing, setEditing] = React.useState<StationListRow | "new" | null>(null);
  const [values, setValues] = React.useState<FormValues>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [assigning, setAssigning] = React.useState<StationListRow | null>(null);
  const [picked, setPicked] = React.useState<PersonOption | null>(null);
  const [temp, setTemp] = React.useState<{ username: string; password: string } | null>(null);
  const [deleting, setDeleting] = React.useState<StationListRow | null>(null);
  const [reorder, setReorder] = React.useState<string[] | null>(null);
  const [pending, start] = React.useTransition();

  const fields: FieldDef[] = [
    { name: "code", label: "Station code", type: "text", required: true, placeholder: "PS-T3" },
    { name: "name", label: "Station / office name", type: "text", required: true },
    { name: "kind", label: "Type", type: "select", options: KIND, required: true },
    { name: "divisionId", label: "Division", type: "select", options: divisions },
    { name: "newDivision", label: "…or new division", type: "text", placeholder: "Type to create a division" },
    { name: "location", label: "Location", type: "latlng", wide: true },
  ];

  const open = (row: StationListRow | "new") => {
    setEditing(row);
    setErrors({});
    setValues(
      row === "new"
        ? { code: "", name: "", kind: "police_station", divisionId: divisions[0]?.value ?? "", newDivision: "", location: { lat: null, lng: null } }
        : { code: row.code, name: row.name, kind: row.kind, divisionId: row.divisionId, newDivision: "", location: { lat: row.lat, lng: row.lng } },
    );
  };

  const searchFor = React.useCallback((q: string) => (assigning ? searchStationPersonsAction(assigning.id, q) : Promise.resolve([])), [assigning]);

  const columns: ColumnDef<StationListRow, unknown>[] = [
    { accessorKey: "displayOrder", header: "#", cell: ({ row }) => <span className="tabular text-xs text-muted-foreground">{row.index + 1}</span>, size: 40 },
    {
      accessorKey: "name",
      header: ({ column }) => <SortHeader label="Station / office" column={column} />,
      cell: ({ row: { original: s } }) => (
        <div className="leading-tight">
          <p className="font-medium">{s.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{s.code}</p>
        </div>
      ),
    },
    { accessorKey: "division", header: ({ column }) => <SortHeader label="Division" column={column} /> },
    {
      id: "incharge",
      header: "Office Incharge",
      cell: ({ row: { original: s } }) =>
        s.inchargeName ? (
          <span className="flex items-center gap-1.5">
            <Badge tone="primary">{s.inchargeRank}</Badge>
            <span className="leading-tight">
              <span className="block">{s.inchargeName}</span>
              <span className="tabular block text-[11px] text-muted-foreground">{s.inchargePhone}</span>
            </span>
          </span>
        ) : canManage ? (
          <Button variant="soft" size="sm" onClick={() => setAssigning(s)}>
            <UserCog /> Assign
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Not assigned</span>
        ),
    },
    {
      accessorKey: "available",
      header: ({ column }) => <SortHeader label="Available" column={column} />,
      cell: ({ row: { original: s } }) => (
        <span className="tabular">
          <span className="font-semibold">{s.available}</span>
          <span className="text-muted-foreground"> / {s.strength}</span>
        </span>
      ),
    },
    {
      id: "location",
      header: "Location",
      cell: ({ row: { original: s } }) => (s.lat !== null && s.lng !== null ? <StreetViewLink lat={s.lat} lng={s.lng} /> : <span className="text-xs text-muted-foreground">—</span>),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row: { original: s } }) =>
        canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.name}`}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => open(s)}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAssigning(s)}>
                <UserCog /> {s.inchargeName ? "Change" : "Assign"} Office Incharge
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(s)}>
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
        <a href="/api/export/stations" download>
          <Download /> Excel
        </a>
      </Button>
      {canManage && (
        <Button variant="outline" size="sm" onClick={() => setReorder(rows.map((r) => r.id))}>
          <ArrowUpDown /> Reorder
        </Button>
      )}
      {canManage && (
        <Button size="sm" onClick={() => open("new")}>
          <Plus /> Add station
        </Button>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      {view === "map" ? (
        <>
          <div className="flex flex-wrap justify-end gap-2">{toolbar}</div>
          <MapView
            className="h-[calc(100dvh-13rem)] min-h-96"
            points={rows.filter((r) => r.lat !== null && r.lng !== null).map((r) => ({ id: r.id, lat: r.lat!, lng: r.lng!, label: r.name, sub: r.inchargeName ? `${r.inchargeRank} ${r.inchargeName}` : "No Office Incharge", color: r.inchargeName ? "primary" : "warning" }))}
          />
        </>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          storageKey="stations"
          searchPlaceholder="Station, code, division, incharge…"
          searchText={(s) => `${s.name} ${s.code} ${s.division} ${s.inchargeName ?? ""} ${s.inchargePhone ?? ""}`}
          filters={[
            {
              id: "divisions",
              options: [...new Set(rows.map((r) => r.division))].map((d) => ({ value: d, label: d, count: rows.filter((r) => r.division === d).length })),
              match: (s, v) => s.division === v,
            },
          ]}
          actions={toolbar}
          mobileCard={(s) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">{s.inchargeName ? `${s.inchargeRank} ${s.inchargeName}` : "No Office Incharge"}</p>
              </div>
              <span className="tabular text-sm">
                <span className="font-semibold">{s.available}</span>/{s.strength}
              </span>
            </div>
          )}
        />
      )}

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editing === "new" ? "Add station / office" : `Edit ${editing?.name ?? ""}`}</SheetTitle>
            <SheetDescription>Location is used to find the nearest stations when sourcing force.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <EntityFields fields={fields} values={values} onChange={(n, v) => setValues((c) => ({ ...c, [n]: v }))} errors={errors} options={{ stations: [], ranks: [] }} files={{}} onFile={() => {}} />
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const loc = (values.location ?? { lat: null, lng: null }) as { lat: number | null; lng: number | null };
                  const r = await saveStationAction(editing && editing !== "new" ? editing.id : null, {
                    code: String(values.code ?? ""),
                    name: String(values.name ?? ""),
                    kind: values.kind as "police_station",
                    divisionId: String(values.divisionId ?? ""),
                    newDivision: String(values.newDivision ?? "") || undefined,
                    location: { lat: loc.lat ?? null, lng: loc.lng ?? null },
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

      <Dialog open={!!assigning} onOpenChange={(o) => (!o ? (setAssigning(null), setPicked(null)) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Office Incharge — {assigning?.name}</DialogTitle>
            <DialogDescription>Pick an officer of this station. If they have no login yet, one is created with a one-time password.</DialogDescription>
          </DialogHeader>
          <PersonPicker value={picked} onChange={setPicked} search={searchFor} placeholder="Search officers of this station…" />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              disabled={!picked || pending}
              onClick={() =>
                start(async () => {
                  if (!assigning || !picked) return;
                  const r = await assignInchargeAction(assigning.id, picked.id);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success(r.message ?? "Assigned");
                  setAssigning(null);
                  setPicked(null);
                  if (r.data.tempPassword) setTemp({ username: r.data.username, password: r.data.tempPassword });
                })
              }
            >
              <UserCog /> Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!temp} onOpenChange={(o) => !o && setTemp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login created</DialogTitle>
            <DialogDescription>Share these privately. The officer must change the password at first sign-in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-2xl bg-muted p-4 text-sm">
            <p>
              Username: <span className="font-mono font-semibold">{temp?.username}</span>
            </p>
            <p className="flex items-center gap-2">
              Password: <span className="font-mono text-base font-semibold">{temp?.password}</span>
              <Button variant="ghost" size="icon-sm" aria-label="Copy password" onClick={() => void navigator.clipboard?.writeText(temp?.password ?? "")}>
                <Copy />
              </Button>
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>Only stations with no officers can be deleted.</DialogDescription>
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
                  const r = await deleteStationAction(deleting.id);
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

      <Sheet open={!!reorder} onOpenChange={(o) => !o && setReorder(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Reorder stations</SheetTitle>
            <SheetDescription>This order is used in distribution grids and reports.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            {reorder && <SortableList id="reorder-stations" items={reorder.map((id) => ({ id, label: rows.find((r) => r.id === id)?.name ?? "", sub: rows.find((r) => r.id === id)?.division }))} onChange={setReorder} />}
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setReorder(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  if (!reorder) return;
                  const r = await reorderStationsAction(reorder);
                  if (r.ok) {
                    toast.success(r.message ?? "Saved");
                    setReorder(null);
                  } else toast.error(r.error);
                })
              }
            >
              Save order
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
