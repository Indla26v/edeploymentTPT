/**
 * Lets DB tests call real Server Actions: the session is replaced by a chosen demo user, and Next's
 * request-only APIs (headers, refresh) are stubbed. Import this file BEFORE any action module.
 */
import { vi } from "vitest";

import type { CurrentUser } from "@/lib/auth/session";

export const actor: { current: CurrentUser | null } = { current: null };

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "vitest" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {}, updateTag: () => {}, revalidateTag: () => {} }));
vi.mock("@/lib/auth/session", async (orig) => {
  const mod = await orig<typeof import("@/lib/auth/session")>();
  const current = async () => {
    if (!actor.current) throw new Error("No test actor set");
    return actor.current;
  };
  return { ...mod, getCurrentUser: current, requireUser: current };
});
