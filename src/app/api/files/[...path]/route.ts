import { getCurrentUser } from "@/lib/auth/session";
import { readLocalFile } from "@/lib/storage";

/** Serves locally stored uploads (dev storage adapter) to signed-in users only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[...path]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { path } = await ctx.params;
  const file = await readLocalFile(path);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), { headers: { "content-type": file.type, "cache-control": "private, max-age=3600" } });
}
