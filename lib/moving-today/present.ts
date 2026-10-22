import { cleanImageUrl } from "@/lib/social/link-preview";
import { centsToDollars } from "@/lib/comps/stats";
import { money } from "@/lib/format";
import {
  addCalendarDays,
  dropOwnerFlaggedSales,
  formatMovePercent,
  formatSaleDate,
  MOVING_THIS_WEEK_TITLE,
  MOVING_TODAY_MIN_DAY_ROWS,
  MOVING_TODAY_MIN_LEAD_CENTS,
  MOVING_TODAY_MIN_WEEK_ROWS,
  MOVING_TODAY_WEEK_DAYS,
  bestRowPerCard,
  capNotableSales,
  movingDayHeading,
  orderedNotableSales,
  publicCardHref,
  toSaleRecord,
  weekDateLabel,
  type NotableSale,
  type SaleRecord,
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

type ShowContext = {
  cards: Map<string, PublicCardRef>;
  handles: Map<string, string>;
  alternates: readonly { queryKey: string; cardId: string }[];
  owners: readonly { id: string; userId: string }[];
  flags: readonly { cardId: string; userId: string; itemId: string }[];
};

function projectSales(ranked: readonly NotableSale[], context: ShowContext): MovingTodaySale[] {
  const shown: MovingTodaySale[] = [];
  for (const sale of ranked) {
    const card = pickCard(sale, context.cards, context.alternates);
    if (!card) continue;
    if (
      dropOwnerFlaggedSales([{ cardId: card.id, itemId: sale.itemId }], context.owners, context.flags)
        .length === 0
    ) {
      continue;
    }
    const href = publicCardHref(context.handles.get(card.userId) ?? "", card.id);
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
  return bestRowPerCard(shown);
}

function rowsFor(
  sales: readonly SaleRecord[],
  history: readonly SaleRecord[],
  from: string,
  to: string,
  minimum: number,
  context: ShowContext,
): MovingTodaySale[] {
  const show = (pool: readonly SaleRecord[]) =>
    capNotableSales(
      projectSales(orderedNotableSales({ today: to, from, to, sales: pool, history }), context),
    );
  const lead = sales.filter((sale) => sale.priceCents >= MOVING_TODAY_MIN_LEAD_CENTS);
  const leadRows = show(lead);
  if (leadRows.length >= minimum) return leadRows;
  return show(sales);
}

/** Rank the window's sales and keep the ones that open a public card page. */
export function assembleMovingToday(input: {
  today: string;
  asOf?: string;
  sales: readonly RawCompSale[];
  history: readonly RawCompSale[];
  cards: readonly PublicCardRef[];
  profiles: readonly ProfileRef[];
  alternates: readonly { queryKey: string; cardId: string }[];
  owners?: readonly { id: string; userId: string }[];
  flags?: readonly { cardId: string; userId: string; itemId: string }[];
}): MovingTodayPayload {
  const owners = [...(input.owners ?? [])];
  const seenOwners = new Set(owners.map((owner) => owner.id));
  for (const card of input.cards) {
    if (seenOwners.has(card.id)) continue;
    owners.push({ id: card.id, userId: card.userId });
    seenOwners.add(card.id);
  }
  const flags = input.flags ?? [];
  const sales = dropOwnerFlaggedSales(input.sales, owners, flags)
    .map((sale) => toSaleRecord(sale))
    .filter((sale): sale is NonNullable<typeof sale> => sale != null);
  const history = dropOwnerFlaggedSales(input.history, owners, flags)
    .map((sale) => toSaleRecord(sale))
    .filter((sale): sale is NonNullable<typeof sale> => sale != null);
  const asOf = input.asOf ?? input.today;
  const context: ShowContext = {
    cards: new Map(input.cards.map((card) => [card.id, card])),
    handles: new Map(input.profiles.map((profile) => [profile.id, profile.username])),
    alternates: input.alternates,
    owners,
    flags,
  };
  const weekStart = addCalendarDays(asOf, -(MOVING_TODAY_WEEK_DAYS - 1));
  const yesterday = addCalendarDays(asOf, -1);
  const inWeek = sales.filter((sale) => sale.soldOn >= weekStart && sale.soldOn <= asOf);
  const days = [...new Set(inWeek.map((sale) => sale.soldOn))].sort();

  for (let index = days.length - 1; index >= 0; index -= 1) {
    const day = days[index] ?? "";
    const dayRows = rowsFor(
      inWeek.filter((sale) => sale.soldOn === day),
      history,
      day,
      day,
      MOVING_TODAY_MIN_DAY_ROWS,
      context,
    );
    if (dayRows.length === 0) continue;
    if ((day === asOf || day === yesterday) && dayRows.length >= MOVING_TODAY_MIN_DAY_ROWS) {
      return {
        ...emptyMovingToday(day),
        title: movingDayHeading(day, asOf),
        dateLabel: formatSaleDate(day),
        sales: dayRows,
        window: "day",
      };
    }
    break;
  }

  const weekRows = rowsFor(inWeek, history, weekStart, asOf, MOVING_TODAY_MIN_WEEK_ROWS, context);
  if (weekRows.length >= MOVING_TODAY_MIN_WEEK_ROWS) {
    return {
      ...emptyMovingToday(asOf),
      title: MOVING_THIS_WEEK_TITLE,
      dateLabel: weekDateLabel(asOf),
      sales: weekRows,
      window: "week",
    };
  }
  return { ...emptyMovingToday(asOf), dateLabel: "" };
}
