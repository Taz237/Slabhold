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
  // The same pick again (a retry): the very same rows, so the sheet keeps everything.
  if (top.parallel === pick.name && top.serialNo === serialNo && top.sureness.parallel === "sure" && (pick.serialRun ?? top.serialRun) === top.serialRun) return [...rows];
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

/**
 * Whether a pick should read the slab again now: a key for that read (so each tap reads once), or
 * null. A slab still waiting on its version reads on the first pick. After a read, picking another
 * version reads that one, and tapping any version after a failed read tries again.
 */
export function versionReadKey(solds: SoldsState | undefined, pick: ParallelPick, picked: boolean, taps: number): string | null {
  if (!picked || !pick || solds?.status !== "done") return null;
  const key = `${pick.name}#${taps}`;
  if (solds.comp.status === "version") return key;
  if (!solds.version) return null;
  return pick.name !== solds.version || solds.comp.status === "unavailable" ? key : null;
}

/** The sales to show beside a pick: never a read's prices under a different version. */
export function soldsForPick(solds: SoldsState | undefined, pick: string | null): SoldsState | undefined {
  if (solds?.status === "done" && solds.version && pick !== solds.version) return undefined;
  return solds;
}

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
  const version = top?.parallel ?? "";
  const found = solds?.matches[0];
  const same = Boolean(top && found && sameCardRow(top, found) && key(found.parallel) === key(top.parallel));
  if (!solds || !same || solds.comp.status === "version") {
    return { kind: "ready", matches: rows, solds: { status: "done", comp: { status: "unavailable" }, query: null, version } };
  }
  return {
    kind: "ready",
    matches: rows,
    solds: { status: "done", comp: solds.comp, query: solds.query, ...(solds.queries?.length ? { queries: solds.queries } : {}), version, ...(solds.similar ? { similar: solds.similar } : {}) },
  };
}
