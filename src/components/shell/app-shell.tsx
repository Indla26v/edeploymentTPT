"use client";

import * as React from "react";
import { Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocalSetting } from "@/lib/hooks/use-local-setting";
import type { Role } from "@/lib/authz/roles";
import { cn } from "@/lib/utils";
import { Brand, BrandMark } from "./brand";
import { RoleProvider } from "./role-context";
import { RoleSwitcher, RoleSwitcherList } from "./role-switcher";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

export type ShellUser = { name: string; designation: string; unitName: string; roles: Role[]; defaultRole: Role; permissions: string[] };

export function AppShell({
  user,
  children,
  headerExtras,
  onLogout,
  onRoleChange,
}: {
  user: ShellUser;
  children: React.ReactNode;
  /** Extra header controls (e.g. notifications bell) rendered by the server layout. */
  headerExtras?: React.ReactNode;
  onLogout?: () => Promise<void>;
  onRoleChange?: (role: Role) => Promise<void>;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = useLocalSetting("edeploy.sidebarCollapsed", false);

  return (
    <RoleProvider roles={user.roles} defaultRole={user.defaultRole} permissions={user.permissions} onChange={onRoleChange}>
      <TooltipProvider>
        <div className="flex min-h-dvh">
          {/* Desktop sidebar: full or icon rail */}
          <aside
            className={cn(
              "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-3 transition-[width] duration-200 lg:flex",
              collapsed ? "w-16 items-center px-2" : "w-60 px-3",
            )}
          >
            <div className={cn("mb-3 flex h-9 items-center", collapsed ? "justify-center" : "px-1")}>
              {collapsed ? <BrandMark className="size-8" /> : <Brand />}
            </div>
            <div className={cn("-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-3", collapsed && "w-full")}>
              <SidebarNav collapsed={collapsed} />
            </div>
            <div className={cn("flex items-center border-t border-sidebar-border pt-2", collapsed ? "justify-center" : "justify-between gap-2 px-1")}>
              {!collapsed && (
                <p className="min-w-0 truncate text-[11px] text-muted-foreground" title={user.unitName}>
                  {user.unitName}
                </p>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setCollapsed(!collapsed)}
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  >
                    {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
              </Tooltip>
            </div>
          </aside>

          {/* Mobile navigation */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="left" className="gap-4 bg-sidebar px-3 py-4">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="px-1">
                <Brand />
              </div>
              <RoleSwitcherList />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <SidebarNav onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/70 bg-background/85 px-3 backdrop-blur-md sm:px-5">
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
                <Menu />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{user.unitName}</p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Search" className="hidden md:inline-flex 2xl:hidden">
                <Search className="size-[18px]" />
              </Button>
              <label className="relative hidden w-64 2xl:block">
                <span className="sr-only">Search</span>
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  type="search"
                  placeholder="Search plans, officers…"
                  className="h-9 w-full rounded-full border border-input bg-card pr-10 pl-10 text-sm shadow-soft outline-none placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
                />
                <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-full border border-border bg-muted px-1.5 text-[10px] text-muted-foreground">
                  /
                </kbd>
              </label>
              <RoleSwitcher />
              {headerExtras}
              <UserMenu name={user.name} subtitle={user.designation} onLogout={onLogout} />
            </header>
            <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4 sm:px-5 lg:px-6">{children}</main>
          </div>
        </div>
      </TooltipProvider>
    </RoleProvider>
  );
}
