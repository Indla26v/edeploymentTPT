"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Check, Download, Ellipsis, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { deleteMasterAction, reorderUnitsAction, saveMasterAction } from "@/app/(app)/masters/actions";
import { DataTable, SortHeader } from "@/components/data-table";
import { SortableList } from "@/components/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ColumnSpec, MasterDef, Option } from "@/lib/masters/defs";
import { EntityFields, initialValues, toFormData, type FormValues, type OptionSets } from "./entity-form";

type Row = Record<string, unknown> & { id: string };

function labelOf(def: MasterDef, field: string, value: unknown, sets: OptionSets): string {
  const f = def.fields.find((x) => x.name === field);
  const opts: Option[] = Array.isArray(f?.options) ? f.options : f?.options === "stations" ? sets.stations : f?.options === "ranks" ? sets.ranks : [];
  return opts.find((o) => o.value === value)?.label ?? String(value ?? "");
}

function renderCell(def: MasterDef, c: ColumnSpec, row: Row, sets: OptionSets): React.ReactNode {
  const v = row[c.key];
  switch (c.kind) {
    case "strong":
      return <span className="font-medium">{String(v ?? "")}</span>;
    case "badge":
      return v ? <Badge tone="primary">{String(v)}</Badge> : null;
    case "mono":
      return <span className="font-mono text-xs">{String(v ?? "")}</span>;
    case "number":
      return <span className="tabular">{String(v ?? "")}</span>;
    case "time":
      return <span className="tabular">{String(v ?? "").slice(0, 5)}</span>;
    case "bool":
      return v ? (
        <Badge tone="success">
          <Check /> Yes
        </Badge>
      ) : (
        <Badge tone="neutral">
          <X /> No
        </Badge>
      );
    case "option":
      return <Badge tone="neutral">{labelOf(def, c.key, v, sets)}</Badge>;
    case "image":
      return v ? (
        // eslint-disable-next-line @next/next/no-img-element -- stored upload
        <img src={String(v)} alt="" className="h-8 w-20 rounded-md object-cover" />
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      );
    case "composition": {
      const list = (v as { rankCode: string; count: number }[]) ?? [];
      return (
        <span className="flex flex-wrap gap-1">
          {list.map((x) => (
            <Badge key={x.rankCode} tone="primary">
              {x.count} × {x.rankCode}
            </Badge>
          ))}
        </span>
      );
    }
    default:
      return <span className="line-clamp-1 max-w-md whitespace-normal">{String(v ?? "")}</span>;
  }
}

export function MasterClient({ def, rows, options, canManage }: { def: MasterDef; rows: Row[]; options: OptionSets; canManage: boolean }) {
  const [editing, setEditing] = React.useState<Row | "new" | null>(null);
  const [values, setValues] = React.useState<FormValues>({});
  const [files, setFiles] = React.useState<Record<string, File | "__remove__" | undefined>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [deleting, setDeleting] = React.useState<Row | null>(null);
  const [reorderOpen, setReorderOpen] = React.useState(false);
  const [order, setOrder] = React.useState<string[]>([]);
  const [pending, start] = React.useTransition();

  const open = (row: Row | "new") => {
    setEditing(row);
    setValues(initialValues(def.fields, row === "new" ? null : row));
    setFiles({});
    setErrors({});
  };

  const save = () =>
    start(async () => {
      const id = editing && editing !== "new" ? editing.id : null;
      const r = await saveMasterAction(def.key, id, toFormData(def.fields, values, files));
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k.split(".")[0]!, v])));
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "Saved");
      setEditing(null);
    });

  const abstract = React.useMemo(() => {
    if (!def.abstract) return null;
    const m = new Map<string, { count: number; sum: number }>();
    for (const r of rows) {
      const k = String(r[def.abstract.by] ?? "");
      const cur = m.get(k) ?? { count: 0, sum: 0 };
      cur.count += 1;
      if (def.abstract.sum) cur.sum += Number(r[def.abstract.sum] ?? 0);
      m.set(k, cur);
    }
    return [...m.entries()].map(([k, x]) => ({ key: k, label: labelOf(def, def.abstract!.by, k, options), ...x }));
  }, [def, rows, options]);

  const columns: ColumnDef<Row, unknown>[] = [
    ...def.columns.map<ColumnDef<Row, unknown>>((c) => ({
      id: c.key,
      accessorFn: (r) => r[c.key] as unknown,
      header: c.kind === "number" || c.kind === "strong" ? ({ column }) => <SortHeader label={c.label} column={column} /> : c.label,
      cell: ({ row }) => renderCell(def, c, row.original, options),
      meta: { hideOnMobile: c.hideOnMobile },
    })),
    ...(canManage
      ? [
          {
            id: "actions",
            header: () => <span className="sr-only">Actions</span>,
            cell: ({ row }: { row: { original: Row } }) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Row actions">
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => open(row.original)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row.original)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          } satisfies ColumnDef<Row, unknown>,
        ]
      : []),
  ];

  const titleCol = def.columns.find((c) => c.kind === "strong" || c.kind === "mono") ?? def.columns[0]!;

  return (
    <div className="flex flex-col gap-3">
      {abstract && abstract.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {abstract.map((a) => (
            <span key={a.key} className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-sm shadow-soft">
              <span className="text-muted-foreground">{a.label}</span>
              <span className="tabular font-semibold">{a.count}</span>
              {def.abstract?.sum && (
                <span className="tabular text-xs text-muted-foreground">
                  · {a.sum} {def.abstract.sumLabel}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
      <DataTable
        data={rows}
        columns={columns}
        storageKey={`master-${def.key}`}
        searchPlaceholder={`Search ${def.title.toLowerCase()}…`}
        searchText={(r) => def.search.map((k) => String(r[k] ?? "")).join(" ")}
        emptyMessage={def.emptyHint}
        mobileCard={(r) => (
          <div className="flex items-start justify-between gap-3" onClick={canManage ? () => open(r) : undefined}>
            <div className="min-w-0 space-y-1">
              <div>{renderCell(def, titleCol, r, options)}</div>
              <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                {def.columns
                  .filter((c) => c !== titleCol && !c.hideOnMobile)
                  .map((c) => (
                    <span key={c.key}>{renderCell(def, c, r, options)}</span>
                  ))}
              </div>
            </div>
          </div>
        )}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/export/${def.key}`} download>
                <Download /> Excel
              </a>
            </Button>
            {canManage && def.reorderable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOrder(rows.map((r) => r.id));
                  setReorderOpen(true);
                }}
              >
                <ArrowUpDown /> Reorder
              </Button>
            )}
            {canManage && (
              <Button size="sm" onClick={() => open("new")}>
                <Plus /> Add {def.singular}
              </Button>
            )}
          </>
        }
      />

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editing === "new" ? `Add ${def.singular}` : `Edit ${def.singular}`}</SheetTitle>
            <SheetDescription>{def.description}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <form
              id="master-form"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <EntityFields
                fields={def.fields}
                values={values}
                onChange={(n, v) => setValues((cur) => ({ ...cur, [n]: v }))}
                errors={errors}
                options={options}
                files={files}
                onFile={(n, f) => setFiles((cur) => ({ ...cur, [n]: f }))}
              />
            </form>
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="master-form" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this {def.singular}?</DialogTitle>
            <DialogDescription>{String(deleting?.[titleCol.key] ?? "")} will be removed permanently.</DialogDescription>
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
                  const r = await deleteMasterAction(def.key, deleting.id);
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

      <Sheet open={reorderOpen} onOpenChange={setReorderOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Reorder {def.title.toLowerCase()}</SheetTitle>
            <SheetDescription>Drag rows (or use space + arrow keys) to set the order shown across the app.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <SortableList
              id={`reorder-${def.key}`}
              items={order.map((id) => {
                const r = rows.find((x) => x.id === id)!;
                return { id, label: String(r[titleCol.key] ?? "") };
              })}
              onChange={setOrder}
            />
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setReorderOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await reorderUnitsAction(order);
                  if (r.ok) {
                    toast.success(r.message ?? "Saved");
                    setReorderOpen(false);
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
