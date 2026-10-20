import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { anonymousSubject } from "./anon-subject";

export { anonymousSubject };

const REQUESTS_BUCKET = "requests";
const TRAWL_BUCKET = "trawl";
const ANON_CARD_VALUES_BUCKET = "card_values";
/** Signed-in card value reads. Separate from the comps "requests" bucket. */
const CARD_VALUES_BUCKET = "card_values";

/** Max comps API hits per user per 10-minute window. */
export const REQUESTS_LIMIT = 20;
export const REQUESTS_WINDOW_MS = 10 * 60 * 1000;

/** Signed-in card value reads per user per 10-minute window. */
export const CARD_VALUES_LIMIT = 120;
export const CARD_VALUES_WINDOW_MS = 10 * 60 * 1000;

/** Max actual Trawl fetches per user per hour. */
export const TRAWL_LIMIT = 5;
export const TRAWL_WINDOW_MS = 60 * 60 * 1000;

/** Logged-out card-value reads per IP hash per 10-minute window. */
export const ANON_CARD_VALUES_LIMIT = 60;
export const ANON_CARD_VALUES_WINDOW_MS = 10 * 60 * 1000;

export const RATE_LIMIT_MESSAGE =
  "You're checking sold comps too quickly. Please wait a bit and try again.";

export const ANON_RATE_LIMIT_MESSAGE =
  "Too many requests. Please wait a bit and try again.";

function alignedWindowStart(periodMs: number): string {
  const ms = Math.floor(Date.now() / periodMs) * periodMs;
  return new Date(ms).toISOString();
}

/**
 * Atomically-ish increment a rate-limit bucket. Returns false when over the limit.
 * Fail-open if the service-role client or table is unavailable (cache still works).
 */
async function consumeBucket(
  table: "comps_rate_limits" | "anon_rate_limits",
  subjectColumn: "user_id" | "subject",
  subject: string,
  bucket: string,
  windowMs: number,
  limit: number,
): Promise<boolean> {
  const client = createSupabaseAdmin();
  if (!client) return true;

  const windowStart = alignedWindowStart(windowMs);

  const { data: existing, error: readError } = await client
    .from(table)
    .select("count")
    .eq(subjectColumn, subject)
    .eq("bucket", bucket)
    .eq("window_start", windowStart)
    .maybeSingle();

  if (readError) {
    console.warn(`[${table}] read failed:`, readError.message);
    return true;
  }

  const current = typeof existing?.count === "number" ? existing.count : 0;
  if (current >= limit) return false;

  const next = current + 1;
  const { error: writeError } = await client.from(table).upsert(
    {
      [subjectColumn]: subject,
      bucket,
      window_start: windowStart,
      count: next,
    },
    { onConflict: `${subjectColumn},bucket,window_start` },
  );

  if (writeError) {
    console.warn(`[${table}] write failed:`, writeError.message);
    return true;
  }

  return true;
}

export async function consumeRateLimit(
  userId: string,
  bucket: string,
  windowMs: number,
  limit: number,
): Promise<boolean> {
  return consumeBucket(
    "comps_rate_limits",
    "user_id",
    userId,
    bucket,
    windowMs,
    limit,
  );
}

export async function consumeAnonymousCardValueLimit(
  request: Request,
): Promise<boolean> {
  return consumeBucket(
    "anon_rate_limits",
    "subject",
    anonymousSubject(request),
    ANON_CARD_VALUES_BUCKET,
    ANON_CARD_VALUES_WINDOW_MS,
    ANON_CARD_VALUES_LIMIT,
  );
}

export async function consumeRequestLimit(userId: string): Promise<boolean> {
  return consumeRateLimit(
    userId,
    REQUESTS_BUCKET,
    REQUESTS_WINDOW_MS,
    REQUESTS_LIMIT,
  );
}

/** Signed-in GET /api/card-values. Does not consume the comps "requests" bucket. */
export async function consumeCardValueLimit(userId: string): Promise<boolean> {
  return consumeRateLimit(
    userId,
    CARD_VALUES_BUCKET,
    CARD_VALUES_WINDOW_MS,
    CARD_VALUES_LIMIT,
  );
}

export async function consumeTrawlLimit(userId: string): Promise<boolean> {
  return consumeRateLimit(userId, TRAWL_BUCKET, TRAWL_WINDOW_MS, TRAWL_LIMIT);
}
