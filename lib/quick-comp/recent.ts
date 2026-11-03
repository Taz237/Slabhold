import type { CatalogCard } from "@/lib/card-catalog";
import type { SoldCompsPayload } from "@/lib/comps/types";
import type { CompListing } from "@/lib/types";
import type { QuickCompIdentity } from "./identity";

/** Comps kept on this device. Never the shared recent-search key. */
export const QUICK_COMP_RECENT_LIMIT = 10;
/** Sales kept per saved comp, enough to redraw the chart and the list. */
const SAVED_SALES_LIMIT = 30;

export function quickCompRecentKey(userId: string): string {
  return `slabhold.quickcomp.recent.v1.${userId}`;
}

export type SavedPayload = Pick<
  SoldCompsPayload,
  "median" | "p25" | "p75" | "count" | "source" | "fetchedAt" | "lowConfidence" | "sample"
> & { comps: CompListing[] };

export type RecentComp = {
  key: string;
  identity: QuickCompIdentity;
  /** The catalog row picked, so Add to collection fills the same fields. Null for a manual entry. */
  catalog: CatalogCard | null;
  payload: SavedPayload;
  /** When this device saved it. */
  savedAt: string;
};

type Store = Pick<Storage, "getItem" | "setItem">;

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function validIdentity(value: unknown): value is QuickCompIdentity {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    isString(row.playerName) &&
    row.playerName.length > 0 &&
    typeof row.year === "number" &&
    isString(row.yearLabel) &&
    isString(row.setBrand) &&
    isString(row.cardNumber) &&
    isString(row.parallel) &&
    isString(row.grade)
  );
}

function validComp(value: unknown): value is CompListing {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return isString(row.id) && isString(row.title) && typeof row.soldPrice === "number" && isString(row.soldDate);
}

function validCatalog(value: unknown): value is CatalogCard | null {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return isString(row.id) && isString(row.playerName) && isString(row.yearLabel) && isString(row.setBrand);
}

function validRecent(value: unknown): value is RecentComp {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const payload = row.payload as Record<string, unknown> | undefined;
  return (
    isString(row.key) &&
    isString(row.savedAt) &&
    validIdentity(row.identity) &&
    validCatalog(row.catalog ?? null) &&
    !!payload &&
    isNumberOrNull(payload.median) &&
    isNumberOrNull(payload.p25) &&
    isNumberOrNull(payload.p75) &&
    typeof payload.count === "number" &&
    Array.isArray(payload.comps) &&
    payload.comps.every(validComp)
  );
}

/** Saved comps, newest first. Bad JSON or bad rows are dropped silently. */
export function readRecentComps(store: Store | null, userId: string | null): RecentComp[] {
  if (!store || !userId) return [];
  try {
    const raw = store.getItem(quickCompRecentKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validRecent).slice(0, QUICK_COMP_RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function savedPayload(payload: SoldCompsPayload): SavedPayload {
  return {
    median: payload.median,
    p25: payload.p25,
    p75: payload.p75,
    count: payload.count,
    source: payload.source,
    fetchedAt: payload.fetchedAt,
    lowConfidence: payload.lowConfidence,
    sample: payload.sample,
    comps: payload.comps.slice(0, SAVED_SALES_LIMIT),
  };
}

/** Put this comp first, drop an older copy of the same key, keep the last 10. */
export function rememberRecentComp(
  store: Store | null,
  userId: string | null,
  entry: RecentComp,
): RecentComp[] {
  const next = [entry, ...readRecentComps(store, userId).filter((item) => item.key !== entry.key)].slice(
    0,
    QUICK_COMP_RECENT_LIMIT,
  );
  if (!store || !userId) return next;
  try {
    store.setItem(quickCompRecentKey(userId), JSON.stringify(next));
  } catch {
    // A full or blocked store only loses the saved list.
  }
  return next;
}

/** localStorage, or null where it is blocked. */
export function browserRecentStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
