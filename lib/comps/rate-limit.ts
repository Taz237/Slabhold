import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";

const REQUESTS_BUCKET = "requests";
const TRAWL_BUCKET = "trawl";

/** Max API hits per user per 10-minute window. */
export const REQUESTS_LIMIT = 20;
export const REQUESTS_WINDOW_MS = 10 * 60 * 1000;

/** Max actual Trawl fetches per user per hour. */
export const TRAWL_LIMIT = 5;
export const TRAWL_WINDOW_MS = 60 * 60 * 1000;

export const RATE_LIMIT_MESSAGE =
  "You're checking sold comps too quickly. Please wait a bit and try again.";

function alignedWindowStart(periodMs: number): string {
  const ms = Math.floor(Date.now() / periodMs) * periodMs;
  return new Date(ms).toISOString();
}

/**
 * Atomically-ish increment a rate-limit bucket. Returns false when over the limit.
 * Fail-open if the service-role client or table is unavailable (cache still works).
 */
export async function consumeRateLimit(
  userId: string,
  bucket: string,
  windowMs: number,
  limit: number,
): Promise<boolean> {
  const client = createSupabaseAdmin();
  if (!client) return true;

  const windowStart = alignedWindowStart(windowMs);

  const { data: existing, error: readError } = await client
    .from("comps_rate_limits")
    .select("count")
    .eq("user_id", userId)
    .eq("bucket", bucket)
    .eq("window_start", windowStart)
    .maybeSingle();

  if (readError) {
    console.warn("[comps_rate_limits] read failed:", readError.message);
    return true;
  }

  const current = typeof existing?.count === "number" ? existing.count : 0;
  if (current >= limit) return false;

  const next = current + 1;
  const { error: writeError } = await client.from("comps_rate_limits").upsert(
    {
      user_id: userId,
      bucket,
      window_start: windowStart,
      count: next,
    },
    { onConflict: "user_id,bucket,window_start" },
  );

  if (writeError) {
    console.warn("[comps_rate_limits] write failed:", writeError.message);
    return true;
  }

  return true;
}

export async function consumeRequestLimit(userId: string): Promise<boolean> {
  return consumeRateLimit(
    userId,
    REQUESTS_BUCKET,
    REQUESTS_WINDOW_MS,
    REQUESTS_LIMIT,
  );
}

export async function consumeTrawlLimit(userId: string): Promise<boolean> {
  return consumeRateLimit(userId, TRAWL_BUCKET, TRAWL_WINDOW_MS, TRAWL_LIMIT);
}
