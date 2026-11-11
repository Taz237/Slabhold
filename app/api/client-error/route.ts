import { createRateLimiter } from "@/lib/errors/report";
import { handleClientError } from "@/lib/errors/route-handler";

/** Crash and error reports from the web app and the iPhone app, to the Vercel logs. */
export const runtime = "nodejs";

// Per server instance: 20 reports a minute from one sender, 600 in all.
const limit = createRateLimiter({ perKey: 20, total: 600, windowMs: 60_000 });
const serverVersion = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || null;

export async function POST(request: Request) {
  return handleClientError(request, {
    limit,
    log: (line) => console.error(line),
    serverVersion,
  });
}
