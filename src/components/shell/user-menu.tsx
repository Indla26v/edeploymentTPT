"use client";

import * as React from "react";
import { LogOut, MonitorSmartphone, Moon, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/utils";

export function UserMenu({ name, subtitle }: { name: string; subtitle: string }) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2.5 rounded-full p-1 pr-1 transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none sm:pr-3"
            aria-label="Account menu"
          >
            <Avatar className="size-8">
              <AvatarFallback>{initials(name)}</AvatarFallback>
            </Avatar>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-medium">{name}</span>
              <span className="block text-[11px] text-muted-foreground">{subtitle}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Signed in as {name}</DropdownMenuLabel>
          <DropdownMenuItem>
            <UserRound /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem>
            <MonitorSmartphone /> Active sessions
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" />
            <span className="dark:hidden">Dark mode</span>
            <span className="hidden dark:inline">Light mode</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Logout confirmation (Manual A p218–219) */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log out?</DialogTitle>
            <DialogDescription>You will need a fresh OTP on your registered mobile to sign in again.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Stay signed in</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => setConfirmOpen(false)}>
              <LogOut /> Log out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
