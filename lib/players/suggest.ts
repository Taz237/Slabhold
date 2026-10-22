import { collectSportBlocked, type InterestHit } from "@/lib/social/collect-interests";
import {
  compactInterest,
  compactNorm,
  majorityPlayerSpelling,
  normInterest,
  playerSportsCompatible,
} from "@/lib/social/follow-rank";
import { collapseInitials } from "./initials";
import type { DirectoryPlayer } from "./types";

export type NameSuggestion = InterestHit & { custom?: boolean };

type SearchablePlayer = DirectoryPlayer & {
  norm?: string;
  words?: readonly string[];
  joined?: readonly string[];
  compact?: string;
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
/** Two-letter initials. "jr" stays a suffix, not an initial. */
const INITIALS = new Set([
  "aj",
  "bj",
  "cc",
  "cj",
  "dj",
  "dk",
  "jd",
  "jj",
  "jt",
  "kj",
  "oj",
  "pj",
  "rj",
  "tj",
]);

/**
 * Prefix of the full normalized name, or each query word as a prefix of some name word.
 * "joel em" matches Joel Embiid. "maxey" matches Tyrese Maxey.
 * Dotted and undotted initials match each other: "cj stroud" matches "C.J. Stroud".
 */
export function normMatches(
  norm: string,
  queryNorm: string,
  words: readonly string[] = norm.split(" "),
  joined?: readonly string[],
): boolean {
  if (!queryNorm || !norm) return false;
  const queryWords = queryNorm.split(" ");
  return formsMatch(
    norm,
    words,
    joined,
    queryNorm,
    queryWords,
    collapseInitials(queryWords),
  );
}

function formMatches(
  norm: string,
  words: readonly string[],
  queryNorm: string,
  queryWords: readonly string[],
): boolean {
  if (norm.startsWith(queryNorm)) return true;
  const used = new Array<boolean>(words.length).fill(false);
  for (const part of queryWords) {
    const index = words.findIndex((word, wordIndex) => !used[wordIndex] && word.startsWith(part));
    if (index < 0) return false;
    used[index] = true;
  }
  return true;
}

/**
 * Original tokens, and the same tokens with single-letter runs joined.
 * Indexed rows already stored `joined` when it differs. A missing `joined`
 * is the same as `words`, so a keystroke does not collapse the roster again.
 */
function formsMatch(
  norm: string,
  words: readonly string[],
  joined: readonly string[] | undefined,
  queryNorm: string,
  queryWords: readonly string[],
  queryJoined: readonly string[],
  indexed = false,
): boolean {
  if (formMatches(norm, words, queryNorm, queryWords)) return true;
  const queryCollapsed = queryJoined !== queryWords;
  if (indexed && !joined && !queryCollapsed) return false;
  const nameJoined = indexed ? (joined ?? words) : (joined ?? collapseInitials(words));
  if (nameJoined === words && !queryCollapsed) return false;
  const nameJoinedNorm = nameJoined === words ? norm : nameJoined.join(" ");
  const queryJoinedNorm = queryCollapsed ? queryJoined.join(" ") : queryNorm;
  return formMatches(nameJoinedNorm, nameJoined, queryJoinedNorm, queryJoined);
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

type NamePart = { kind: "letters"; text: string } | { kind: "sep"; text: string };

/**
 * All-lowercase and all-uppercase names are title-cased.
 * Mixed case is kept. "mcbride" becomes "McBride".
 * A pair of single letters separated by spaces becomes one initialism: "c j" → "CJ".
 * Longer runs stay separate, so "a b c d" does not become "ABCD".
 * Periods stay, so "c.j. stroud" is still "C.J. Stroud".
 */
export function titleCasePlayerName(value: string): string {
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (!collapsed || hasMixedCase(collapsed)) return collapsed;
  const parts: NamePart[] = [];
  let buf = "";
  const pushLetters = () => {
    if (!buf) return;
    parts.push({ kind: "letters", text: buf });
    buf = "";
  };
  for (const char of collapsed) {
    if (/\p{L}/u.test(char)) buf += char;
    else {
      pushLetters();
      parts.push({ kind: "sep", text: char });
    }
  }
  pushLetters();

  let result = "";
  let wordIndex = 0;
  let index = 0;
  while (index < parts.length) {
    const part = parts[index];
    if (!part) break;
    if (part.kind === "sep") {
      result += part.text;
      index += 1;
      continue;
    }
    if (part.text.length === 1) {
      const prevSep = parts[index - 1];
      const prevLetters = parts[index - 2];
      const continuesRun =
        prevSep?.kind === "sep" &&
        prevSep.text === " " &&
        prevLetters?.kind === "letters" &&
        prevLetters.text.length === 1;
      let end = index;
      let run = "";
      while (end < parts.length) {
        const current = parts[end];
        if (!current || current.kind !== "letters" || current.text.length !== 1) break;
        run += current.text;
        const sep = parts[end + 1];
        const next = parts[end + 2];
        if (
          sep?.kind === "sep" &&
          sep.text === " " &&
          next?.kind === "letters" &&
          next.text.length === 1
        ) {
          end += 2;
          continue;
        }
        break;
      }
      if (!continuesRun && run.length === 2) {
        result += run.toLocaleUpperCase();
        wordIndex += 1;
        index = end + 1;
        continue;
      }
    }
    result += titleToken(part.text, wordIndex);
    wordIndex += 1;
    index += 1;
  }
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
  return blockedSplitWords(words);
}

/**
 * Glue every word, then accept a blocked term only when that hit starts on a
 * word or ends on a word. "p o k e m o n" is blocked. In "robertcgriffin",
 * "tcg" does neither, so Robert C. Griffin stays allowed.
 */
function blockedSplitWords(words: readonly string[]): boolean {
  const starts = new Set<number>();
  const ends = new Set<number>();
  let glued = "";
  for (const word of words) {
    starts.add(glued.length);
    glued += word;
    ends.add(glued.length);
  }
  if (!glued) return false;
  for (const term of BLOCKED_SUBSTRINGS) {
    let from = 0;
    while (from <= glued.length - term.length) {
      const at = glued.indexOf(term, from);
      if (at < 0) break;
      if (starts.has(at) || ends.has(at + term.length)) return true;
      from = at + 1;
    }
  }
  return false;
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

type SpellingBag = { catalog: string[]; directory: string[] };

function absorbPlayer(
  grouped: Map<string, NameSuggestion[]>,
  spellings: Map<NameSuggestion, SpellingBag>,
  hit: NameSuggestion,
  key: string,
  source: "catalog" | "directory",
): boolean {
  const list = grouped.get(key);
  const existing = list?.find((item) => playerSportsCompatible(item.sport, hit.sport));
  if (existing) {
    const bag = spellings.get(existing);
    if (bag) bag[source].push(hit.value);
    const chosen = bag && bag.catalog.length > 0 ? bag.catalog : (bag?.directory ?? [hit.value]);
    existing.value = majorityPlayerSpelling(chosen);
    return true;
  }
  const bag: SpellingBag = { catalog: [], directory: [] };
  bag[source].push(hit.value);
  spellings.set(hit, bag);
  if (list) list.push(hit);
  else grouped.set(key, [hit]);
  return false;
}

/** Full norm, or the joined-initial form ("c j stroud" and "cj stroud"). */
function hiddenNameIsExact(
  norm: string,
  joined: readonly string[] | undefined,
  indexed: boolean,
  words: readonly string[],
  queryNorm: string,
  queryJoinedNorm: string,
): boolean {
  if (norm === queryNorm) return true;
  if (joined) return joined.join(" ") === queryJoinedNorm;
  if (indexed) return norm === queryJoinedNorm;
  return collapseInitials(words).join(" ") === queryJoinedNorm;
}

/**
 * Catalog and remote hits stay in front. Directory players fill the rest,
 * one row per compact name and sport, so "CJ Stroud" does not repeat "C.J. Stroud".
 * The catalog spelling is the one shown. A blank sport stays its own row.
 * An empty list becomes the custom-name chip once the directory has loaded.
 * A partial query that only missed because of a sport chip does not become Add.
 * An exact full name, dotted or joined, still offers Add. Only the name is stored.
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
  const queryWords = queryNorm.split(" ");
  const queryJoined = collapseInitials(queryWords);
  const queryJoinedNorm = queryJoined === queryWords ? queryNorm : queryJoined.join(" ");
  const sports = (input.sports ?? []).map((sport) => sport.toLowerCase()).filter(Boolean);
  const catalog: NameSuggestion[] = [];
  const grouped = new Map<string, NameSuggestion[]>();
  const spellings = new Map<NameSuggestion, SpellingBag>();
  for (const hit of input.catalogHits.slice(0, limit)) {
    const copy = { ...hit };
    if (copy.kind === "player" && absorbPlayer(grouped, spellings, copy, compactInterest(copy.value), "catalog")) {
      continue;
    }
    catalog.push(copy);
  }
  const directoryHits: NameSuggestion[] = [];
  let hiddenPartial = false;
  let hiddenExact = false;
  if (catalog.length < limit) {
    const matches: { player: SearchablePlayer; norm: string; suggestion: NameSuggestion }[] = [];
    for (const player of input.directoryPlayers ?? []) {
      const norm = playerNorm(player);
      const words = player.words ?? norm.split(" ");
      const indexed = player.words != null;
      if (!formsMatch(norm, words, player.joined, queryNorm, queryWords, queryJoined, indexed)) {
        continue;
      }
      if (!sportAllowed(player.sport, sports)) {
        if (sports.length > 0 && !collectSportBlocked(player.sport)) {
          if (hiddenNameIsExact(norm, player.joined, indexed, words, queryNorm, queryJoinedNorm)) {
            hiddenExact = true;
          } else hiddenPartial = true;
        }
        continue;
      }
      const compact = player.compact ?? compactNorm(norm);
      const suggestion: NameSuggestion = {
        kind: "player",
        value: player.name,
        sport: player.sport,
      };
      if (absorbPlayer(grouped, spellings, suggestion, compact, "directory")) continue;
      matches.push({ player, norm, suggestion });
    }
    matches.sort((a, b) => {
      const aStart = a.norm.startsWith(queryNorm) ? 0 : 1;
      const bStart = b.norm.startsWith(queryNorm) ? 0 : 1;
      if (aStart !== bStart) return aStart - bStart;
      return a.player.name.localeCompare(b.player.name);
    });
    for (const match of matches) {
      if (catalog.length + directoryHits.length >= limit) break;
      directoryHits.push(match.suggestion);
    }
  }
  const merged = [...catalog, ...directoryHits];
  if (merged.length > 0) return merged;
  if (!input.directoryReady) return [];
  if (hiddenPartial && !hiddenExact) return [];
  const custom = customPlayerFallback(input.query, input.sports ?? []);
  return custom ? [custom] : [];
}
