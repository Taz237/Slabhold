import { consumeRateLimit } from "@/lib/comps/rate-limit";
import { scanPreviewAllowed } from "@/lib/scan/confirm";
import { lookupLiveSolds } from "@/lib/scan/live-solds";
import { respondLiveSolds } from "@/lib/scan/live-solds-respond";
import { serverLiveSoldsDeps } from "@/lib/scan/live-solds-server";
import { getAuthUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
/** Trawl times out at 8 s; the rest is cache reads. */
export const maxDuration = 15;

/** Scans per user per 10 minutes. Scanning is unlimited in practice; this only stops a runaway loop. */
const SOLDS_LIMIT = 60;
const SOLDS_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  return respondLiveSolds(request, {
    enabled: () => scanPreviewAllowed(),
    userId: getAuthUserId,
    allow: (userId) => consumeRateLimit(userId, "scan_solds", SOLDS_WINDOW_MS, SOLDS_LIMIT),
    lookup: (input, userId) => lookupLiveSolds(input, userId, serverLiveSoldsDeps),
  });
}
