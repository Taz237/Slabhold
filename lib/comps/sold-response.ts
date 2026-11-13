export const SOLD_UNAVAILABLE_MESSAGE =
  "Sold data unavailable, try again shortly";

/**
 * No lookup ran because the card has no card #. Not a failure: the collector can fix it.
 * Never shown as "unavailable".
 */
export const SOLD_NEEDS_NUMBER_MESSAGE = "Add the card # to see sold prices";

/** The heading over a sold-prices notice. A card with no card # isn't an outage. */
export function soldNoticeTitle(message: string | null): string {
  return message === SOLD_NEEDS_NUMBER_MESSAGE ? "Sold prices need the card #" : "Sales are taking a break";
}

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

/** A live Trawl write. Cache hits and sample payloads are not writes. */
export function isFreshSoldWrite(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const row = payload as { cached?: unknown; sample?: unknown };
  return row.cached === false && row.sample !== true;
}

/**
 * Bust comps only when this request ran the refresh and that run wrote sales.
 * A later cache hit can still carry `cached: false` from the run that wrote it.
 */
export function shouldBustCompsResult(refreshedLive: boolean, payload: unknown): boolean {
  return refreshedLive && isFreshSoldWrite(payload);
}

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
    if (failed?.attempt.reason === "no_number" && !failed.payload) {
      return Response.json({ error: SOLD_NEEDS_NUMBER_MESSAGE }, { status: 409 });
    }
    return Response.json({ error: SOLD_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  if (refreshed.attempt.reason === "budget_exhausted") {
    return Response.json({ error: SOLD_RATE_LIMIT_MESSAGE }, { status: 429 });
  }
  if (!refreshed.payload) {
    // No card #: no search ran. Say what to do, not "unavailable".
    if (refreshed.attempt.reason === "no_number") {
      return Response.json({ error: SOLD_NEEDS_NUMBER_MESSAGE }, { status: 409 });
    }
    return Response.json({ error: SOLD_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  return Response.json(refreshed.payload);
}
