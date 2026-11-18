import { confirmKeyOf, type ClosestCard } from "./closest";
import { scanMissFromBody, type ScanMiss } from "./miss";

/**
 * The scanner's two coverage routes, pure so they are tested without a database:
 *   POST /api/scan/miss       logs a scan that didn't end on the card (lib/scan/miss.ts);
 *   GET  /api/scan/confirmed  the cards collectors confirmed for a read;
 *   POST /api/scan/confirmed  saves the card a collector confirmed for a read.
 * Text only, no photo. A miss stores nothing about who scanned. A confirmation stores one vote per
 * user per card (the user id, server-only, never sent to a phone, deleted with the account), so one
 * person can't vote a card up twice.
 * A confirmation is only saved or shown for a card our checklists have for that player, filed under
 * that player's own read: a made-up card is refused ("Not a card we know") and never shown.
 * A store that fails (the tables are not there yet) never fails the scan: the answer is still ok.
 */

export type CoverageRouteDeps = {
  enabled: () => boolean;
  userId: () => Promise<string | null>;
  allow: (userId: string) => Promise<boolean>;
};

const PRIVATE = { "Cache-Control": "private, no-store" };
const KEY = /^[a-z0-9|]{3,200}$/;

const RATE_MESSAGE = "You're scanning quickly. Try again in a few minutes";
export const NOT_KNOWN_MESSAGE = "Not a card we know";

/** The signed-in user, or the response that stops the request (off, signed out, too fast). */
async function gate(deps: CoverageRouteDeps): Promise<{ userId: string } | Response> {
  if (!deps.enabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const userId = await deps.userId();
  if (!userId) return Response.json({ error: "Log in to scan cards" }, { status: 401 });
  if (!(await deps.allow(userId))) return Response.json({ error: RATE_MESSAGE }, { status: 429, headers: PRIVATE });
  return { userId };
}

export async function respondScanMiss(request: Request, deps: CoverageRouteDeps & { store: (miss: ScanMiss) => Promise<void>; log?: (miss: ScanMiss) => void }): Promise<Response> {
  const gated = await gate(deps);
  if (gated instanceof Response) return gated;
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

/** A card we know for its player (our checklists have it), filed under that player's own read. */
export type KnownCard = (card: ClosestCard) => Promise<boolean>;

export async function respondConfirmedCards(request: Request, deps: CoverageRouteDeps & { read: (key: string) => Promise<ClosestCard[]>; known: KnownCard }): Promise<Response> {
  const gated = await gate(deps);
  if (gated instanceof Response) return gated;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!KEY.test(key)) return Response.json({ error: "key is required" }, { status: 400 });
  try {
    const cards: ClosestCard[] = [];
    // The same check as a save: a row that isn't this player's real card is never shown.
    for (const card of await deps.read(key)) {
      if (confirmKeyOf(card) === key && (await deps.known(card))) cards.push(card);
    }
    return Response.json({ cards }, { headers: PRIVATE });
  } catch {
    return Response.json({ cards: [] }, { headers: PRIVATE });
  }
}

export async function respondConfirmCard(
  request: Request,
  deps: CoverageRouteDeps & { save: (key: string, card: ClosestCard, userId: string) => Promise<void>; known: KnownCard },
): Promise<Response> {
  const gated = await gate(deps);
  if (gated instanceof Response) return gated;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const key = text(body?.key, 200);
  const card = confirmedCardFromBody(body?.card);
  if (!KEY.test(key) || !card) return Response.json({ error: "A key and a card are required" }, { status: 400 });
  // The key is the card's own player's read, and the card is one our checklists have for them.
  let known = false;
  try {
    known = confirmKeyOf(card) === key && (await deps.known(card));
  } catch {
    known = false;
  }
  if (!known) return Response.json({ error: NOT_KNOWN_MESSAGE }, { status: 400, headers: PRIVATE });
  let stored = true;
  try {
    await deps.save(key, card, gated.userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // The database's own answers: this user is voting too fast, or the row failed its checks.
    if (message.includes("scan_confirm_rate_limited")) return Response.json({ error: RATE_MESSAGE }, { status: 429, headers: PRIVATE });
    if (message.includes("scan_confirm_invalid")) return Response.json({ error: NOT_KNOWN_MESSAGE }, { status: 400, headers: PRIVATE });
    stored = false;
  }
  return Response.json({ ok: true, stored }, { headers: PRIVATE });
}
