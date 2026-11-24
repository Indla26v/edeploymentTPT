"use client";

import * as React from "react";
import Link from "next/link";
import { unstable_OneTimePasswordField as OTPField } from "radix-ui";
import { ArrowLeft, ArrowRight, Info, Loader2, Smartphone } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "phone" | "otp" | "welcome";

/**
 * Phase 1: the sign-in screens as designed (mobile → OTP → officer confirmation, Manual A p6–7).
 * Phase 2 wires this to Better Auth's phone-number OTP with rate limiting; only pre-registered numbers can sign in.
 */
export function LoginForm() {
  const [step, setStep] = React.useState<Step>("phone");
  const [phone, setPhone] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [seconds, setSeconds] = React.useState(30);
  const phoneValid = /^[6-9]\d{9}$/.test(phone);

  React.useEffect(() => {
    if (step !== "otp" || seconds === 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, seconds]);

  const fakeWait = (next: () => void) => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      next();
    }, 600);
  };

  return (
    <Card className="w-full max-w-[420px] gap-6 rounded-3xl p-2 shadow-lifted sm:p-4">
      <CardContent className="space-y-6 px-4 sm:px-5">
        <Badge tone="info" className="py-1">
          <Info /> Design preview — OTP is connected in phase 2
        </Badge>

        {step === "phone" && (
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (phoneValid) fakeWait(() => (setStep("otp"), setSeconds(30)));
            }}
          >
            <div className="space-y-1.5">
              <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
              <p className="text-sm text-muted-foreground">Use the mobile number registered with your unit. We&apos;ll send a one-time password.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-phone">Mobile number</Label>
              <div className="flex gap-2">
                <span className="inline-flex h-12 items-center gap-1.5 rounded-full bg-muted px-4 text-sm font-medium text-muted-foreground">
                  <Smartphone className="size-4" aria-hidden /> +91
                </span>
                <Input
                  id="login-phone"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  placeholder="98xxxxxxxx"
                  className="h-12 rounded-full px-5 text-base tracking-wide"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  aria-invalid={phone.length === 10 && !phoneValid}
                />
              </div>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={!phoneValid || busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Send OTP <ArrowRight />
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (otp.length === 6) fakeWait(() => setStep("welcome"));
            }}
          >
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setStep("phone")}
                className="mb-2 inline-flex cursor-pointer items-center gap-1 rounded-full text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" /> Change number
              </button>
              <h2 className="text-2xl font-semibold tracking-tight">Enter the OTP</h2>
              <p className="text-sm text-muted-foreground">
                Sent to <span className="tabular font-medium text-foreground">+91 {phone.slice(0, 5)} {phone.slice(5)}</span>
              </p>
            </div>
            <OTPField.Root
              value={otp}
              onValueChange={setOtp}
              validationType="numeric"
              autoSubmit
              onAutoSubmit={() => fakeWait(() => setStep("welcome"))}
              className="flex justify-between gap-2"
              aria-label="One-time password"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <OTPField.Input
                  key={i}
                  className="tabular size-12 rounded-2xl border border-input bg-card text-center text-xl font-semibold shadow-soft outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/25 sm:size-13"
                />
              ))}
              <OTPField.HiddenInput name="otp" />
            </OTPField.Root>
            <Button type="submit" size="lg" className="w-full" disabled={otp.length !== 6 || busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Verify & continue
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {seconds > 0 ? (
                <>
                  Resend OTP in <span className="tabular">0:{String(seconds).padStart(2, "0")}</span>
                </>
              ) : (
                <button type="button" className="cursor-pointer rounded-full font-medium text-primary hover:underline" onClick={() => setSeconds(30)}>
                  Resend OTP
                </button>
              )}
            </p>
          </form>
        )}

        {step === "welcome" && (
          <div className="space-y-6 text-center">
            <Avatar className="mx-auto size-20 ring-4 ring-accent">
              <AvatarFallback className="text-xl">KS</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight">Welcome, K. Srinivas</h2>
              <p className="text-sm text-muted-foreground">Superintendent of Police · Demo District Police</p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {["Unit Officer", "Initiating Officer", "Component Officer", "Office Incharge"].map((r) => (
                <Badge key={r} tone="primary">
                  {r}
                </Badge>
              ))}
            </div>
            <Button size="lg" className="w-full" asChild>
              <Link href="/dashboard">
                Continue to dashboard <ArrowRight />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
