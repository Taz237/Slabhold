export const CARD_VALUE_HISTORY_TABLE = "card_value_history";

/** Cards written on one cron run. The rest wait for a later run. */
export const CARD_VALUE_HISTORY_RUN_CAP = 1000;

/** Rows older than this many days are deleted by the service-role cron after it writes. */
export const CARD_VALUE_HISTORY_RETENTION_DAYS = 400;

/** Off unless this is exactly "1". The cron is not scheduled. */
export function cardValueHistoryEnabled(
  env: { CARD_VALUE_HISTORY_ENABLED?: string } = {
    CARD_VALUE_HISTORY_ENABLED: process.env.CARD_VALUE_HISTORY_ENABLED,
  },
): boolean {
  return env.CARD_VALUE_HISTORY_ENABLED === "1";
}

export function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /schema cache|does not exist/i.test(error.message ?? "")
  );
}

export type CardValueHistoryRow = {
  user_id: string;
  card_id: string;
  snapshot_date: string;
  median: number | null;
  previous_median: number | null;
  delta: number | null;
};

export function finiteNumber(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

/** Null and blank stay null. Numeric strings from Postgres are accepted. */
export function numericFromUnknown(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return finiteNumber(number);
}

/** A stored row counts only when this run sees a matched value (status ok) with a median. */
export function isFreshMatchedCardValue(row: { status?: unknown; median?: unknown }): boolean {
  return row.status === "ok" && numericFromUnknown(row.median) != null;
}

export function historyRetentionCutoff(snapshotDate: string, days = CARD_VALUE_HISTORY_RETENTION_DAYS): string {
  const [year, month, day] = snapshotDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() - days);
  return utc.toISOString().slice(0, 10);
}

export function cardValueDelta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return current - previous;
}

/** One history row per card. Delta stays empty until yesterday's median exists. */
export function buildCardValueHistoryRows(input: {
  userId: string;
  snapshotDate: string;
  current: readonly { cardId: string; median: number | null }[];
  previous: readonly { cardId: string; median: number | null }[];
}): CardValueHistoryRow[] {
  const prior = new Map(input.previous.map((row) => [row.cardId, finiteNumber(row.median)]));
  const rows: CardValueHistoryRow[] = [];
  const seen = new Set<string>();
  for (const card of input.current) {
    if (!input.userId || !card.cardId || seen.has(card.cardId)) continue;
    seen.add(card.cardId);
    const median = finiteNumber(card.median);
    const previousMedian = prior.has(card.cardId) ? (prior.get(card.cardId) ?? null) : null;
    rows.push({
      user_id: input.userId,
      card_id: card.cardId,
      snapshot_date: input.snapshotDate,
      median,
      previous_median: previousMedian,
      delta: cardValueDelta(median, previousMedian),
    });
  }
  return rows;
}

/**
 * Home may show "your cards up and down since yesterday" only after the
 * history table exists and has movers. The flag-off cron does not create it.
 */
export function shouldShowYourCardsSinceYesterday(input: {
  tableExists: boolean;
  moverCount: number;
}): boolean {
  return input.tableExists && input.moverCount > 0;
}

export type CardValueHistoryCronResult = {
  ok: true;
  skipped: "flag" | "missing_table" | null;
  written: number;
};

/**
 * Flag off skips every read and write. A missing table skips the write.
 */
export async function runCardValueHistoryCron(deps: {
  enabled: () => boolean;
  tableExists: () => Promise<boolean>;
  write: () => Promise<number>;
}): Promise<CardValueHistoryCronResult> {
  if (!deps.enabled()) return { ok: true, skipped: "flag", written: 0 };
  if (!(await deps.tableExists())) return { ok: true, skipped: "missing_table", written: 0 };
  const written = await deps.write();
  return { ok: true, skipped: null, written };
}
