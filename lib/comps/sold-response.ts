export const SOLD_UNAVAILABLE_MESSAGE =
  "Sold data unavailable, try again shortly";

/** Keep in sync with lib/comps/rate-limit RATE_LIMIT_MESSAGE (avoid server-only import). */
export const SOLD_RATE_LIMIT_MESSAGE =
  "You're checking sold comps too quickly. Please wait a bit and try again.";

/** Rate limits use the friendly copy. Other failures stay on the generic line. */
export function soldNotice(
  status: string,
  message: string | null,
): string | null {
  if (status === "rate_limited") {
    if (message && message !== SOLD_UNAVAILABLE_MESSAGE) return message;
    return SOLD_RATE_LIMIT_MESSAGE;
  }
  if (status === "unavailable") return message || SOLD_UNAVAILABLE_MESSAGE;
  return null;
}

export type SoldAccess = "owner" | "public" | "hidden" | "unavailable";

/** Structural result shape — avoids importing server-only getCardValue. */
export type SoldRefreshResult = {
  attempt: { reason: string };
  payload: unknown;
};

export type SoldRefreshOptions = {
  save?: boolean;
  beforeRequest?: () => Promise<boolean>;
  beforeTrawl?: () => Promise<boolean>;
};

export type SoldCompsLoaders = {
  lookupAccess: (cardId: string, userId: string) => Promise<SoldAccess>;
  loadRefresh: (
    cardId: string,
    options?: SoldRefreshOptions,
  ) => Promise<SoldRefreshResult>;
  beforeRequest: () => Promise<boolean>;
  beforeTrawl: () => Promise<boolean>;
};

type MarketFail = { name?: string; result?: SoldRefreshResult };

function marketFailResult(err: unknown): SoldRefreshResult | null {
  if (!err || typeof err !== "object") return null;
  const fail = err as MarketFail;
  if (fail.name !== "CardMarketUnavailable" || !fail.result) return null;
  return fail.result;
}

/**
 * Access check first. Hidden/missing cards 404 before any comps/value loader runs.
 * No uncached Trawl fallback on this path.
 */
export async function respondSoldComps(
  cardId: string,
  userId: string,
  loaders: SoldCompsLoaders,
): Promise<Response> {
  const access = await loaders.lookupAccess(cardId, userId);
  if (access === "unavailable") {
    return Response.json({ error: SOLD_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  if (access === "hidden") {
    return Response.json({ error: "Card not found" }, { status: 404 });
  }

  let refreshed: SoldRefreshResult;
  try {
    refreshed = await loaders.loadRefresh(cardId, {
      save: access === "owner",
      beforeRequest: loaders.beforeRequest,
      beforeTrawl: loaders.beforeTrawl,
    });
  } catch (err) {
    const failed = marketFailResult(err);
    if (failed?.attempt.reason === "budget_exhausted") {
      return Response.json({ error: SOLD_RATE_LIMIT_MESSAGE }, { status: 429 });
    }
    return Response.json({ error: SOLD_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  if (refreshed.attempt.reason === "budget_exhausted") {
    return Response.json({ error: SOLD_RATE_LIMIT_MESSAGE }, { status: 429 });
  }
  if (!refreshed.payload) {
    return Response.json({ error: SOLD_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  return Response.json(refreshed.payload);
}
