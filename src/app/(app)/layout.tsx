import { Suspense } from "react";

import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import { AuthedShell } from "./authed-shell";

/**
 * The session is read at request time, so the whole signed-in area streams in behind this boundary
 * (Cache Components: runtime data must not block the static shell).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}
