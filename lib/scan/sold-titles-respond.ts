import type { SoldTitle } from "./match";
import { soldTitlePlayer } from "./sold-titles";

export const SOLD_TITLES_RATE_MESSAGE = "You're scanning quickly. Try again in a few minutes";

export type SoldTitlesRouteDeps = {
  enabled: () => boolean;
  userId: () => Promise<string | null>;
  /** False when this user is over the scan rate. A cache read, but still capped. */
  allow: (userId: string) => Promise<boolean>;
  /** Cached sold listings whose titles name this player. Never Trawl. */
  search: (player: string) => Promise<SoldTitle[]>;
};

const PRIVATE = { "Cache-Control": "private, no-store" };

/** GET /api/scan/sold-titles?player=. The flag is checked before auth so off is a plain 404. */
export async function respondSoldTitles(request: Request, deps: SoldTitlesRouteDeps): Promise<Response> {
  if (!deps.enabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const userId = await deps.userId();
  if (!userId) return Response.json({ error: "Log in to scan cards" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (key !== "player") return Response.json({ error: "Unknown field" }, { status: 400 });
  }
  const player = soldTitlePlayer(params.get("player"));
  if (!player) return Response.json({ error: "player is required" }, { status: 400 });
  if (!(await deps.allow(userId))) {
    return Response.json({ error: SOLD_TITLES_RATE_MESSAGE }, { status: 429, headers: PRIVATE });
  }
  try {
    const titles = await deps.search(player);
    return Response.json({ titles }, { headers: PRIVATE });
  } catch {
    // The card's own read still matches without them.
    return Response.json({ titles: [] }, { headers: PRIVATE });
  }
}
