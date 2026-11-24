import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Copy .env.example to .env.local.`);
  return v;
}
