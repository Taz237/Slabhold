import { insertNameOf } from "@/lib/cards/insert-name";
import type { ScanMatch } from "./match";

/**
 * The card the scan pinned down: an insert's name ("Rookie Code") and its card # (RC-3), read off
 * the card and placed by the checklist. Once pinned, nothing later (the sold titles, the cache, the
 * server's own re-read) may replace or drop it. Later steps only add to it: its parallel, its
 * price, a listing photo. Open beats wrong, and a pinned card beats a guess.
 */
export type ScanPin = {
  playerName: string;
  sport: string;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  insertName: string;
  isRookie: boolean;
};

const TEXT_MAX = 80;

// Kept small on purpose: the scan screen loads this up front, without the scanner's text reader.
/** "RC-3", "rc 3" and "#RC3" are one card #. */
const numberKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
/** "Topps" and "topps " are one set. */
const setKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Accents, case, periods and Jr./II/III aside: "Cameron Boozer" is "CAMERON BOOZER". */
const nameKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, "")
    .replace(/\s+(?:jr|sr|ii|iii|iv)$/, "")
    .replace(/\s+/g, " ")
    .trim();
/** The same player, as two sources spell him. */
export const samePlayer = (a: string, b: string) => Boolean(nameKey(a)) && nameKey(a) === nameKey(b);
const clean = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, TEXT_MAX) : "");

/** The pin a match carries: an insert, its card #, a player, a year and a set. Null for anything less. */
export function pinOf(match: ScanMatch | null | undefined): ScanPin | null {
  if (!match) return null;
  const insertName = insertNameOf(match);
  if (!insertName || !match.cardNumber.trim() || match.sureness.number === "unsure") return null;
  if (!match.playerName.trim() || !match.yearLabel.trim() || !match.setBrand.trim()) return null;
  return {
    playerName: match.playerName.trim(),
    sport: match.sport,
    yearLabel: match.yearLabel.trim(),
    setBrand: match.setBrand.trim(),
    cardNumber: match.cardNumber.trim(),
    insertName,
    isRookie: match.isRookie,
  };
}

/** A pin from a request body, field by field. Null for anything unusable. */
export function pinFromBody(value: unknown): ScanPin | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const pin: ScanPin = {
    playerName: clean(raw.playerName),
    sport: clean(raw.sport),
    yearLabel: clean(raw.yearLabel),
    setBrand: clean(raw.setBrand),
    cardNumber: clean(raw.cardNumber).slice(0, 20),
    insertName: insertNameOf({ insertName: clean(raw.insertName) }),
    isRookie: raw.isRookie === true,
  };
  if (!pin.playerName || !pin.yearLabel || !pin.setBrand || !pin.insertName) return null;
  if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(pin.cardNumber)) return null;
  return pin;
}

/** The same card as the pin: player, year, set and card #. */
export function samePinnedCard(pin: ScanPin, match: Pick<ScanMatch, "playerName" | "yearLabel" | "setBrand" | "cardNumber">): boolean {
  return (
    samePlayer(match.playerName, pin.playerName) &&
    match.yearLabel.trim() === pin.yearLabel &&
    setKey(match.setBrand) === setKey(pin.setBrand) &&
    numberKey(match.cardNumber) === numberKey(pin.cardNumber)
  );
}

/** The pin dropped or replaced: the top isn't the pinned card, or lost its insert. */
export function downgradesPin(pin: ScanPin | null, matches: readonly ScanMatch[]): boolean {
  const top = matches[0];
  return Boolean(pin) && (!top || !samePinnedCard(pin!, top) || !insertNameOf(top));
}

/**
 * The matches with the pinned card first, whole. A later match of the same card keeps what it
 * added (a parallel the sales named, a listing photo) and gets the pin's identity back. With no
 * such match, `fallback` (the read itself) leads. Other matches follow, as they were ranked.
 */
export function keepPinned(pin: ScanPin | null, matches: readonly ScanMatch[], fallback: ScanMatch | null): ScanMatch[] {
  if (!pin || !downgradesPin(pin, matches)) return [...matches];
  const same = matches.find((match) => samePinnedCard(pin, match));
  const base = same ?? (fallback && samePinnedCard(pin, fallback) ? fallback : null);
  if (!base) return [...matches];
  const pinned: ScanMatch = {
    ...base,
    playerName: base.playerName || pin.playerName,
    yearLabel: pin.yearLabel,
    setBrand: pin.setBrand,
    cardNumber: pin.cardNumber,
    insertName: pin.insertName,
    sureness: { ...base.sureness, number: "sure", year: base.sureness.year === "unsure" ? "likely" : base.sureness.year, set: base.sureness.set === "unsure" ? "likely" : base.sureness.set },
  };
  return [pinned, ...matches.filter((match) => match !== same)];
}

/**
 * The read itself as a match, built from a pin the phone sent when this side's own read came out
 * weaker (no insert, no #). The version stays open; `parallelOptions` are the insert's own.
 */
export function matchFromPin(pin: ScanPin, parallelOptions: ScanMatch["parallelOptions"], serial: { run: number | null; no: string } = { run: null, no: "" }): ScanMatch {
  return {
    catalogId: null,
    playerName: pin.playerName,
    sport: pin.sport,
    yearLabel: pin.yearLabel,
    setBrand: pin.setBrand,
    cardNumber: pin.cardNumber,
    insertName: pin.insertName,
    parallel: "",
    serialRun: serial.run,
    serialNo: serial.no,
    isRookie: pin.isRookie,
    isAuto: false,
    grade: null,
    score: 0,
    sureness: { player: "sure", year: "likely", set: "likely", number: "sure", parallel: "unsure" },
    parallelOptions,
  };
}
