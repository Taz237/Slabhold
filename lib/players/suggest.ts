import { collectSportBlocked, type InterestHit } from "@/lib/social/collect-interests";
import { normInterest } from "@/lib/social/follow-rank";
import type { DirectoryPlayer } from "./types";

export type NameSuggestion = InterestHit & { custom?: boolean };

type SearchablePlayer = DirectoryPlayer & {
  norm?: string;
  words?: readonly string[];
};

const SUFFIXES: Record<string, string> = {
  jr: "Jr",
  sr: "Sr",
  ii: "II",
  iii: "III",
  iv: "IV",
  v: "V",
};

/** Letters, spaces, periods, apostrophes, and hyphens. Digits and symbols stay out. */
const CUSTOM_NAME_CHARS = /^[\p{L} .'\u2019-]+$/u;

const BLOCKED_TERMS = [
  "pokemon",
  "pokémon",
  "tcg",
  "yugioh",
  "yu gi oh",
  "magic the gathering",
  "mtg",
  "lorcana",
  "one piece tcg",
  "pikachu",
  "charizard",
  "blastoise",
  "venusaur",
  "mewtwo",
  "mew",
  "umbreon",
  "espeon",
  "gengar",
  "dragonite",
  "lugia",
  "rayquaza",
  "eevee",
  "gyarados",
  "snorlax",
  "lucario",
  "greninja",
  "alakazam",
  "charmander",
  "squirtle",
  "bulbasaur",
].map((term) => normInterest(term));

const BLOCKED_WORDS = new Set(BLOCKED_TERMS.filter((term) => !term.includes(" ")));
const BLOCKED_PHRASES = BLOCKED_TERMS.filter((term) => term.includes(" "));
/** Caught even when spaces split the word, as in "poke mon" or "yugi oh". */
const BLOCKED_SUBSTRINGS = ["pokemon", "pikachu", "charizard", "yugioh", "tcg"];
const INITIALS = new Set(["aj", "cj", "dj", "jj", "tj"]);

/**
 * Prefix of the full normalized name, or each query word as a prefix of some name word.
 * "joel em" matches Joel Embiid. "maxey" matches Tyrese Maxey.
 */
export function normMatches(
  norm: string,
  queryNorm: string,
  words: readonly string[] = norm.split(" "),
): boolean {
  if (!queryNorm || !norm) return false;
  if (norm.startsWith(queryNorm)) return true;
  const used = new Array<boolean>(words.length).fill(false);
  for (const part of queryNorm.split(" ")) {
    const index = words.findIndex((word, wordIndex) => !used[wordIndex] && word.startsWith(part));
    if (index < 0) return false;
    used[index] = true;
  }
  return true;
}

/** Accents and case are ignored. Prefer normMatches when the name is already normalized. */
export function playerNameMatches(name: string, query: string): boolean {
  return normMatches(normInterest(name), normInterest(query));
}

function sportAllowed(sport: string, sports: readonly string[]): boolean {
  if (collectSportBlocked(sport)) return false;
  if (sports.length === 0) return true;
  return sports.includes(sport.toLowerCase());
}

function playerNorm(player: SearchablePlayer): string {
  return player.norm ?? normInterest(player.name);
}

function hasMixedCase(value: string): boolean {
  let upper = false;
  let lower = false;
  for (const char of value) {
    if (/\p{Ll}/u.test(char)) lower = true;
    else if (/\p{Lu}/u.test(char)) upper = true;
    if (upper && lower) return true;
  }
  return false;
}

function titleToken(token: string, wordIndex: number): string {
  const lower = token.toLocaleLowerCase();
  const suffix = wordIndex > 0 ? SUFFIXES[lower] : undefined;
  if (suffix) return suffix;
  if (INITIALS.has(lower)) return lower.toUpperCase();
  const mc = /^mc(\p{L})(.*)$/u.exec(lower);
  if (mc) return `Mc${mc[1].toLocaleUpperCase()}${mc[2]}`;
  return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
}

/**
 * All-lowercase and all-uppercase names are title-cased.
 * Mixed case is kept. "mcbride" becomes "McBride".
 */
export function titleCasePlayerName(value: string): string {
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (!collapsed || hasMixedCase(collapsed)) return collapsed;
  let wordIndex = 0;
  let result = "";
  let token = "";
  const flush = () => {
    if (!token) return;
    result += titleToken(token, wordIndex);
    wordIndex += 1;
    token = "";
  };
  for (const char of collapsed) {
    if (/\p{L}/u.test(char)) token += char;
    else {
      flush();
      result += char;
    }
  }
  flush();
  return result;
}

function containsPhrase(words: readonly string[], phrase: string): boolean {
  const parts = phrase.split(" ");
  for (let start = 0; start + parts.length <= words.length; start += 1) {
    let found = true;
    for (let index = 0; index < parts.length; index += 1) {
      if (words[start + index] !== parts[index]) {
        found = false;
        break;
      }
    }
    if (found) return true;
  }
  return false;
}

/** True when any normalized word or phrase is a Pokémon or TCG term. */
export function blockedCustomName(value: string): boolean {
  const norm = normInterest(value);
  if (!norm) return false;
  const words = norm.split(" ");
  for (const word of words) {
    if (BLOCKED_WORDS.has(word)) return true;
  }
  if (BLOCKED_PHRASES.some((phrase) => containsPhrase(words, phrase))) return true;
  const stripped = norm.replace(/ /g, "");
  return BLOCKED_SUBSTRINGS.some((term) => stripped.includes(term));
}

/**
 * When the roster and catalog have nobody, offer the typed name.
 * Trimmed, 2–60 characters, letters and light punctuation, title-cased when needed.
 */
export function customPlayerFallback(
  query: string,
  sports: readonly string[] = [],
): NameSuggestion | null {
  const collapsed = query.trim().replace(/\s+/g, " ").normalize("NFC");
  if (collapsed.length < 2 || collapsed.length > 60) return null;
  if (!CUSTOM_NAME_CHARS.test(collapsed) || blockedCustomName(collapsed)) return null;
  const letters = collapsed.match(/\p{L}/gu);
  if (!letters || letters.length < 2) return null;
  const value = titleCasePlayerName(collapsed);
  if (value.length < 2 || value.length > 60 || !CUSTOM_NAME_CHARS.test(value)) return null;
  const picked = sports
    .map((sport) => sport.trim())
    .filter((sport) => sport && !collectSportBlocked(sport));
  const sport = picked.length === 1 ? picked[0] : "";
  return { kind: "player", value, sport, custom: true };
}

export function nameSuggestionLabel(hit: NameSuggestion): string {
  return hit.custom ? `Add "${hit.value}"` : hit.value;
}

/**
 * Catalog and remote hits stay in front. Directory players fill the rest,
 * one row per normalized name, so "Luka Doncic" does not repeat "Luka Dončić".
 * An empty list becomes the custom-name chip once the directory has loaded.
 * A query that only missed because of a sport chip does not become Add.
 */
export function withDirectoryPlayers(input: {
  query: string;
  sports?: readonly string[];
  catalogHits: readonly InterestHit[];
  directoryPlayers?: readonly SearchablePlayer[];
  directoryReady?: boolean;
  limit?: number;
}): NameSuggestion[] {
  const limit = input.limit == null ? 8 : Math.max(0, Math.floor(input.limit));
  const queryNorm = normInterest(input.query);
  if (!queryNorm || limit === 0) return [];
  const sports = (input.sports ?? []).map((sport) => sport.toLowerCase()).filter(Boolean);
  const catalog = input.catalogHits.slice(0, limit);
  const taken = new Set(
    catalog.filter((hit) => hit.kind === "player").map((hit) => normInterest(hit.value)),
  );
  const directoryHits: NameSuggestion[] = [];
  let hiddenBySport = false;
  if (catalog.length < limit) {
    const matches: { player: SearchablePlayer; norm: string }[] = [];
    for (const player of input.directoryPlayers ?? []) {
      const norm = playerNorm(player);
      if (!normMatches(norm, queryNorm, player.words ?? norm.split(" "))) continue;
      if (!sportAllowed(player.sport, sports)) {
        if (sports.length > 0 && !collectSportBlocked(player.sport)) hiddenBySport = true;
        continue;
      }
      if (taken.has(norm)) continue;
      taken.add(norm);
      matches.push({ player, norm });
    }
    matches.sort((a, b) => {
      const aStart = a.norm.startsWith(queryNorm) ? 0 : 1;
      const bStart = b.norm.startsWith(queryNorm) ? 0 : 1;
      if (aStart !== bStart) return aStart - bStart;
      return a.player.name.localeCompare(b.player.name);
    });
    for (const match of matches) {
      if (catalog.length + directoryHits.length >= limit) break;
      directoryHits.push({
        kind: "player",
        value: match.player.name,
        sport: match.player.sport,
      });
    }
  }
  const merged = [...catalog, ...directoryHits];
  if (merged.length > 0) return merged;
  if (!input.directoryReady) return [];
  if (hiddenBySport) return [];
  const custom = customPlayerFallback(input.query, input.sports ?? []);
  return custom ? [custom] : [];
}
