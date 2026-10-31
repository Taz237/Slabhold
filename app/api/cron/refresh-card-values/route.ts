import { snapshotOwnersAfterRefresh } from "@/lib/leaderboard/snapshot-owners";
import { revalidateCard } from "@/lib/value/card-market";
import {
  listRefreshQueue,
  markCardChecked,
  refreshCardValue,
} from "@/lib/value/getCardValue";
import {
  cardRefreshLog,
  cardRefreshSummary,
  takeRefreshBatch,
  trawlCronBudget,
} from "@/lib/value/refresh-queue";

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
 * Daily at 09:00 UTC; up to N cards per run, oldest-checked first;
 * every card is re-checked at least every ceil(total/N) days.
 *
 * N is TRAWL_CRON_BUDGET (default 25, hard max 100). That budget is the only
 * Trawl cap on this route. The per-user interactive limiter does not apply.
 *
 * card_values.matched_at is the last attempt. It moves on a kept price, on
 * zero matches, and when a Trawl error leaves the old value in place.
 * Cards past N stay at the front of the queue for the next run.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();

  const budget = trawlCronBudget(process.env.TRAWL_CRON_BUDGET);
  const queue = await listRefreshQueue();
  const { picked, remaining } = takeRefreshBatch(queue, budget);

  let repriced = 0;
  let kept = 0;
  let skipped = 0;
  const cards: ReturnType<typeof cardRefreshLog>[] = [];

  for (const candidate of picked) {
    try {
      const refreshed = await refreshCardValue(candidate.cardId);
      revalidateCard(candidate.cardId);
      const line = cardRefreshLog({
        cardId: candidate.cardId,
        result: refreshed.attempt.action,
        reason: refreshed.attempt.reason,
        matched: refreshed.attempt.matched,
        keptTitles: refreshed.attempt.keptTitles,
        droppedTitles: refreshed.attempt.droppedTitles,
      });
      console.log(JSON.stringify(line));
      cards.push(line);
      if (line.result === "re-priced") repriced += 1;
      else if (line.result === "kept") kept += 1;
      else skipped += 1;
    } catch (err) {
      console.warn(
        "[card_values] refresh threw:",
        err instanceof Error ? err.message : err,
      );
      revalidateCard(candidate.cardId);
      await markCardChecked(candidate.cardId);
      const line = cardRefreshLog({
        cardId: candidate.cardId,
        result: "skipped",
        reason: "trawl_error",
        matched: 0,
        keptTitles: [],
        droppedTitles: [],
      });
      console.log(JSON.stringify(line));
      cards.push(line);
      skipped += 1;
    }
  }

  const summary = cardRefreshSummary({
    picked: picked.length,
    repriced,
    kept,
    skipped,
    remaining,
  });
  console.log(JSON.stringify(summary));
  await snapshotOwnersAfterRefresh(picked.map((card) => card.cardId));

  return Response.json({
    ok: true,
    budget,
    ...summary,
    cards,
  });
}
