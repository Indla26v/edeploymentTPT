"use client";

import * as React from "react";
import { Bell, Menu, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Role } from "@/lib/authz/roles";
import { Brand } from "./brand";
import { RoleProvider } from "./role-context";
import { RoleSwitcher, RoleSwitcherList } from "./role-switcher";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

export type ShellUser = { name: string; designation: string; unitName: string; roles: Role[]; defaultRole: Role };

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <RoleProvider roles={user.roles} defaultRole={user.defaultRole}>
      <TooltipProvider>
        <div className="flex min-h-dvh">
          {/* Desktop sidebar */}
          <aside className="sticky top-0 hidden h-dvh w-[272px] shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex">
            <div className="px-1.5">
              <Brand />
            </div>
            <div className="-mx-1 flex-1 overflow-y-auto px-1 pb-4">
              <SidebarNav />
            </div>
            <div className="rounded-2xl bg-muted/70 p-3.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{user.unitName}</p>
              <p>Within-district deployment</p>
            </div>
          </aside>

          {/* Mobile sidebar */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="left" className="gap-6 bg-sidebar px-4 py-5">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="px-1.5">
                <Brand />
              </div>
              <RoleSwitcherList />
              <div className="flex-1 overflow-y-auto">
                <SidebarNav onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border/70 bg-background/80 px-4 backdrop-blur-md sm:px-6">
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
                <Menu />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold sm:text-base">{user.unitName}</p>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">eDeployment · Security plan lifecycle</p>
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
                  className="h-10 w-full rounded-full border border-input bg-card pr-12 pl-10 text-sm shadow-soft outline-none placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
                />
                <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-full border border-border bg-muted px-1.5 text-[10px] text-muted-foreground">
                  /
                </kbd>
              </label>
              <RoleSwitcher />
              <span className="hidden sm:inline-flex">
                <ThemeToggle />
              </span>
              <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
                <Bell className="size-[18px]" />
                <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-danger ring-2 ring-background" />
              </Button>
              <UserMenu name={user.name} subtitle={user.designation} />
            </header>
            <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
          </div>
        </div>
      </TooltipProvider>
    </RoleProvider>
  );
}
