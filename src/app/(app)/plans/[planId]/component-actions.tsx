"use client";

import * as React from "react";
import { BellRing, Check, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { acceptComponentAction, nudgeAction, returnComponentAction } from "./consolidate/actions";

/** IO actions on one component: remind (pending), accept / return (submitted). */
export function ComponentActions({ id, name, status, compact = false }: { id: string; name: string; status: string; compact?: boolean }) {
  const [pending, start] = React.useTransition();
  const [returning, setReturning] = React.useState(false);
  const [comment, setComment] = React.useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message ?? "Done");
      else toast.error(r.error);
    });
  if (status === "assigned" || status === "in_progress" || status === "returned") {
    return (
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => nudgeAction(id))}>
        {pending ? <Loader2 className="animate-spin" /> : <BellRing />} {compact ? "" : "Remind"}
      </Button>
    );
  }
  if (status !== "submitted" && status !== "accepted") return null;
  return (
    <span className="flex gap-1">
      {status === "submitted" && (
        <Button size="sm" variant="soft" disabled={pending} onClick={() => run(() => acceptComponentAction(id))}>
          <Check /> Accept
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setReturning(true)}>
        <Undo2 /> Return
      </Button>
      <Dialog open={returning} onOpenChange={setReturning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return {name}?</DialogTitle>
            <DialogDescription>Only for real rework. To change a count, edit it inline instead — the proposal then stays with you.</DialogDescription>
          </DialogHeader>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="What should the Component Officer change?" aria-label="Comment" />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              disabled={pending || comment.trim().length < 5}
              onClick={() =>
                run(async () => {
                  const r = await returnComponentAction(id, comment);
                  if (r.ok) setReturning(false);
                  return r;
                })
              }
            >
              <Undo2 /> Return with comment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}
