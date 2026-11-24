import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function Feedback() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-4">
          <p className="text-sm font-medium">Loading skeleton</p>
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
          <Skeleton className="h-28 w-full rounded-2xl" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-9 rounded-full" />
            <Skeleton className="h-9 rounded-full" />
            <Skeleton className="h-9 rounded-full" />
          </div>
        </CardContent>
      </Card>
      <EmptyState
        icon={Inbox}
        title="No force requests right now"
        description="When the Unit Officer asks your station for men, the request appears here with its deadline."
        action={<Button variant="outline" size="sm">View completed requests</Button>}
      />
    </div>
  );
}
