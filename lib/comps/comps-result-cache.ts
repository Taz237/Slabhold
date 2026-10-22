import { parallelMatchKey } from "@/lib/cards/parallels";
import { normalizeCardNumber, setMatchPhrase } from "@/lib/comps/match";

/** Repeat views reuse comps for 45 minutes. Inside the 30–60 minute window. */
export const COMPS_RESULT_REVALIDATE_SECONDS = 45 * 60;

export class CompsResultError extends Error {
  constructor(message = "comps unavailable") {
    super(message);
    this.name = "CompsResultError";
  }
}

export type CompsIdentity = {
  id?: string;
  playerName?: string | null;
  year?: number | null;
  yearLabel?: string | null;
  setBrand?: string | null;
  cardNumber?: string | null;
  parallel?: string | null;
  grade?: string | null;
};

function playerKey(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function gradeKey(grade: string | null | undefined): string {
  const text = (grade ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text || text === "raw" || text === "ungraded" || text === "—") return "raw";
  return text;
}

/**
 * Identity of the card being priced: player, year, set, number, parallel, grade.
 * A different parallel or grade is a different key. The card id keeps one
 * collector's sales from being served as another copy's cache entry.
 */
export function compsIdentityKey(card: CompsIdentity): string {
  const year = (card.yearLabel ?? "").trim() || String(card.year ?? "");
  const parallel = parallelMatchKey(card.parallel || "Base") || "base";
  return [
    playerKey(card.playerName),
    year,
    setMatchPhrase(card.setBrand ?? ""),
    normalizeCardNumber(card.cardNumber),
    parallel,
    gradeKey(card.grade),
  ].join("|");
}

/** Next cache key for one card's comps result. */
export function compsResultCacheKey(card: CompsIdentity & { id: string }): string {
  return `${card.id}|${compsIdentityKey(card)}`;
}

export type CompsCacheStore<T> = {
  read(key: string): Promise<T | undefined>;
  write(key: string, value: T): Promise<void>;
};

function isFailedPayload(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== "object") return false;
  return "ok" in value && (value as { ok?: boolean }).ok === false;
}

/**
 * Read-through cache. A throw or `{ ok: false }` is not written, so the next
 * call tries again. Next's `unstable_cache` follows the same rule: a thrown
 * error is not stored.
 */
export async function rememberCompsResult<T>(
  key: string,
  load: () => Promise<T>,
  store: CompsCacheStore<T>,
): Promise<T> {
  const hit = await store.read(key);
  if (hit !== undefined) return hit;

  let fresh: T;
  try {
    fresh = await load();
  } catch (err) {
    throw err instanceof CompsResultError
      ? err
      : new CompsResultError(err instanceof Error ? err.message : "comps unavailable");
  }

  if (isFailedPayload(fresh)) {
    throw new CompsResultError("comps unavailable");
  }

  await store.write(key, fresh);
  return fresh;
}
