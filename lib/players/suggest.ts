import { collectSportBlocked, type InterestHit } from "@/lib/social/collect-interests";
import { normInterest } from "@/lib/social/follow-rank";
import type { DirectoryPlayer } from "./types";

export type NameSuggestion = InterestHit & { custom?: boolean };

const SUFFIXES: Record<string, string> = {
  jr: "Jr",
  sr: "Sr",
  ii: "II",
  iii: "III",
  iv: "IV",
  v: "V",
};

/**
 * Prefix of the full name, or each query word as a prefix of some name word.
 * "joel em" matches Joel Embiid. "maxey" matches Tyrese Maxey.
 * Accents and case are ignored.
 */
export function playerNameMatches(name: string, query: string): boolean {
  const needle = normInterest(query);
  if (!needle) return false;
  const haystack = normInterest(name);
  if (!haystack) return false;
  if (haystack.startsWith(needle)) return true;
  const words = haystack.split(" ");
  const used = new Array<boolean>(words.length).fill(false);
  for (const part of needle.split(" ")) {
    const index = words.findIndex((word, wordIndex) => !used[wordIndex] && word.startsWith(part));
    if (index < 0) return false;
    used[index] = true;
  }
  return true;
}

function sportAllowed(sport: string, sports: readonly string[]): boolean {
  if (collectSportBlocked(sport)) return false;
  if (sports.length === 0) return true;
  return sports.includes(sport.toLowerCase());
}

/** Display form for a name someone typed. "tyrese maxey" → "Tyrese Maxey". */
export function titleCasePlayerName(value: string): string {
  const collapsed = value.trim().replace(/\s+/g, " ");
  let wordIndex = 0;
  let result = "";
  let token = "";
  const flush = () => {
    if (!token) return;
    const suffix = wordIndex > 0 ? SUFFIXES[token.toLowerCase()] : undefined;
    wordIndex += 1;
    result += suffix ?? token.charAt(0).toLocaleUpperCase() + token.slice(1).toLocaleLowerCase();
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

function blockedCustomName(value: string): boolean {
  return /^(pokemon|tcg|magic|yu gi oh|yugioh|magic the gathering)$/.test(normInterest(value));
}

/**
 * When the roster and catalog have nobody, offer the typed name.
 * Trimmed, 2–60 characters, title-cased. Saved later as a normal player row.
 */
export function customPlayerFallback(
  query: string,
  sports: readonly string[] = [],
): NameSuggestion | null {
  const collapsed = query.trim().replace(/\s+/g, " ");
  if (collapsed.length < 2 || collapsed.length > 60) return null;
  if (!/\p{L}/u.test(collapsed) || blockedCustomName(collapsed)) return null;
  const value = titleCasePlayerName(collapsed);
  if (value.length < 2 || value.length > 60) return null;
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
 */
export function withDirectoryPlayers(input: {
  query: string;
  sports?: readonly string[];
  catalogHits: readonly InterestHit[];
  directoryPlayers?: readonly DirectoryPlayer[];
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
  if (catalog.length < limit) {
    const matches: DirectoryPlayer[] = [];
    for (const player of input.directoryPlayers ?? []) {
      if (!sportAllowed(player.sport, sports)) continue;
      if (!playerNameMatches(player.name, input.query)) continue;
      const key = normInterest(player.name);
      if (!key || taken.has(key)) continue;
      taken.add(key);
      matches.push(player);
    }
    matches.sort((a, b) => {
      const aStart = normInterest(a.name).startsWith(queryNorm) ? 0 : 1;
      const bStart = normInterest(b.name).startsWith(queryNorm) ? 0 : 1;
      if (aStart !== bStart) return aStart - bStart;
      return a.name.localeCompare(b.name);
    });
    for (const player of matches) {
      if (catalog.length + directoryHits.length >= limit) break;
      directoryHits.push({ kind: "player", value: player.name, sport: player.sport });
    }
  }
  const merged = [...catalog, ...directoryHits];
  if (merged.length > 0) return merged;
  if (!input.directoryReady) return [];
  const custom = customPlayerFallback(input.query, input.sports ?? []);
  return custom ? [custom] : [];
}
