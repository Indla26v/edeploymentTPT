"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PersonOption = { id: string; name: string; rank: string; genNo: string; station: string; phone?: string | null };

/**
 * Searchable officer picker (name, Gen No or phone). `search` is a Server Action that applies the caller's scope.
 */
export function PersonPicker({
  value,
  onChange,
  search,
  placeholder = "Search officer by name or Gen No…",
  disabled,
  invalid,
}: {
  value: PersonOption | null;
  onChange: (p: PersonOption | null) => void;
  search: (q: string) => Promise<PersonOption[]>;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<PersonOption[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await search(q);
        if (!cancelled) setResults(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-invalid={invalid ? "true" : undefined}
          className="flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-input bg-card px-3.5 text-left text-sm shadow-soft outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 data-[invalid=true]:border-destructive"
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              <Badge tone="primary">{value.rank}</Badge>
              <span className="truncate">{value.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">#{value.genNo}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <span className="flex shrink-0 items-center gap-1">
            {value && !disabled && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                className="inline-flex size-5 items-center justify-center rounded-full hover:bg-muted"
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronsUpDown className="size-4 opacity-50" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(420px,calc(100vw-2rem))] p-0">
        <div className="relative border-b border-border/70">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="h-10 w-full bg-transparent pr-3 pl-9 text-sm outline-none" />
          {loading && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <ul className="max-h-72 overflow-y-auto p-1" role="listbox">
          {results.length === 0 && !loading && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No officers found.</li>}
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={value?.id === p.id}
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className={cn("flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-accent", value?.id === p.id && "bg-accent")}
              >
                <Badge tone="primary" className="w-16 justify-center">
                  {p.rank}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    #{p.genNo} · {p.station}
                  </span>
                </span>
                {value?.id === p.id && <Check className="size-4 text-primary" />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
