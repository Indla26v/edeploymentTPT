import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Pill-shaped badge. For workflow status use <StatusPill>, which always adds an icon + label. */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium [&>svg]:pointer-events-none [&>svg]:size-3.5",
  {
    variants: {
      tone: {
        neutral: "bg-neutral-soft text-neutral-soft-foreground",
        primary: "bg-accent text-accent-foreground",
        success: "bg-success-soft text-success-soft-foreground",
        warning: "bg-warning-soft text-warning-soft-foreground",
        danger: "bg-danger-soft text-danger-soft-foreground",
        info: "bg-info-soft text-info-soft-foreground",
        solid: "bg-primary text-primary-foreground",
        outline: "border-border bg-card text-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function Badge({
  className,
  tone,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";
  return <Comp data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
