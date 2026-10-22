import "server-only";

import { unstable_cache } from "next/cache";
import { formatGrade, parseGrade } from "@/lib/card-options";
import {
  COMPS_RESULT_REVALIDATE_SECONDS,
  CompsResultError,
  compsResultCacheKey,
  compsResultCacheTag,
} from "@/lib/comps/comps-result-cache";
import { soldCompCardFromRow } from "@/lib/comps/load-card";
import { publicCardQueryKey } from "@/lib/comps/public";
import { buildQueryKey } from "@/lib/comps/query-key";
import { escapeIlike } from "@/lib/db/escape-ilike";
import { mapCardRow, type CardRow } from "@/lib/social/cards";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/value/card-value-access";
import { cardCacheTag } from "@/lib/value/card-cache";
import {
  fallbackSales,
  mergeExactSales,
  readNewestBatches,
  type FallbackSale,
} from "@/lib/value/price-batch";
import {
  isSameCardIdentity,
  NORMAL_ESTIMATE_MIN_SALES,
  pickSimilarOffer,
  similarRelation,
  type SimilarCandidate,
} from "@/lib/value/price-fallback";
import type { CardValueResult, CardValueSale, CardValueSimilar } from "@/lib/value/types";
import type { SoldCompCard } from "@/lib/comps/types";

/** How many cards get a comps read at once. */
export const PRICE_CONTEXT_CONCURRENCY = 4;

export type PriceContext = {
  sales: CardValueSale[];
  cousins: SimilarCandidate[];
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

const PUBLIC_COLUMNS =
  "id, user_id, player, year, year_label, set, set_name, grade, grader, parallel, card_number, serial_run, is_auto, is_relic, condition_type, grade_qualifier";

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

function soldCardFromPublic(row: PublicRow): SoldCompCard {
  const year = Number(row.year) || 0;
  const serial =
    row.serial_run == null || row.serial_run === "" ? null : Number(row.serial_run);
  const condition =
    row.condition_type === "graded" || row.condition_type === "raw"
      ? row.condition_type
      : undefined;
  return {
    id: row.id,
    playerName: (row.player ?? "").trim(),
    year,
    yearLabel: (row.year_label ?? "").trim() || String(year || ""),
    setBrand: (row.set_name || row.set || "").trim(),
    cardNumber: row.card_number || undefined,
    parallel: row.parallel || undefined,
    grade: displayGrade(row) || undefined,
    serialRun: serial != null && Number.isFinite(serial) ? serial : null,
    isAuto: Boolean(row.is_auto),
    isRelic: Boolean(row.is_relic),
    conditionType: condition,
    gradeQualifier: row.grade_qualifier || null,
  };
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

/** This card and any identical public copy. Their batches are read outside the shared cap. */
function exactCompQueryKeys(card: SoldCompCard, related: readonly PublicRow[]): string[] {
  const keys = new Set<string>([buildQueryKey(card)]);
  for (const row of related) {
    if (!row.id || row.id === card.id) continue;
    if (isSameCardIdentity(card, soldCardFromPublic(row))) {
      keys.add(publicCardQueryKey(row));
    }
  }
  return [...keys];
}

async function flagsForCards(
  client: Admin,
  pairs: readonly { cardId: string; ownerId: string }[],
): Promise<Map<string, Set<string>>> {
  const ids = [...new Set(pairs.map((pair) => pair.cardId).filter(Boolean))];
  const out = new Map<string, Set<string>>();
  if (!ids.length) return out;
  const { data, error } = await client
    .from("comp_flags")
    .select("card_id, user_id, item_id")
    .in("card_id", ids);
  if (error) throw new CompsResultError(error.message);
  const wanted = new Set(pairs.map((pair) => `${pair.cardId}|${pair.ownerId}`));
  for (const row of data ?? []) {
    const cardId = String((row as { card_id?: string }).card_id ?? "");
    const userId = String((row as { user_id?: string }).user_id ?? "");
    const itemId = String((row as { item_id?: string }).item_id ?? "");
    const key = `${cardId}|${userId}`;
    if (!wanted.has(key) || !itemId) continue;
    const set = out.get(key) ?? new Set<string>();
    set.add(itemId);
    out.set(key, set);
  }
  return out;
}

function candidateFromRow(row: PublicRow, username: string, sales: CardValueSale[]): SimilarCandidate {
  const card = soldCardFromPublic(row);
  return {
    id: card.id,
    username,
    ownerId: String(row.user_id ?? ""),
    playerName: card.playerName,
    year: card.year,
    yearLabel: card.yearLabel,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber,
    parallel: card.parallel,
    grade: card.grade,
    sales,
  };
}

export async function readPriceContext(
  card: SoldCompCard,
  ownerId: string,
  db?: { from(table: string): unknown },
): Promise<PriceContext> {
  const client = (db ?? createSupabaseAdmin()) as Admin | null;
  if (!client || !ownerId) throw new CompsResultError("comps unavailable");

  const player = card.playerName.trim();
  const ownKey = buildQueryKey(card);
  const related: PublicRow[] = [];

  if (player) {
    let query = client
      .from("public_cards")
      .select(PUBLIC_COLUMNS)
      .ilike("player", escapeIlike(player));
    if (card.year > 0) {
      query = query.gte("year", card.year - 1).lte("year", card.year + 1);
    }
    const { data, error } = await query
      .order("year", { ascending: true })
      .order("id", { ascending: true })
      .limit(60);
    if (error) throw new CompsResultError(error.message);
    related.push(...((data ?? []) as PublicRow[]));
  }

  const exactKeys = exactCompQueryKeys(card, related);
  const keys = new Set<string>(exactKeys);
  for (const row of related) {
    if (row.id) keys.add(publicCardQueryKey(row));
  }
  const batches = await readNewestBatches(client, [...keys], exactKeys);

  const flagPairs = [{ cardId: card.id, ownerId }];
  for (const row of related) {
    const copyOwner = String(row.user_id ?? "");
    if (row.id && copyOwner) flagPairs.push({ cardId: row.id, ownerId: copyOwner });
  }
  const flags = await flagsForCards(client, flagPairs);
  const flagged = (cardId: string, userId: string) => flags.get(`${cardId}|${userId}`) ?? new Set<string>();
  const subjectFlags = flagged(card.id, ownerId);

  const exactGroups: FallbackSale[][] = [
    fallbackSales(card, batches.get(ownKey) ?? [], subjectFlags),
  ];

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

  const cousins: SimilarCandidate[] = [];
  for (const row of related) {
    if (!row.id || row.id === card.id) continue;
    const copyOwner = String(row.user_id ?? "");
    if (!copyOwner) continue;
    const copy = soldCardFromPublic(row);
    const sales = fallbackSales(
      copy,
      batches.get(publicCardQueryKey(row)) ?? [],
      flagged(row.id, copyOwner),
    );
    if (!sales.length) continue;
    const username = usernames.get(copyOwner) ?? "";
    const candidate = candidateFromRow(
      row,
      username,
      sales.map((sale) => ({ price: sale.price, soldAt: sale.soldAt ?? null })),
    );
    if (isSameCardIdentity(card, candidate)) {
      exactGroups.push(sales);
      continue;
    }
    if (similarRelation(card, candidate)) cousins.push(candidate);
  }

  const exact = mergeExactSales(subjectFlags, exactGroups);
  return {
    sales: exact,
    cousins: exact.length >= NORMAL_ESTIMATE_MIN_SALES ? [] : cousins,
  };
}

/**
 * Comps for one card, cached by card identity.
 * Throws on a failed read so Next does not cache the error.
 */
export function loadCachedPriceContext(card: SoldCompCard, ownerId: string): Promise<PriceContext> {
  const key = compsResultCacheKey(card);
  return unstable_cache(
    async () => {
      try {
        return await readPriceContext(card, ownerId);
      } catch (err) {
        throw new CompsResultError(err instanceof Error ? err.message : "comps unavailable");
      }
    },
    ["comps-result", key],
    {
      revalidate: COMPS_RESULT_REVALIDATE_SECONDS,
      tags: [cardCacheTag(card.id), compsResultCacheTag(card.id)],
    },
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
    value.median != null &&
    value.median >= 0.01
  ) {
    return false;
  }
  return true;
}

async function loadCompCards(ids: string[]): Promise<Array<{ card: SoldCompCard; ownerId: string }>> {
  const client = createSupabaseAdmin();
  if (!client) throw new CompsResultError("comps unavailable");
  const { data, error } = await client.from("cards").select("*").in("id", ids);
  if (error) throw new CompsResultError(error.message);
  return (data ?? []).map((row) => {
    const mapped = row as CardRow;
    return {
      card: soldCompCardFromRow(mapCardRow(mapped)),
      ownerId: mapped.user_id ?? "",
    };
  });
}

/** Null when the block read fails, so similar cards stay hidden. */
async function blockedOwnerIds(viewerId: string): Promise<Set<string> | null> {
  if (!isUuid(viewerId)) return new Set();
  const client = createSupabaseAdmin();
  if (!client) return null;
  const { data, error } = await client
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`);
  if (error) return null;
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const blocker = String((row as { blocker_id?: string }).blocker_id ?? "");
    const blocked = String((row as { blocked_id?: string }).blocked_id ?? "");
    if (blocker === viewerId && blocked) ids.add(blocked);
    if (blocked === viewerId && blocker) ids.add(blocker);
  }
  return ids;
}

/** A public card row already in hand. Skips the cards-table read inside attach. */
export function knownPriceCard(row: PublicRow): { card: SoldCompCard; ownerId: string } | null {
  const ownerId = String(row.user_id ?? "");
  if (!row.id || !ownerId) return null;
  return { card: soldCardFromPublic(row), ownerId };
}

/** Attach exact sales and a similar-card offer. A failed read leaves the value unchanged. */
export async function attachPriceContext(
  ids: string[],
  values: Map<string, CardValueResult>,
  viewerId?: string | null,
  knownCards?: readonly { card: SoldCompCard; ownerId: string }[],
): Promise<Map<string, CardValueResult>> {
  const needs = ids.filter((id) => needsContext(values.get(id)));
  if (!needs.length) return values;

  let cards: Array<{ card: SoldCompCard; ownerId: string }>;
  if (knownCards) {
    const byId = new Map(knownCards.map((item) => [item.card.id, item]));
    cards = needs.flatMap((id) => {
      const known = byId.get(id);
      return known ? [known] : [];
    });
  } else {
    try {
      cards = await loadCompCards(needs);
    } catch (err) {
      console.warn(
        "[price-context]",
        err instanceof Error ? err.message : "comps unavailable",
      );
      return values;
    }
  }

  const blocked = viewerId ? await blockedOwnerIds(viewerId) : new Set<string>();
  const next = new Map(values);
  await mapLimit(cards, PRICE_CONTEXT_CONCURRENCY, async ({ card, ownerId }) => {
    const value = next.get(card.id);
    if (!needsContext(value) || !ownerId) return;
    try {
      const context = await loadCachedPriceContext(card, ownerId);
      const cousins =
        blocked == null
          ? []
          : context.cousins.filter((cousin) => cousin.ownerId && !blocked.has(cousin.ownerId));
      const similar: CardValueSimilar | null = cousins.length
        ? pickSimilarOffer(card, cousins)
        : null;
      next.set(card.id, {
        ...value,
        sales: context.sales,
        similar,
      });
    } catch (err) {
      console.warn(
        "[price-context]",
        err instanceof Error ? err.message : "comps unavailable",
      );
    }
  });
  return next;
}
