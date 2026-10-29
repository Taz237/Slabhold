import { cleanImageUrl } from "@/lib/social/link-preview";
import { centsToDollars } from "@/lib/comps/stats";
import { money } from "@/lib/format";
import {
  addCalendarDays,
  dropOwnerFlaggedSales,
  formatMovePercent,
  formatSaleDate,
  MOVING_THIS_WEEK_TITLE,
  MOVING_TODAY_MIN_DAY_MOVERS,
  MOVING_TODAY_MIN_LEAD_CENTS,
  MOVING_TODAY_MIN_WEEK_MOVERS,
  MOVING_TODAY_WEEK_DAYS,
  orderedNotableSales,
  rankMovers,
  publicCardHref,
  toSaleRecord,
  weekDateLabel,
  type NotableSale,
  type SaleRecord,
} from "./rank";
import {
  emptyMovingToday,
  MOVING_TODAY_TITLE,
  type MovingTodayPayload,
  type MovingTodaySale,
} from "./types";

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
  /** "PSA 10": grader and grade together. */
  grade: string;
  imageUrl: string | null;
  accent: string;
  grader?: string;
  conditionType?: "raw" | "graded" | null;
  isRookie?: boolean;
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
      yearLabel: card.yearLabel,
      setBrand: card.setName,
      grade: card.grade,
      grader: card.grader ?? "",
      conditionType: card.conditionType ?? null,
      isRookie: card.isRookie ?? false,
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
  return shown;
}

/** Movers from the $5+ sales when they reach the minimum, else from every sale. */
function moversFor(
  sales: readonly SaleRecord[],
  history: readonly SaleRecord[],
  from: string,
  to: string,
  minimum: number,
  context: ShowContext,
): MovingTodaySale[] {
  const show = (pool: readonly SaleRecord[]) =>
    rankMovers(
      projectSales(orderedNotableSales({ today: to, from, to, sales: pool, history }), context),
    );
  const lead = sales.filter((sale) => sale.priceCents >= MOVING_TODAY_MIN_LEAD_CENTS);
  const leadRows = show(lead);
  if (leadRows.length >= minimum) return leadRows;
  return show(sales);
}

/**
 * Movers for the window: every public card with a real percent, biggest move
 * first. "Moving today" needs MOVING_TODAY_MIN_DAY_MOVERS from today's comps.
 * Otherwise the week, which hides below MOVING_TODAY_MIN_WEEK_MOVERS.
 */
export function assembleMovingToday(input: {
  today: string;
  asOf?: string;
  /** ISO time of the read. */
  updatedAt?: string;
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
  const updatedAt = input.updatedAt ? { updatedAt: input.updatedAt } : {};
  const context: ShowContext = {
    cards: new Map(input.cards.map((card) => [card.id, card])),
    handles: new Map(input.profiles.map((profile) => [profile.id, profile.username])),
    alternates: input.alternates,
    owners,
    flags,
  };
  const weekStart = addCalendarDays(asOf, -(MOVING_TODAY_WEEK_DAYS - 1));
  const inWeek = sales.filter((sale) => sale.soldOn >= weekStart && sale.soldOn <= asOf);

  const dayRows = moversFor(
    inWeek.filter((sale) => sale.soldOn === asOf),
    history,
    asOf,
    asOf,
    MOVING_TODAY_MIN_DAY_MOVERS,
    context,
  );
  if (dayRows.length >= MOVING_TODAY_MIN_DAY_MOVERS) {
    return {
      ...emptyMovingToday(asOf),
      title: MOVING_TODAY_TITLE,
      dateLabel: formatSaleDate(asOf),
      sales: dayRows,
      window: "day",
      ...updatedAt,
    };
  }

  const weekRows = moversFor(inWeek, history, weekStart, asOf, MOVING_TODAY_MIN_WEEK_MOVERS, context);
  if (weekRows.length >= MOVING_TODAY_MIN_WEEK_MOVERS) {
    return {
      ...emptyMovingToday(asOf),
      title: MOVING_THIS_WEEK_TITLE,
      dateLabel: weekDateLabel(asOf),
      sales: weekRows,
      window: "week",
      ...updatedAt,
    };
  }
  return { ...emptyMovingToday(asOf), ...updatedAt };
}
