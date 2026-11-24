"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Ellipsis, KeyRound, Lock, LockOpen, Plus, ShieldCheck, Trash2, UserPlus, UserX, UserCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { DataTable, SortHeader } from "@/components/data-table";
import { PersonPicker, type PersonOption } from "@/components/pickers/person-picker";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { scopeKindFor } from "@/lib/authz/assignable";
import { ROLE_LABEL, ROLE_SHORT, type Role } from "@/lib/authz/roles";
import type { UserRow } from "@/lib/queries/users";
import { initials } from "@/lib/utils";
import {
  createUserAction,
  resetPasswordAction,
  saveRolesAction,
  searchPersonsAction,
  setUserActiveAction,
  suggestUsernameAction,
  unlockUserAction,
} from "./actions";

type Scopes = { units: { id: string; name: string }[]; stations: { id: string; name: string; unitId: string }[] };
type AssignmentDraft = { role: Role | ""; unitId: string | null; stationId: string | null };

function StatusPills({ u }: { u: UserRow }) {
  return (
    <span className="flex flex-wrap gap-1">
      {!u.isActive ? (
        <Badge tone="neutral">
          <UserX /> Inactive
        </Badge>
      ) : u.lockedUntil ? (
        <Badge tone="danger">
          <Lock /> Locked
        </Badge>
      ) : (
        <Badge tone="success">
          <UserCheck /> Active
        </Badge>
      )}
      {u.mustChangePassword && u.isActive && (
        <Badge tone="warning">
          <KeyRound /> Temp password
        </Badge>
      )}
    </span>
  );
}

function RolesEditor({ value, onChange, scopes, grantable }: { value: AssignmentDraft[]; onChange: (v: AssignmentDraft[]) => void; scopes: Scopes; grantable: Role[] }) {
  const set = (i: number, patch: Partial<AssignmentDraft>) => onChange(value.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <div className="space-y-2">
      {value.map((a, i) => {
        const kind = a.role ? scopeKindFor(a.role) : "unit";
        return (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <Select value={a.role} onValueChange={(v) => set(i, { role: v as Role, unitId: scopes.units.length === 1 ? scopes.units[0]!.id : null, stationId: null })}>
              <SelectTrigger aria-label="Role">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {grantable.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {kind === "state" ? (
              <span className="px-2 text-sm text-muted-foreground">All units</span>
            ) : kind === "station" ? (
              <Select value={a.stationId ?? ""} onValueChange={(v) => set(i, { stationId: v })}>
                <SelectTrigger aria-label="Station">
                  <SelectValue placeholder="Station" />
                </SelectTrigger>
                <SelectContent>
                  {scopes.stations.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={a.unitId ?? ""} onValueChange={(v) => set(i, { unitId: v })}>
                <SelectTrigger aria-label="Unit">
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent>
                  {scopes.units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove role" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { role: "", unitId: scopes.units.length === 1 ? scopes.units[0]!.id : null, stationId: null }])}>
        <Plus /> Add role
      </Button>
    </div>
  );
}

function TempPasswordDialog({ data, onClose }: { data: { username: string; password: string } | null; onClose: () => void }) {
  return (
    <Dialog open={!!data} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>One-time password</DialogTitle>
          <DialogDescription>Share it privately with the officer. It is shown only once, and they must change it when they first sign in.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-2xl bg-muted p-4 text-sm">
          <p>
            Username: <span className="font-mono font-semibold">{data?.username}</span>
          </p>
          <p className="flex items-center gap-2">
            Password: <span className="font-mono text-base font-semibold tracking-wide">{data?.password}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy password"
              onClick={() => {
                void navigator.clipboard?.writeText(data?.password ?? "");
                toast.success("Copied");
              }}
            >
              <Copy />
            </Button>
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UsersClient({ rows, scopes, grantable, selfId }: { rows: UserRow[]; scopes: Scopes; grantable: Role[]; selfId: string }) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [temp, setTemp] = React.useState<{ username: string; password: string } | null>(null);
  const [confirmReset, setConfirmReset] = React.useState<UserRow | null>(null);
  const [pending, start] = React.useTransition();

  // create form state
  const [person, setPerson] = React.useState<PersonOption | null>(null);
  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [assignments, setAssignments] = React.useState<AssignmentDraft[]>([{ role: "", unitId: scopes.units.length === 1 ? scopes.units[0]!.id : null, stationId: null }]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [editAssignments, setEditAssignments] = React.useState<AssignmentDraft[]>([]);

  const resetCreate = () => {
    setPerson(null);
    setName("");
    setUsername("");
    setAssignments([{ role: "", unitId: scopes.units.length === 1 ? scopes.units[0]!.id : null, stationId: null }]);
    setErrors({});
  };

  const roleCounts = React.useMemo(() => {
    const m = new Map<Role, number>();
    rows.forEach((r) => new Set(r.assignments.map((a) => a.role)).forEach((role) => m.set(role, (m.get(role) ?? 0) + 1)));
    return m;
  }, [rows]);

  const columns: ColumnDef<UserRow, unknown>[] = [
    {
      accessorKey: "username",
      header: ({ column }) => <SortHeader label="User" column={column} />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback>{initials(row.original.name)}</AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <p className="font-medium">{row.original.name}</p>
            <p className="font-mono text-xs text-muted-foreground">{row.original.username}</p>
          </div>
        </div>
      ),
    },
    {
      id: "officer",
      header: "Officer",
      cell: ({ row }) =>
        row.original.person ? (
          <span className="flex items-center gap-1.5 text-sm">
            <Badge tone="primary">{row.original.person.rank}</Badge>
            <span className="text-muted-foreground">
              #{row.original.person.genNo} · {row.original.person.station}
            </span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not linked</span>
        ),
    },
    {
      id: "roles",
      header: "Roles",
      cell: ({ row }) => (
        <span className="flex max-w-80 flex-wrap gap-1">
          {row.original.assignments.map((a) => (
            <Badge key={a.id} tone={a.planId ? "info" : "neutral"} title={`${ROLE_LABEL[a.role]} · ${a.scopeLabel}`}>
              {ROLE_SHORT[a.role]} · {a.scopeLabel}
            </Badge>
          ))}
        </span>
      ),
    },
    { id: "status", header: "Status", cell: ({ row }) => <StatusPills u={row.original} /> },
    {
      accessorKey: "lastLoginAt",
      header: ({ column }) => <SortHeader label="Last sign-in" column={column} />,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.lastLoginAt ? formatDistanceToNow(new Date(row.original.lastLoginAt), { addSuffix: true }) : "Never"}</span>,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) =>
        row.original.id === selfId ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.username}`}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setEditing(row.original);
                  setEditAssignments(row.original.assignments.filter((a) => !a.planId).map((a) => ({ role: a.role, unitId: a.unitId, stationId: a.stationId })));
                }}
              >
                <ShieldCheck /> Edit roles
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setConfirmReset(row.original)}>
                <KeyRound /> Reset password
              </DropdownMenuItem>
              {row.original.lockedUntil && (
                <DropdownMenuItem
                  onSelect={() =>
                    start(async () => {
                      const r = await unlockUserAction({ userId: row.original.id });
                      if (r.ok) toast.success(r.message ?? "Unlocked");
                      else toast.error(r.error);
                    })
                  }
                >
                  <LockOpen /> Unlock
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant={row.original.isActive ? "destructive" : "default"}
                onSelect={() =>
                  start(async () => {
                    const r = await setUserActiveAction({ userId: row.original.id, active: !row.original.isActive });
                    if (r.ok) toast.success(r.message ?? "Saved");
                    else toast.error(r.error);
                  })
                }
              >
                {row.original.isActive ? <UserX /> : <UserCheck />} {row.original.isActive ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
    },
  ];

  return (
    <>
      <DataTable
        data={rows}
        columns={columns}
        storageKey="admin-users"
        searchPlaceholder="Search name, username, Gen No…"
        searchText={(r) => `${r.name} ${r.username} ${r.person?.genNo ?? ""} ${r.person?.station ?? ""}`}
        filters={[
          {
            id: "roles",
            options: grantable.filter((r) => roleCounts.get(r)).map((r) => ({ value: r, label: ROLE_SHORT[r], count: roleCounts.get(r) })),
            match: (row, v) => row.assignments.some((a) => a.role === v),
          },
        ]}
        actions={
          <Button size="sm" onClick={() => (resetCreate(), setCreateOpen(true))}>
            <UserPlus /> Add user
          </Button>
        }
        mobileCard={(u) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{u.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{u.username}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {u.assignments.map((a) => (
                  <Badge key={a.id} tone="neutral">
                    {ROLE_SHORT[a.role]}
                  </Badge>
                ))}
              </div>
            </div>
            <StatusPills u={u} />
          </div>
        )}
        emptyMessage="No users yet. Add the first one."
      />

      {/* Create user */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Add user</SheetTitle>
            <SheetDescription>Pick the officer, check the username, give roles. A one-time password is generated.</SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Officer (optional for admin accounts)</Label>
              <PersonPicker
                value={person}
                search={searchPersonsAction}
                onChange={async (p) => {
                  setPerson(p);
                  if (p) {
                    const s = await suggestUsernameAction(p.id);
                    if (s) {
                      setUsername(s.username);
                      setName(s.name);
                    }
                  }
                }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="u-name">Display name</Label>
                <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-username">Username</Label>
                <Input id="u-username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} className="font-mono" aria-invalid={!!errors.username} />
                {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Roles</Label>
              <RolesEditor value={assignments} onChange={setAssignments} scopes={scopes} grantable={grantable} />
              {errors.assignments && <p className="text-xs text-destructive">{errors.assignments}</p>}
            </div>
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await createUserAction({
                    personId: person?.id ?? null,
                    name,
                    username,
                    assignments: assignments.filter((a) => a.role).map((a) => ({ role: a.role as Role, unitId: a.unitId, stationId: a.stationId })),
                  });
                  if (!r.ok) {
                    setErrors(r.fieldErrors ?? {});
                    toast.error(r.error);
                    return;
                  }
                  setCreateOpen(false);
                  setTemp({ username: r.data.username, password: r.data.tempPassword });
                })
              }
            >
              <UserPlus /> Create user
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Edit roles */}
      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Roles for {editing?.name}</SheetTitle>
            <SheetDescription>Plan roles (Component / Initiating Officer of a plan) are managed from the plan itself.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <RolesEditor value={editAssignments} onChange={setEditAssignments} scopes={scopes} grantable={grantable} />
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  if (!editing) return;
                  const r = await saveRolesAction({
                    userId: editing.id,
                    assignments: editAssignments.filter((a) => a.role).map((a) => ({ role: a.role as Role, unitId: a.unitId, stationId: a.stationId })),
                  });
                  if (r.ok) {
                    toast.success(r.message ?? "Saved");
                    setEditing(null);
                  } else toast.error(r.error);
                })
              }
            >
              Save roles
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Reset password confirm */}
      <Dialog open={!!confirmReset} onOpenChange={(o) => !o && setConfirmReset(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password for {confirmReset?.username}?</DialogTitle>
            <DialogDescription>Their current password stops working immediately. You will get a one-time password to share.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const target = confirmReset;
                  if (!target) return;
                  const r = await resetPasswordAction({ userId: target.id });
                  setConfirmReset(null);
                  if (r.ok) setTemp({ username: target.username, password: r.data.tempPassword });
                  else toast.error(r.error);
                })
              }
            >
              <KeyRound /> Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TempPasswordDialog data={temp} onClose={() => setTemp(null)} />
    </>
  );
}
