import type { ScanMatch, ScanMatchResult } from "./match";
import type { ScanCapture } from "./session";

/**
 * "Flip it over": a raw card whose front alone couldn't pin the card (no year, set or card #, or
 * one we aren't sure of) asks once for a photo of the back, then reads both sides together.
 * Pure, so the hub only wires it. One extra tap, always skippable, and a front that is already
 * enough never sees it.
 */

export const BACK_COPY = {
  title: "Flip it over",
  body: "The back prints the year, set and card number. One photo of it and we can finish the match.",
  scan: "Scan the back",
  skip: "Skip",
  skipLabel: "Skip the back and use the front",
  missing: "Not read yet",
  year: "Year",
  set: "Set",
  number: "Card #",
} as const;

export type BackField = "year" | "set" | "number";
export type ScanSource = "camera" | "library";

/**
 * The phone's own camera already asks for the back when the front prints no card # line
 * (CardScannerViewController.needsBack, before it asked on every raw card). The same test here, so
 * a collector who skipped it there is never asked twice. Newer builds say so outright (backAsked).
 */
export function nativeAskedForBack(lines: readonly string[]): boolean {
  return !lines.some((line) => /(#|\bNO\.)\s*[A-Z0-9]/i.test(line));
}

/** The fields the front left empty or unsure, in the order the sheet lists them. */
export function missingFields(match: ScanMatch | undefined): BackField[] {
  if (!match) return ["year", "set", "number"];
  const out: BackField[] = [];
  if (!match.yearLabel.trim() || match.sureness.year === "unsure") out.push("year");
  if (!match.setBrand.trim() || match.sureness.set === "unsure") out.push("set");
  if (!match.cardNumber.trim() || match.sureness.number === "unsure") out.push("number");
  return out;
}

/**
 * Ask for the back: a raw card read from its front only, the search worked, and the top match is
 * missing its year, set or card # (or there is no match yet). Never for a slab (its label has them),
 * never when the back is already in, and never right after the phone's camera asked and was skipped.
 */
export function needsBackStep(capture: ScanCapture, result: ScanMatchResult | null, source: ScanSource): boolean {
  if (!result) return false;
  if (capture.kind === "slab" || result.matches[0]?.grade?.company) return false;
  if (capture.backLines?.length) return false;
  if (capture.lines.length === 0) return false;
  if (capture.backAsked) return false;
  if (source === "camera" && nativeAskedForBack(capture.lines)) return false;
  return missingFields(result.matches[0]).length > 0;
}

/**
 * The front and the back as one scan. Everything the back's scan read counts as the back (a back
 * that printed no card # can come back with a second read of its own), and the front's photo stays
 * the card's photo.
 */
export function withBack(front: ScanCapture, back: ScanCapture): ScanCapture {
  const backLines = [...back.lines, ...(back.backLines ?? [])];
  const sameShape = back.alternates?.length === back.lines.length && !back.backLines?.length;
  const combined: ScanCapture = { ...front, backLines, backAlternates: sameShape ? back.alternates : null, backImage: back.image ?? null };
  return combined;
}
