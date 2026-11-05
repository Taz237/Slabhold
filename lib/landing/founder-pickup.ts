import type { PickupDemo } from "@/components/landing/showcase/sample-data";
import { photoSource, slabLabel } from "@/lib/collection/grid";
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

/** Only what picking needs. No ids beyond the owner check, no value, cert, paid or notes. */
export const FOUNDER_PICKUP_SELECT = "user_id, player, grade, grader, condition_type, image_url, created_at";

export type FounderPickupRow = {
  user_id: string;
  player: string;
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
 * fields the timeline draws: the photo, the player and the grade. Null when
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
  return { player: row.player.trim(), grader: FOUNDER_PICKUP_GRADER, grade: FOUNDER_PICKUP_GRADE, photoUrl: photo.src };
}
