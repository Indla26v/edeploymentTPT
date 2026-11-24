import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One-row page header: breadcrumb › title (+ status) on the left, actions on the right.
 * Description is a single muted line, hidden on phones to save space.
 */
export function PageHeader({
  title,
  description,
  breadcrumb,
  status,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  status?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {breadcrumb?.map((b, i) => (
            <span key={`${b.label}-${i}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              {b.href ? (
                <Link href={b.href} className="rounded-full hover:text-foreground">
                  {b.label}
                </Link>
              ) : (
                <span>{b.label}</span>
              )}
              <ChevronRight className="size-3.5" aria-hidden />
            </span>
          ))}
          <h1 className="truncate text-lg leading-tight font-semibold tracking-tight sm:text-xl">{title}</h1>
          {status && <span className="ml-1">{status}</span>}
        </div>
        {description && <p className="mt-0.5 hidden max-w-3xl text-xs text-muted-foreground sm:block">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
