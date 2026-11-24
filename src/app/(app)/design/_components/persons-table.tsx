"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Ellipsis, HeartPulse, Pencil, Search, ArrowRightLeft, Trash2, BarChart3 } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterPill } from "@/components/ui/toggle-group";
import { initials } from "@/lib/utils";
import { SAMPLE_PERSONS, type SamplePerson } from "../_data";

const RANK_FILTERS = ["SI", "ASI", "HC", "PC"];

export function PersonsTable() {
  const [data, setData] = React.useState(SAMPLE_PERSONS);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [search, setSearch] = React.useState("");
  const [rankFilter, setRankFilter] = React.useState<string[]>([]);
  const [showAbstract, setShowAbstract] = React.useState(false);

  const filtered = React.useMemo(
    () => (rankFilter.length ? data.filter((p) => rankFilter.includes(p.rank)) : data),
    [data, rankFilter],
  );

  const columns = React.useMemo<ColumnDef<SamplePerson>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <button className="inline-flex cursor-pointer items-center gap-1 uppercase" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Officer <ArrowUpDown className="size-3" />
          </button>
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar className="size-9">
              <AvatarFallback>{initials(row.original.name)}</AvatarFallback>
            </Avatar>
            <div className="leading-tight">
              <p className="font-medium">{row.original.name}</p>
              <p className="text-xs text-muted-foreground">Gen No. {row.original.genNo}</p>
            </div>
          </div>
        ),
      },
      { accessorKey: "rank", header: "Rank", cell: ({ getValue }) => <Badge tone="primary">{getValue<string>()}</Badge> },
      { accessorKey: "station", header: "Station / office" },
      {
        accessorKey: "age",
        header: ({ column }) => (
          <button className="inline-flex cursor-pointer items-center gap-1 uppercase" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Age <ArrowUpDown className="size-3" />
          </button>
        ),
        cell: ({ getValue }) => <span className="tabular">{getValue<number>()}</span>,
      },
      {
        accessorKey: "fitness",
        header: "Fitness",
        cell: ({ getValue }) =>
          getValue<string>() === "fit" ? (
            <Badge tone="success">Fit</Badge>
          ) : (
            <Badge tone="warning">
              <HeartPulse /> Light duty
            </Badge>
          ),
      },
      { accessorKey: "phone", header: "Mobile", cell: ({ getValue }) => <span className="tabular text-muted-foreground">{getValue<string>()}</span> },
      {
        accessorKey: "available",
        header: "Available",
        cell: ({ row }) => (
          <Switch
            checked={row.original.available}
            aria-label={`Availability of ${row.original.name}`}
            onCheckedChange={(v) => {
              setData((d) => d.map((p) => (p.id === row.original.id ? { ...p, available: v } : p)));
              toast.success(`${row.original.name} marked ${v ? "available" : "not available"}`);
            }}
          />
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: () => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Row actions">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem>
                <ArrowRightLeft /> Request transfer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [],
  );

  // TanStack Table returns non-memoisable functions; the React Compiler skips this component, which is expected.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    globalFilterFn: (row, _id, value: string) => {
      const q = value.toLowerCase();
      const p = row.original;
      return [p.name, p.rank, p.station, p.genNo, p.phone, String(p.age)].some((f) => f.toLowerCase().includes(q));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  });

  const abstract = RANK_FILTERS.map((r) => ({ rank: r, count: data.filter((p) => p.rank === r && p.available).length }));
  const { pageIndex, pageSize } = table.getState().pagination;
  const total = table.getFilteredRowModel().rows.length;

  return (
    <Card className="gap-4 py-5">
      <div className="flex flex-col gap-3 px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative w-full sm:w-72">
            <span className="sr-only">Search police persons</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, rank, station, Gen No…"
              className="h-10 w-full rounded-full border border-input bg-card pr-4 pl-10 text-sm shadow-soft outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {RANK_FILTERS.map((r) => (
              <FilterPill key={r} active={rankFilter.includes(r)} onClick={() => setRankFilter((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]))}>
                {r}
              </FilterPill>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAbstract((v) => !v)}>
            <BarChart3 /> {showAbstract ? "Hide abstract" : "Show abstract"}
          </Button>
          <Button variant="outline" size="sm">
            <Download /> Excel
          </Button>
        </div>
      </div>
      {showAbstract && (
        <div className="mx-5 flex flex-wrap gap-2 rounded-2xl bg-muted/60 p-3">
          {abstract.map((a) => (
            <span key={a.rank} className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm shadow-soft">
              <Badge tone="primary">{a.rank}</Badge>
              <span className="tabular font-semibold">{a.count}</span>
              <span className="text-xs text-muted-foreground">available</span>
            </span>
          ))}
        </div>
      )}
      <div className="px-5">
        <Table containerClassName="max-h-[480px]">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
            {total === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                  No officers match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col items-center justify-between gap-3 px-5 sm:flex-row">
        <p className="text-sm text-muted-foreground">
          <span className="tabular">
            {total === 0 ? 0 : pageIndex * pageSize + 1}–{Math.min(total, (pageIndex + 1) * pageSize)}
          </span>{" "}
          of <span className="tabular">{total}</span> officers
        </p>
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
            <SelectTrigger size="sm" className="w-auto rounded-full" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[8, 16, 24].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon-sm" aria-label="Previous page" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next page" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </Card>
  );
}
