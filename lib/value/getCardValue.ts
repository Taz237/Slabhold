import "server-only";

import { getCompsSource, getSoldComps, type CompClassification } from "@/lib/comps";
import { loadSoldCompCard } from "@/lib/comps/load-card";
import { buildQueryKey } from "@/lib/comps/query-key";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { preserveValueOnFailedAttempt, refreshCardValueResult } from "./refresh-result";
import type { CardRefreshReason, CardRefreshResult, RefreshQueueCard } from "./refresh-queue";
import type { CardValueResult, CardValueStatus } from "./types";

export type { CardValueResult, CardValueStatus } from "./types";
export type { RefreshQueueCard } from "./refresh-queue";

export type RefreshAttempt = {
  action: CardRefreshResult;
  reason: CardRefreshReason;
  matched: number;
  keptTitles: string[];
  droppedTitles: string[];
};

export type RefreshCardValueResult = CardValueResult & { attempt: RefreshAttempt };

type CardValueRow = {
  card_id: string;
  median: number | null;
  low: number | null;
  high: number | null;
  n_sales: number | null;
  status: string;
  query_key: string | null;
  matched_at: string | null;
};

function emptyAttempt(
  action: CardRefreshResult,
  reason: CardRefreshReason,
  titles?: CompClassification,
): RefreshAttempt {
  return {
    action,
    reason,
    matched: titles?.matched ?? 0,
    keptTitles: titles?.keptTitles ?? [],
    droppedTitles: titles?.droppedTitles ?? [],
  };
}

function finish(
  result: CardValueResult,
  attempt: RefreshAttempt,
): RefreshCardValueResult {
  return { ...result, attempt };
}

function emptyResult(status: CardValueStatus): CardValueResult {
  return {
    status,
    median: null,
    low: null,
    high: null,
    nSales: 0,
    matchedAt: null,
  };
}

function applySourceStatus(status: CardValueStatus): CardValueStatus {
  const source = getCompsSource();
  if (source === "sample" || source === "off") return "sample";
  return status;
}

function rowToResult(
  row: CardValueRow,
  opts?: { expectedQueryKey?: string },
): CardValueResult {
  let status = (row.status as CardValueStatus) || "unavailable";
  if (
    opts?.expectedQueryKey &&
    row.query_key &&
    row.query_key !== opts.expectedQueryKey
  ) {
    status = "stale";
  }
  status = applySourceStatus(status);

  return {
    status,
    median: row.median != null ? Number(row.median) : null,
    low: row.low != null ? Number(row.low) : null,
    high: row.high != null ? Number(row.high) : null,
    nSales: typeof row.n_sales === "number" ? row.n_sales : 0,
    matchedAt: row.matched_at,
  };
}

/**
 * Read trusted value for one card. Never calls Trawl.
 * Returns null when no card_values row exists.
 */
export async function getCardValue(
  cardId: string,
): Promise<CardValueResult | null> {
  if (!cardId) return emptyResult("unavailable");

  const client = createSupabaseAdmin();
  const source = getCompsSource();
  if (!client) {
    return emptyResult(
      source === "sample" || source === "off" ? "sample" : "unavailable",
    );
  }

  const card = await loadSoldCompCard(cardId);
  const expectedKey = card ? buildQueryKey(card) : undefined;

  const { data, error } = await client
    .from("card_values")
    .select("card_id, median, low, high, n_sales, status, query_key, matched_at")
    .eq("card_id", cardId)
    .maybeSingle();

  if (error) {
    console.warn("[card_values] read failed:", error.message);
    return emptyResult(
      source === "sample" || source === "off" ? "sample" : "unavailable",
    );
  }
  if (!data) return null;

  return rowToResult(data as CardValueRow, { expectedQueryKey: expectedKey });
}

/**
 * Read trusted values for many cards in ONE query. Never calls Trawl.
 * Only ids with a card_values row appear in the map.
 */
export async function getCardValues(
  cardIds: string[],
): Promise<Map<string, CardValueResult>> {
  const out = new Map<string, CardValueResult>();
  const ids = [...new Set(cardIds.filter(Boolean))];
  if (!ids.length) return out;

  const source = getCompsSource();
  const client = createSupabaseAdmin();
  if (!client) {
    if (source === "sample" || source === "off") {
      const sample = emptyResult("sample");
      for (const id of ids) out.set(id, sample);
    }
    return out;
  }

  const { data, error } = await client
    .from("card_values")
    .select("card_id, median, low, high, n_sales, status, query_key, matched_at")
    .in("card_id", ids);

  if (error) {
    console.warn("[card_values] read failed:", error.message);
    return out;
  }

  for (const row of (data ?? []) as CardValueRow[]) {
    out.set(row.card_id, rowToResult(row));
  }

  return out;
}

export type RefreshCardValueOptions = {
  beforeRequest?: () => Promise<boolean>;
  beforeTrawl?: () => Promise<boolean>;
};

/**
 * Refresh card_values from getSoldComps (uses sold_comps_cache; Trawl only if cache > 6h).
 */
export async function refreshCardValue(
  cardId: string,
  options?: RefreshCardValueOptions,
): Promise<RefreshCardValueResult> {
  const client = createSupabaseAdmin();
  if (!client || !cardId) {
    return finish(emptyResult("unavailable"), emptyAttempt("skipped", "unavailable"));
  }

  const card = await loadSoldCompCard(cardId);
  if (!card) {
    return finish(emptyResult("unavailable"), emptyAttempt("skipped", "unavailable"));
  }

  const queryKey = buildQueryKey(card);
  const source = getCompsSource();
  let titles: CompClassification = { keptTitles: [], droppedTitles: [], matched: 0 };

  const result = await getSoldComps(card, {
    beforeRequest: options?.beforeRequest,
    beforeTrawl: options?.beforeTrawl,
    onClassified: (info) => {
      titles = info;
    },
  });

  if (!result.ok) {
    if ("rateLimited" in result && result.rateLimited) {
      const existing = await getCardValue(cardId);
      return finish(
        existing ?? emptyResult("unavailable"),
        emptyAttempt("skipped", "budget_exhausted"),
      );
    }
    // Trawl failed. Keep the stored price and move matched_at so the queue rotates.
    const failedAt = new Date().toISOString();
    const { data: previousRow, error: previousError } = await client
      .from("card_values")
      .select("card_id, median, low, high, n_sales, status, query_key, matched_at")
      .eq("card_id", cardId)
      .maybeSingle();
    if (previousError) {
      console.warn("[card_values] previous read failed:", previousError.message);
    }
    if (previousRow) {
      const preserved = preserveValueOnFailedAttempt(
        {
          median: previousRow.median != null ? Number(previousRow.median) : null,
          low: previousRow.low != null ? Number(previousRow.low) : null,
          high: previousRow.high != null ? Number(previousRow.high) : null,
          nSales:
            previousRow.n_sales == null || Number.isNaN(Number(previousRow.n_sales))
              ? 0
              : Number(previousRow.n_sales),
          matchedAt: (previousRow.matched_at as string | null) ?? null,
        },
        failedAt,
      );
      await markCardChecked(cardId, preserved.matchedAt ?? failedAt);
      return finish(
        rowToResult({ ...(previousRow as CardValueRow), matched_at: preserved.matchedAt }),
        emptyAttempt("kept", "trawl_error", titles),
      );
    }

    await upsertCardValue(client, {
      card_id: cardId,
      median: null,
      low: null,
      high: null,
      n_sales: 0,
      status: "unavailable",
      query_key: queryKey,
      matched_at: failedAt,
    });
    return finish(
      emptyResult("unavailable"),
      emptyAttempt("kept", "trawl_error", titles),
    );
  }

  const payload = result.payload;
  const isSample = source === "sample" || source === "off" || payload.sample;
  const nSales = payload.count;
  const hasSales = nSales >= 1 && payload.median != null;

  let status: CardValueStatus;
  if (isSample) status = "sample";
  else if (!hasSales) status = "no_sales";
  else status = "ok";

  const matchedAt = new Date().toISOString();
  const { data: previousRow, error: previousError } = await client
    .from("card_values")
    .select("median, low, high, n_sales, status, matched_at, query_key")
    .eq("card_id", cardId)
    .maybeSingle();

  if (previousError) {
    console.warn("[card_values] previous read failed:", previousError.message);
    if (!hasSales) {
      await markCardChecked(cardId, matchedAt);
      return finish(
        emptyResult(isSample ? "sample" : "no_sales"),
        emptyAttempt("kept", "no_matches", titles),
      );
    }
  }

  const decision = refreshCardValueResult(
    previousRow
      ? {
          status: ((previousRow.status as CardValueStatus) || "unavailable"),
          median: previousRow.median != null ? Number(previousRow.median) : null,
          low: previousRow.low != null ? Number(previousRow.low) : null,
          high: previousRow.high != null ? Number(previousRow.high) : null,
          nSales:
            previousRow.n_sales == null || Number.isNaN(Number(previousRow.n_sales))
              ? 0
              : Number(previousRow.n_sales),
          matchedAt: (previousRow.matched_at as string | null) ?? null,
          queryKey: (previousRow.query_key as string | null) ?? null,
        }
      : null,
    {
      status,
      median: hasSales ? payload.median : null,
      low: hasSales ? payload.p25 : null,
      high: hasSales ? payload.p75 : null,
      nSales,
      matchedAt,
      queryKey,
    },
  );
  const merged = decision.value;
  if (decision.keptPreviousMedian) {
    console.log(
      `[card_values] kept previous median for ${cardId}: new run had 0 sales`,
    );
  }

  const row: CardValueRow = {
    card_id: cardId,
    median: merged.median,
    low: merged.low,
    high: merged.high,
    n_sales: merged.nSales,
    status: merged.status,
    query_key: merged.queryKey,
    matched_at: merged.matchedAt,
  };

  await upsertCardValue(client, {
    card_id: cardId,
    median: row.median,
    low: row.low,
    high: row.high,
    n_sales: row.n_sales ?? 0,
    status: row.status,
    query_key: row.query_key ?? queryKey,
    matched_at: row.matched_at ?? matchedAt,
  });

  const previousMedian =
    previousRow && previousRow.median != null ? Number(previousRow.median) : null;
  const samePrice = previousMedian === merged.median;
  let action: CardRefreshResult = "re-priced";
  let reason: CardRefreshReason = "re-priced";
  if (decision.keptPreviousMedian) {
    action = "kept";
    reason = "kept_old_price";
  } else if (merged.nSales < 1) {
    reason = "no_matches";
    action = samePrice ? "kept" : "re-priced";
  }

  return finish(rowToResult(row), emptyAttempt(action, reason, titles));
}

/** Move matched_at without changing the stored price. */
export async function markCardChecked(
  cardId: string,
  at = new Date().toISOString(),
): Promise<void> {
  const client = createSupabaseAdmin();
  if (!client || !cardId) return;
  const { error } = await client
    .from("card_values")
    .update({ matched_at: at })
    .eq("card_id", cardId);
  if (error) console.warn("[card_values] matched_at update failed:", error.message);
}

async function upsertCardValue(
  client: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  row: {
    card_id: string;
    median: number | null;
    low: number | null;
    high: number | null;
    n_sales: number;
    status: string;
    query_key: string;
    matched_at: string;
  },
): Promise<void> {
  const { error } = await client.from("card_values").upsert(row, {
    onConflict: "card_id",
  });
  if (error) {
    console.warn("[card_values] upsert failed:", error.message);
  }
}

async function selectPage<T>(
  client: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  table: "cards" | "card_values",
  columns: string,
): Promise<T[]> {
  const rows: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .range(from, from + page - 1);
    if (error) {
      console.warn(`[card_values] list ${table} failed:`, error.message);
      break;
    }
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < page) break;
  }
  return rows;
}

/**
 * Every card, valued or not. matched_at is the last attempt (null if never checked).
 * Ordering is applied by takeRefreshBatch: oldest first, nulls first.
 */
export async function listRefreshQueue(): Promise<RefreshQueueCard[]> {
  const client = createSupabaseAdmin();
  if (!client) return [];

  const cards = await selectPage<{ id: string }>(client, "cards", "id");
  const values = await selectPage<{ card_id: string; matched_at: string | null }>(
    client,
    "card_values",
    "card_id, matched_at",
  );
  const matchedAt = new Map(values.map((row) => [row.card_id, row.matched_at]));
  return cards.map((card) => ({
    cardId: card.id,
    matchedAt: matchedAt.has(card.id) ? matchedAt.get(card.id) ?? null : null,
  }));
}
