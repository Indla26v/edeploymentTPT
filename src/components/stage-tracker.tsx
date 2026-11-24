import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type Stage = {
  key: string;
  label: string;
  state: "done" | "current" | "upcoming" | "attention";
  /** Short note under the label, e.g. "Short by 6" */
  note?: string;
};

/** Horizontal pill stage tracker shown at the top of every plan. Scrolls horizontally on phones. */
export function StageTracker({ stages, className }: { stages: Stage[]; className?: string }) {
  return (
    <ol className={cn("relative flex items-center gap-1.5 overflow-x-auto pb-1", className)} aria-label="Plan stages">
      {stages.map((s, i) => (
        <li key={s.key} className="flex shrink-0 items-center gap-1.5">
          <div
            aria-current={s.state === "current" ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full border py-1.5 pr-4 pl-1.5 text-sm transition-colors",
              s.state === "done" && "border-success/30 bg-success-soft text-success-soft-foreground",
              s.state === "current" && "border-primary/40 bg-accent text-accent-foreground shadow-soft",
              s.state === "attention" && "border-warning/40 bg-warning-soft text-warning-soft-foreground",
              s.state === "upcoming" && "border-border bg-card text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                s.state === "done" && "bg-success text-white",
                s.state === "current" && "bg-primary text-primary-foreground",
                s.state === "attention" && "bg-warning text-black/80",
                s.state === "upcoming" && "bg-muted text-muted-foreground",
              )}
            >
              {s.state === "done" ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-medium">{s.label}</span>
              {s.note && <span className="text-[11px] opacity-80">{s.note}</span>}
            </span>
            <span className="sr-only">
              {s.state === "done" ? "(completed)" : s.state === "current" ? "(in progress)" : s.state === "attention" ? "(needs attention)" : "(not started)"}
            </span>
          </div>
          {i < stages.length - 1 && <span aria-hidden className="h-px w-4 bg-border" />}
        </li>
      ))}
    </ol>
  );
}
