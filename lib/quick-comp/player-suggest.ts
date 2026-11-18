import { titleIsAuto, titleSet, namesPlayer } from "./player-sales";
import type { PlayerSuggestion } from "./player-feed";
import { nameKey, type PlayerNameRow } from "./player-names";

export type NameIndex = { name: string; key: string; words: string[]; recent: number }[];

/** Built once per server. */
export function indexNames(rows: readonly PlayerNameRow[]): NameIndex {
  return rows.map(([name, recent]) => {
    const key = nameKey(name);
    return { name, key, words: key.split(" "), recent };
  });
}

/** Every typed word starts a different word of the name, in any order ("acuff dar" finds Darius Acuff Jr.). */
function score(tokens: readonly string[], entry: NameIndex[number]): number | null {
  const used = new Set<number>();
  for (const token of tokens) {
    const at = entry.words.findIndex((word, index) => !used.has(index) && word.startsWith(token));
    if (at < 0) return null;
    used.add(at);
  }
  let value = 0;
  if (entry.key === tokens.join(" ")) value -= 2;
  if (!entry.words[0].startsWith(tokens[0])) value += 1;
  return value;
}

export const MAX_NAME_SUGGESTIONS = 5;

export function suggestPlayerNames(text: string, index: NameIndex, limit = MAX_NAME_SUGGESTIONS): string[] {
  const tokens = nameKey(text).split(" ").filter(Boolean);
  if (tokens.length === 0 || tokens.join("").length < 2) return [];
  const hits: { name: string; score: number; recent: number }[] = [];
  for (const entry of index) {
    const value = score(tokens, entry);
    if (value != null) hits.push({ name: entry.name, score: value, recent: entry.recent });
  }
  // How well it matches, then the names with the most cards in the newest checklists.
  return hits
    .sort((a, b) => a.score - b.score || b.recent - a.recent || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((hit) => hit.name);
}

/** The name people use in a title: "Darius Acuff Jr." is "Acuff". */
export function surnameOf(player: string): string {
  const words = player.replace(/[,]/g, " ").split(/\s+/).filter(Boolean);
  while (words.length > 1 && /^(?:jr|sr|ii|iii|iv|v)\.?$/i.test(words[words.length - 1])) words.pop();
  return words[words.length - 1] ?? player;
}

const MIN_PHRASE_TITLES = 2;
export const MAX_PHRASES = 3;

/**
 * "Acuff auto", "Acuff Prizm": what this player's sold titles say most. Each one opens
 * the player's sales with that chip on, so it never starts another search.
 */
export function titlePhrases(player: string, titles: readonly string[], limit = MAX_PHRASES): PlayerSuggestion[] {
  const counts = new Map<string, { count: number; filter: PlayerSuggestion["filter"] }>();
  const bump = (key: string, filter: PlayerSuggestion["filter"]) => {
    const current = counts.get(key);
    counts.set(key, { count: (current?.count ?? 0) + 1, filter });
  };
  const seen = new Set<string>();
  for (const raw of titles) {
    const title = raw.trim();
    if (!title || seen.has(title) || !namesPlayer(title, player)) continue;
    seen.add(title);
    if (titleIsAuto(title)) bump("auto", { auto: true });
    const set = titleSet(title);
    if (set) bump(set, { set });
  }
  const surname = surnameOf(player);
  return [...counts.entries()]
    .filter(([, value]) => value.count >= MIN_PHRASE_TITLES)
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, value]) => ({ label: `${surname} ${key}`, player, filter: value.filter }));
}

/** Names first, with the top name's phrases right under it. */
export function playerSuggestions(names: readonly string[], phrases: readonly PlayerSuggestion[]): PlayerSuggestion[] {
  if (names.length === 0) return [];
  const [top, ...rest] = names;
  return [{ label: top, player: top }, ...phrases, ...rest.map((name) => ({ label: name, player: name }))];
}
