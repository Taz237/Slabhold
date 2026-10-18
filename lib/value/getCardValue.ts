import "server-only";

import { getCompsSource, getSoldComps } from "@/lib/comps";
import { loadSoldCompCard } from "@/lib/comps/load-card";
import { buildQueryKey } from "@/lib/comps/query-key";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { refreshCardValueResult } from "./refresh-result";
import type { CardValueResult, CardValueStatus } from "./types";
import { VALUE_STALE_AFTER_MS } from "./types";

export type { CardValueResult, CardValueStatus } from "./types";
export { VALUE_STALE_AFTER_MS } from "./types";

export const TRAWL_BUDGET_PER_RUN = Math.max(
  1,
  Number(process.env.TRAWL_BUDGET_PER_RUN) || 5,
);

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
): Promise<CardValueResult> {
  const client = createSupabaseAdmin();
  if (!client || !cardId) return emptyResult("unavailable");

  const card = await loadSoldCompCard(cardId);
  if (!card) return emptyResult("unavailable");

  const queryKey = buildQueryKey(card);
  const source = getCompsSource();

  const result = await getSoldComps(card, {
    beforeRequest: options?.beforeRequest,
    beforeTrawl: options?.beforeTrawl,
  });

  if (!result.ok) {
    if ("rateLimited" in result && result.rateLimited) {
      return (await getCardValue(cardId)) ?? emptyResult("unavailable");
    }
    // Keep any existing row unchanged on Trawl errors.
    const existing = await getCardValue(cardId);
    if (existing) return existing;

    const matchedAt = new Date().toISOString();
    await upsertCardValue(client, {
      card_id: cardId,
      median: null,
      low: null,
      high: null,
      n_sales: 0,
      status: "unavailable",
      query_key: queryKey,
      matched_at: matchedAt,
    });
    return emptyResult("unavailable");
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
    .select("median, low, high, n_sales, status, matched_at")
    .eq("card_id", cardId)
    .maybeSingle();

  if (previousError) {
    console.warn("[card_values] previous read failed:", previousError.message);
    if (!hasSales) return emptyResult(isSample ? "sample" : "no_sales");
  }

  const merged = refreshCardValueResult(
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

  return rowToResult(row);
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

export type StaleCardCandidate = {
  cardId: string;
  matchedAt: string | null;
  priority: number;
};

/**
 * Pick cards that need a value refresh: missing, stale query_key, or older than 24h.
 * Ordered stalest-first.
 */
export async function listStaleCardIds(
  limit: number,
): Promise<StaleCardCandidate[]> {
  const client = createSupabaseAdmin();
  if (!client || limit < 1) return [];

  const { data: cards, error } = await client
    .from("cards")
    .select("*");

  if (error || !cards?.length) {
    if (error) console.warn("[card_values] list cards failed:", error.message);
    return [];
  }

  const ids = cards.map((c) => c.id as string);
  const { data: values } = await client
    .from("card_values")
    .select("card_id, query_key, matched_at, status")
    .in("card_id", ids);

  const valueById = new Map(
    ((values ?? []) as CardValueRow[]).map((row) => [row.card_id, row]),
  );

  const now = Date.now();
  const candidates: StaleCardCandidate[] = [];

  for (const card of cards) {
    const id = card.id as string;
    const expected = buildQueryKey({
      id,
      year: card.year as number,
      yearLabel: (card.year_label as string) || undefined,
      setBrand:
        ((card.set_name as string) || (card.set as string) || undefined) ??
        undefined,
      cardNumber: (card.card_number as string) || undefined,
      grade: (card.grade as string) || undefined,
      parallel: (card.parallel as string) || undefined,
      serialRun: (card.serial_run as number) ?? null,
      isAuto: Boolean(card.is_auto),
      isRelic: Boolean(card.is_relic),
      gradeQualifier: (card.grade_qualifier as string) || null,
      conditionType:
        card.condition_type === "graded" || card.condition_type === "raw"
          ? card.condition_type
          : undefined,
    });
    const row = valueById.get(id);
    if (!row) {
      candidates.push({ cardId: id, matchedAt: null, priority: 0 });
      continue;
    }
    const keyMismatch = Boolean(row.query_key && row.query_key !== expected);
    const age = row.matched_at
      ? now - new Date(row.matched_at).getTime()
      : Number.POSITIVE_INFINITY;
    const old = !row.matched_at || age > VALUE_STALE_AFTER_MS;
    const badStatus =
      row.status === "stale" ||
      row.status === "unavailable" ||
      keyMismatch;

    if (badStatus || old) {
      const priority = !row.matched_at
        ? 0
        : keyMismatch
          ? 1
          : badStatus
            ? 2
            : 3;
      candidates.push({
        cardId: id,
        matchedAt: row.matched_at,
        priority,
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aT = a.matchedAt ? new Date(a.matchedAt).getTime() : 0;
    const bT = b.matchedAt ? new Date(b.matchedAt).getTime() : 0;
    return aT - bT;
  });

  return candidates.slice(0, limit);
}
