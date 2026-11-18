import type { ScanMatch, ScanMatchResult } from "./match";

/**
 * A scan that didn't end on the card: what we read, what we searched and why it fell out, in a
 * shape small enough to log every time (POST /api/scan/miss). Text only: no photo, no cert number,
 * nothing about who scanned it. Pure, so the hub only sends it and the route only stores it.
 */

export type ScanMissReason =
  /** The camera read no text at all. */
  | "no_text"
  /** Text, but no player we could name, and no year, set and card # to look one up by. */
  | "no_player"
  /** A player and nothing that names the card: their cards were offered to pick from. */
  | "player_only"
  /** Everything we found disagreed with what the back printed, so nothing was shown. */
  | "unpinned"
  /** A card was shown with its year, set or card # still open. */
  | "open_fields"
  /** A card was shown, and the collector left it for a search or the step-by-step add. */
  | "none_of_these";

export type ScanMiss = {
  reason: ScanMissReason;
  /** Why, in plain words, for the weekly read. */
  why: string;
  kind: "card" | "slab" | "unknown";
  lines: string[];
  backLines: string[];
  /** What the scan read off the card. */
  read: { player: string; sport: string; year: string; set: string; number: string; run: number | null; auto: boolean; relic: boolean; rookie: boolean };
  /** What was searched: the catalog queries, and the checklist the read pointed at ("" for none). */
  searched: { catalog: string[]; checklist: string; checklistFiles: number };
  /** What the collector was shown: the top card's line and how many choices. */
  shown: { top: string; matches: number; closest: number };
};

const MAX_LINES = 40;
const MAX_LINE = 120;
/** A slab's cert number, or any long run of digits: never logged. */
const LONG_DIGITS = /\d{7,}/g;

function clip(lines: readonly string[] | null | undefined): string[] {
  return (lines ?? [])
    .slice(0, MAX_LINES)
    .map((line) => String(line).replace(LONG_DIGITS, "#").replace(/\s+/g, " ").trim().slice(0, MAX_LINE))
    .filter(Boolean);
}

const lineOf = (match: ScanMatch | undefined) =>
  match ? [match.playerName, match.yearLabel, match.setBrand, match.cardNumber ? `#${match.cardNumber}` : "", match.parallel, match.serialRun ? `/${match.serialRun}` : ""].filter(Boolean).join(" · ") : "";

export type ScanMissInput = {
  capture: { lines: string[]; backLines: string[] | null; kind: "card" | "slab" | null };
  result: ScanMatchResult | null;
  /** The player the read named ("" for none) and their sport. */
  player: { name: string; sport: string };
  /** The catalog queries and checklist the scan looked up. */
  searched: { catalog: string[]; checklist: { years: readonly string[]; setBrand: string; sport: string } | null; checklistFiles: number };
  /** How many closest cards were offered. */
  closest: number;
  /** The collector left the card shown for a search or the step-by-step add. */
  leftForSearch?: boolean;
};

/** The miss to log for this scan, or null when it ended on a card with its year, set and card # read. */
export function scanMissOf(input: ScanMissInput): ScanMiss | null {
  const top = input.result?.matches[0];
  const open = top ? (["year", "set", "number"] as const).filter((field) => top.sureness[field] === "unsure" || !(field === "year" ? top.yearLabel : field === "set" ? top.setBrand : top.cardNumber).trim()) : [];
  const checklist = input.searched.checklist;
  const checklistLine = checklist ? [checklist.years.join("/"), checklist.setBrand, checklist.sport].filter(Boolean).join(" ") : "";
  let reason: ScanMissReason;
  let why: string;
  if (input.capture.lines.length === 0) {
    reason = "no_text";
    why = "The camera read no text.";
  } else if (input.result?.unpinned) {
    reason = "unpinned";
    why = "Every card we found disagreed with the back's maker or card #.";
  } else if (!top && !input.player.name) {
    reason = "no_player";
    why = "No player we know was read, and no year, set and card # to look one up by.";
  } else if (!top) {
    reason = "player_only";
    why = input.closest > 0 ? `Only the player was read. ${input.closest} of their cards were offered.` : "Only the player was read, and our checklists have no card of theirs.";
  } else if (input.leftForSearch) {
    reason = "none_of_these";
    why = "The collector left the card we showed.";
  } else if (open.length > 0) {
    reason = "open_fields";
    why = `Shown with ${open.join(", ")} open.${checklistLine && input.searched.checklistFiles === 0 ? ` No checklist for ${checklistLine}.` : ""}`;
  } else {
    return null;
  }
  return {
    reason,
    why,
    kind: input.capture.kind ?? "unknown",
    lines: clip(input.capture.lines),
    backLines: clip(input.capture.backLines),
    read: {
      player: (top?.playerName || input.player.name).slice(0, 80),
      sport: (top?.sport || input.player.sport).slice(0, 24),
      year: top?.yearLabel ?? "",
      set: top?.setBrand ?? "",
      number: top?.cardNumber ?? "",
      run: top?.serialRun ?? null,
      auto: Boolean(top?.isAuto),
      relic: Boolean(top?.isRelic),
      rookie: Boolean(top?.isRookie),
    },
    searched: { catalog: input.searched.catalog.slice(0, 4).map((query) => query.slice(0, 120)), checklist: checklistLine, checklistFiles: input.searched.checklistFiles },
    shown: { top: lineOf(top), matches: input.result?.matches.length ?? 0, closest: input.closest },
  };
}

const REASONS = new Set<ScanMissReason>(["no_text", "no_player", "player_only", "unpinned", "open_fields", "none_of_these"]);
const text = (value: unknown, limit: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "");
const count = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 100000 ? value : 0);

/** A miss from a request body, field by field. Null for anything unusable. Nothing is trusted as it came. */
export function scanMissFromBody(value: unknown): ScanMiss | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const reason = raw.reason as ScanMissReason;
  if (!REASONS.has(reason)) return null;
  const read = (raw.read && typeof raw.read === "object" ? raw.read : {}) as Record<string, unknown>;
  const searched = (raw.searched && typeof raw.searched === "object" ? raw.searched : {}) as Record<string, unknown>;
  const shown = (raw.shown && typeof raw.shown === "object" ? raw.shown : {}) as Record<string, unknown>;
  const lines = (list: unknown) => clip(Array.isArray(list) ? list.filter((line): line is string => typeof line === "string") : []);
  return {
    reason,
    why: text(raw.why, 200),
    kind: raw.kind === "card" || raw.kind === "slab" ? raw.kind : "unknown",
    lines: lines(raw.lines),
    backLines: lines(raw.backLines),
    read: {
      player: text(read.player, 80),
      sport: text(read.sport, 24),
      year: text(read.year, 12),
      set: text(read.set, 80),
      number: text(read.number, 20),
      run: count(read.run) || null,
      auto: read.auto === true,
      relic: read.relic === true,
      rookie: read.rookie === true,
    },
    searched: {
      catalog: Array.isArray(searched.catalog) ? searched.catalog.slice(0, 4).map((query) => text(query, 120)).filter(Boolean) : [],
      checklist: text(searched.checklist, 120),
      checklistFiles: count(searched.checklistFiles),
    },
    shown: { top: text(shown.top, 200), matches: count(shown.matches), closest: count(shown.closest) },
  };
}
