import { AppShell } from "@/components/shell/app-shell";
import { NotificationsBell } from "@/components/shell/notifications-bell";
import { requireUser } from "@/lib/auth/session";
import { logoutAction, switchRoleAction } from "./shell-actions";

/** Reads the session (inside the layout's Suspense boundary) and renders the shell for the signed-in user. */
export async function AuthedShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell
      user={{
        name: user.name,
        designation: user.designation,
        unitName: user.unitName,
        roles: user.roles,
        defaultRole: user.activeRole,
        permissions: [...user.permissions],
      }}
      headerExtras={<NotificationsBell userId={user.id} />}
      onLogout={logoutAction}
      onRoleChange={switchRoleAction}
    >
      {children}
    </AppShell>
  );
}
