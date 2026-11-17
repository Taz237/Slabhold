import { gradeLabel, maskCert, setWithInsert } from "./confirm";
import type { ScanMatch } from "./match";

/**
 * The scan reveal (components/scan/scan-reveal.tsx): the collector's own card spins from its back to
 * its front, then its details type in one line at a time, like a slab label being read. Nothing is
 * guessed: a field nothing read is left out, and an open parallel says so.
 */

export type RevealField = "player" | "year" | "set" | "number" | "parallel";

export const REVEAL_COPY = {
  /** A row on the list that read no player or set. */
  open: "Not sure yet",
  front: "Your card's front",
  noPhoto: "No photo",
  reading: "Reading your card",
  pickTitle: "Pick your card",
  /** The price screen's title in the add flow. */
  yourCard: "Your card",
  /** Above the list: what to do. */
  pickBody: "Tap your card to see its price",
  likely: "Most likely",
  /** A row whose version (plain, Refractor, a numbered color) is still to be picked. */
  parallelOpen: "Version not picked",
  pickAnother: "Not this one? Pick another",
} as const;

/** One line of the reveal's label, typed in like a slab label being read. */
export type RevealLine = { field: RevealField | "cert" | "grade"; text: string };

const VERSION_OPEN = "Version not read yet";

/**
 * The lines the reveal types, in a slab label's order. A raw card: year, set, number, player, then
 * parallel. A slab: its cert first (the last 4 only), then player, year, set, number, grade and
 * parallel. A field nothing read is left out; an open parallel says so, never Base.
 */
export function revealLines(match: ScanMatch): RevealLine[] {
  const parallel = match.parallel
    ? [match.parallel, match.serialRun ? (match.serialNo ? `${match.serialNo}/${match.serialRun}` : `/${match.serialRun}`) : ""].filter(Boolean).join(" ")
    : VERSION_OPEN;
  const year: RevealLine | null = match.yearLabel ? { field: "year", text: match.yearLabel } : null;
  const setText = setWithInsert(match);
  const set: RevealLine | null = setText ? { field: "set", text: setText } : null;
  const number: RevealLine | null = match.cardNumber ? { field: "number", text: `#${match.cardNumber}` } : null;
  const player: RevealLine | null = match.playerName ? { field: "player", text: match.playerName } : null;
  const version: RevealLine = { field: "parallel", text: parallel };
  if (match.grade?.company) {
    const cert = maskCert(match.grade.certNumber ?? "");
    const grade = gradeLabel(match.grade);
    return [cert ? { field: "cert", text: `Cert ${cert}` } : null, player, year, set, number, grade ? { field: "grade", text: grade } : null, version].filter(
      (line): line is RevealLine => line !== null,
    );
  }
  return [year, set, number, player, version].filter((line): line is RevealLine => line !== null);
}

/** Typing speed: a character this long, a line never longer than the cap, a beat between lines. */
const CHAR_MS = 18;
const LINE_CAP_MS = 380;
const LINE_GAP_MS = 90;
/** The card lands (back to front) before the first line types. */
export const LAND_MS = 700;

/** When each line starts typing and how long it takes, and when the whole label is done. */
export function typingPlan(lines: readonly RevealLine[]): { lines: { delayMs: number; durationMs: number; chars: number }[]; totalMs: number } {
  let at = LAND_MS;
  const planned = lines.map((line) => {
    const chars = [...line.text].length;
    const durationMs = Math.min(chars * CHAR_MS, LINE_CAP_MS);
    const item = { delayMs: at, durationMs, chars };
    at += durationMs + LINE_GAP_MS;
    return item;
  });
  return { lines: planned, totalMs: at };
}

/**
 * Sure enough to skip "Pick your card": only one card, or a top match whose player, year, set and
 * card # the card itself pinned. Anything less and the collector picks from the list.
 */
export function matchIsSure(matches: readonly ScanMatch[]): boolean {
  if (matches.length <= 1) return true;
  const sure = matches[0].sureness;
  return sure.player !== "unsure" && sure.year !== "unsure" && sure.set !== "unsure" && sure.number === "sure";
}
