import { withDirectoryPlayers } from "@/lib/players/suggest";
import type { DirectoryPlayer, IndexedDirectoryPlayer } from "@/lib/players/types";

/** The guided picker's player step: Recent, In your collection, and roster search. */
export const RECENT_PLAYERS_KEY = "slabhold:add-recent-players";
export const RECENT_PLAYERS_MAX = 5;
export const COLLECTION_PLAYERS_MAX = 8;
/** Short enough to feel instant, long enough to skip work between keystrokes. */
export const PLAYER_SEARCH_DEBOUNCE_MS = 40;

export type AddPlayerHit = {
  name: string;
  sport: string;
  team?: string;
  /** A typed name that is not on a roster. */
  custom?: true;
};

function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Last players picked on this device, newest first. Names only. */
export function readRecentPlayers(storage: Storage | null | undefined): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_PLAYERS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && item.trim() !== "")
      .slice(0, RECENT_PLAYERS_MAX);
  } catch {
    return [];
  }
}

export function rememberRecentPlayer(storage: Storage | null | undefined, name: string): string[] {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!storage || !clean) return readRecentPlayers(storage);
  const next = [clean, ...readRecentPlayers(storage).filter((item) => nameKey(item) !== nameKey(clean))]
    .slice(0, RECENT_PLAYERS_MAX);
  try {
    storage.setItem(RECENT_PLAYERS_KEY, JSON.stringify(next));
  } catch {
    // Private mode or full storage: Recent just stays as it was.
  }
  return next;
}

/** Distinct player names from your cards, newest card first. */
export function collectionPlayers(
  cards: readonly { playerName: string; createdAt?: string | null }[],
  max = COLLECTION_PLAYERS_MAX,
): string[] {
  const sorted = [...cards].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  const seen = new Set<string>();
  const names: string[] = [];
  for (const card of sorted) {
    const name = card.playerName.trim().replace(/\s+/g, " ");
    const key = nameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= max) break;
  }
  return names;
}

const teamIndexes = new WeakMap<readonly DirectoryPlayer[], Map<string, string>>();

function teamIndex(players: readonly DirectoryPlayer[]): Map<string, string> {
  let index = teamIndexes.get(players);
  if (!index) {
    index = new Map();
    for (const player of players) {
      if (player.team) index.set(`${nameKey(player.name)}|${player.sport.toLowerCase()}`, player.team);
    }
    teamIndexes.set(players, index);
  }
  return index;
}

/** Roster matches for the search field, with sport and team as plain text. */
export function searchAddPlayers(
  query: string,
  players: readonly IndexedDirectoryPlayer[],
  limit = 8,
): AddPlayerHit[] {
  if (!query.trim()) return [];
  const hits = withDirectoryPlayers({
    query,
    catalogHits: [],
    directoryPlayers: players,
    directoryReady: players.length > 0,
    limit,
  });
  const teams = teamIndex(players);
  return hits
    .filter((hit) => hit.kind === "player")
    .map((hit) => {
      const out: AddPlayerHit = { name: hit.value, sport: hit.sport ?? "" };
      const team = teams.get(`${nameKey(hit.value)}|${(hit.sport ?? "").toLowerCase()}`);
      if (team) out.team = team;
      if (hit.custom) out.custom = true;
      return out;
    });
}
