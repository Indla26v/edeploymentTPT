"use client";

import * as React from "react";
import { Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ROLE_LABEL, ROLE_SHORT, ROLES, type Role } from "@/lib/authz/roles";
import { cn } from "@/lib/utils";
import { savePermissionsAction } from "./actions";

type Perm = { key: string; module: string; label: string };

export function PermissionMatrix({ permissions, grants }: { permissions: Perm[]; grants: { role: Role; key: string }[] }) {
  const initial = React.useMemo(() => new Set(grants.map((g) => `${g.role}|${g.key}`)), [grants]);
  const [state, setState] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const dirty = state.size !== initial.size || [...state].some((k) => !initial.has(k));

  const modules = React.useMemo(() => {
    const m = new Map<string, Perm[]>();
    permissions.forEach((p) => m.set(p.module, [...(m.get(p.module) ?? []), p]));
    return [...m.entries()];
  }, [permissions]);

  const toggle = (role: Role, key: string) =>
    setState((cur) => {
      const next = new Set(cur);
      const id = `${role}|${key}`;
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-auto rounded-2xl border border-border/70 bg-card shadow-soft lg:max-h-[calc(100dvh-12rem)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
            <tr>
              <th className="sticky left-0 z-10 min-w-56 bg-muted/90 px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Permission</th>
              {ROLES.map((r) => (
                <th key={r} className="px-1.5 py-2 text-center text-[11px] font-semibold text-muted-foreground" title={ROLE_LABEL[r]}>
                  {ROLE_SHORT[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map(([module, perms]) => (
              <React.Fragment key={module}>
                <tr>
                  <td colSpan={ROLES.length + 1} className="sticky left-0 bg-card px-3 pt-3 pb-1 text-xs font-semibold text-primary">
                    {module}
                  </td>
                </tr>
                {perms.map((p) => (
                  <tr key={p.key} className="border-t border-border/50 hover:bg-muted/40">
                    <td className="sticky left-0 bg-card px-3 py-1.5">
                      <span className="block">{p.label}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{p.key}</span>
                    </td>
                    {ROLES.map((r) => {
                      const id = `${r}|${p.key}`;
                      const locked = r === "SUPER_ADMIN" && p.key === "admin.roles.manage";
                      return (
                        <td key={r} className={cn("px-1.5 py-1.5 text-center", state.has(id) !== initial.has(id) && "bg-warning-soft/60")}>
                          <Checkbox
                            checked={state.has(id)}
                            disabled={locked}
                            onCheckedChange={() => toggle(r, p.key)}
                            aria-label={`${ROLE_LABEL[r]}: ${p.label}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="mr-auto text-xs text-warning-soft-foreground">Unsaved changes are highlighted</span>}
        <Button variant="outline" size="sm" disabled={!dirty || pending} onClick={() => setState(initial)}>
          <RotateCcw /> Discard
        </Button>
        <Button
          size="sm"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await savePermissionsAction({
                grants: [...state].map((id) => {
                  const [role, key] = id.split("|") as [Role, string];
                  return { role, key };
                }),
              });
              if (r.ok) toast.success(r.message ?? "Saved");
              else toast.error(r.error);
            })
          }
        >
          <Save /> Save changes
        </Button>
      </div>
    </div>
  );
}
