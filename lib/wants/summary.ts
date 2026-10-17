import "server-only";

import { readLatestSoldComps } from "@/lib/comps/cache";
import { buildQueryKey } from "@/lib/comps/query-key";
import type { SoldCompCard } from "@/lib/comps/types";
import { mapCardRow, type CardRow } from "@/lib/social/cards";
import type { SportsCard } from "@/lib/types";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCardValues } from "@/lib/value/getCardValue";
import type { CardValueResult } from "@/lib/value/types";

export type WantSummary = {
  id: string;
  label: string;
  targetPrice: number | null;
  value: CardValueResult | null;
  deal: boolean;
};

function toSold(card: SportsCard): SoldCompCard {
  return {
    id: card.id,
    playerName: card.playerName,
    year: card.year,
    yearLabel: card.yearLabel,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber || undefined,
    grade: card.grade || undefined,
    parallel: card.parallel || undefined,
    serialRun: card.serialRun,
    isAuto: card.isAuto,
    isRelic: card.isRelic,
    conditionType: card.conditionType,
    gradeQualifier: card.gradeQualifier || null,
  };
}

function latestPrice(
  sales: { price: number; soldAt: string }[],
): number | null {
  let best: { price: number; soldAt: string } | null = null;
  for (const sale of sales) {
    if (!sale.soldAt || !Number.isFinite(sale.price)) continue;
    if (!best || sale.soldAt > best.soldAt) best = sale;
  }
  return best ? best.price : null;
}

/** The signed-in user's wants with current value and a deal flag. No Trawl. */
export async function listWantSummaries(userId: string): Promise<WantSummary[]> {
  const admin = createSupabaseAdmin();
  if (!admin || !userId) return [];

  const { data, error } = await admin
    .from("want_list")
    .select("id, label, target_price, source_card_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const wants = data ?? [];
  const sourceIds = [
    ...new Set(
      wants
        .map((row) => row.source_card_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const values = sourceIds.length ? await getCardValues(sourceIds) : new Map();

  const cardsById = new Map<string, SportsCard>();
  if (sourceIds.length) {
    const { data: cards, error: cardsError } = await admin
      .from("cards")
      .select("*")
      .in("id", sourceIds);
    if (cardsError) throw new Error(cardsError.message);
    for (const row of (cards ?? []) as CardRow[]) {
      cardsById.set(row.id, mapCardRow(row));
    }
  }

  const priceByQuery = new Map<string, number | null>();
  for (const card of cardsById.values()) {
    const queryKey = buildQueryKey(toSold(card));
    if (priceByQuery.has(queryKey)) continue;
    const sales = await readLatestSoldComps(queryKey);
    priceByQuery.set(queryKey, latestPrice(sales));
  }

  return wants.map((row) => {
    const sourceId = (row.source_card_id as string | null) ?? null;
    const card = sourceId ? cardsById.get(sourceId) : undefined;
    const latest = card ? priceByQuery.get(buildQueryKey(toSold(card))) ?? null : null;
    const target = row.target_price == null ? null : Number(row.target_price);
    return {
      id: row.id as string,
      label: row.label as string,
      targetPrice: target != null && Number.isFinite(target) ? target : null,
      value: sourceId ? values.get(sourceId) ?? null : null,
      deal: target != null && latest != null && latest <= target,
    };
  });
}
