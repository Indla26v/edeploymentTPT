import type { LucideIcon } from "lucide-react";
import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  Clock,
  Hourglass,
  Lock,
  Radio,
  RotateCcw,
  Send,
  TriangleAlert,
  XCircle,
  MinusCircle,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

/**
 * Every workflow status in the app. Colour is never the only signal:
 * each status renders as a pill with an icon AND a text label.
 */
export const STATUS_META = {
  draft: { label: "Draft", tone: "neutral", icon: CircleDashed },
  pending: { label: "Pending", tone: "warning", icon: Hourglass },
  sent: { label: "Sent", tone: "info", icon: Send },
  submitted: { label: "Submitted", tone: "info", icon: CircleDot },
  accepted: { label: "Accepted", tone: "success", icon: CircleCheck },
  auto_accepted: { label: "Auto-accepted", tone: "success", icon: Clock },
  short: { label: "Short", tone: "warning", icon: TriangleAlert },
  shortfall_accepted: { label: "Shortfall accepted", tone: "neutral", icon: MinusCircle },
  declined: { label: "Declined", tone: "danger", icon: XCircle },
  approved: { label: "Approved", tone: "success", icon: CircleCheck },
  rejected: { label: "Rejected", tone: "danger", icon: XCircle },
  returned: { label: "Returned", tone: "warning", icon: RotateCcw },
  overdue: { label: "Overdue", tone: "danger", icon: TriangleAlert },
  suggested: { label: "Suggested", tone: "primary", icon: Sparkles },
  locked: { label: "Locked", tone: "neutral", icon: Lock },
  published: { label: "Published", tone: "success", icon: Send },
  live: { label: "Live", tone: "danger", icon: Radio },
  completed: { label: "Completed", tone: "success", icon: CircleCheck },
  assigned: { label: "Not started", tone: "neutral", icon: CircleDashed },
  in_progress: { label: "In progress", tone: "info", icon: CircleDot },
  proposing: { label: "Proposals open", tone: "info", icon: Send },
  consolidating: { label: "Consolidating", tone: "primary", icon: CircleDot },
  sourcing: { label: "Force sourcing", tone: "warning", icon: Hourglass },
  placement: { label: "Placement", tone: "primary", icon: Sparkles },
  cancelled: { label: "Cancelled", tone: "neutral", icon: XCircle },
} satisfies Record<string, { label: string; tone: Tone; icon: LucideIcon }>;

export type Status = keyof typeof STATUS_META;

export function StatusPill({
  status,
  label,
  count,
  className,
}: {
  status: Status;
  /** Override the default label. */
  label?: string;
  /** For "short": renders "Short by N". */
  count?: number;
  className?: string;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const text =
    label ?? (status === "short" && count !== undefined ? `Short by ${count}` : meta.label);
  return (
    <Badge tone={meta.tone} className={cn("gap-1.5 py-1 pr-3 pl-2", className)}>
      <Icon aria-hidden className={cn(status === "live" && "animate-pulse")} />
      {text}
    </Badge>
  );
}
