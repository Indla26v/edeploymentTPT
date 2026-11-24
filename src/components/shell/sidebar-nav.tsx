"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Collapsible } from "radix-ui";
import { ChevronDown } from "lucide-react";

import { navForRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useRole } from "./role-context";

function isActive(pathname: string, href: string) {
  if (href === "/plans") return pathname === "/plans" || /^\/plans\/(?!new|completed)[^/]+/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { activeRole } = useRole();
  const groups = navForRole(activeRole);

  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups.map((group) => {
        const groupActive = group.items.some((i) => isActive(pathname, i.href));
        const list = (
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex h-10 items-center gap-3 rounded-full px-3.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-muted hover:text-sidebar-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
                      active && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
                    )}
                  >
                    <Icon
                      className={cn("size-[18px] shrink-0 text-sidebar-muted group-hover:text-sidebar-foreground", active && "text-sidebar-accent-foreground group-hover:text-sidebar-accent-foreground")}
                      aria-hidden
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        );

        if (!group.collapsible) {
          return (
            <div key={group.label} className="flex flex-col gap-1.5">
              <p className="px-3.5 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">{group.label}</p>
              {list}
            </div>
          );
        }
        return (
          <Collapsible.Root key={group.label} defaultOpen={groupActive} className="flex flex-col gap-1.5">
            <Collapsible.Trigger className="group/trigger flex cursor-pointer items-center justify-between rounded-full px-3.5 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase hover:text-sidebar-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none">
              {group.label}
              <ChevronDown className="size-3.5 transition-transform group-data-[state=open]/trigger:rotate-180" aria-hidden />
            </Collapsible.Trigger>
            <Collapsible.Content className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
              {list}
            </Collapsible.Content>
          </Collapsible.Root>
        );
      })}
    </nav>
  );
}
