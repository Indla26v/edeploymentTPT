import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { cn, formatNumber } from "@/lib/utils";

const iconTone = {
  primary: "bg-accent text-accent-foreground",
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-danger-soft text-danger-soft-foreground",
  info: "bg-info-soft text-info-soft-foreground",
} as const;

/** Compact horizontal KPI: icon left, label + number right (~84px tall). Optional link makes the whole card clickable. */
export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  hint,
  trend,
  href,
  className,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: keyof typeof iconTone;
  hint?: string;
  trend?: { value: string; direction: "up" | "down"; good?: boolean };
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl", iconTone[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="tabular text-2xl leading-tight font-semibold tracking-tight">
            {typeof value === "number" ? formatNumber(value) : value}
          </p>
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 text-[11px] font-medium",
                (trend.good ?? trend.direction === "up")
                  ? "bg-success-soft text-success-soft-foreground"
                  : "bg-danger-soft text-danger-soft-foreground",
              )}
            >
              {trend.direction === "up" ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {trend.value}
            </span>
          )}
        </div>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </>
  );
  const cls = cn(
    "flex min-h-[84px] min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-soft transition-shadow",
    href && "hover:border-primary/30 hover:shadow-lifted focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
    className,
  );
  return href ? (
    <a href={href} className={cls}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
