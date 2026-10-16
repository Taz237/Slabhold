import { TRAWL_LIMIT } from "@/lib/comps/rate-limit";
import {
  listStaleCardIds,
  refreshCardValue,
  TRAWL_BUDGET_PER_RUN,
} from "@/lib/value/getCardValue";

export const runtime = "nodejs";
export const maxDuration = 60;

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  return header === `Bearer ${secret}`;
}

/**
 * Daily cron: refresh the stalest card_values first.
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Budget: TRAWL_BUDGET_PER_RUN (default 5). Sold-comps cache still avoids
 * Trawl when fresher than 6h; user-facing routes keep the hourly Trawl limit.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();

  const budget = TRAWL_BUDGET_PER_RUN;
  // Fetch more candidates than budget — cache hits do not consume Trawl budget.
  const candidates = await listStaleCardIds(Math.max(budget * 4, budget));

  let refreshed = 0;
  let trawlUsed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const candidate of candidates) {
    if (trawlUsed >= budget) break;

    try {
      await refreshCardValue(candidate.cardId, {
        beforeTrawl: async () => {
          if (trawlUsed >= budget) return false;
          trawlUsed += 1;
          return true;
        },
      });
      refreshed += 1;
    } catch (err) {
      skipped += 1;
      errors.push(
        `${candidate.cardId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return Response.json({
    ok: true,
    candidates: candidates.length,
    refreshed,
    trawlUsed,
    trawlBudget: budget,
    trawlHourlyLimit: TRAWL_LIMIT,
    skipped,
    errors: errors.slice(0, 5),
  });
}
