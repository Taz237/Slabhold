export const MOVING_TODAY_TITLE = "Moving today";
export const MOVING_TODAY_PATH = "/moving-today";

export type MovingTodaySale = {
  /** "mover" has a real percent. "card" is any other public card, newest first. */
  kind: "mover" | "card";
  cardId: string;
  href: string;
  player: string;
  /** "2023-24 · Prizm · PSA 10". Kept for the share image. */
  detail: string;
  /** Tile fields, from public_cards. */
  yearLabel: string;
  setBrand: string;
  grade: string;
  grader: string;
  conditionType: "raw" | "graded" | null;
  isRookie: boolean;
  imageUrl: string | null;
  accent: string;
  /** Lowercase sport from public_cards, or "" when unknown. */
  sport?: string;
  /** ISO time the card was added. Orders the card section newest first. */
  addedAt?: string;
  /** Added within MOVING_FRESH_DAYS. Shows a neutral "New" chip on a card tile. */
  isNew?: boolean;
  /** Null on a card tile with no comp and no estimated value. */
  priceCents: number | null;
  /** "" when there is no price to show. */
  priceLabel: string;
  /** The sale date. Movers always have one. */
  soldOn?: string;
  soldLabel?: string;
  /** This sale versus the mean of 3+ earlier comps. Movers always have one. Cards never do. */
  percent: number | null;
  percentLabel: string | null;
};

/** Day is one New York date, week 7 dates, month 30. Fresh has no movers, only cards. */
export type MovingTodayWindow = "day" | "week" | "month" | "fresh";

export type MovingTodayPayload = {
  title: string;
  date: string;
  dateLabel: string;
  sales: MovingTodaySale[];
  window?: MovingTodayWindow;
  /** ISO time the list was read from sold_comps_cache. */
  updatedAt?: string;
  /** Tiles with kind "mover". */
  moverCount: number;
  /** Every tile: movers and cards. */
  totalCount: number;
};

export function emptyMovingToday(date = ""): MovingTodayPayload {
  return {
    title: MOVING_TODAY_TITLE,
    date,
    dateLabel: "",
    sales: [],
    moverCount: 0,
    totalCount: 0,
  };
}

export function shouldShowMovingToday(sales: unknown): sales is MovingTodaySale[] {
  return Array.isArray(sales) && sales.length > 0 && sales.every(isMovingTodaySale);
}

export function isMovingTodaySale(value: unknown): value is MovingTodaySale {
  if (!value || typeof value !== "object") return false;
  const sale = value as MovingTodaySale;
  const percentOk =
    sale.kind === "card"
      ? sale.percent === null && sale.percentLabel == null
      : typeof sale.percent === "number" && Number.isFinite(sale.percent) && typeof sale.soldLabel === "string";
  return (
    (sale.kind === "mover" || sale.kind === "card") &&
    percentOk &&
    typeof sale.cardId === "string" &&
    typeof sale.href === "string" &&
    sale.href.startsWith("/u/") &&
    typeof sale.player === "string" &&
    typeof sale.yearLabel === "string" &&
    typeof sale.setBrand === "string" &&
    typeof sale.grade === "string" &&
    typeof sale.grader === "string" &&
    (sale.conditionType === null || sale.conditionType === "raw" || sale.conditionType === "graded") &&
    typeof sale.isRookie === "boolean" &&
    typeof sale.priceLabel === "string" &&
    (sale.soldLabel === undefined || typeof sale.soldLabel === "string") &&
    (sale.percentLabel == null || typeof sale.percentLabel === "string")
  );
}
