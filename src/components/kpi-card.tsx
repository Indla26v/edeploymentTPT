import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";

const iconTone = {
  primary: "bg-accent text-accent-foreground",
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-danger-soft text-danger-soft-foreground",
  info: "bg-info-soft text-info-soft-foreground",
} as const;

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  hint,
  trend,
  className,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: keyof typeof iconTone;
  hint?: string;
  trend?: { value: string; direction: "up" | "down"; good?: boolean };
  className?: string;
}) {
  return (
    <Card className={cn("gap-3 p-4 transition-shadow hover:shadow-lifted sm:gap-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("inline-flex size-10 items-center justify-center rounded-2xl sm:size-11", iconTone[tone])}>
          <Icon className="size-5" aria-hidden />
        </span>
        {trend && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
              (trend.good ?? trend.direction === "up")
                ? "bg-success-soft text-success-soft-foreground"
                : "bg-danger-soft text-danger-soft-foreground",
            )}
          >
            {trend.direction === "up" ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {trend.value}
          </span>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-[13px] leading-snug text-muted-foreground sm:text-sm">{label}</p>
        <p className="tabular text-2xl font-semibold tracking-tight sm:text-3xl">
          {typeof value === "number" ? formatNumber(value) : value}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
}
