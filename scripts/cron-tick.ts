/** Calls the running app's cron endpoint once (local development): pnpm cron:tick */
import "./env";

const base = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Set CRON_SECRET in .env.local (any long random string) to use the cron tick.");
  process.exit(1);
}
const res = await fetch(`${base}/api/cron/tick`, { headers: { authorization: `Bearer ${secret}` } });
console.log(res.status, await res.text());
