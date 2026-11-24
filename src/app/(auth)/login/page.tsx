import type { Metadata } from "next";
import { CircleCheck, MapPinned, ShieldCheck, Users } from "lucide-react";

import { BrandMark } from "@/components/shell/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const POINTS = [
  { icon: Users, text: "Ask stations for men — accept what they give and keep going" },
  { icon: MapPinned, text: "Place the right officer at the right point, yourself" },
  { icon: CircleCheck, text: "Nothing reaches officers until you publish" },
];

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-[oklch(0.38_0.16_266)] to-[oklch(0.28_0.12_270)] p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-32 size-[480px] rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-[420px] rounded-full bg-white/5 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <ShieldCheck className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-lg font-semibold tracking-tight">eDeployment</p>
            <p className="text-sm text-white/70">Bandobast planning</p>
          </div>
        </div>
        <div className="relative max-w-md space-y-8">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance">Plan, staff and run every bandobast from one place.</h1>
          <ul className="space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/90">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Icon className="size-4" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">Authorised police personnel only. All actions are recorded in the audit log.</p>
      </aside>

      <main className="flex flex-col">
        <div className="flex items-center justify-between p-5">
          <div className="flex items-center gap-2 lg:invisible">
            <BrandMark className="size-8" />
            <span className="font-semibold tracking-tight">eDeployment</span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-16">
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
