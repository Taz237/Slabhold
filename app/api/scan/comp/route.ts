import { consumeRateLimit } from "@/lib/comps/rate-limit";
import { scanPreviewAllowed } from "@/lib/scan/confirm";
import { lookupScanComp } from "@/lib/scan/comp-lookup";
import { serverScanCompDeps } from "@/lib/scan/comp-lookup-server";
import { respondScanComp } from "@/lib/scan/comp-respond";
import { getAuthUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 10;

/** Scan to comp lookups per user per 10 minutes. Cache reads only, but bounded. */
const SCAN_COMP_LIMIT = 60;
const SCAN_COMP_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  return respondScanComp(request, {
    enabled: () => scanPreviewAllowed(),
    userId: getAuthUserId,
    allow: (userId) => consumeRateLimit(userId, "scan_comp", SCAN_COMP_WINDOW_MS, SCAN_COMP_LIMIT),
    lookup: (identity, userId, options) => lookupScanComp(identity, userId, serverScanCompDeps, options),
  });
}
