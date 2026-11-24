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
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterPill } from "@/components/ui/toggle-group";
import { useLocalSetting } from "@/lib/hooks/use-local-setting";
import { cn } from "@/lib/utils";

export type FilterGroup<T> = {
  id: string;
  label?: string;
  options: { value: string; label: string; count?: number }[];
  /** Multi-select pills; a row passes when any selected value matches. */
  match: (row: T, value: string) => boolean;
};

/** Sortable header helper for column definitions. */
export function SortHeader({ label, column }: { label: string; column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (desc?: boolean) => void } }) {
  const s = column.getIsSorted();
  return (
    <button type="button" className="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground" onClick={() => column.toggleSorting(s === "asc")}>
      {label}
      {s === "asc" ? <ArrowUp className="size-3" /> : s === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-50" />}
    </button>
  );
}

/**
 * The one list component used by every screen: search, filter pills, sorting, pagination, remembered
 * preferences (per storageKey), toolbar actions and stacked cards on phones.
 */
export function DataTable<T>({
  data,
  columns,
  storageKey,
  searchPlaceholder = "Search…",
  searchText,
  filters = [],
  actions,
  emptyMessage = "Nothing to show yet.",
  mobileCard,
  initialPageSize = 20,
  onRowClick,
  className,
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  storageKey: string;
  searchPlaceholder?: string;
  /** Text searched for each row; omit to hide the search box. */
  searchText?: (row: T) => string;
  filters?: FilterGroup<T>[];
  actions?: React.ReactNode;
  emptyMessage?: React.ReactNode;
  mobileCard?: (row: T) => React.ReactNode;
  initialPageSize?: number;
  onRowClick?: (row: T) => void;
  className?: string;
}) {
  const [prefs, setPrefs] = useLocalSetting<{ pageSize: number; sorting: SortingState; filters: Record<string, string[]> }>(`edeploy.table.${storageKey}`, {
    pageSize: initialPageSize,
    sorting: [],
    filters: {},
  });
  const [search, setSearch] = React.useState("");
  const [pageIndex, setPageIndex] = React.useState(0);

  const filtered = React.useMemo(() => {
    let rows = data;
    for (const g of filters) {
      const sel = prefs.filters[g.id] ?? [];
      if (sel.length) rows = rows.filter((r) => sel.some((v) => g.match(r, v)));
    }
    if (searchText && search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => searchText(r).toLowerCase().includes(q));
    }
    return rows;
  }, [data, filters, prefs.filters, search, searchText]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is not memoisable by the React Compiler
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting: prefs.sorting, pagination: { pageIndex, pageSize: prefs.pageSize } },
    onSortingChange: (u) => setPrefs({ ...prefs, sorting: typeof u === "function" ? u(prefs.sorting) : u }),
    onPaginationChange: (u) => {
      const next = typeof u === "function" ? u({ pageIndex, pageSize: prefs.pageSize }) : u;
      setPageIndex(next.pageIndex);
      if (next.pageSize !== prefs.pageSize) setPrefs({ ...prefs, pageSize: next.pageSize });
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / prefs.pageSize));
  const safeIndex = Math.min(pageIndex, pageCount - 1);
  React.useEffect(() => {
    if (safeIndex !== pageIndex) setPageIndex(safeIndex);
  }, [safeIndex, pageIndex]);
  const rows = table.getRowModel().rows;

  const toggleFilter = (gid: string, value: string) => {
    const cur = prefs.filters[gid] ?? [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    setPrefs({ ...prefs, filters: { ...prefs.filters, [gid]: next } });
    setPageIndex(0);
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      {(searchText || filters.length > 0 || actions) && (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            {searchText && (
              <label className="relative w-full sm:w-64">
                <span className="sr-only">{searchPlaceholder}</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPageIndex(0);
                  }}
                  placeholder={searchPlaceholder}
                  className="h-9 w-full rounded-full border border-input bg-card pr-3 pl-9 text-sm shadow-soft outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
                />
              </label>
            )}
            {filters.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center gap-1.5" role="group" aria-label={g.label ?? g.id}>
                {g.label && <span className="text-xs text-muted-foreground">{g.label}</span>}
                {g.options.map((o) => (
                  <FilterPill key={o.value} active={(prefs.filters[g.id] ?? []).includes(o.value)} onClick={() => toggleFilter(g.id, o.value)}>
                    {o.label}
                    {o.count !== undefined && <span className="tabular opacity-70">{o.count}</span>}
                  </FilterPill>
                ))}
              </div>
            ))}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* Phones: stacked cards */}
      {mobileCard && (
        <ul className="flex flex-col gap-2 sm:hidden">
          {rows.length === 0 && <li className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{emptyMessage}</li>}
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border/70 bg-card p-3 shadow-soft" onClick={onRowClick ? () => onRowClick(r.original) : undefined}>
              {mobileCard(r.original)}
            </li>
          ))}
        </ul>
      )}

      <div className={cn(mobileCard && "hidden sm:block")}>
        <Table containerClassName="max-h-[calc(100dvh-14rem)]">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} style={{ width: h.column.columnDef.size ? h.column.getSize() : undefined }}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row: Row<T>) => (
              <TableRow key={row.id} className={cn(onRowClick && "cursor-pointer")} onClick={onRowClick ? () => onRowClick(row.original) : undefined}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-24 text-center whitespace-normal text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="tabular text-muted-foreground">
            {safeIndex * prefs.pageSize + 1}–{Math.min(total, (safeIndex + 1) * prefs.pageSize)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Select value={String(prefs.pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
              <SelectTrigger size="sm" className="w-auto rounded-full" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon-sm" aria-label="Previous page" onClick={() => setPageIndex(Math.max(0, safeIndex - 1))} disabled={safeIndex === 0}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next page" onClick={() => setPageIndex(Math.min(pageCount - 1, safeIndex + 1))} disabled={safeIndex >= pageCount - 1}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
