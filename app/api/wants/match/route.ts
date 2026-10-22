import { isUuid } from "@/lib/value/card-value-access";
import { getAuthUserId } from "@/lib/supabase/server";
import { notifyOwnedCard, notifyOwnedListing, notifyOwnedPost } from "@/lib/wants/dispatch";

export const runtime = "nodejs";

/**
 * Match a post, card, or listing the signed-in user just saved.
 * Sale alerts are created from the comps refresh, not this route.
 */
export async function POST(request: Request) {
  const userId = await getAuthUserId();
  if (!userId) {
    return Response.json({ error: "You need to be signed in." }, { status: 401 });
  }

  let body: { sourceType?: unknown; sourceId?: unknown } = {};
  try {
    body = (await request.json()) as { sourceType?: unknown; sourceId?: unknown };
  } catch {
    body = {};
  }

  const sourceType = body.sourceType;
  const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
  if (
    (sourceType !== "post" && sourceType !== "listing" && sourceType !== "card") ||
    !isUuid(sourceId)
  ) {
    return Response.json({ error: "Missing post or listing." }, { status: 400 });
  }

  try {
    const notified =
      sourceType === "post"
        ? await notifyOwnedPost(userId, sourceId)
        : sourceType === "listing"
          ? await notifyOwnedListing(userId, sourceId)
          : await notifyOwnedCard(userId, sourceId);
    if (notified == null) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    return Response.json({ ok: true, notified });
  } catch (err) {
    console.warn(
      "[want_alerts]",
      err instanceof Error ? err.message : "match failed",
    );
    return Response.json({ error: "Couldn't check want alerts." }, { status: 500 });
  }
}
