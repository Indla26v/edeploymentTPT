import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { KeyRound, MonitorSmartphone } from "lucide-react";

import { DetailPage, SummaryStrip } from "@/components/layout/page-layouts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { ROLE_LABEL } from "@/lib/authz/roles";

export const metadata: Metadata = { title: "Profile" };

export default function AccountPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  await connection();
  const user = await requireUser();
  return (
    <DetailPage
      title={user.name}
      breadcrumb={[{ label: "Account" }]}
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link href="/account/sessions">
              <MonitorSmartphone /> Active sessions
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/account/password">
              <KeyRound /> Change password
            </Link>
          </Button>
        </>
      }
      summary={
        <SummaryStrip
          items={[
            { label: "Username", value: user.username },
            { label: "Designation", value: user.designation },
            { label: "Unit", value: user.unitName },
            { label: "Acting as", value: ROLE_LABEL[user.activeRole] },
          ]}
        />
      }
    >
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Your roles</CardTitle>
          <CardDescription>Switch between them from the header. What you can see depends on the role you are acting as.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {user.roles.map((r) => (
            <Badge key={r} tone={r === user.activeRole ? "solid" : "primary"} className="py-1">
              {ROLE_LABEL[r]}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </DetailPage>
  );
}
