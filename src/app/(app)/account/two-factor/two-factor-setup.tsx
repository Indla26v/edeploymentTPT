"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmTwoFactorAction, disableTwoFactorAction, startTwoFactorAction } from "./actions";

export function TwoFactorSetup({ enabled, required }: { enabled: boolean; required: boolean }) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [setup, setSetup] = React.useState<{ qr: string; secret: string; backupCodes: string[] } | null>(null);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  if (enabled) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm text-success-soft-foreground">
          <ShieldCheck className="size-4" /> Two-step sign-in is on. You&apos;ll be asked for a code from your authenticator app at each sign-in.
        </p>
        {!required && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await disableTwoFactorAction(password);
                if (!r.ok) return setError(r.error);
                toast.success("Two-step sign-in turned off");
                router.refresh();
              });
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="pw-off">Password</Label>
              <Input id="pw-off" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="w-64" />
            </div>
            <Button type="submit" variant="outline" disabled={pending || !password}>
              <ShieldOff /> Turn off
            </Button>
            {error && <p className="w-full text-sm text-destructive">{error}</p>}
          </form>
        )}
      </div>
    );
  }

  if (!setup) {
    return (
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await startTwoFactorAction(password);
            if (!r.ok) return setError(r.error);
            setSetup(r.data);
          });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="pw-on">Confirm your password</Label>
          <Input id="pw-on" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="w-64" />
        </div>
        <Button type="submit" disabled={pending || !password}>
          {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Set up two-step sign-in
        </Button>
        {error && <p className="w-full text-sm text-destructive">{error}</p>}
      </form>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      <div className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated QR data URL */}
        <img src={setup.qr} alt="QR code for your authenticator app" className="size-56 rounded-2xl border bg-white p-2" />
        <p className="text-center text-xs text-muted-foreground">
          Can&apos;t scan? Enter this key: <span className="font-mono break-all">{setup.secret}</span>
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator…).</li>
          <li>Scan the QR code.</li>
          <li>Enter the 6-digit code it shows.</li>
        </ol>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await confirmTwoFactorAction(code);
              if (!r.ok) return setError(r.error);
              toast.success("Two-step sign-in is on");
              router.replace("/account/two-factor");
              router.refresh();
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="totp">Code from the app</Label>
            <Input id="totp" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className="tabular w-40 text-center tracking-[0.3em]" />
          </div>
          <Button type="submit" disabled={pending || code.replace(/\s/g, "").length < 6}>
            {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Turn on
          </Button>
          {error && <p className="w-full text-sm text-destructive">{error}</p>}
        </form>
        <div className="rounded-2xl border bg-muted/50 p-3">
          <p className="mb-2 flex items-center justify-between text-sm font-medium">
            Backup codes — keep them safe, each works once
            <Button size="icon-sm" variant="ghost" aria-label="Copy backup codes" onClick={() => void navigator.clipboard?.writeText(setup.backupCodes.join("\n"))}>
              <Copy />
            </Button>
          </p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
            {setup.backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
