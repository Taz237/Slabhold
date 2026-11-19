import { photoSource } from "@/lib/collection/grid";
import type { PullRef } from "@/lib/landing/media";

/*
 * The pulls wall: approved public pulls listed in public/landing/media/pulls.json.
 * A pull is drawn only when its card is public, has a photo in our card-photos
 * bucket, and belongs to the handle it is listed under.
 */

export const PULL_CARD_SELECT = "id, user_id, player, year, year_label, set, set_name, image_url";

export type PullCardRow = {
  id: string;
  user_id: string;
  player: string;
  year: number;
  year_label: string | null;
  set: string;
  set_name: string | null;
  image_url: string | null;
};

export type PullProfileRow = { id: string; username: string };

/** What the wall draws: the photo, a plain card line for the alt text, and the handle. */
export type LandingPull = { cardId: string; handle: string; photoUrl: string; label: string };

/** Listed pulls, in the file's order, that pass every check. Each card once. */
export function landingPulls(
  refs: readonly PullRef[],
  profiles: readonly PullProfileRow[],
  cards: readonly PullCardRow[],
): LandingPull[] {
  const owner = new Map(profiles.map((profile) => [profile.username.toLowerCase(), profile]));
  const byId = new Map(cards.map((card) => [card.id, card]));
  const seen = new Set<string>();
  const pulls: LandingPull[] = [];
  for (const ref of refs) {
    const profile = owner.get(ref.handle.toLowerCase());
    const card = byId.get(ref.cardId);
    if (!profile || !card || card.user_id !== profile.id || seen.has(card.id)) continue;
    const source = photoSource(card.image_url);
    if (source.kind !== "optimized") continue;
    seen.add(card.id);
    const year = (card.year_label ?? "").trim() || String(card.year || "");
    const set = (card.set_name || card.set || "").trim();
    pulls.push({
      cardId: card.id,
      handle: profile.username,
      photoUrl: source.src,
      label: [card.player, [year, set].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    });
  }
  return pulls;
}
