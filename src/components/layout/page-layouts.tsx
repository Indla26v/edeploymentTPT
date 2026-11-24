import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

type HeaderProps = React.ComponentProps<typeof PageHeader>;

/** List screens: header → toolbar/table content. */
export function ListPage({ children, className, ...header }: HeaderProps & { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <PageHeader {...header} />
      {children}
    </div>
  );
}

/** Detail screens: header (+ status) → compact summary strip → body (usually tabs). */
export function DetailPage({
  summary,
  children,
  className,
  ...header
}: HeaderProps & { summary?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <PageHeader {...header} />
      {summary}
      {children}
    </div>
  );
}

/** A compact horizontal strip of label/value facts for detail pages. */
export function SummaryStrip({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-6 gap-y-2 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-soft sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center",
        className,
      )}
    >
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-[11px] text-muted-foreground">{it.label}</dt>
          <dd className="truncate text-sm font-medium">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Sticky footer bar for wizards and long forms so primary actions never fall below the fold. */
export function StickyActionBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-4 mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-border/70 bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Board screens (placement board, sourcing): fixed toolbar, then a side pane and a main pane that scroll
 * independently and fill the viewport on desktop (no page scroll at 1440×900).
 */
export function BoardLayout({
  toolbar,
  side,
  children,
  sideWidth = "320px",
  className,
}: {
  toolbar?: React.ReactNode;
  side?: React.ReactNode;
  children: React.ReactNode;
  sideWidth?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 lg:h-[calc(100dvh-9rem)]", className)}>
      {toolbar}
      <div
        className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[var(--side)_1fr]"
        style={{ "--side": sideWidth } as React.CSSProperties}
      >
        {side && <aside className="min-h-0 lg:overflow-y-auto">{side}</aside>}
        <div className="min-h-0 lg:overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
