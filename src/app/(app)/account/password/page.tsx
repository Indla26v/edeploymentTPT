import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Change password" };

export default function PasswordPage() {
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <PageHeader title="Change password" breadcrumb={[{ label: "Account", href: "/account" }]} />
      <Suspense>
        <RequiredBanner />
      </Suspense>
      <Card>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}

async function RequiredBanner() {
  await connection();
  const user = await requireUser({ allowPasswordChange: true });
  return (
    <>
      {user.mustChangePassword && (
        <p className="flex items-start gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          You signed in with a temporary password. Choose your own password to continue.
        </p>
      )}
    </>
  );
}
