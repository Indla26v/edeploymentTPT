"use client";

import * as React from "react";
import { Loader2, PackageCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { issueReturnAction } from "@/app/(app)/plans/[planId]/execution/actions";

export function IssueButtons({ id, quantity, issued, returned }: { id: string; quantity: number; issued: boolean; returned: boolean }) {
  const [qty, setQty] = React.useState(quantity);
  const [pending, start] = React.useTransition();
  const run = (action: "issue" | "return") =>
    start(async () => {
      const r = await issueReturnAction(id, { action, returnedQty: action === "return" ? qty : undefined });
      if (r.ok) toast.success(r.message ?? "Saved");
      else toast.error(r.error);
    });
  if (returned) return null;
  if (!issued)
    return (
      <Button size="sm" disabled={pending} onClick={() => run("issue")}>
        {pending ? <Loader2 className="animate-spin" /> : <PackageCheck />} Mark issued
      </Button>
    );
  return (
    <span className="flex items-center gap-1.5">
      <input inputMode="numeric" aria-label="Returned quantity" value={qty} onChange={(e) => setQty(Math.min(quantity, Number(e.target.value.replace(/\D/g, "")) || 0))} className="tabular h-9 w-14 rounded-xl border border-input bg-card text-center text-sm" />
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run("return")}>
        <Undo2 /> Returned
      </Button>
    </span>
  );
}
