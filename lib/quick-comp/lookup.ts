import "server-only";

import { unstable_cache } from "next/cache";
import { getCompsSource, payloadFromSales, samplePayload, type CompsSource } from "@/lib/comps";
import { buildSoldSearchQuery } from "@/lib/comps/match";
import { sharedCompValue } from "@/lib/comps/shared-value";
import { fetchTrawlSold, getTrawlApiKey } from "@/lib/comps/trawl";
import type { SoldCompsPayload } from "@/lib/comps/types";
import { loadSharedQuickComp, QuickCompFailure, type CacheFn } from "./cache";
import { toMatchCard, toSoldCompCard, type QuickCompIdentity } from "./identity";
import { pickQuickCompPhoto, samplePhoto, type QuickCompPhoto } from "./photo";
import { spendQuickCompLookup, type QuickCompLimitDeps, type QuickCompLimitReason } from "./limits";
import { serverQuickCompLimits } from "./limits-server";

/**
 * The comps plus one card photo picked from the sales already matched.
 * Undefined on entries cached before the photo shipped: the screen shows the
 * placeholder until they expire (6h), so no refetch spends credits.
 */
export type QuickCompPayload = SoldCompsPayload & { photo?: QuickCompPhoto | null };

export type QuickCompResult =
  | { ok: true; payload: QuickCompPayload }
  | { ok: false; reason: QuickCompLimitReason; resetAt: string }
  | { ok: false; reason: "unavailable" };

export type QuickCompDeps = {
  source: () => CompsSource;
  hasTrawlKey: () => boolean;
  fetchSold: typeof fetchTrawlSold;
  limits: QuickCompLimitDeps;
  cache: CacheFn;
  now: () => number;
};

const defaultDeps: QuickCompDeps = {
  source: getCompsSource,
  hasTrawlKey: () => Boolean(getTrawlApiKey()),
  fetchSold: fetchTrawlSold,
  limits: serverQuickCompLimits,
  cache: unstable_cache as CacheFn,
  now: Date.now,
};

/**
 * Comps for a card that is not in anyone's collection. Unlike getSoldComps it
 * never writes sold_comps_cache (keyed to a card row) and never sends want
 * alerts. Sample and off sources return the sample payload with no cap and no
 * Trawl. A live miss spends today's cap, then the hourly cap, then one
 * Trawl lookup (details=1, max_pages=1: 2 credits, 0 when nothing matches).
 * The photo comes from those same results and is cached with the comps.
 */
export async function getQuickComp(
  identity: QuickCompIdentity,
  userId: string,
  overrides: Partial<QuickCompDeps> = {},
): Promise<QuickCompResult> {
  const deps = { ...defaultDeps, ...overrides };
  const source = deps.source();
  if (source === "sample" || source === "off") {
    const sample = samplePayload(toSoldCompCard(identity));
    return { ok: true, payload: { ...sample, photo: samplePhoto(sample.comps.map((comp) => comp.soldDate)) } };
  }

  const matchCard = toMatchCard(identity);
  const query = buildSoldSearchQuery(matchCard);
  if (!query || !deps.hasTrawlKey()) return { ok: false, reason: "unavailable" };

  try {
    const payload = await loadSharedQuickComp<QuickCompPayload>(
      identity,
      async () => {
        const spent = await spendQuickCompLookup(userId, { ...deps.limits, now: deps.now });
        if (!spent.ok) throw new QuickCompFailure(spent.reason, spent.resetAt);
        const result = await deps.fetchSold(query, { days: 90, maxPages: 1 });
        if (!result.ok) throw new QuickCompFailure("unavailable");
        const results = result.body.results ?? [];
        const value = sharedCompValue(matchCard, results);
        return {
          ...payloadFromSales(value.sales, {
            source: "trawl",
            cached: false,
            fetchedAt: new Date(deps.now()).toISOString(),
            query,
          }),
          // From the same results, so the photo costs no Trawl call.
          photo: pickQuickCompPhoto(value.sales, results, identity.grade),
        };
      },
      deps.cache,
    );
    return { ok: true, payload };
  } catch (err) {
    if (err instanceof QuickCompFailure && err.kind !== "unavailable" && err.resetAt) {
      return { ok: false, reason: err.kind, resetAt: err.resetAt };
    }
    console.warn("[quick-comp] lookup failed:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "unavailable" };
  }
}
