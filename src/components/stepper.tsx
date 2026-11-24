import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/** Vertical/horizontal stepper for multi-step forms (plan initiation, CO proposal). */
export function Stepper({
  steps,
  current,
  className,
}: {
  steps: { label: string; description?: string }[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn("grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))] sm:gap-2", className)}>
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "upcoming";
        return (
          <li key={s.label} className="flex items-start gap-3 sm:flex-col sm:gap-2">
            <div className="flex w-full items-center gap-2">
              <span
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                  state === "done" && "border-transparent bg-primary text-primary-foreground",
                  state === "current" && "border-primary bg-accent text-accent-foreground ring-4 ring-primary/10",
                  state === "upcoming" && "border-border bg-card text-muted-foreground",
                )}
                aria-current={state === "current" ? "step" : undefined}
              >
                {state === "done" ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn("hidden h-0.5 flex-1 rounded-full sm:block", i < current ? "bg-primary" : "bg-border")}
                />
              )}
            </div>
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", state === "upcoming" && "text-muted-foreground")}>{s.label}</p>
              {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
