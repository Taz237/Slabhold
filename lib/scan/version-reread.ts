import type { LiveSoldsResult } from "./live-solds";
import type { SoldsState } from "./comp";
import type { ScanMatch } from "./match";
import type { ParallelPick } from "./confirm";

/**
 * "Which version?" picked on a slab: the sheet's rows as the collector left them, with the pick
 * on the top row. The row they promoted stays on top and a serial they typed stays typed.
 */
export function rowsWithVersion(rows: readonly ScanMatch[], pick: NonNullable<ParallelPick>, serialNo: string): ScanMatch[] {
  const [top, ...rest] = rows;
  if (!top) return [];
  const picked: ScanMatch = {
    ...top,
    parallel: pick.name,
    serialRun: pick.serialRun ?? top.serialRun,
    serialNo,
    sureness: { ...top.sureness, parallel: "sure" },
    // The versions offered stay, so the collector can still change their mind.
    parallelOptions: top.parallelOptions.some((option) => option.name === pick.name)
      ? top.parallelOptions
      : [{ name: pick.name, serialRun: pick.serialRun }, ...top.parallelOptions],
  };
  return [picked, ...rest];
}

const key = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The same card, by what's printed: player, year, set and card #. The parallel is not compared. */
export function sameCardRow(a: ScanMatch, b: ScanMatch): boolean {
  return (
    key(a.playerName) === key(b.playerName) &&
    key(a.yearLabel) === key(b.yearLabel) &&
    key(a.setBrand) === key(b.setBrand) &&
    key(a.cardNumber) === key(b.cardNumber)
  );
}

const UNAVAILABLE: SoldsState = { status: "done", comp: { status: "unavailable" }, query: null };

/**
 * The sheet after the slab is read again as the picked version. The rows stay exactly as the
 * collector left them (same objects), so the sheet keeps its picks and nothing is re-asked.
 * The sales show only when the read found this same card at this same version. A failed or
 * offline read keeps the pick and says sold prices are unavailable: never a lost sheet, never
 * another card's prices.
 */
export function versionRereadSheet(
  rows: ScanMatch[],
  solds: LiveSoldsResult | null,
): { kind: "ready"; matches: ScanMatch[]; solds: SoldsState } {
  const top = rows[0];
  const found = solds?.matches[0];
  const same = Boolean(top && found && sameCardRow(top, found) && key(found.parallel) === key(top.parallel));
  if (!solds || !same || solds.comp.status === "version") return { kind: "ready", matches: rows, solds: UNAVAILABLE };
  return {
    kind: "ready",
    matches: rows,
    solds: { status: "done", comp: solds.comp, query: solds.query, ...(solds.similar ? { similar: solds.similar } : {}) },
  };
}
