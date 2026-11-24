"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { markNotificationsReadAction } from "@/app/(app)/shell-actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Item = { id: string; title: string; body: string | null; href: string | null; kind: string; read: boolean; createdAt: string };

export function NotificationsMenu({ unread, items }: { unread: number; items: Item[] }) {
  const [pending, start] = React.useTransition();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative">
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="tabular absolute top-1 right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold text-white ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(() => markNotificationsReadAction())}>
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto py-1">
            {items.map((n) => {
              const inner = (
                <div className={cn("flex gap-3 px-4 py-2.5", !n.read && "bg-accent/40")}>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : n.kind === "alert" ? "bg-danger" : "bg-primary")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug font-medium">{n.title}</p>
                    {n.body && <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</p>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.href ? (
                    <Link href={n.href} className="block hover:bg-muted">
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
