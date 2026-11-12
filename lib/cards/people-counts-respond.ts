import type { OwnersAndHunters } from "./people";
import { peopleCounts } from "./people-counts";

export type PeopleCountsRouteDeps = {
  /** Throws (notFound) when this viewer can't open the card. */
  access: (cardId: string) => Promise<void>;
  load: (cardId: string) => Promise<OwnersAndHunters | null>;
};

/** GET /api/cards/people/counts?id=: two numbers, never names, avatars or lists. */
export async function respondPeopleCounts(request: Request, deps: PeopleCountsRouteDeps): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  await deps.access(id);
  const counts = peopleCounts(await deps.load(id));
  if (!counts) return Response.json({ error: "Not available" }, { status: 503 });
  return Response.json(counts, { headers: { "Cache-Control": "private, no-store" } });
}
