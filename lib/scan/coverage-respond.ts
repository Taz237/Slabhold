import type { ClosestCard } from "./closest";
import { scanMissFromBody, type ScanMiss } from "./miss";

/**
 * The scanner's two coverage routes, pure so they are tested without a database:
 *   POST /api/scan/miss       logs a scan that didn't end on the card (lib/scan/miss.ts);
 *   GET  /api/scan/confirmed  the cards collectors confirmed for a read;
 *   POST /api/scan/confirmed  saves the card a collector confirmed for a read.
 * Text only. Neither stores who scanned: the user id is used for the rate limit and dropped.
 * A store that fails (the tables are not there yet) never fails the scan: the answer is still ok.
 */

export type CoverageRouteDeps = {
  enabled: () => boolean;
  userId: () => Promise<string | null>;
  allow: (userId: string) => Promise<boolean>;
};

const PRIVATE = { "Cache-Control": "private, no-store" };
const KEY = /^[a-z0-9|]{3,200}$/;

async function gate(deps: CoverageRouteDeps): Promise<Response | null> {
  if (!deps.enabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const userId = await deps.userId();
  if (!userId) return Response.json({ error: "Log in to scan cards" }, { status: 401 });
  if (!(await deps.allow(userId))) return Response.json({ error: "You're scanning quickly. Try again in a few minutes" }, { status: 429, headers: PRIVATE });
  return null;
}

export async function respondScanMiss(request: Request, deps: CoverageRouteDeps & { store: (miss: ScanMiss) => Promise<void>; log?: (miss: ScanMiss) => void }): Promise<Response> {
  const stopped = await gate(deps);
  if (stopped) return stopped;
  const miss = scanMissFromBody(await request.json().catch(() => null));
  if (!miss) return Response.json({ error: "A miss needs a reason" }, { status: 400 });
  // One line in the server log every time, so misses show even before the table exists.
  deps.log?.(miss);
  let stored = true;
  try {
    await deps.store(miss);
  } catch {
    stored = false;
  }
  return Response.json({ ok: true, stored }, { headers: PRIVATE });
}

const text = (value: unknown, limit: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "");

/** A confirmed card from a request body, field by field. Null unless it has a player, a year, a set and a card #. */
export function confirmedCardFromBody(value: unknown): ClosestCard | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const card: ClosestCard = {
    playerName: text(raw.playerName, 80),
    sport: text(raw.sport, 24),
    yearLabel: text(raw.yearLabel, 12),
    setBrand: text(raw.setBrand, 80),
    cardNumber: text(raw.cardNumber, 20),
  };
  if (!card.playerName || !/^\d{4}(-\d{2})?$/.test(card.yearLabel) || !card.setBrand) return null;
  if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(card.cardNumber)) return null;
  return card;
}

export async function respondConfirmedCards(request: Request, deps: CoverageRouteDeps & { read: (key: string) => Promise<ClosestCard[]> }): Promise<Response> {
  const stopped = await gate(deps);
  if (stopped) return stopped;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!KEY.test(key)) return Response.json({ error: "key is required" }, { status: 400 });
  try {
    return Response.json({ cards: await deps.read(key) }, { headers: PRIVATE });
  } catch {
    return Response.json({ cards: [] }, { headers: PRIVATE });
  }
}

export async function respondConfirmCard(request: Request, deps: CoverageRouteDeps & { save: (key: string, card: ClosestCard) => Promise<void> }): Promise<Response> {
  const stopped = await gate(deps);
  if (stopped) return stopped;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const key = text(body?.key, 200);
  const card = confirmedCardFromBody(body?.card);
  if (!KEY.test(key) || !card) return Response.json({ error: "A key and a card are required" }, { status: 400 });
  let stored = true;
  try {
    await deps.save(key, card);
  } catch {
    stored = false;
  }
  return Response.json({ ok: true, stored }, { headers: PRIVATE });
}
