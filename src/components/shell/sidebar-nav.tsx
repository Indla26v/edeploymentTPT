"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Collapsible } from "radix-ui";
import { ChevronDown } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { navForRole, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useRole } from "./role-context";

function isActive(pathname: string, href: string) {
  if (href === "/plans") return pathname === "/plans" || /^\/plans\/(?!new|completed)[^/]+/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "group flex h-9 items-center gap-2.5 rounded-full text-[13px] font-medium text-sidebar-foreground/80 transition-colors hover:bg-muted hover:text-sidebar-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
        collapsed ? "w-9 justify-center" : "px-3",
        active && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
      )}
    >
      <Icon
        className={cn(
          "size-[18px] shrink-0 text-sidebar-muted group-hover:text-sidebar-foreground",
          active && "text-sidebar-accent-foreground group-hover:text-sidebar-accent-foreground",
        )}
        aria-hidden
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { activeRole } = useRole();
  const groups = navForRole(activeRole);

  return (
    <nav aria-label="Main" className={cn("flex flex-col", collapsed ? "items-center gap-2" : "gap-4")}>
      {groups.map((group, gi) => {
        const groupActive = group.items.some((i) => isActive(pathname, i.href));
        const list = (
          <ul className={cn("flex flex-col gap-0.5", collapsed && "items-center")}>
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={isActive(pathname, item.href)} collapsed={collapsed} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        );
        if (collapsed) {
          return (
            <div key={group.label} className="flex flex-col items-center gap-0.5">
              {gi > 0 && <span aria-hidden className="mb-1.5 h-px w-6 bg-sidebar-border" />}
              {list}
            </div>
          );
        }
        if (!group.collapsible) {
          return (
            <div key={group.label} className="flex flex-col gap-1">
              <p className="px-3 text-[10px] font-semibold tracking-wider text-sidebar-muted uppercase">{group.label}</p>
              {list}
            </div>
          );
        }
        return (
          <Collapsible.Root key={group.label} defaultOpen={groupActive} className="flex flex-col gap-1">
            <Collapsible.Trigger className="group/trigger flex cursor-pointer items-center justify-between rounded-full px-3 text-[10px] font-semibold tracking-wider text-sidebar-muted uppercase hover:text-sidebar-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none">
              {group.label}
              <ChevronDown className="size-3.5 transition-transform group-data-[state=open]/trigger:rotate-180" aria-hidden />
            </Collapsible.Trigger>
            <Collapsible.Content>{list}</Collapsible.Content>
          </Collapsible.Root>
        );
      })}
    </nav>
  );
}
