import type { CatalogCard } from "@/lib/card-catalog";
import { parseYearLabel } from "@/lib/card-options";
import type { SoldCompsPayload } from "@/lib/comps/types";
import { quickCompIdentityKey, type QuickCompIdentity } from "./identity";
import type { QuickCompLimitReason } from "./limits";

export const QUICK_COMP_API = "/api/quick-comp";

export type QuickCompOutcome =
  | { status: "ready"; payload: SoldCompsPayload }
  | { status: "limited"; reason: QuickCompLimitReason; resetAt: string | null }
  | { status: "error" }
  | { status: "offline" };

/** The identity of a catalog pick at one grade. Null when its year is not a real year. */
export function identityFromCatalog(card: CatalogCard, grade: string): QuickCompIdentity | null {
  const year = parseYearLabel(card.yearLabel);
  if (!year) return null;
  return {
    playerName: card.playerName,
    year: year.year,
    yearLabel: year.yearLabel,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber,
    parallel: card.parallel || "Base",
    grade,
  };
}

export function quickCompUrl(identity: QuickCompIdentity): string {
  const params = new URLSearchParams();
  params.set("player", identity.playerName);
  params.set("year", identity.yearLabel);
  if (identity.setBrand) params.set("set", identity.setBrand);
  if (identity.cardNumber) params.set("number", identity.cardNumber);
  if (identity.parallel && identity.parallel !== "Base") params.set("parallel", identity.parallel);
  params.set("grade", identity.grade);
  return `${QUICK_COMP_API}?${params.toString()}`;
}

type Fetcher = (url: string) => Promise<Response>;

/** One GET, read into an outcome. Never throws. */
export async function fetchQuickComp(
  identity: QuickCompIdentity,
  fetcher: Fetcher,
  online: () => boolean = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
): Promise<QuickCompOutcome> {
  if (!online()) return { status: "offline" };
  let response: Response;
  try {
    response = await fetcher(quickCompUrl(identity));
  } catch {
    return online() ? { status: "error" } : { status: "offline" };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok && body && typeof body === "object" && Array.isArray(body.comps)) {
    return { status: "ready", payload: body as unknown as SoldCompsPayload };
  }
  if (response.status === 429) {
    const reason = body?.reason === "daily" ? "daily" : "hourly";
    return { status: "limited", reason, resetAt: typeof body?.resetAt === "string" ? body.resetAt : null };
  }
  return { status: "error" };
}

/**
 * One lookup per identity at a time. A double tap, or a second pick of the
 * same card and grade while the first is out, shares the first request.
 */
export function createLookupGate(run: (identity: QuickCompIdentity) => Promise<QuickCompOutcome>) {
  const inflight = new Map<string, Promise<QuickCompOutcome>>();
  return {
    lookup(identity: QuickCompIdentity): Promise<QuickCompOutcome> {
      const key = quickCompIdentityKey(identity);
      const pending = inflight.get(key);
      if (pending) return pending;
      const next = run(identity).finally(() => inflight.delete(key));
      inflight.set(key, next);
      return next;
    },
    pending(identity: QuickCompIdentity): boolean {
      return inflight.has(quickCompIdentityKey(identity));
    },
  };
}
