import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

import { directDatabaseUrl } from "./src/lib/db/url";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

// drizzle-kit (generate / studio) uses the direct connection; on Neon that is DATABASE_URL_UNPOOLED.
const url = directDatabaseUrl();
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  casing: "snake_case",
  strict: true,
  verbose: true,
});
