"use client";

import * as React from "react";
import { CircleCheck, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setPlanStageAction } from "./actions";

/** "Go live" (published) and "Complete" (live / published) for the UO and IO. */
export function StageButtons({ planId, status }: { planId: string; status: string }) {
  const [pending, start] = React.useTransition();
  const [confirm, setConfirm] = React.useState(false);
  const go = (to: "live" | "completed") =>
    start(async () => {
      const r = await setPlanStageAction(planId, to);
      if (r.ok) toast.success(r.message ?? "Done");
      else toast.error(r.error);
      setConfirm(false);
    });
  return (
    <>
      {status === "published" && (
        <Button size="sm" disabled={pending} onClick={() => go("live")}>
          {pending ? <Loader2 className="animate-spin" /> : <Radio />} Go live
        </Button>
      )}
      {(status === "published" || status === "live") && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirm(true)}>
          <CircleCheck /> Complete
        </Button>
      )}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete the bandobast?</DialogTitle>
            <DialogDescription>Check-in closes and officers are freed for other duties. Documents stay available under Completed plans.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button disabled={pending} onClick={() => go("completed")}>
              <CircleCheck /> Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
