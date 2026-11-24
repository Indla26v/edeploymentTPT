import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { UserError } from "@/lib/authz/authorize";

const ROOT = path.join(process.cwd(), ".data", "uploads");
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/**
 * Stores an uploaded image and returns a URL the app can render.
 * Vercel Blob when BLOB_READ_WRITE_TOKEN is set, otherwise local disk under .data/uploads
 * (served by /api/files, which requires a signed-in user).
 */
export async function saveImage(file: File, folder: "persons" | "signatures" | "headers" | "units" | "sectors" | "plans" | "tasks"): Promise<string> {
  const ext = TYPES[file.type];
  if (!ext) throw new UserError("Upload a PNG, JPG or WebP image.");
  if (file.size > MAX_BYTES) throw new UserError("Images must be 5 MB or smaller.");
  const name = `${folder}/${randomUUID()}.${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(name, file, { access: "public", contentType: file.type });
    return blob.url;
  }
  await mkdir(path.join(ROOT, folder), { recursive: true });
  await writeFile(path.join(ROOT, name), Buffer.from(await file.arrayBuffer()));
  return `/api/files/${name}`;
}

/** Reads a locally stored file; rejects path traversal. */
export async function readLocalFile(parts: string[]): Promise<{ data: Buffer; type: string } | null> {
  const rel = parts.join("/");
  if (!/^[a-z]+\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(rel)) return null;
  try {
    const data = await readFile(path.join(ROOT, rel));
    const ext = rel.split(".").pop()!;
    return { data, type: ext === "jpg" ? "image/jpeg" : `image/${ext}` };
  } catch {
    return null;
  }
}
