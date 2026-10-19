import "server-only";

import {
  getCompsSource,
  getSoldComps,
  type CompClassification,
  type SoldCompsPayload,
} from "@/lib/comps";
import { loadSoldCompCard } from "@/lib/comps/load-card";
import { buildQueryKey } from "@/lib/comps/query-key";
import { pricePayloadWithoutFlags } from "@/lib/comps/shared-value";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  preserveValueOnFailedAttempt,
  refreshCardValueResult,
  valueAfterRefreshError,
} from "./refresh-result";
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

export type RefreshCardValueResult = CardValueResult & {
  attempt: RefreshAttempt;
  /** Sold comps from this refresh, when the fetch succeeded. */
  payload: SoldCompsPayload | null;
};

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
  payload: SoldCompsPayload | null = null,
): RefreshCardValueResult {
  return { ...result, attempt, payload };
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

  // A changed query_key must not surface the previous card's price.
  if (status === "stale") {
    return {
      status,
      median: null,
      low: null,
      high: null,
      nSales: 0,
      matchedAt: row.matched_at,
    };
  }

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
  /** Price from sold_comps_cache only. Does not call Trawl. */
  cacheOnly?: boolean;
  /**
   * Write the filtered result even when it has no sales.
   * Flag reprices use this so hiding the last sale clears the stored price.
   */
  replaceValue?: boolean;
  /** False when a public viewer may see comps but must not write card_values. */
  save?: boolean;
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
  const save = options?.save !== false;
  let titles: CompClassification = { keptTitles: [], droppedTitles: [], matched: 0 };

  const result = await getSoldComps(card, {
    beforeRequest: options?.beforeRequest,
    beforeTrawl: options?.beforeTrawl,
    cacheOnly: options?.cacheOnly,
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
    // Trawl failed. Keep the stored price only when this card's query_key
    // did not change, and move matched_at so the queue rotates.
    const failedAt = new Date().toISOString();
    const { data: previousRow, error: previousError } = await client
      .from("card_values")
      .select("card_id, median, low, high, n_sales, status, query_key, matched_at")
      .eq("card_id", cardId)
      .maybeSingle();
    if (previousError) {
      console.warn("[card_values] previous read failed:", previousError.message);
    }
    const onError = valueAfterRefreshError(
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
      queryKey,
      failedAt,
    );
    if (onError.keep && previousRow) {
      const preserved = preserveValueOnFailedAttempt(
        {
          median: onError.median,
          low: onError.low,
          high: onError.high,
          nSales: onError.nSales,
          matchedAt: (previousRow.matched_at as string | null) ?? null,
        },
        onError.matchedAt,
      );
      if (save) await markCardChecked(cardId, preserved.matchedAt ?? onError.matchedAt);
      return finish(
        rowToResult({
          ...(previousRow as CardValueRow),
          matched_at: preserved.matchedAt,
          query_key: onError.queryKey,
        }),
        emptyAttempt("kept", "trawl_error", titles),
      );
    }

    if (save) {
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
    }
    return finish(
      emptyResult("unavailable"),
      emptyAttempt(previousRow ? "re-priced" : "kept", "trawl_error", titles),
    );
  }

  const payload = pricePayloadWithoutFlags(
    result.payload,
    await loadOwnerFlaggedItemIds(client, cardId),
  );
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
      if (save) await markCardChecked(cardId, matchedAt);
      return finish(
        emptyResult(isSample ? "sample" : "no_sales"),
        emptyAttempt("kept", "no_matches", titles),
      );
    }
  }

  const nextDraft = {
    status,
    median: hasSales ? payload.median : null,
    low: hasSales ? payload.p25 : null,
    high: hasSales ? payload.p75 : null,
    nSales,
    matchedAt,
    queryKey,
  };
  const decision = options?.replaceValue
    ? { value: nextDraft, keptPreviousMedian: false }
    : refreshCardValueResult(
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
        nextDraft,
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

  if (save) {
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
  }

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

  return finish(rowToResult(row), emptyAttempt(action, reason, titles), payload);
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

async function loadOwnerFlaggedItemIds(
  client: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  cardId: string,
): Promise<Set<string>> {
  const { data: ownerRow, error: ownerError } = await client
    .from("cards")
    .select("user_id")
    .eq("id", cardId)
    .maybeSingle();
  if (ownerError) {
    console.warn("[comp_flags] owner read failed:", ownerError.message);
    return new Set();
  }
  const ownerId = ownerRow?.user_id ? String(ownerRow.user_id) : "";
  if (!ownerId) return new Set();

  const { data, error } = await client
    .from("comp_flags")
    .select("item_id")
    .eq("card_id", cardId)
    .eq("user_id", ownerId);
  if (error) {
    console.warn("[comp_flags] read failed:", error.message);
    return new Set();
  }
  return new Set(
    (data ?? [])
      .map((row) => String((row as { item_id?: string }).item_id ?? ""))
      .filter(Boolean),
  );
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
