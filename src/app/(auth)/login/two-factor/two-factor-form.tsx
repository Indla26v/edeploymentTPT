"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyRound, Loader2, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyTwoFactorAction, type TwoFactorState } from "../actions";

export function TwoFactorForm() {
  const params = useSearchParams();
  const [backup, setBackup] = React.useState(false);
  const [state, action, pending] = React.useActionState<TwoFactorState, FormData>(verifyTwoFactorAction, undefined);
  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-4 rounded-3xl border bg-card p-6 shadow-soft">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">{backup ? <KeyRound className="size-6" /> : <Smartphone className="size-6" />}</span>
        <h1 className="text-lg font-semibold">Two-step sign-in</h1>
        <p className="text-sm text-muted-foreground">{backup ? "Enter one of your backup codes." : "Enter the 6-digit code from your authenticator app."}</p>
      </div>
      <input type="hidden" name="next" value={params.get("next") ?? "/dashboard"} />
      <input type="hidden" name="backup" value={backup ? "1" : "0"} />
      <div className="grid gap-1.5">
        <Label htmlFor="code">{backup ? "Backup code" : "Authentication code"}</Label>
        <Input id="code" name="code" autoFocus autoComplete="one-time-code" inputMode={backup ? "text" : "numeric"} pattern={backup ? undefined : "[0-9 ]{6,7}"} maxLength={backup ? 24 : 7} className="tabular h-12 text-center text-lg tracking-[0.3em]" aria-invalid={!!state?.error} />
        {state?.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Verify and sign in
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" className="text-primary hover:underline" onClick={() => setBackup((b) => !b)}>
          {backup ? "Use the authenticator app" : "Use a backup code"}
        </button>
        <Link href="/login" className="text-muted-foreground hover:underline">
          Start again
        </Link>
      </div>
    </form>
  );
}
