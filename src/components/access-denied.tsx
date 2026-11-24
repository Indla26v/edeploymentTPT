import Link from "next/link";
import { ShieldOff } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export function AccessDenied({ message = "Your current role doesn't have access to this page. Switch role from the header if you hold another one." }: { message?: string }) {
  return (
    <EmptyState
      icon={ShieldOff}
      title="No access"
      description={message}
      action={
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      }
    />
  );
}
