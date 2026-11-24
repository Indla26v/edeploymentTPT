import Link from "next/link";
import { BedDouble, FileText, Package, Radio } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { key: "live", label: "Live", icon: Radio },
  { key: "documents", label: "ID cards & documents", icon: FileText },
  { key: "accommodation", label: "Accommodation", icon: BedDouble },
  { key: "equipment", label: "Equipment", icon: Package },
] as const;

/** Pill sub-navigation for a published plan's execution screens. */
export function ExecNav({ planId, active, show }: { planId: string; active?: (typeof TABS)[number]["key"]; show: Partial<Record<(typeof TABS)[number]["key"], boolean>> }) {
  return (
    <nav aria-label="Execution" className="flex gap-1.5 overflow-x-auto pb-0.5">
      {TABS.filter((t) => show[t.key] !== false).map((t) => (
        <Link
          key={t.key}
          href={`/plans/${planId}/${t.key}`}
          aria-current={active === t.key ? "page" : undefined}
          className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors", active === t.key ? "border-primary/40 bg-accent font-medium text-accent-foreground" : "bg-card hover:bg-accent/50")}
        >
          <t.icon className="size-4" /> {t.label}
        </Link>
      ))}
    </nav>
  );
}
