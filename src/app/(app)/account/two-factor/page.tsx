import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { needsTwoFactorSetup, requireUser } from "@/lib/auth/session";
import { TwoFactorSetup } from "./two-factor-setup";

export const metadata: Metadata = { title: "Two-step sign-in" };

export default function TwoFactorPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Two-step sign-in" breadcrumb={[{ label: "Account", href: "/account" }]} />
      <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
        <Body />
      </Suspense>
    </div>
  );
}

async function Body() {
  await connection();
  const user = await requireUser({ allowPasswordChange: true });
  const required = needsTwoFactorSetup(user);
  return (
    <>
      {required && (
        <div className="flex items-center gap-2 rounded-2xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          <ShieldAlert className="size-4 shrink-0" /> State Admin accounts must use two-step sign-in. Set it up to continue.
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Authenticator app</CardTitle>
          <CardDescription>After your password, you&apos;ll enter a 6-digit code from an app on your phone — so a stolen password alone can&apos;t sign in.</CardDescription>
        </CardHeader>
        <CardContent>
          <TwoFactorSetup enabled={user.twoFactorEnabled} required={user.activeRole === "SUPER_ADMIN" && process.env.REQUIRE_ADMIN_2FA !== "false"} />
        </CardContent>
      </Card>
    </>
  );
}
