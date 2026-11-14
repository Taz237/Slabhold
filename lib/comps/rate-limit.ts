import "server-only";

import { makeTeamCheck } from "@/lib/social/team-check-server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { anonymousSubject } from "./anon-subject";
import { consumeBucketWithStore, failsClosedOnError, type BucketStore } from "./rate-limit-loop";
import { WANT_MATCH_WINDOW_MS } from "./rate-window";

export { WANT_MATCH_WINDOW_MS };

export { anonymousSubject };

const REQUESTS_BUCKET = "requests";
const TRAWL_BUCKET = "trawl";
const ANON_CARD_VALUES_BUCKET = "card_values";
/** Signed-in card value reads. Separate from the comps "requests" bucket. */
const CARD_VALUES_BUCKET = "card_values";

/** Max comps API hits per user per 10-minute window. */
export const REQUESTS_LIMIT = 20;
export const REQUESTS_WINDOW_MS = 10 * 60 * 1000;

/**
 * Team badge holders (TEAM_BADGE_USERNAMES) get a much higher cap on the same
 * buckets and windows. Still a cap, so a stuck loop can't run up the Trawl bill.
 */
export const TEAM_REQUESTS_LIMIT = 200;
export const TEAM_TRAWL_LIMIT = 60;

/** Signed-in card value reads per user per 10-minute window. */
export const CARD_VALUES_LIMIT = 120;
export const CARD_VALUES_WINDOW_MS = 10 * 60 * 1000;

/** POST /api/wants/match per user per 10-minute window. Separate from comps requests. */
const WANT_MATCH_BUCKET = "want_match";
export const WANT_MATCH_LIMIT = 30;

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

/** Anonymous IP hashes in anon_rate_limits are deleted once they are older than this. */
export const ANON_RATE_LIMIT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function anonRateLimitCutoff(now = Date.now()): string {
  return new Date(now - ANON_RATE_LIMIT_MAX_AGE_MS).toISOString();
}

/** Drop anon_rate_limits rows whose window started more than a day ago. */
export async function pruneAnonRateLimits(now = Date.now()): Promise<boolean> {
  const client = createSupabaseAdmin();
  if (!client) {
    console.warn("[anon_rate_limits] prune skipped: no admin client");
    return false;
  }

  const cutoff = anonRateLimitCutoff(now);
  const { error } = await client
    .from("anon_rate_limits")
    .delete()
    .lt("window_start", cutoff);

  if (error) {
    console.warn("[anon_rate_limits] prune failed:", error.message);
    return false;
  }
  return true;
}

function alignedWindowStart(periodMs: number): string {
  const ms = Math.floor(Date.now() / periodMs) * periodMs;
  return new Date(ms).toISOString();
}

/**
 * Increment a rate-limit bucket. Returns false when over the limit.
 * Fail-open if the service-role client or table is unavailable (cache still works),
 * except quick_comp_day, which fails closed (failsClosedOnError).
 * A parallel burst reads a count and writes the next one only while that count
 * is still current, pausing briefly between lost writes. After the last lost
 * write, want_match and trawl are blocked. Card values, comps, and anonymous
 * card values are allowed.
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
  if (!client) return !failsClosedOnError(bucket);

  const windowStart = alignedWindowStart(windowMs);
  const row = { table, subjectColumn, subject, bucket, windowStart };
  const store: BucketStore = {
    async read() {
      const { data: existing, error: readError } = await client
        .from(table)
        .select("count")
        .eq(subjectColumn, subject)
        .eq("bucket", bucket)
        .eq("window_start", windowStart)
        .maybeSingle();

      if (readError) {
        console.warn(`[${table}] read failed:`, readError.message);
        return { count: null, error: readError.message };
      }
      if (!existing) return { count: null };
      return { count: typeof existing.count === "number" ? existing.count : 0 };
    },
    async insert(_row, count) {
      const { error: insertError } = await client.from(table).insert({
        [subjectColumn]: subject,
        bucket,
        window_start: windowStart,
        count,
      });
      if (!insertError) return { ok: true };
      if (insertError.code === "23505") return { ok: false, conflict: true };
      console.warn(`[${table}] write failed:`, insertError.message);
      return { ok: false, conflict: false, error: insertError.message };
    },
    async update(_row, from, to) {
      const { data: updated, error: writeError } = await client
        .from(table)
        .update({ count: to })
        .eq(subjectColumn, subject)
        .eq("bucket", bucket)
        .eq("window_start", windowStart)
        .eq("count", from)
        .select("count");

      if (writeError) {
        console.warn(`[${table}] write failed:`, writeError.message);
        return { ok: false, conflict: false, error: writeError.message };
      }
      if ((updated?.length ?? 0) > 0) return { ok: true };
      return { ok: false, conflict: true };
    },
  };

  return consumeBucketWithStore(store, row, limit);
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

/** Who counts as team, and how a bucket is spent. Swappable in tests. */
export type CompsLimitDeps = {
  isTeam: (userId: string) => Promise<boolean>;
  consume: typeof consumeRateLimit;
};

const serverCompsLimitDeps: CompsLimitDeps = {
  isTeam: makeTeamCheck(),
  consume: consumeRateLimit,
};

export async function consumeRequestLimit(
  userId: string,
  deps: CompsLimitDeps = serverCompsLimitDeps,
): Promise<boolean> {
  const limit = (await deps.isTeam(userId)) ? TEAM_REQUESTS_LIMIT : REQUESTS_LIMIT;
  return deps.consume(userId, REQUESTS_BUCKET, REQUESTS_WINDOW_MS, limit);
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

export async function consumeTrawlLimit(
  userId: string,
  deps: CompsLimitDeps = serverCompsLimitDeps,
): Promise<boolean> {
  const limit = (await deps.isTeam(userId)) ? TEAM_TRAWL_LIMIT : TRAWL_LIMIT;
  return deps.consume(userId, TRAWL_BUCKET, TRAWL_WINDOW_MS, limit);
}

/** Signed-in POST /api/wants/match. Does not consume the comps "requests" bucket. */
export async function consumeWantMatchLimit(userId: string): Promise<boolean> {
  return consumeRateLimit(
    userId,
    WANT_MATCH_BUCKET,
    WANT_MATCH_WINDOW_MS,
    WANT_MATCH_LIMIT,
  );
}

/** Post likes per signed-in user per hour. Separate from comps and card values. */
const LIKES_BUCKET = "likes";
export const LIKES_LIMIT = 300;
export const LIKES_WINDOW_MS = 60 * 60 * 1000;

export const LIKE_LIMIT_MESSAGE =
  "You're liking posts too quickly. Please wait a bit and try again.";

export async function consumeLikeLimit(userId: string): Promise<boolean> {
  return consumeRateLimit(userId, LIKES_BUCKET, LIKES_WINDOW_MS, LIKES_LIMIT);
}
