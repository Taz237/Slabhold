import "server-only";

import { readLatestSoldComps } from "@/lib/comps/cache";
import { buildQueryKey } from "@/lib/comps/query-key";
import type { SoldCompCard } from "@/lib/comps/types";
import { cardIdentityKey } from "@/lib/social/card-identity";
import { mapCardRow, type CardRow } from "@/lib/social/cards";
import type { SportsCard } from "@/lib/types";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCardValues } from "@/lib/value/getCardValue";
import type { CardValueResult } from "@/lib/value/types";
import {
  summarizeWants,
  visibleCardIdForWant,
  type WantCardRef,
  type WantSummaryInput,
  type WantSummaryView,
} from "./summary-pick";

export type WantSummary = WantSummaryView;

type LoadedCard = {
  ref: WantCardRef;
  sold: SoldCompCard;
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

function asCardRow(row: CardRow): CardRow {
  return {
    ...row,
    paid_price: row.paid_price ?? null,
    estimated_value: row.estimated_value ?? null,
    image_url: row.image_url ?? null,
    purchase_date: row.purchase_date ?? null,
    sell_price: row.sell_price ?? null,
    sell_date: row.sell_date ?? null,
    notes: row.notes ?? "",
    cert_number: row.cert_number ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

function loadCard(row: CardRow): LoadedCard {
  const card = mapCardRow(asCardRow(row));
  return {
    ref: {
      id: row.id,
      userId: row.user_id,
      isPublic: Boolean(row.is_public),
      cardKey: cardIdentityKey(card),
    },
    sold: toSold(card),
  };
}

function latestPrice(sales: { price: number; soldAt: string }[]): number | null {
  let best: { price: number; soldAt: string } | null = null;
  for (const sale of sales) {
    if (!sale.soldAt || !Number.isFinite(sale.price)) continue;
    if (!best || sale.soldAt > best.soldAt) best = sale;
  }
  return best ? best.price : null;
}

function remember(cards: Map<string, LoadedCard>, row: CardRow) {
  const loaded = loadCard(row);
  const prev = cards.get(loaded.ref.id);
  if (!prev || loaded.ref.isPublic) cards.set(loaded.ref.id, loaded);
}

type RowQuery = PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function rowsOrThrow(query: RowQuery): Promise<CardRow[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as CardRow[];
}

/** The signed-in user's wants with current value and a deal flag. No Trawl. */
export async function listWantSummaries(userId: string): Promise<WantSummary[]> {
  const admin = createSupabaseAdmin();
  if (!admin || !userId) return [];

  const { data, error } = await admin
    .from("want_list")
    .select("id, label, target_price, card_key, source_card_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const wants: WantSummaryInput[] = (data ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    cardKey: row.card_key as string,
    sourceCardId: (row.source_card_id as string | null) ?? null,
    targetPrice: row.target_price == null ? null : Number(row.target_price),
  }));
  if (wants.length === 0) return [];

  const cards = new Map<string, LoadedCard>();
  const sourceIds = [
    ...new Set(wants.map((want) => want.sourceCardId).filter((id): id is string => Boolean(id))),
  ];
  const [ownRows, sourceRows] = await Promise.all([
    rowsOrThrow(admin.from("cards").select("*").eq("user_id", userId)),
    sourceIds.length > 0
      ? rowsOrThrow(admin.from("public_cards").select("*").in("id", sourceIds))
      : Promise.resolve([] as CardRow[]),
  ]);
  for (const row of ownRows) remember(cards, row);
  for (const row of sourceRows) remember(cards, row);

  const refs = () => [...cards.values()].map((card) => card.ref);
  const unresolvedPlayers = new Set<string>();
  for (const want of wants) {
    if (visibleCardIdForWant(want, userId, refs())) continue;
    const player = want.cardKey.split("|")[0]?.trim();
    if (player) unresolvedPlayers.add(player);
  }

  const playerLists = await Promise.all(
    [...unresolvedPlayers].map((player) =>
      rowsOrThrow(admin.from("public_cards").select("*").ilike("player", player)),
    ),
  );
  for (const rows of playerLists) {
    for (const row of rows) remember(cards, row);
  }

  const visibleRefs = refs();
  const chosenIds = [
    ...new Set(
      wants
        .map((want) => visibleCardIdForWant(want, userId, visibleRefs))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [values, latestPriceByCardId] = await Promise.all([
    chosenIds.length ? getCardValues(chosenIds) : Promise.resolve(new Map<string, CardValueResult>()),
    latestPricesFor(chosenIds, cards),
  ]);

  return summarizeWants(userId, wants, visibleRefs, values, latestPriceByCardId);
}

async function latestPricesFor(
  chosenIds: string[],
  cards: Map<string, LoadedCard>,
): Promise<Map<string, number | null>> {
  const queryKeyByCardId = new Map<string, string>();
  const uniqueKeys = new Set<string>();
  for (const id of chosenIds) {
    const loaded = cards.get(id);
    if (!loaded) continue;
    const queryKey = buildQueryKey(loaded.sold);
    queryKeyByCardId.set(id, queryKey);
    uniqueKeys.add(queryKey);
  }

  const priceByQuery = new Map<string, number | null>();
  await Promise.all(
    [...uniqueKeys].map(async (queryKey) => {
      const sales = await readLatestSoldComps(queryKey);
      priceByQuery.set(queryKey, latestPrice(sales));
    }),
  );

  const latestPriceByCardId = new Map<string, number | null>();
  for (const [id, queryKey] of queryKeyByCardId) {
    latestPriceByCardId.set(id, priceByQuery.get(queryKey) ?? null);
  }
  return latestPriceByCardId;
}
