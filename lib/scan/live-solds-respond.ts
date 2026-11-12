import type { CatalogCard } from "@/lib/card-catalog";
import { scanCaptureFrom } from "@/lib/ios/scanner";
import type { LiveSoldsInput, LiveSoldsResult } from "./live-solds";

export const LIVE_SOLDS_RATE_MESSAGE = "You're scanning quickly. Try again in a few minutes";

export type LiveSoldsRouteDeps = {
  enabled: () => boolean;
  userId: () => Promise<string | null>;
  /** Requests per user per window. The live eBay lookups have their own caps inside. */
  allow: (userId: string) => Promise<boolean>;
  lookup: (input: LiveSoldsInput, userId: string) => Promise<LiveSoldsResult>;
};

const PRIVATE = { "Cache-Control": "private, no-store" };
/** The color names lib/ios/scanner.ts gives a border. Anything else is dropped. */
const BORDER_NAMES = new Set(["red", "orange", "gold", "green", "aqua", "blue", "purple", "pink"]);
const MAX_ROWS = 3;
const FIELD = 80;

function text(value: unknown, limit = FIELD): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

/** The rows the phone ranked, as catalog cards. Only real catalog rows (with an id) are kept. */
export function rowsFromBody(value: unknown): CatalogCard[] {
  if (!Array.isArray(value)) return [];
  const rows: CatalogCard[] = [];
  for (const item of value.slice(0, MAX_ROWS)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = text(row.catalogId, 64);
    const playerName = text(row.playerName);
    if (!id || !playerName) continue;
    rows.push({
      id,
      playerName,
      sport: text(row.sport, 24),
      yearLabel: text(row.yearLabel, 12),
      setBrand: text(row.setBrand),
      cardNumber: text(row.cardNumber, 20),
      parallel: text(row.parallel) || "Base",
      isRookie: row.isRookie === true,
    });
  }
  return rows;
}

/**
 * POST /api/scan/solds: the scan's read text (front and back), and the rows
 * the phone ranked. Returns the matches, re-ranked with eBay sold titles, and
 * the top card's last solds. No photo is sent.
 */
export async function respondLiveSolds(request: Request, deps: LiveSoldsRouteDeps): Promise<Response> {
  if (!deps.enabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const userId = await deps.userId();
  if (!userId) return Response.json({ error: "Log in to see sold prices" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const capture = body ? scanCaptureFrom({ lines: body.lines, backLines: body.backLines, kind: body.kind }) : null;
  if (!capture || capture.lines.length === 0) return Response.json({ error: "lines are required" }, { status: 400 });
  if (!(await deps.allow(userId))) {
    return Response.json({ error: LIVE_SOLDS_RATE_MESSAGE }, { status: 429, headers: PRIVATE });
  }
  const result = await deps.lookup(
    {
      capture: {
        lines: capture.lines,
        backLines: capture.backLines,
        kind: capture.kind,
        border: typeof body?.border === "string" && BORDER_NAMES.has(body.border) ? body.border : null,
      },
      rows: rowsFromBody(body?.rows),
    },
    userId,
  );
  return Response.json(result, { headers: PRIVATE });
}
