"use client";

import { Check } from "lucide-react";

import { ROLE_LABEL, ROLE_SHORT, type Role } from "@/lib/authz/roles";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRole } from "./role-context";

/**
 * Pill segmented control on wide screens, a pill select on medium ones; on phones the switcher lives in the
 * navigation sheet (<RoleSwitcherList>). Hidden when the user holds a single role.
 */
export function RoleSwitcher() {
  const { roles, activeRole, setActiveRole } = useRole();
  if (roles.length < 2) return null;

  return (
    <>
      <ToggleGroup
        type="single"
        value={activeRole}
        onValueChange={(v) => v && setActiveRole(v as Role)}
        aria-label="Switch role"
        className="hidden xl:inline-flex"
      >
        {roles.map((r) => (
          <Tooltip key={r}>
            <TooltipTrigger asChild>
              <ToggleGroupItem value={r} aria-label={ROLE_LABEL[r]}>
                {ROLE_LABEL[r]}
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>Act as {ROLE_LABEL[r]}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
      <Select value={activeRole} onValueChange={(v) => setActiveRole(v as Role)}>
        <SelectTrigger size="sm" aria-label="Switch role" className="hidden w-auto rounded-full px-3 md:flex xl:hidden">
          <span className="text-muted-foreground">Role:</span>
          <SelectValue>{ROLE_SHORT[activeRole]}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          {roles.map((r) => (
            <SelectItem key={r} value={r}>
              {ROLE_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

/** Role list shown at the top of the mobile navigation sheet. */
export function RoleSwitcherList() {
  const { roles, activeRole, setActiveRole } = useRole();
  if (roles.length < 2) return null;
  return (
    <div className="space-y-2 md:hidden">
      <p className="px-3.5 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">Acting as</p>
      <div className="flex flex-wrap gap-1.5 px-1.5" role="radiogroup" aria-label="Switch role">
        {roles.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={r === activeRole}
            onClick={() => setActiveRole(r)}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
              r === activeRole
                ? "border-primary/30 bg-accent text-accent-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {r === activeRole && <Check className="size-3.5" aria-hidden />}
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
    </div>
  );
}
