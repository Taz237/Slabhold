export const MOVING_TODAY_TITLE = "Moving today";
export const MOVING_TODAY_PATH = "/moving-today";

export type MovingTodaySale = {
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
  priceCents: number;
  priceLabel: string;
  soldOn: string;
  soldLabel: string;
  /** This sale versus the mean of 3+ earlier comps. Movers always have one. */
  percent: number | null;
  percentLabel: string | null;
};

export type MovingTodayWindow = "day" | "week";

export type MovingTodayPayload = {
  title: string;
  date: string;
  dateLabel: string;
  sales: MovingTodaySale[];
  /** Day keeps one calendar date. Week is the last 7 New York dates. */
  window?: MovingTodayWindow;
  /** ISO time the list was read from sold_comps_cache. */
  updatedAt?: string;
};

export function emptyMovingToday(date = ""): MovingTodayPayload {
  return {
    title: MOVING_TODAY_TITLE,
    date,
    dateLabel: "",
    sales: [],
  };
}

export function shouldShowMovingToday(sales: unknown): sales is MovingTodaySale[] {
  return Array.isArray(sales) && sales.length > 0 && sales.every(isMovingTodaySale);
}

export function isMovingTodaySale(value: unknown): value is MovingTodaySale {
  if (!value || typeof value !== "object") return false;
  const sale = value as MovingTodaySale;
  return (
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
    typeof sale.soldLabel === "string" &&
    (sale.percent === null || (typeof sale.percent === "number" && Number.isFinite(sale.percent))) &&
    (sale.percentLabel == null || typeof sale.percentLabel === "string")
  );
}
