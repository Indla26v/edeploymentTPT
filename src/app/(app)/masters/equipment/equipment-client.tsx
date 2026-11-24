"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, Download, Ellipsis, Loader2, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { DataTable, SortHeader } from "@/components/data-table";
import { EntityFields, type FormValues } from "@/components/masters/entity-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FieldDef, Option } from "@/lib/masters/defs";
import { deleteEquipmentTypeAction, deleteStockAction, saveEquipmentTypeAction, saveStockAction } from "./actions";

export type StockRow = {
  id: string;
  stationId: string;
  station: string;
  equipmentTypeId: string;
  equipment: string;
  total: number;
  working: number;
  custodianName: string | null;
  custodianDesignation: string | null;
  custodianPhone: string | null;
};

export function EquipmentClient({ types, stock, stations, canManage }: { types: { id: string; name: string }[]; stock: StockRow[]; stations: Option[]; canManage: boolean }) {
  const [editing, setEditing] = React.useState<StockRow | "new" | null>(null);
  const [values, setValues] = React.useState<FormValues>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [typesOpen, setTypesOpen] = React.useState(false);
  const [pending, start] = React.useTransition();

  const fields: FieldDef[] = [
    { name: "equipmentTypeId", label: "Equipment", type: "select", options: types.map((t) => ({ value: t.id, label: t.name })), required: true },
    { name: "stationId", label: "Station", type: "select", options: stations, required: true },
    { name: "total", label: "Total", type: "number", min: 0, required: true },
    { name: "working", label: "Working", type: "number", min: 0, required: true, help: "Not working = total − working" },
    { name: "custodianName", label: "Custodian name", type: "text" },
    { name: "custodianDesignation", label: "Custodian designation", type: "text" },
    { name: "custodianPhone", label: "Custodian mobile", type: "phone" },
  ];

  const open = (row: StockRow | "new") => {
    setEditing(row);
    setErrors({});
    setValues(
      row === "new"
        ? { equipmentTypeId: types[0]?.id ?? "", stationId: stations.length === 1 ? stations[0]!.value : "", total: 0, working: 0, custodianName: "", custodianDesignation: "", custodianPhone: "" }
        : { ...row, custodianName: row.custodianName ?? "", custodianDesignation: row.custodianDesignation ?? "", custodianPhone: row.custodianPhone ?? "" },
    );
  };

  const abstract = React.useMemo(() => {
    const m = new Map<string, { name: string; stations: number; total: number; working: number }>();
    for (const t of types) m.set(t.id, { name: t.name, stations: 0, total: 0, working: 0 });
    for (const s of stock) {
      const a = m.get(s.equipmentTypeId)!;
      a.stations++;
      a.total += s.total;
      a.working += s.working;
    }
    return [...m.values()];
  }, [types, stock]);

  const columns: ColumnDef<StockRow, unknown>[] = [
    { accessorKey: "equipment", header: ({ column }) => <SortHeader label="Equipment" column={column} />, cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
    { accessorKey: "station", header: ({ column }) => <SortHeader label="Station" column={column} /> },
    { accessorKey: "total", header: ({ column }) => <SortHeader label="Total" column={column} />, cell: ({ getValue }) => <span className="tabular font-semibold">{getValue() as number}</span> },
    {
      accessorKey: "working",
      header: "Working / not",
      cell: ({ row: { original: s } }) => (
        <span className="flex gap-1">
          <Badge tone="success">{s.working} working</Badge>
          {s.total - s.working > 0 && <Badge tone="danger">{s.total - s.working} not</Badge>}
        </span>
      ),
    },
    {
      id: "custodian",
      header: "Custodian",
      cell: ({ row: { original: s } }) =>
        s.custodianName ? (
          <span className="leading-tight">
            <span className="block">
              {s.custodianName} <span className="text-xs text-muted-foreground">{s.custodianDesignation}</span>
            </span>
            <span className="tabular block text-[11px] text-muted-foreground">{s.custodianPhone}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row: { original: s } }) =>
        canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.equipment} at ${s.station}`}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => open(s)}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() =>
                  start(async () => {
                    const r = await deleteStockAction(s.id);
                    if (r.ok) toast.success(r.message ?? "Removed");
                    else toast.error(r.error);
                  })
                }
              >
                <Trash2 /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  return (
    <Tabs defaultValue="stock" className="gap-3">
      <TabsList>
        <TabsTrigger value="stock">Stock by station</TabsTrigger>
        <TabsTrigger value="abstract">Abstract</TabsTrigger>
      </TabsList>
      <TabsContent value="stock">
        <DataTable
          data={stock}
          columns={columns}
          storageKey="equipment-stock"
          searchPlaceholder="Equipment, station, custodian…"
          searchText={(s) => `${s.equipment} ${s.station} ${s.custodianName ?? ""}`}
          filters={[{ id: "equipment", options: types.map((t) => ({ value: t.id, label: t.name, count: stock.filter((s) => s.equipmentTypeId === t.id).length })), match: (s, v) => s.equipmentTypeId === v }]}
          actions={
            <>
              <Button variant="outline" size="sm" asChild>
                <a href="/api/export/equipment" download>
                  <Download /> Excel
                </a>
              </Button>
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => setTypesOpen(true)}>
                  <Settings2 /> Equipment types
                </Button>
              )}
              {canManage && (
                <Button size="sm" onClick={() => (types.length ? open("new") : setTypesOpen(true))}>
                  <Plus /> Add stock
                </Button>
              )}
            </>
          }
          emptyMessage={types.length ? "No stock recorded yet. Use “Add stock” to record what each station holds." : "Start by adding equipment types (Lathi, Body protector, Metal detector…)."}
          mobileCard={(s) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{s.equipment}</p>
                <p className="truncate text-xs text-muted-foreground">{s.station}</p>
              </div>
              <span className="tabular text-sm">
                <span className="font-semibold text-success-soft-foreground">{s.working}</span>/{s.total}
              </span>
            </div>
          )}
        />
      </TabsContent>
      <TabsContent value="abstract">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {abstract.map((a) => (
            <Card key={a.name} className="gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-medium">{a.name}</p>
                <span className="tabular text-xl font-semibold">{a.total}</span>
              </div>
              <div className="flex flex-wrap gap-1 text-xs">
                <Badge tone="success">{a.working} working</Badge>
                <Badge tone={a.total - a.working ? "danger" : "neutral"}>{a.total - a.working} not working</Badge>
                <Badge tone="neutral">{a.stations} stations</Badge>
              </div>
            </Card>
          ))}
          {abstract.length === 0 && <p className="text-sm text-muted-foreground">No equipment types yet.</p>}
        </div>
      </TabsContent>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editing === "new" ? "Add stock" : editing && `Edit ${editing?.equipment ?? ""} — ${editing?.station ?? ""}`}</SheetTitle>
            <SheetDescription>Adding stock for an equipment the station already has updates that row.</SheetDescription>
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
                  const r = await saveStockAction(editing && editing !== "new" ? editing.id : null, {
                    stationId: String(values.stationId ?? ""),
                    equipmentTypeId: String(values.equipmentTypeId ?? ""),
                    total: Number(values.total ?? 0),
                    working: Number(values.working ?? 0),
                    custodianName: String(values.custodianName ?? ""),
                    custodianDesignation: String(values.custodianDesignation ?? ""),
                    custodianPhone: String(values.custodianPhone ?? ""),
                  });
                  if (!r.ok) {
                    setErrors(r.fieldErrors ?? {});
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

      <TypesSheet open={typesOpen} onOpenChange={setTypesOpen} types={types} />
    </Tabs>
  );
}

function TypesSheet({ open, onOpenChange, types }: { open: boolean; onOpenChange: (o: boolean) => void; types: { id: string; name: string }[] }) {
  const [name, setName] = React.useState("");
  const [edit, setEdit] = React.useState<{ id: string; name: string } | null>(null);
  const [pending, start] = React.useTransition();
  const save = (id: string | null, n: string, done: () => void) =>
    start(async () => {
      const r = await saveEquipmentTypeAction(id, n);
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        done();
      } else toast.error(r.error);
    });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Equipment types</SheetTitle>
          <SheetDescription>Types used for station stock and plan requirements.</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) save(null, name, () => setName(""));
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New type, e.g. Lathi" aria-label="New equipment type" />
            <Button type="submit" disabled={pending || !name.trim()}>
              <Plus /> Add
            </Button>
          </form>
          <ul className="divide-y rounded-2xl border">
            {types.map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-3 py-1.5">
                {edit?.id === t.id ? (
                  <>
                    <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="h-8" aria-label="Type name" autoFocus />
                    <Button size="icon-sm" variant="ghost" aria-label="Save" onClick={() => save(t.id, edit.name, () => setEdit(null))}>
                      <Check />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setEdit(null)}>
                      <X />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{t.name}</span>
                    <Button size="icon-sm" variant="ghost" aria-label={`Rename ${t.name}`} onClick={() => setEdit(t)}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${t.name}`}
                      onClick={() =>
                        start(async () => {
                          const r = await deleteEquipmentTypeAction(t.id);
                          if (r.ok) toast.success(r.message ?? "Deleted");
                          else toast.error(r.error);
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </li>
            ))}
            {types.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">No types yet.</li>}
          </ul>
        </SheetBody>
        <SheetFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
