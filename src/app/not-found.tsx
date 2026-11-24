import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-3xl border bg-card p-8 text-center shadow-soft">
        <Compass className="size-10 text-primary" aria-hidden />
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">The link may be old, or the page was moved. Use the dashboard to find your way.</p>
        <Button asChild>
          <Link href="/dashboard">Go to the dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
