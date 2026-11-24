"use client";

import { Stepper } from "@/components/stepper";
import { cn } from "@/lib/utils";

/** Wizard: vertical stepper on the left (desktop) / compact stepper on top (phone), form on the right, sticky footer. */
export function WizardLayout({
  steps,
  current,
  onSelect,
  footer,
  children,
  className,
}: {
  steps: { label: string; description?: string }[];
  current: number;
  onSelect?: (i: number) => void;
  footer: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]", className)}>
      <div className="min-w-0 lg:sticky lg:top-[4.5rem] lg:self-start">
        <Stepper steps={steps} current={current} onSelect={onSelect} orientation="horizontal" className="lg:hidden" />
        <div className="hidden rounded-2xl border border-border/70 bg-card p-2 shadow-soft lg:block">
          <Stepper steps={steps} current={current} onSelect={onSelect} orientation="vertical" />
        </div>
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="min-w-0 flex-1">{children}</div>
        <div className="sticky bottom-0 z-20 mt-4 flex items-center justify-between gap-2 rounded-2xl border border-border/70 bg-card/95 px-4 py-3 shadow-lifted backdrop-blur-md">
          {footer}
        </div>
      </div>
    </div>
  );
}
