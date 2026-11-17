import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { scanPlayerName, type ScanMatch, type ScanRead } from "./match";

/**
 * The scan reveal (components/scan/scan-reveal.tsx): while the card is read, its five fields fill
 * in as each is found. First what the card's own text gives (the player, the card #), then the
 * year, set and number of the top match, and its parallel when one was read. Nothing is guessed:
 * a field nothing found stays empty.
 */

export const REVEAL_FIELDS = ["player", "year", "set", "number", "parallel"] as const;
export type RevealField = (typeof REVEAL_FIELDS)[number];
export type RevealFound = Partial<Record<RevealField, string>>;

export const REVEAL_COPY = {
  labels: { player: "Player", year: "Year", set: "Set", number: "Number", parallel: "Parallel" } satisfies Record<RevealField, string>,
  /** A field nothing found, once the read is done. */
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
  parallelOpen: "Parallel open",
  pickAnother: "Not this one? Pick another",
} as const;

/** What the card's own text gives before any lookup: the player and the card # it printed. */
export function earlyFound(read: ScanRead, directory: readonly IndexedDirectoryPlayer[]): RevealFound {
  const found: RevealFound = {};
  const player = scanPlayerName(read, directory);
  if (player) found.player = player;
  const number = read.kind === "slab" ? read.label.cardNumber : read.back?.cardNumber || read.front.cardNumber;
  if (number) found.number = `#${number}`;
  return found;
}

/** The fields the top match fills. */
export function revealFoundFrom(match: ScanMatch | undefined): RevealFound {
  if (!match) return {};
  const found: RevealFound = {};
  if (match.playerName) found.player = match.playerName;
  if (match.yearLabel) found.year = match.yearLabel;
  if (match.setBrand) found.set = match.setBrand;
  if (match.cardNumber) found.number = `#${match.cardNumber}`;
  if (match.parallel) found.parallel = match.parallel;
  return found;
}
