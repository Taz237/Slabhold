import "server-only";

import { unstable_cache } from "next/cache";
import { formatGrade, parseGrade } from "@/lib/card-options";
import {
  COMPS_RESULT_REVALIDATE_SECONDS,
  CompsResultError,
  compsResultCacheKey,
} from "@/lib/comps/comps-result-cache";
import { soldCompCardFromRow } from "@/lib/comps/load-card";
import { publicCardQueryKey } from "@/lib/comps/public";
import { buildQueryKey } from "@/lib/comps/query-key";
import { mapCardRow, type CardRow } from "@/lib/social/cards";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { cardCacheTag } from "@/lib/value/card-cache";
import {
  isSameCardIdentity,
  NORMAL_ESTIMATE_MIN_SALES,
  pickSimilarOffer,
  similarRelation,
  type SimilarCandidate,
} from "@/lib/value/price-fallback";
import type { CardValueResult, CardValueSale, CardValueSimilar } from "@/lib/value/types";
import type { SoldCompCard } from "@/lib/comps/types";

export type PriceContext = {
  sales: CardValueSale[];
  similar: CardValueSimilar | null;
};

type Admin = NonNullable<ReturnType<typeof createSupabaseAdmin>>;

type PublicRow = {
  id: string;
  user_id?: string | null;
  player?: string | null;
  year?: number | string | null;
  year_label?: string | null;
  set?: string | null;
  set_name?: string | null;
  grade?: string | null;
  grader?: string | null;
  parallel?: string | null;
  card_number?: string | null;
  serial_run?: number | string | null;
  is_auto?: boolean | null;
  is_relic?: boolean | null;
  condition_type?: string | null;
  grade_qualifier?: string | null;
};

type CacheRow = {
  query_key?: string | null;
  item_id?: string | null;
  price?: number | string | null;
  sold_at?: string | null;
  fetched_at?: string | null;
};

function displayGrade(row: PublicRow): string {
  const grader = (row.grader ?? "").trim();
  const gradeText = (row.grade ?? "").trim();
  if (grader) {
    const numberOnly = /^\d+(?:\.\d+)?$/.test(gradeText)
      ? gradeText
      : parseGrade(gradeText).number;
    return formatGrade(grader, numberOnly);
  }
  return gradeText;
}

function asPrice(value: number | string | null | undefined): number | null {
  const price = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(price) || price <= 0) return null;
  return price;
}

function latestSales(rows: CacheRow[]): Map<string, CardValueSale[]> {
  const newest = new Map<string, string>();
  for (const row of rows) {
    const key = row.query_key ?? "";
    const fetched = row.fetched_at ?? "";
    if (!key || !fetched) continue;
    const prev = newest.get(key);
    if (!prev || fetched > prev) newest.set(key, fetched);
  }
  const sales = new Map<string, CardValueSale[]>();
  for (const row of rows) {
    const key = row.query_key ?? "";
    if (!key || row.fetched_at !== newest.get(key)) continue;
    if (row.item_id === "__empty__") continue;
    const price = asPrice(row.price);
    if (price == null) continue;
    const list = sales.get(key) ?? [];
    list.push({ price, soldAt: row.sold_at ?? null });
    sales.set(key, list);
  }
  return sales;
}

async function readCacheSales(client: Admin, keys: string[]): Promise<Map<string, CardValueSale[]>> {
  if (!keys.length) return new Map();
  const { data, error } = await client
    .from("sold_comps_cache")
    .select("query_key, item_id, price, sold_at, fetched_at")
    .in("query_key", keys)
    .limit(1000);
  if (error) throw new CompsResultError(error.message);
  return latestSales((data ?? []) as CacheRow[]);
}

function candidateFromRow(row: PublicRow, username: string, sales: CardValueSale[]): SimilarCandidate {
  const year = Number(row.year) || 0;
  return {
    id: row.id,
    username,
    playerName: (row.player ?? "").trim(),
    year,
    yearLabel: (row.year_label ?? "").trim() || String(year || ""),
    setBrand: (row.set_name || row.set || "").trim(),
    cardNumber: row.card_number,
    parallel: row.parallel,
    grade: displayGrade(row),
    sales,
  };
}

function subjectOf(card: SoldCompCard): SimilarCandidate {
  return {
    id: card.id,
    playerName: card.playerName,
    year: card.year,
    yearLabel: card.yearLabel,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber,
    parallel: card.parallel,
    grade: card.grade,
    sales: [],
  };
}

async function readPriceContext(card: SoldCompCard): Promise<PriceContext> {
  const client = createSupabaseAdmin();
  if (!client) throw new CompsResultError("comps unavailable");

  const player = card.playerName.trim();
  const ownKey = buildQueryKey(card);
  const related: PublicRow[] = [];

  if (player) {
    let query = client
      .from("public_cards")
      .select(
        "id, user_id, player, year, year_label, set, set_name, grade, grader, parallel, card_number, serial_run, is_auto, is_relic, condition_type, grade_qualifier",
      )
      .eq("player", player);
    if (card.year > 0) {
      query = query.gte("year", card.year - 1).lte("year", card.year + 1);
    }
    const { data, error } = await query.limit(60);
    if (error) throw new CompsResultError(error.message);
    related.push(...((data ?? []) as PublicRow[]));
  }

  const keys = new Set<string>([ownKey]);
  for (const row of related) {
    if (row.id) keys.add(publicCardQueryKey(row));
  }
  const byKey = await readCacheSales(client, [...keys]);

  const userIds = [
    ...new Set(related.map((row) => (row.user_id ? String(row.user_id) : "")).filter(Boolean)),
  ];
  const usernames = new Map<string, string>();
  if (userIds.length) {
    const { data, error } = await client.from("profiles").select("id, username").in("id", userIds);
    if (error) throw new CompsResultError(error.message);
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      const username = String((row as { username?: string }).username ?? "");
      if (id && username) usernames.set(id, username);
    }
  }

  const subject = subjectOf(card);
  const exact: CardValueSale[] = [...(byKey.get(ownKey) ?? [])];
  const cousins: SimilarCandidate[] = [];
  for (const row of related) {
    if (!row.id || row.id === card.id) continue;
    const sales = byKey.get(publicCardQueryKey(row)) ?? [];
    const username = usernames.get(String(row.user_id ?? "")) ?? "";
    const candidate = candidateFromRow(row, username, sales);
    if (!sales.length) continue;
    if (isSameCardIdentity(subject, candidate)) {
      exact.push(...sales);
      continue;
    }
    if (similarRelation(subject, candidate)) cousins.push(candidate);
  }

  const sales = dedupeSales(exact);
  const similar =
    sales.length >= NORMAL_ESTIMATE_MIN_SALES ? null : pickSimilarOffer(subject, cousins);
  return { sales, similar };
}

function dedupeSales(sales: CardValueSale[]): CardValueSale[] {
  const seen = new Set<string>();
  const out: CardValueSale[] = [];
  for (const sale of sales) {
    const day = (sale.soldAt ?? "").slice(0, 10);
    const key = `${sale.price}|${day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ price: sale.price, soldAt: sale.soldAt ?? null });
  }
  return out;
}

/**
 * Comps for one card, cached by card identity.
 * Throws on a failed read so Next does not cache the error.
 */
export function loadCachedPriceContext(card: SoldCompCard): Promise<PriceContext> {
  const key = compsResultCacheKey(card);
  return unstable_cache(
    async () => {
      try {
        return await readPriceContext(card);
      } catch (err) {
        throw new CompsResultError(err instanceof Error ? err.message : "comps unavailable");
      }
    },
    ["comps-result", key],
    { revalidate: COMPS_RESULT_REVALIDATE_SECONDS, tags: [cardCacheTag(card.id)] },
  )();
}

function needsContext(value: CardValueResult | undefined): value is CardValueResult {
  if (!value) return false;
  if (value.status === "unavailable" || value.status === "stale" || value.status === "sample") {
    return false;
  }
  if (
    value.status === "ok" &&
    value.nSales >= NORMAL_ESTIMATE_MIN_SALES &&
    value.median != null
  ) {
    return false;
  }
  return true;
}

async function loadCompCards(ids: string[]): Promise<SoldCompCard[]> {
  const client = createSupabaseAdmin();
  if (!client) throw new CompsResultError("comps unavailable");
  const { data, error } = await client.from("cards").select("*").in("id", ids);
  if (error) throw new CompsResultError(error.message);
  return (data ?? []).map((row) => soldCompCardFromRow(mapCardRow(row as CardRow)));
}

/** Attach exact sales and a similar-card offer. A failed read leaves the value unchanged. */
export async function attachPriceContext(
  ids: string[],
  values: Map<string, CardValueResult>,
): Promise<Map<string, CardValueResult>> {
  const needs = ids.filter((id) => needsContext(values.get(id)));
  if (!needs.length) return values;

  let cards: SoldCompCard[];
  try {
    cards = await loadCompCards(needs);
  } catch (err) {
    console.warn(
      "[price-context]",
      err instanceof Error ? err.message : "comps unavailable",
    );
    return values;
  }

  const next = new Map(values);
  await Promise.all(
    cards.map(async (card) => {
      const value = next.get(card.id);
      if (!needsContext(value)) return;
      try {
        const context = await loadCachedPriceContext(card);
        next.set(card.id, {
          ...value,
          sales: context.sales,
          similar: context.similar,
        });
      } catch (err) {
        console.warn(
          "[price-context]",
          err instanceof Error ? err.message : "comps unavailable",
        );
      }
    }),
  );
  return next;
}
