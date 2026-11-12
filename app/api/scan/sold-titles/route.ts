import { consumeRateLimit } from "@/lib/comps/rate-limit";
import { scanPreviewAllowed } from "@/lib/scan/confirm";
import { respondSoldTitles } from "@/lib/scan/sold-titles-respond";
import { searchCachedSoldTitles } from "@/lib/scan/sold-titles-server";
import { getAuthUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 10;

/** Scans per user per 10 minutes. Cache reads only, but bounded. */
const SOLD_TITLES_LIMIT = 60;
const SOLD_TITLES_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  return respondSoldTitles(request, {
    enabled: () => scanPreviewAllowed(),
    userId: getAuthUserId,
    allow: (userId) => consumeRateLimit(userId, "scan_titles", SOLD_TITLES_WINDOW_MS, SOLD_TITLES_LIMIT),
    search: searchCachedSoldTitles,
  });
}
