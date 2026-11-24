"use client";

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction, type PasswordState } from "../actions";

const RULES = ["At least 10 characters", "Upper and lowercase letters", "At least one number", "At least one symbol"];

export function PasswordForm() {
  const [state, action, pending] = React.useActionState<PasswordState, FormData>(changePasswordAction, undefined);
  const formRef = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (state?.ok) {
      toast.success("Password changed", { description: "Other devices were signed out." });
      formRef.current?.reset();
    }
  }, [state]);
  const err = state?.fieldErrors ?? {};
  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="current">Current password</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" aria-invalid={!!err.current} />
        {err.current && <p className="text-xs text-destructive">{err.current}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="next">New password</Label>
        <Input id="next" name="next" type="password" autoComplete="new-password" aria-invalid={!!err.next} />
        {err.next && <p className="text-xs text-destructive">{err.next}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" aria-invalid={!!err.confirm} />
        {err.confirm && <p className="text-xs text-destructive">{err.confirm}</p>}
      </div>
      <ul className="grid gap-1 text-xs text-muted-foreground sm:col-span-2 sm:grid-cols-2">
        {RULES.map((r) => (
          <li key={r} className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5" aria-hidden /> {r}
          </li>
        ))}
      </ul>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Save new password
        </Button>
      </div>
    </form>
  );
}
