import type { PickupDemo } from "@/components/landing/showcase/sample-data";
import { photoSource, slabLabel } from "@/lib/collection/grid";
import { mapPublicCard } from "@/lib/social/cards";
import type { FounderProfileRow } from "./founder";

/*
 * The landing timeline's pickup post, shown with one real card from the
 * founder's public collection: his Jordan Love PSA 10. Read like the hero
 * slabs (public_cards), cached for an hour, never a Trawl call.
 */

/** Matched against his public card's player name. */
export const FOUNDER_PICKUP_PLAYER = "Jordan Love";

/** Only this slab: the post says it came back a PSA 10. */
export const FOUNDER_PICKUP_GRADER = "PSA";
export const FOUNDER_PICKUP_GRADE = "10";

/** Rows read before picking. */
export const FOUNDER_PICKUP_SCAN = 12;

/** Only what picking and the slab label need. No ids beyond the owner check, no value, cert, paid or notes. */
export const FOUNDER_PICKUP_SELECT =
  "user_id, player, year, year_label, set, set_name, parallel, grade, grader, condition_type, image_url, created_at";

export type FounderPickupRow = {
  user_id: string;
  player: string;
  year: number | null;
  year_label: string | null;
  set: string | null;
  set_name: string | null;
  parallel: string | null;
  grade: string | null;
  grader: string | null;
  condition_type: string | null;
  image_url: string | null;
  created_at: string | null;
};

function time(row: FounderPickupRow): number {
  const at = Date.parse(row.created_at ?? "");
  return Number.isFinite(at) ? at : 0;
}

function label(row: FounderPickupRow): string {
  return slabLabel({
    grade: row.grade,
    grader: row.grader,
    conditionType: row.condition_type === "graded" || row.condition_type === "raw" ? row.condition_type : null,
  });
}

/**
 * His Jordan Love PSA 10 with a stored photo, newest first, as the public
 * fields the timeline draws: the photo, the player, year, set and grade. Null when
 * there is no such card, so the post keeps its sample slab.
 */
export function founderPickup(profile: FounderProfileRow | null, rows: readonly FounderPickupRow[]): PickupDemo | null {
  if (!profile) return null;
  const want = FOUNDER_PICKUP_PLAYER.toLowerCase();
  const row = rows
    .filter(
      (item) =>
        item.user_id === profile.id &&
        (item.player ?? "").toLowerCase().includes(want) &&
        label(item).toUpperCase() === `${FOUNDER_PICKUP_GRADER} ${FOUNDER_PICKUP_GRADE}` &&
        photoSource(item.image_url).kind === "optimized",
    )
    .sort((a, b) => time(b) - time(a))[0];
  const photo = photoSource(row?.image_url);
  if (!row || photo.kind !== "optimized") return null;
  // Year and set the way founderComp builds them: the label year, then the set plus a non-base parallel.
  const card = mapPublicCard({
    id: "",
    user_id: row.user_id,
    player: row.player,
    year: row.year ?? 0,
    year_label: row.year_label,
    set: row.set ?? "",
    set_name: row.set_name,
    parallel: row.parallel,
    grade: row.grade,
    grader: row.grader,
    estimated_value: null,
    image_url: null,
    card_number: null,
    sport: null,
    accent: null,
    condition_type: row.condition_type as "graded" | "raw" | null,
  });
  const year = row.year ? card.yearLabel ?? String(card.year) : (row.year_label ?? "").trim();
  const parallel = (row.parallel ?? "").trim();
  const set = [card.setBrand, parallel && !/^base$/i.test(parallel) && !card.setBrand.toLowerCase().includes(parallel.toLowerCase()) ? parallel : ""]
    .filter(Boolean)
    .join(" ");
  return {
    player: row.player.trim(),
    year,
    set,
    grader: FOUNDER_PICKUP_GRADER,
    grade: FOUNDER_PICKUP_GRADE,
    photoUrl: photo.src,
  };
}
