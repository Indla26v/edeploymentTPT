import type { Metadata } from "next";
import { Suspense } from "react";

import { BrandMark } from "@/components/shell/brand";
import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Two-step sign-in" };

export default function TwoFactorPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="flex items-center gap-2">
        <BrandMark className="size-8" />
        <span className="font-semibold tracking-tight">eDeployment</span>
      </div>
      <Suspense>
        <TwoFactorForm />
      </Suspense>
    </main>
  );
}
