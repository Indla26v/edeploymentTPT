import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

/** Generic product mark (deliberately not an official emblem). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.36_0.15_270)] text-primary-foreground shadow-lifted",
        className,
      )}
    >
      <ShieldCheck className="size-5" aria-hidden />
    </span>
  );
}

export function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      {!collapsed && (
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-tight">eDeployment</p>
          <p className="text-[11px] text-sidebar-muted">Bandobast planning</p>
        </div>
      )}
    </div>
  );
}
