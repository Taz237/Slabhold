export const MOVING_TODAY_TITLE = "Moving today";
export const MOVING_TODAY_PATH = "/moving-today";

export type MovingTodaySale = {
  cardId: string;
  href: string;
  player: string;
  /** Sport when the public card has one, so a shared name opens the right page. */
  sport?: string;
  detail: string;
  imageUrl: string | null;
  accent: string;
  priceCents: number;
  priceLabel: string;
  soldOn: string;
  soldLabel: string;
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

function isMovingTodaySale(value: unknown): value is MovingTodaySale {
  if (!value || typeof value !== "object") return false;
  const sale = value as MovingTodaySale;
  return (
    typeof sale.cardId === "string" &&
    typeof sale.href === "string" &&
    sale.href.startsWith("/u/") &&
    typeof sale.player === "string" &&
    typeof sale.priceLabel === "string" &&
    typeof sale.soldLabel === "string" &&
    (sale.percentLabel == null || typeof sale.percentLabel === "string")
  );
}
