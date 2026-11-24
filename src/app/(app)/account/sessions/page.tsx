import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { headers } from "next/headers";
import { Monitor } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuth } from "@/lib/auth/server";
import { requireUser } from "@/lib/auth/session";
import { RevokeButton, RevokeOthersButton } from "./session-buttons";

export const metadata: Metadata = { title: "Active sessions" };

function device(ua: string | null | undefined) {
  if (!ua) return "Unknown device";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Device";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}

export default function SessionsPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Active sessions" breadcrumb={[{ label: "Account", href: "/account" }]} actions={<RevokeOthersButton />} />
      <Suspense fallback={<Skeleton className="h-40 rounded-2xl" />}>
        <SessionList />
      </Suspense>
    </div>
  );
}

async function SessionList() {
  await connection();
  const user = await requireUser();
  const list = await getAuth().api.listSessions({ headers: await headers() });
  return (
    <>
      <Card className="py-1">
        <CardContent className="divide-y divide-border/70 px-0">
          {list.map((s) => {
            const current = s.token === user.sessionToken;
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <span className="inline-flex size-9 items-center justify-center rounded-xl bg-muted">
                  <Monitor className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {device(s.userAgent)} {current && <Badge tone="success" className="ml-1">This device</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.ipAddress ?? "IP unknown"} · signed in {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                  </p>
                </div>
                {!current && <RevokeButton token={s.token} />}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
