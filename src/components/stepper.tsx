import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type Step = { label: string; description?: string };

/**
 * Stepper for multi-step flows. Horizontal (compact, scrolls on phones) or vertical (wizard sidebar on desktop).
 * Pass `onSelect` to let users jump back to completed steps.
 */
export function Stepper({
  steps,
  current,
  orientation = "horizontal",
  onSelect,
  className,
}: {
  steps: Step[];
  current: number;
  orientation?: "horizontal" | "vertical";
  onSelect?: (index: number) => void;
  className?: string;
}) {
  const vertical = orientation === "vertical";
  return (
    <ol
      className={cn(
        vertical ? "flex flex-col gap-1" : "flex items-center gap-1.5 overflow-x-auto pb-1",
        "relative",
        className,
      )}
    >
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "upcoming";
        const clickable = !!onSelect && i < current;
        const Inner = clickable ? "button" : "div";
        return (
          <li key={s.label} className={cn(!vertical && "flex shrink-0 items-center gap-1.5")}>
            <Inner
              {...(clickable ? { type: "button" as const, onClick: () => onSelect!(i) } : {})}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-full text-left transition-colors",
                vertical ? "px-2 py-1.5" : "py-1 pr-3 pl-1",
                state === "current" && "bg-accent text-accent-foreground",
                clickable && "cursor-pointer hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  state === "done" && "border-transparent bg-primary text-primary-foreground",
                  state === "current" && "border-primary bg-card text-primary",
                  state === "upcoming" && "border-border bg-card text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 leading-tight">
                <span className={cn("block text-sm font-medium whitespace-nowrap", state === "upcoming" && "text-muted-foreground")}>{s.label}</span>
                {vertical && s.description && <span className="block truncate text-[11px] text-muted-foreground">{s.description}</span>}
              </span>
            </Inner>
            {!vertical && i < steps.length - 1 && <span aria-hidden className={cn("h-px w-4 shrink-0", i < current ? "bg-primary" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}
