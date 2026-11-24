import { AppShell, type ShellUser } from "@/components/shell/app-shell";

/**
 * Phase 1: a demo officer holding the four roles from Manual A p8.
 * Phase 2 replaces this with the signed-in user, read inside a <Suspense> boundary
 * (Cache Components: session reads must not block the static shell).
 */
const demoUser: ShellUser = {
  name: "K. Srinivas",
  designation: "Superintendent of Police",
  unitName: "Demo District Police",
  roles: ["UNIT_OFFICER", "INITIATING_OFFICER", "COMPONENT_OFFICER", "OFFICE_INCHARGE"],
  defaultRole: "UNIT_OFFICER",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell user={demoUser}>{children}</AppShell>;
}
