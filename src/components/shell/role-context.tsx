"use client";

import * as React from "react";

import type { Role } from "@/lib/authz/roles";

type RoleState = {
  roles: Role[];
  activeRole: Role;
  setActiveRole: (role: Role) => void;
};

const RoleContext = React.createContext<RoleState | null>(null);

const STORAGE_KEY = "edeploy.activeRole";

// Tiny external store over localStorage, with an in-memory fallback when storage is unavailable.
const listeners = new Set<() => void>();
let memoryRole: string | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? memoryRole;
  } catch {
    return memoryRole;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

function writeRole(role: Role) {
  memoryRole = role;
  try {
    window.localStorage.setItem(STORAGE_KEY, role);
  } catch {
    // private mode / blocked storage: the in-memory value still works for this tab
  }
  listeners.forEach((l) => l());
}

/**
 * Phase 1: demo role state kept in the browser.
 * Phase 2 replaces `roles` with the signed-in user's role assignments from the session,
 * and switching role becomes a server action (authz never trusts this client value).
 */
export function RoleProvider({
  roles,
  defaultRole,
  onChange,
  children,
}: {
  roles: Role[];
  defaultRole: Role;
  /** Server action persisting the active role on the session; authz always re-reads it server-side. */
  onChange?: (role: Role) => Promise<void>;
  children: React.ReactNode;
}) {
  const saved = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // When a server action owns the active role, the server-provided default wins.
  const activeRole = !onChange && saved && (roles as string[]).includes(saved) ? (saved as Role) : defaultRole;

  const setActiveRole = React.useCallback(
    (role: Role) => {
      writeRole(role);
      void onChange?.(role);
    },
    [onChange],
  );
  const value = React.useMemo(() => ({ roles, activeRole, setActiveRole }), [roles, activeRole, setActiveRole]);
  return <RoleContext value={value}>{children}</RoleContext>;
}

export function useRole() {
  const ctx = React.use(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside <RoleProvider>");
  return ctx;
}
