import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth/server";

// Lazily bound so `next build` doesn't need a database connection to import this module.
export async function GET(req: Request) {
  return toNextJsHandler(getAuth()).GET(req);
}

export async function POST(req: Request) {
  return toNextJsHandler(getAuth()).POST(req);
}
