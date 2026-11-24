import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic auth check only: no session cookie → login page. Real authorization happens on the server
 * in every page and Server Action (see lib/auth/session.ts and lib/server/mutate.ts).
 */
export function proxy(request: NextRequest) {
  const cookie = getSessionCookie(request, { cookiePrefix: "edeploy" });
  if (!cookie) {
    const url = new URL("/login", request.url);
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next !== "/" && next !== "/dashboard") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except: login, Better Auth API, QR check-in, cron, Next internals and static files.
  matcher: ["/((?!login|api/auth|api/cron|c/|_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)"],
};
