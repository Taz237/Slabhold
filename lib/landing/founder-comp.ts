import type { CompDemo } from "@/components/landing/showcase/sample-data";
import { photoSource } from "@/lib/collection/grid";
import type { PublicCardComps } from "@/lib/comps/public-types";
import { centsToDollars } from "@/lib/comps/stats";
import { mapPublicCard } from "@/lib/social/cards";
import type { FounderProfileRow } from "./founder";

/*
 * The landing page's Quick Comp, played with one real card from the founder's
 * public collection: his Tyrese Maxey Downtown. The comps are the stored ones
 * his public card page already shows signed-out visitors (card_values and
 * sold_comps_cache), never a new Trawl call.
 */

/** Matched against his public card's player, set and parallel. */
export const FOUNDER_COMP_PLAYER = "Maxey";
export const FOUNDER_COMP_INSERT = "Downtown";

/** Rows read before picking. */
export const FOUNDER_COMP_SCAN = 12;

/** Newest sold prices drawn as chips. */
export const FOUNDER_COMP_SALES = 5;

/** Fewer sales than this and the demo plays the sample card. */
export const FOUNDER_COMP_MIN_SALES = 3;

export const FOUNDER_COMP_SELECT =
  "id, user_id, player, year, year_label, set, set_name, parallel, grade, grader, grade_qualifier, condition_type, estimated_value, image_url, created_at";

export type FounderCompRow = {
  id: string;
  user_id: string;
  player: string;
  year: number;
  year_label: string | null;
  set: string;
  set_name: string | null;
  parallel: string | null;
  grade: string | null;
  grader: string | null;
  grade_qualifier: string | null;
  condition_type: string | null;
  estimated_value: number | null;
  image_url: string | null;
  created_at: string | null;
};

/** Public label fields, the photo and prices. No ids, cert, paid or owner id. */
export type FounderComp = {
  owner: string;
  player: string;
  year: string;
  set: string;
  grade: string;
  photoUrl: string;
  sales: { price: number; when: string }[];
  median: number;
  p25: number;
  p75: number;
  count: number;
};

function matches(row: FounderCompRow): boolean {
  const text = [row.player, row.set, row.set_name, row.parallel].join(" ").toLowerCase();
  return text.includes(FOUNDER_COMP_PLAYER.toLowerCase()) && text.includes(FOUNDER_COMP_INSERT.toLowerCase());
}

function graded(row: FounderCompRow): boolean {
  return row.condition_type === "graded" || Boolean((row.grader ?? "").trim());
}

function time(row: FounderCompRow): number {
  const at = Date.parse(row.created_at ?? "");
  return Number.isFinite(at) ? at : 0;
}

/** His Maxey Downtown with a stored photo. Graded first, then the newest. */
export function pickFounderCompCard(
  profile: FounderProfileRow | null,
  rows: readonly FounderCompRow[],
): FounderCompRow | null {
  if (!profile) return null;
  const candidates = rows
    .filter((row) => row.user_id === profile.id && matches(row) && photoSource(row.image_url).kind === "optimized")
    .sort((a, b) => Number(graded(b)) - Number(graded(a)) || time(b) - time(a));
  return candidates[0] ?? null;
}

function cents(value: number | null): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

const DAY = 24 * 60 * 60 * 1000;

function soldWhen(soldAt: string, now: number): string {
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const days = Math.round((today - Date.parse(`${soldAt}T00:00:00Z`)) / DAY);
  return days <= 0 ? "today" : `${days}d ago`;
}

/**
 * The demo's real card, or null when anything is missing: no card, no photo,
 * comps that aren't a real "ok" result, or fewer than 3 sales.
 */
export function founderComp(
  profile: FounderProfileRow | null,
  row: FounderCompRow | null,
  comps: PublicCardComps,
  now: number = Date.now(),
): FounderComp | null {
  if (!profile || !row) return null;
  const photo = photoSource(row.image_url);
  if (photo.kind !== "optimized") return null;
  if (comps.status !== "ok" || comps.nSales < FOUNDER_COMP_MIN_SALES) return null;
  if (!cents(comps.medianCents) || !cents(comps.p25Cents) || !cents(comps.p75Cents)) return null;
  const sales = comps.sales
    .filter((sale) => cents(sale.priceCents))
    .slice(0, FOUNDER_COMP_SALES)
    .map((sale) => ({ price: centsToDollars(sale.priceCents), when: soldWhen(sale.soldAt, now) }));
  if (sales.length < FOUNDER_COMP_MIN_SALES) return null;

  const card = mapPublicCard({
    ...row,
    card_number: null,
    sport: null,
    accent: null,
    condition_type: row.condition_type as "graded" | "raw" | null,
  });
  const parallel = (row.parallel ?? "").trim();
  const set = [card.setBrand, parallel && !/^base$/i.test(parallel) && !card.setBrand.toLowerCase().includes(parallel.toLowerCase()) ? parallel : ""]
    .filter(Boolean)
    .join(" ");
  return {
    owner: profile.username,
    player: card.playerName,
    year: card.yearLabel ?? String(card.year),
    set,
    grade: card.grade ?? "",
    photoUrl: photo.src,
    sales,
    median: centsToDollars(comps.medianCents),
    p25: centsToDollars(comps.p25Cents),
    p75: centsToDollars(comps.p75Cents),
    count: comps.nSales,
  };
}

/** What the demo draws for the real card. `photo` is the optimizer's src and srcset. */
export function compDemoFromFounder(comp: FounderComp, photo: CompDemo["photo"]): CompDemo {
  const yearSet = [comp.year, comp.set].filter(Boolean).join(" ");
  const prices = comp.sales.map((sale) => sale.price);
  return {
    query: [comp.player, yearSet, comp.grade].filter(Boolean).join(" "),
    label: [comp.player, yearSet, comp.grade].filter(Boolean).join(" · "),
    photo,
    alt: [comp.player, yearSet, comp.grade].filter(Boolean).join(", "),
    sales: comp.sales,
    stats: {
      median: comp.median,
      p25: comp.p25,
      p75: comp.p75,
      min: Math.min(...prices),
      max: Math.max(...prices),
      count: comp.count,
    },
    basis: `Based on ${comp.count} sales`,
    owner: comp.owner,
  };
}
