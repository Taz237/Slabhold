import { alignedRetryAfterSeconds, WANT_MATCH_WINDOW_MS } from "@/lib/comps/rate-window";
import { isUuid } from "@/lib/value/card-value-access";

export const WANT_MATCH_RATE_LIMIT_MESSAGE =
  "Too many want checks. Please wait a bit and try again.";

export type WantMatchSource = "post" | "listing" | "card";

export type WantMatchDeps = {
  getUserId: () => Promise<string | null>;
  /** False when this user is over the want-match limit. */
  consumeLimit: (userId: string) => Promise<boolean>;
  notify: (
    userId: string,
    sourceType: WantMatchSource,
    sourceId: string,
  ) => Promise<number | null>;
};

function limited(now = Date.now()): Response {
  return Response.json(
    { error: WANT_MATCH_RATE_LIMIT_MESSAGE },
    {
      status: 429,
      headers: { "Retry-After": String(alignedRetryAfterSeconds(WANT_MATCH_WINDOW_MS, now)) },
    },
  );
}

/**
 * Match a post, card, or listing the signed-in user just saved.
 * Sale alerts are created from the comps refresh, not this route.
 */
export async function postWantMatch(request: Request, deps: WantMatchDeps): Promise<Response> {
  const userId = await deps.getUserId();
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

  const allowed = await deps.consumeLimit(userId);
  if (!allowed) return limited();

  try {
    const notified = await deps.notify(userId, sourceType, sourceId);
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
