import { parseYearLabel } from "@/lib/card-options";

/**
 * The manual form's year, read the way people type it on a phone: full-width
 * digits, an en or em dash from smart punctuation ("2023–24"), stray spaces
 * or a trailing period. Null only when it really isn't a year.
 */
export function readManualYear(value: string): { year: number; yearLabel: string } | null {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[‐-―−]/g, "-")
    .replace(/[\s​-‍﻿]+/g, "")
    .replace(/[.,]+$/, "");
  return parseYearLabel(cleaned);
}

/** Why a year doesn't read, said next to the field. Empty when it reads, or nothing is typed yet. */
export function manualYearError(value: string): string {
  if (!value.trim()) return "Add the year";
  return readManualYear(value) ? "" : "Use a year like 2023 or 2023-24";
}

const YEAR_IN_TEXT = /(?<![\p{N}#/])((?:19|20)\d{2})(?:\s*[-‐-―/]\s*(\d{2}|\d{4}))?(?![\p{N}])/u;

/**
 * Search text split for the manual form: "Darius Acuff 2023" fills Player with
 * "Darius Acuff" and Year with 2023, so the year never sits in Player while the
 * Year box looks filled.
 */
export function splitManualQuery(text: string): { player: string; year: string } {
  const match = YEAR_IN_TEXT.exec(text);
  if (!match) return { player: text.replace(/\s+/g, " ").trim(), year: "" };
  const label = match[2] ? `${match[1]}-${match[2]}` : match[1];
  const year = readManualYear(label)?.yearLabel ?? "";
  if (!year) return { player: text.replace(/\s+/g, " ").trim(), year: "" };
  const player = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`.replace(/\s+/g, " ").trim();
  return { player, year };
}
