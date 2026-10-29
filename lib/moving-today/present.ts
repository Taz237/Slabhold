import { cleanImageUrl } from "@/lib/social/link-preview";
import { centsToDollars, dollarsToCents } from "@/lib/comps/stats";
import { money } from "@/lib/format";
import {
  addCalendarDays,
  buildMovingPayload,
  dropOwnerFlaggedSales,
  formatMovePercent,
  formatSaleDate,
  MOVING_FRESH_DAYS,
  MOVING_FULL_ROW,
  MOVING_MONTH_DAYS,
  MOVING_STRIP_MODE,
  MOVING_TODAY_MIN_LEAD_CENTS,
  MOVING_TODAY_WEEK_DAYS,
  newestFirst,
  orderedNotableSales,
  pickMoverWindow,
  rankMovers,
  publicCardHref,
  toSaleRecord,
  type MoverWindow,
  type MovingStripMode,
  type NotableSale,
  type SaleRecord,
} from "./rank";
import { normalizeSport } from "./sport";
import type { MovingTodayPayload, MovingTodaySale } from "./types";

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
  sport?: string | null;
  /** public_cards.created_at. */
  createdAt?: string | null;
  /** public_cards.estimated_value, in dollars. */
  estimatedValue?: number | null;
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
  sale: Pick<SaleRecord, "cardId" | "queryKey">,
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

/** Added on or after the first of the last MOVING_FRESH_DAYS dates. */
function addedRecently(createdAt: string | null | undefined, asOf: string): boolean {
  const date = createdAt ? createdAt.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return date >= addCalendarDays(asOf, -(MOVING_FRESH_DAYS - 1));
}

type TileBase = Omit<
  MovingTodaySale,
  "kind" | "priceCents" | "priceLabel" | "soldOn" | "soldLabel" | "percent" | "percentLabel"
>;

function tileBase(card: PublicCardRef, href: string, asOf: string): TileBase {
  return {
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
    sport: normalizeSport(card.sport),
    ...(card.createdAt ? { addedAt: card.createdAt } : {}),
    isNew: addedRecently(card.createdAt, asOf),
  };
}

/** The public card a sale opens, unless the owner flagged that sale. */
function showCardFor(
  sale: Pick<SaleRecord, "cardId" | "queryKey" | "itemId">,
  context: ShowContext,
): { card: PublicCardRef; href: string } | null {
  const card = pickCard(sale, context.cards, context.alternates);
  if (!card) return null;
  if (
    dropOwnerFlaggedSales([{ cardId: card.id, itemId: sale.itemId }], context.owners, context.flags)
      .length === 0
  ) {
    return null;
  }
  const href = publicCardHref(context.handles.get(card.userId) ?? "", card.id);
  return href ? { card, href } : null;
}

function projectSales(
  ranked: readonly NotableSale[],
  context: ShowContext,
  asOf: string,
): MovingTodaySale[] {
  const shown: MovingTodaySale[] = [];
  for (const sale of ranked) {
    const target = showCardFor(sale, context);
    if (!target) continue;
    shown.push({
      kind: "mover",
      ...tileBase(target.card, target.href, asOf),
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

/** The newest shown sale per public card, for a card tile's price line. */
function latestSaleByCard(
  sales: readonly SaleRecord[],
  context: ShowContext,
): Map<string, SaleRecord> {
  const latest = new Map<string, SaleRecord>();
  const ordered = [...sales].sort(
    (a, b) => b.soldOn.localeCompare(a.soldOn) || b.priceCents - a.priceCents,
  );
  for (const sale of ordered) {
    const target = showCardFor(sale, context);
    if (target && !latest.has(target.card.id)) latest.set(target.card.id, sale);
  }
  return latest;
}

/** Every other public card as a plain tile, newest first. Never a percent. */
function cardTiles(
  pool: readonly PublicCardRef[],
  skip: ReadonlySet<string>,
  latest: ReadonlyMap<string, SaleRecord>,
  context: ShowContext,
  asOf: string,
): MovingTodaySale[] {
  const seen = new Set(skip);
  const tiles: MovingTodaySale[] = [];
  for (const card of pool) {
    if (!card.id || seen.has(card.id)) continue;
    seen.add(card.id);
    const href = publicCardHref(context.handles.get(card.userId) ?? "", card.id);
    if (!href) continue;
    const sale = latest.get(card.id);
    const estimate =
      card.estimatedValue != null && Number.isFinite(card.estimatedValue) && card.estimatedValue > 0
        ? dollarsToCents(card.estimatedValue)
        : null;
    const priceCents = sale?.priceCents ?? estimate;
    tiles.push({
      kind: "card",
      ...tileBase(card, href, asOf),
      priceCents,
      priceLabel: priceCents != null && priceCents > 0 ? money(centsToDollars(priceCents)) : "",
      ...(sale ? { soldOn: sale.soldOn, soldLabel: formatSaleDate(sale.soldOn) } : {}),
      percent: null,
      percentLabel: null,
    });
  }
  return newestFirst(tiles);
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
      projectSales(orderedNotableSales({ today: to, from, to, sales: pool, history }), context, to),
    );
  const lead = sales.filter((sale) => sale.priceCents >= MOVING_TODAY_MIN_LEAD_CENTS);
  const leadRows = show(lead);
  if (leadRows.length >= minimum) return leadRows;
  return show(sales);
}

/**
 * Movers for the narrowest window with a full row: today, then the last 7
 * dates, then the last 30. Below a full row everywhere, the week or the month,
 * whichever holds more movers. In "all-public" mode every other public card
 * follows, newest first, as a plain tile with no percent.
 */
export function assembleMovingToday(input: {
  today: string;
  asOf?: string;
  /** ISO time of the read. */
  updatedAt?: string;
  sales: readonly RawCompSale[];
  history: readonly RawCompSale[];
  cards: readonly PublicCardRef[];
  /** Public cards newest first, for the card section. */
  newest?: readonly PublicCardRef[];
  profiles: readonly ProfileRef[];
  alternates: readonly { queryKey: string; cardId: string }[];
  owners?: readonly { id: string; userId: string }[];
  flags?: readonly { cardId: string; userId: string; itemId: string }[];
  mode?: MovingStripMode;
}): MovingTodayPayload {
  const mode = input.mode ?? MOVING_STRIP_MODE;
  const newest = mode === "all-public" ? (input.newest ?? []) : [];
  const allCards = [...input.cards, ...newest];
  const owners = [...(input.owners ?? [])];
  const seenOwners = new Set(owners.map((owner) => owner.id));
  for (const card of allCards) {
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
    cards: new Map(allCards.map((card) => [card.id, card])),
    handles: new Map(input.profiles.map((profile) => [profile.id, profile.username])),
    alternates: input.alternates,
    owners,
    flags,
  };
  const weekStart = addCalendarDays(asOf, -(MOVING_TODAY_WEEK_DAYS - 1));
  const monthStart = addCalendarDays(asOf, -(MOVING_MONTH_DAYS - 1));
  const inMonth = sales.filter((sale) => sale.soldOn >= monthStart && sale.soldOn <= asOf);
  const inWeek = inMonth.filter((sale) => sale.soldOn >= weekStart);

  let window: MoverWindow = "day";
  let movers = moversFor(
    inWeek.filter((sale) => sale.soldOn === asOf),
    history,
    asOf,
    asOf,
    MOVING_FULL_ROW,
    context,
  );
  if (movers.length < MOVING_FULL_ROW) {
    const week = moversFor(inWeek, history, weekStart, asOf, MOVING_FULL_ROW, context);
    const month =
      week.length >= MOVING_FULL_ROW
        ? week
        : moversFor(inMonth, history, monthStart, asOf, MOVING_FULL_ROW, context);
    window = pickMoverWindow({ week: week.length, month: month.length });
    movers = window === "week" ? week : month;
  }

  const pool = [...newest, ...(mode === "all-public" ? input.cards : [])];
  const cards =
    mode === "all-public"
      ? cardTiles(
          pool,
          new Set(movers.map((sale) => sale.cardId)),
          latestSaleByCard(inMonth, context),
          context,
          asOf,
        )
      : [];
  return buildMovingPayload({ asOf, window, movers, cards, updatedAt: input.updatedAt });
}
