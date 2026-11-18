import { consumeRateLimit } from "@/lib/comps/rate-limit";
import { scanPreviewAllowed } from "@/lib/scan/confirm";
import { respondScanMiss } from "@/lib/scan/coverage-respond";
import { logScanMiss, storeScanMiss } from "@/lib/scan/coverage-server";
import { getAuthUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 10;

/** Misses logged per user per 10 minutes: one per scan, so the same bound as scanning. */
const MISS_LIMIT = 60;
const MISS_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  return respondScanMiss(request, {
    enabled: () => scanPreviewAllowed(),
    userId: getAuthUserId,
    allow: (userId) => consumeRateLimit(userId, "scan_miss", MISS_WINDOW_MS, MISS_LIMIT),
    store: storeScanMiss,
    log: logScanMiss,
  });
}
