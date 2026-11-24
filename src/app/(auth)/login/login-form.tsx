"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction, type SignInState } from "./actions";

export type DemoAccount = { username: string; role: string; who: string };

export function LoginForm({ demoAccounts, demoPassword }: { demoAccounts?: DemoAccount[]; demoPassword?: string }) {
  const params = useSearchParams();
  const [state, action, pending] = React.useActionState<SignInState, FormData>(signInAction, undefined);
  const [show, setShow] = React.useState(false);
  const userRef = React.useRef<HTMLInputElement>(null);
  const passRef = React.useRef<HTMLInputElement>(null);

  const fill = (u: string) => {
    if (userRef.current) userRef.current.value = u;
    if (passRef.current && demoPassword) passRef.current.value = demoPassword;
    passRef.current?.focus();
  };

  return (
    <div className="w-full max-w-[400px] space-y-4">
      <Card className="gap-5 rounded-3xl p-2 shadow-lifted sm:p-3">
        <CardContent className="space-y-5 px-3 sm:px-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">Use the username and password issued by your unit.</p>
          </div>
          <form action={action} className="space-y-4" noValidate>
            <input type="hidden" name="next" value={params.get("next") ?? ""} />
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  ref={userRef}
                  id="username"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  defaultValue={state?.username}
                  required
                  className="h-11 pl-10"
                  placeholder="e.g. demo-1281"
                  aria-invalid={!!state?.error}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  ref={passRef}
                  id="password"
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="h-11 pr-11 pl-10"
                  aria-invalid={!!state?.error}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute top-1/2 right-2 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            {state?.error && (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">
                {state.error}
              </p>
            )}
            <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Sign in <ArrowRight />
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">Forgot your password? Ask your Unit Officer to reset it.</p>
        </CardContent>
      </Card>

      {demoAccounts && demoAccounts.length > 0 && (
        <Card className="gap-2 rounded-2xl py-3">
          <CardContent className="space-y-2 px-3">
            <p className="text-xs font-medium text-muted-foreground">
              Demo accounts (development only) · password <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">{demoPassword}</code>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {demoAccounts.map((a) => (
                <button
                  key={a.username}
                  type="button"
                  onClick={() => fill(a.username)}
                  title={`${a.who} — ${a.role}`}
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs hover:border-primary/40 hover:bg-accent"
                >
                  <span className="font-medium">{a.username}</span>
                  <span className="text-muted-foreground">{a.role}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
