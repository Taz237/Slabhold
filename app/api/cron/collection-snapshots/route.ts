import { pruneAnonRateLimits } from "@/lib/comps/rate-limit";
import {
  upsertTodaysCollectionSnapshot,
} from "@/lib/collection/totals";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const USER_BATCH = 40;
const CARD_PAGE = 1000;

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  return header === `Bearer ${secret}`;
}

async function listUserIdsWithCards(): Promise<string[]> {
  const admin = createSupabaseAdmin();
  if (!admin) return [];

  const ids = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("cards")
      .select("user_id")
      .range(from, from + CARD_PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      if (row.user_id) ids.add(row.user_id as string);
    }
    if (rows.length < CARD_PAGE) break;
    from += CARD_PAGE;
  }
  return [...ids];
}

/**
 * Daily cron at 03:30 UTC, about 11:30 PM America/New_York
 * (11:30 PM EDT, 10:30 PM EST). Snapshots every collector who has cards,
 * which includes every leaderboard opt-in, from cached card_values only.
 * Writes today's collection total and each card's median, sale count, and self-reported flag.
 * Apply the leaderboard migration before deploy. If the new columns are missing, the median is still saved.
 * A failed user write returns HTTP 500.
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Never calls Trawl.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();

  const anonRateLimitsPruned = await pruneAnonRateLimits();
  const userIds = await listUserIdsWithCards();
  let written = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < userIds.length; i += USER_BATCH) {
    const batch = userIds.slice(i, i + USER_BATCH);
    const results = await Promise.allSettled(
      batch.map((userId) => upsertTodaysCollectionSnapshot(userId)),
    );
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        written += 1;
      } else {
        failed += 1;
        errors.push(
          `${batch[j]}: ${
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
          }`,
        );
      }
    }
  }

  const ok = failed === 0;
  return Response.json(
    {
      ok,
      anonRateLimitsPruned,
      users: userIds.length,
      written,
      failed,
      errors: errors.slice(0, 5),
    },
    { status: failed > 0 ? 500 : 200 },
  );
}
