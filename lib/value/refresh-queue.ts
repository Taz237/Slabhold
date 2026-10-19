export const TRAWL_CRON_BUDGET_DEFAULT = 25;
export const TRAWL_CRON_BUDGET_MAX = 100;

export type RefreshQueueCard = {
  cardId: string;
  matchedAt: string | null;
};

export type CardRefreshResult = "re-priced" | "kept" | "skipped";

export type CardRefreshReason =
  | "re-priced"
  | "kept_old_price"
  | "no_matches"
  | "trawl_error"
  | "budget_exhausted"
  | "unavailable";

/**
 * Cards checked per cron run. Default 25. Hard max 100.
 * Unset, empty, or invalid values use the default.
 */
export function trawlCronBudget(raw?: string | null): number {
  const parsed = Number(String(raw ?? "").trim());
  const chosen =
    Number.isFinite(parsed) && parsed >= 1
      ? Math.floor(parsed)
      : TRAWL_CRON_BUDGET_DEFAULT;
  return Math.min(TRAWL_CRON_BUDGET_MAX, chosen);
}

function checkedTime(value: string | null): number | null {
  if (value == null) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** Oldest attempt first. Never-checked cards (null matched_at) come first. */
export function compareCheckedAt(a: RefreshQueueCard, b: RefreshQueueCard): number {
  const aTime = checkedTime(a.matchedAt);
  const bTime = checkedTime(b.matchedAt);
  if (aTime == null && bTime != null) return -1;
  if (aTime != null && bTime == null) return 1;
  if (aTime != null && bTime != null && aTime !== bTime) return aTime - bTime;
  if (a.cardId < b.cardId) return -1;
  if (a.cardId > b.cardId) return 1;
  return 0;
}

/**
 * Take the oldest N cards. The rest stay unchecked and roll to the next run.
 */
export function takeRefreshBatch<T extends RefreshQueueCard>(
  cards: readonly T[],
  budget: number,
): { picked: T[]; remaining: number } {
  const ordered = [...cards].sort(compareCheckedAt);
  const size = Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : 0;
  const picked = ordered.slice(0, size);
  return { picked, remaining: Math.max(0, ordered.length - picked.length) };
}

export type CardRefreshLog = {
  msg: "card_refresh";
  card_id: string;
  result: CardRefreshResult;
  reason: CardRefreshReason;
  matched: number;
  kept_titles: string[];
  dropped_titles: string[];
};

export function cardRefreshLog(input: {
  cardId: string;
  result: CardRefreshResult;
  reason: CardRefreshReason;
  matched: number;
  keptTitles: readonly string[];
  droppedTitles: readonly string[];
}): CardRefreshLog {
  return {
    msg: "card_refresh",
    card_id: input.cardId,
    result: input.result,
    reason: input.reason,
    matched: input.matched,
    kept_titles: input.keptTitles.slice(0, 10),
    dropped_titles: input.droppedTitles.slice(0, 10),
  };
}

export type CardRefreshSummary = {
  msg: "card_refresh_summary";
  picked: number;
  "re-priced": number;
  kept: number;
  skipped: number;
  remaining: number;
};

export function cardRefreshSummary(input: {
  picked: number;
  repriced: number;
  kept: number;
  skipped: number;
  remaining: number;
}): CardRefreshSummary {
  return {
    msg: "card_refresh_summary",
    picked: input.picked,
    "re-priced": input.repriced,
    kept: input.kept,
    skipped: input.skipped,
    remaining: input.remaining,
  };
}
