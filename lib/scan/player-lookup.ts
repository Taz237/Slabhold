import { setMatchPhrase } from "@/lib/comps/match";
import { sameSeason } from "@/lib/cards/product-data";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { findPlayers, readRawCardText, readsAsNameLine } from "./raw-text";
import { TITLE_LOT, titleRuns } from "./title-facts";

/**
 * The player as a lookup, not a guess. Once a scan has the year, the set and the card #, the
 * player is whoever is on that card, and three sources can say who:
 *
 *   A. The checklist (lib/cards/checklists.ts): the player listed at that number.
 *   B. The market: sold titles for that year, set and card #, when a clear majority name one player.
 *   C. The card: the printed name the OCR read, once A or B agrees with it.
 *
 * A name is only filled in when a source backs it. Nothing here invents one: no agreement leaves
 * the player open. This file holds the pure parts: comparing names and reading the market's vote.
 * The matcher (match.ts, withLookedUpPlayer) decides.
 */

const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** OCR reads a letter as the digit that looks like it. */
const DIGIT_AS_LETTER: Record<string, string> = { "0": "o", "1": "l", "5": "s", "8": "b" };

function plainWords(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’`]/g, "")
    .replace(/[0158]/g, (digit) => DIGIT_AS_LETTER[digit])
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * A name with everything a card or a seller can print differently taken out: accents, case,
 * periods, apostrophes, hyphens, spaces, and a trailing Jr., Sr., II, III. "C.J. Stroud" and
 * "CJ STROUD" are one key, and so are "Ronald Acuña Jr." and "RONALD ACUNA".
 */
export function nameKey(name: string): string {
  const words = plainWords(name);
  while (words.length > 2 && SUFFIX.has(words[words.length - 1])) words.pop();
  return words.join("");
}

/** "Labaron Philon Jr." → "Labaron Philon". A name of two words keeps both. */
export function withoutSuffix(name: string): string {
  const words = name.trim().split(/\s+/);
  while (words.length > 2 && SUFFIX.has(words[words.length - 1].toLowerCase().replace(/\./g, ""))) words.pop();
  return words.join(" ");
}

function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_unused, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = row[0];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (row[j] < best) best = row[j];
    }
    if (best > limit) return limit + 1;
    previous = row;
  }
  return previous[b.length];
}

/**
 * The same person: equal keys, or a small OCR slip apart (one letter in a name of 9+ letters,
 * two in 14+). Only ever used to compare what the card printed against the one player a source
 * puts on that exact card, so a slip is a slip, not another player.
 */
export function namesAgree(left: string, right: string): boolean {
  const a = nameKey(left);
  const b = nameKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  const slips = shorter >= 14 ? 2 : shorter >= 9 ? 1 : 0;
  return slips > 0 && editDistance(a, b, slips) <= slips;
}

/**
 * The card printed only the surname, or the first name fell on another line: "THOMPSON-ROBINSON"
 * for Dorian Thompson-Robinson. The printed words are the end of the source's name, five letters
 * or more. Like namesAgree, only ever asked about the one player a source puts on this exact card.
 */
export function surnameAgrees(printed: string, full: string): boolean {
  const part = plainWords(printed).filter((word) => !SUFFIX.has(word)).join("");
  const words = plainWords(full);
  while (words.length > 2 && SUFFIX.has(words[words.length - 1])) words.pop();
  if (part.length < 5 || words.length < 2) return false;
  for (let start = 1; start < words.length; start += 1) {
    if (words.slice(start).join("") === part) return true;
  }
  return false;
}

/** The card a scan read, as far as the lookup needs it. */
export type LookupCard = {
  /** The years the card can be: the one it printed, or its © year and the year before. */
  years: readonly string[];
  setBrand: string;
  cardNumber: string;
  /** The print run, when the card showed one. */
  run: number | null;
};

export type MarketPlayer = {
  /** The name as most of those titles write it. */
  name: string;
  /** Titles naming this player, out of the titles for this card. */
  votes: number;
  of: number;
};

/** Fewest titles before "most of them" means anything. */
export const MARKET_MIN_VOTES = 2;
/** With no name read off the card to compare against, the titles alone need this many. */
export const MARKET_ALONE_MIN_VOTES = 3;

/** Words sellers put in a title that are never a name, on top of the card words raw-text.ts knows. */
const TITLE_NOISE = new Set([
  "nil", "ncaa", "nfl", "nba", "wnba", "mlb", "nhl", "psa", "bgs", "sgc", "cgc", "gem", "mint", "mt", "nm", "raw", "graded", "ungraded",
  "ssp", "sp", "sssp", "case", "hit", "hot", "rare", "new", "nice", "clean", "sharp", "look", "invest", "free", "shipping", "ship",
  "fast", "read", "see", "pics", "photos", "description", "centered", "pack", "fresh", "pop", "low", "high", "grade", "lot", "sale",
  "sold", "hof", "goat", "roy", "qb", "rb", "wr", "te", "pg", "sg", "sf", "pf", "of", "ss", "sp", "rp", "holo", "color", "match",
  "variation", "variations", "short", "print", "image", "photo", "error", "numbered", "serial", "ssp", "mojo", "wave", "ice", "pulsar",
  "disco", "scope", "shimmer", "velocity", "laser", "hyper", "fast", "break", "choice", "retail", "hobby", "blaster", "mega", "fotl",
  "cello", "jumbo", "value", "box", "trading", "sports", "sport", "panini", "topps", "bowman", "donruss", "leaf", "upper", "deck",
  "paper", "border", "foil", "edition", "collegiate", "prospects", "rookies", "freshman", "legend", "legends", "duke", "tide", "crimson",
]);

function sameSet(left: string, right: string): boolean {
  const a = setMatchPhrase(left);
  return Boolean(a) && a === setMatchPhrase(right);
}

function numberKey(value: string): string {
  return value.replace(/^#/, "").trim().toLowerCase();
}

/**
 * Words that are in a set's name and are also people's names (Topps Allen & Ginter, Court Kings,
 * Leaf, Score, Bowman's Best, Bowman Sterling). In a title for another set they are a name.
 */
const SET_WORDS_THAT_ARE_NAMES = new Set(["allen", "kings", "court", "leaf", "score", "best", "sterling"]);

/** Name-like runs of 2 or 3 words in a title. "C.J." reads as CJ; a word with a digit ends a run. */
function nameWindows(title: string, setBrand: string, directory: readonly IndexedDirectoryPlayer[]): string[] {
  const ownSet = new Set(setBrand.toLowerCase().split(/[^a-z]+/).filter(Boolean));
  const asName = (word: string) => SET_WORDS_THAT_ARE_NAMES.has(word.toLowerCase()) && !ownSet.has(word.toLowerCase());
  const tokens = title
    .replace(/[()[\]{}|,!*~"“”]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\d]+|[^\p{L}\d.]+$/gu, "").replace(/\.(?=\p{L})|\.$/gu, ""))
    .filter(Boolean);
  const out: string[] = [];
  for (let size = 2; size <= 3; size += 1) {
    for (let start = 0; start + size <= tokens.length; start += 1) {
      const window = tokens.slice(start, start + size);
      if (window.some((word) => /\d/.test(word) || TITLE_NOISE.has(word.toLowerCase()) || (SUFFIX.has(word.toLowerCase()) && word !== window[size - 1]))) continue;
      // A suffix alone is not a second word: "Philon Jr" names nobody.
      if (size === 2 && SUFFIX.has(window[1].toLowerCase())) continue;
      const text = window.join(" ");
      // "Allen Lazard" on a Prizm title: checked with the set word stood in for, never when every word is one.
      const stoodIn = window.map((word) => (asName(word) ? "Xx" : word));
      if (readsAsNameLine(text, directory) || (stoodIn.some((word) => word !== "Xx") && readsAsNameLine(stoodIn.join(" "), directory))) out.push(text);
    }
  }
  return out;
}

function tidyName(text: string): string {
  if (text !== text.toUpperCase() && text !== text.toLowerCase()) return text;
  return text.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_all, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
}

/**
 * The titles that are for this card: the same card #, the same set, a year the card can be, and
 * (on a numbered card) no other print run. Lots, reprints and customs never count.
 */
export function titlesForCard(
  titles: readonly { title: string }[],
  card: LookupCard,
  directory: readonly IndexedDirectoryPlayer[],
): string[] {
  const number = numberKey(card.cardNumber);
  if (!number || !card.setBrand || card.years.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const sold of titles) {
    const title = typeof sold?.title === "string" ? sold.title.replace(/\s+/g, " ").trim() : "";
    if (!title || seen.has(title.toLowerCase()) || TITLE_LOT.test(title)) continue;
    seen.add(title.toLowerCase());
    const read = readRawCardText([title], directory);
    if (numberKey(read.cardNumber) !== number) continue;
    if (!read.setNames[0] || !sameSet(read.setNames[0], card.setBrand)) continue;
    if (!read.yearLabel || !card.years.some((year) => sameSeason(read.yearLabel, year))) continue;
    const runs = titleRuns(title);
    if (card.run != null && runs.length > 0 && !runs.includes(card.run)) continue;
    out.push(title);
  }
  return out;
}

/**
 * The one player a clear majority of this card's sold titles name, or null. A title votes once
 * per name it carries: a player our list knows, or a run of two or three words that reads as a
 * name (no set, color, team, school, grade or seller word). The winner needs MARKET_MIN_VOTES
 * titles, more than half of the card's titles, and no other name level with it.
 */
export function marketPlayer(
  titles: readonly { title: string }[],
  card: LookupCard,
  directory: readonly IndexedDirectoryPlayer[],
): MarketPlayer | null {
  const relevant = titlesForCard(titles, card, directory);
  if (relevant.length < MARKET_MIN_VOTES) return null;
  type Vote = { key: string; words: number; count: number; forms: Map<string, number> };
  const votes = new Map<string, Vote>();
  for (const title of relevant) {
    const names = [
      ...findPlayers([title], directory).filter((hit) => hit.score === 1 && !hit.more).map((hit) => hit.name),
      ...nameWindows(title, card.setBrand, directory),
    ];
    const counted = new Set<string>();
    for (const name of names) {
      const key = nameKey(name);
      if (!key || counted.has(key)) continue;
      counted.add(key);
      const vote = votes.get(key) ?? { key, words: name.split(" ").length, count: 0, forms: new Map() };
      vote.count += 1;
      vote.forms.set(name, (vote.forms.get(name) ?? 0) + 1);
      votes.set(key, vote);
    }
  }
  const ranked = [...votes.values()].sort((a, b) => b.count - a.count || b.words - a.words);
  const top = ranked[0];
  if (!top || top.count < MARKET_MIN_VOTES || top.count * 2 <= relevant.length) return null;
  // A longer name that holds the winner ("Shai Gilgeous Alexander" over "Shai Gilgeous") is the
  // same vote. Any other name level with it means the titles don't agree: open.
  const level = ranked.filter((vote) => vote.count === top.count);
  if (level.some((vote) => vote !== top && !top.key.includes(vote.key) && !vote.key.includes(top.key))) return null;
  const form = [...top.forms.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { name: tidyName(form), votes: top.count, of: relevant.length };
}
