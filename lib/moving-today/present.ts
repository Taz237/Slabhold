import { cleanImageUrl } from "@/lib/social/link-preview";
import { centsToDollars } from "@/lib/comps/stats";
import { money } from "@/lib/format";
import {
  formatMovePercent,
  formatSaleDate,
  publicCardHref,
  rankNotableSales,
  toSaleRecord,
  type NotableSale,
} from "./rank";
import { emptyMovingToday, type MovingTodayPayload, type MovingTodaySale } from "./types";

export type RawCompSale = {
  queryKey: string;
  cardId: string;
  itemId: string;
  price: number;
  soldAt: string;
};

export type PublicCardRef = {
  id: string;
  userId: string;
  player: string;
  yearLabel: string;
  setName: string;
  grade: string;
  imageUrl: string | null;
  accent: string;
};

export type ProfileRef = {
  id: string;
  username: string;
};

export function cardDetailLine(input: {
  yearLabel: string;
  setName: string;
  grade: string;
}): string {
  return [input.yearLabel, input.setName, input.grade]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
}

function pickCard(
  sale: NotableSale,
  cards: Map<string, PublicCardRef>,
  alternates: readonly { queryKey: string; cardId: string }[],
): PublicCardRef | null {
  const preferred = cards.get(sale.cardId);
  if (preferred) return preferred;
  const ids = alternates
    .filter((row) => row.queryKey === sale.queryKey)
    .map((row) => row.cardId)
    .sort();
  for (const id of ids) {
    const card = cards.get(id);
    if (card) return card;
  }
  return null;
}

/** Rank today's sales and keep the ones that open a public card page. */
export function assembleMovingToday(input: {
  today: string;
  sales: readonly RawCompSale[];
  history: readonly RawCompSale[];
  cards: readonly PublicCardRef[];
  profiles: readonly ProfileRef[];
  alternates: readonly { queryKey: string; cardId: string }[];
}): MovingTodayPayload {
  const sales = input.sales
    .map((sale) => toSaleRecord(sale))
    .filter((sale): sale is NonNullable<typeof sale> => sale != null);
  const history = input.history
    .map((sale) => toSaleRecord(sale))
    .filter((sale): sale is NonNullable<typeof sale> => sale != null);
  const ranked = rankNotableSales({ today: input.today, sales, history });
  const cards = new Map(input.cards.map((card) => [card.id, card]));
  const handles = new Map(
    input.profiles.map((profile) => [profile.id, profile.username]),
  );

  const shown: MovingTodaySale[] = [];
  for (const sale of ranked) {
    const card = pickCard(sale, cards, input.alternates);
    if (!card) continue;
    const href = publicCardHref(handles.get(card.userId) ?? "", card.id);
    if (!href) continue;
    shown.push({
      cardId: card.id,
      href,
      player: card.player.trim() || "Card",
      detail: cardDetailLine(card),
      imageUrl: cleanImageUrl(card.imageUrl),
      accent: card.accent || "#7c5cff",
      priceCents: sale.priceCents,
      priceLabel: money(centsToDollars(sale.priceCents)),
      soldOn: sale.soldOn,
      soldLabel: formatSaleDate(sale.soldOn),
      percent: sale.percent,
      percentLabel: formatMovePercent(sale.percent),
    });
  }

  return {
    ...emptyMovingToday(input.today),
    dateLabel: formatSaleDate(input.today),
    sales: shown,
  };
}
