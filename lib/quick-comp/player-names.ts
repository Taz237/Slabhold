/** Not one player: checklists, team cards, leaders and dual cards. */
const NOT_A_PLAYER = /\d|\/|&|\+|checklist|\b(?:and|team|leaders?|rookies|cl|card)\b/i;

/** Lower case, no accents, no dots, quotes or commas, one space. */
export function nameKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/["'‘’“”.,]/g, "")
    .replace(/[-\s]+/g, " ")
    .trim();
}

/** A name and how many cards it has in the newest two checklist years: the hobby's current names rank first. */
export type PlayerNameRow = [name: string, recentCards: number];

export function isPlayerName(value: string): boolean {
  const name = value.replace(/\s+/g, " ").trim();
  return name.length >= 3 && name.length <= 40 && !NOT_A_PLAYER.test(name) && /\s/.test(name);
}

/** One spelling per name, the first seen, with its recent card count. Sorted so the file diffs cleanly. */
export function buildPlayerNames(raw: readonly { name: string; recent?: boolean }[]): PlayerNameRow[] {
  const kept = new Map<string, PlayerNameRow>();
  for (const row of raw) {
    const name = (row.name ?? "").replace(/\s+/g, " ").trim();
    if (!isPlayerName(name)) continue;
    const key = nameKey(name);
    const current = kept.get(key) ?? [name, 0];
    if (row.recent) current[1] += 1;
    kept.set(key, current);
  }
  return [...kept.values()].sort((a, b) => a[0].localeCompare(b[0]));
}
