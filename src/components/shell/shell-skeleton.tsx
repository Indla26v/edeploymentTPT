import { Skeleton } from "@/components/ui/skeleton";

export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh" aria-busy="true" aria-label="Loading">
      <div className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar p-3 lg:block">
        <Skeleton className="mb-5 h-9 w-40 rounded-xl" />
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-8 w-full rounded-full" />
        ))}
      </div>
      <div className="flex-1">
        <div className="flex h-14 items-center gap-3 border-b border-border/70 px-5">
          <Skeleton className="h-4 w-48" />
          <div className="flex-1" />
          <Skeleton className="size-8 rounded-full" />
        </div>
        <div className="space-y-4 p-5">
          <Skeleton className="h-6 w-56" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[84px] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
