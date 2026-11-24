import "server-only";

import { AuthzError, UserError } from "../authz/authorize";

/** Runs a page loader; scope / not-found errors become a message for <AccessDenied /> instead of a crash. */
export async function guarded<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AuthzError || e instanceof UserError) return { ok: false, message: e.message };
    throw e;
  }
}
