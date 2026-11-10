import type { CatalogCard } from "@/lib/card-catalog";
import { SETS } from "@/lib/card-options";
import { searchAddPlayers, type AddPlayerHit } from "@/lib/cards/add-flow-players";
import { POPULAR_INSERTS, insertKey, splitInsertFromQuery } from "@/lib/cards/data/popular-inserts";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";

/**
 * The search door on /cards/new: "What's on the card?". One field that finds a
 * player, an insert, a set, or a catalog card. Pure, so the screen only renders it.
 */

/** Same placeholder the brief asks for. Names only, no prices. */
export const DOOR_PLACEHOLDER = "Try Malik Nabers Kaboom or Tyrese Maxey Downtown";

/** One search_cards call once the query is this long, after the usual debounce. */
export const DOOR_CATALOG_MIN_CHARS = 3;

const DOOR_SET_MAX = 4;
const DOOR_CATALOG_MAX = 4;
const DOOR_PLAYER_MAX = 6;

export type DoorParse = {
  /** A seed insert named in the query, e.g. Kaboom. */
  insert: string | null;
  /** What is left for the player search. */
  playerQuery: string;
  /** Roster hits for playerQuery. Typed names are not here. */
  players: AddPlayerHit[];
  /** The best roster hit plus the insert, as one pick. */
  combo: { player: AddPlayerHit; insert: string } | null;
};

/** "Tyrese Maxey Downtown" → Tyrese Maxey + Downtown. A plain name is just a player search. */
export function parseDoorQuery(
  query: string,
  directory: readonly IndexedDirectoryPlayer[],
): DoorParse {
  const split = splitInsertFromQuery(query);
  const playerQuery = split.insert ? split.rest : query.trim();
  const players = playerQuery
    ? searchAddPlayers(playerQuery, directory, DOOR_PLAYER_MAX).filter((hit) => !hit.custom)
    : [];
  const first = players[0];
  return {
    insert: split.insert,
    playerQuery,
    players,
    combo: split.insert && first ? { player: first, insert: split.insert } : null,
  };
}

/** Seed inserts the query points at: the one it names, or any whose name starts with a typed word. */
export function doorInserts(query: string, parsed: Pick<DoorParse, "insert">): string[] {
  if (parsed.insert) return [parsed.insert];
  const words = insertKey(query).split(" ").filter((word) => word.length >= 3);
  if (words.length === 0) return [];
  return POPULAR_INSERTS.filter((item) =>
    [item.name, ...item.aliases].some((name) => {
      const key = insertKey(name);
      return words.some((word) => key.startsWith(word) || key.split(" ").some((part) => part.startsWith(word)));
    }),
  ).map((item) => item.name);
}

/** Sets whose name contains the query, shortest first. */
export function doorSets(query: string, sets: readonly string[] = SETS): string[] {
  const needle = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (needle.length < 2) return [];
  return sets
    .filter((name) => name.toLowerCase().includes(needle))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, DOOR_SET_MAX);
}

export function doorCatalog(rows: readonly CatalogCard[] | null): CatalogCard[] {
  return (rows ?? []).slice(0, DOOR_CATALOG_MAX);
}

/** Whether this query is long enough for the one catalog call. */
export function doorWantsCatalog(query: string): boolean {
  return query.trim().length >= DOOR_CATALOG_MIN_CHARS;
}

/** A typed name that is not on a roster still works: "Use 'X'". */
export function doorTypedName(query: string, parsed: Pick<DoorParse, "insert" | "playerQuery">): string {
  return (parsed.insert ? parsed.playerQuery : query).trim().replace(/\s+/g, " ");
}

/** Enter on the door: the combo, a roster name that starts with what was typed, or the typed name. */
export function doorEnterPick(
  query: string,
  parsed: DoorParse,
): { name: string; sport: string | null; insert: string | null } | null {
  if (parsed.combo) {
    return {
      name: parsed.combo.player.name,
      sport: parsed.combo.player.sport || null,
      insert: parsed.combo.insert,
    };
  }
  const typed = doorTypedName(query, parsed);
  if (!typed) return null;
  const first = parsed.players[0];
  if (first && first.name.toLowerCase().startsWith(typed.toLowerCase())) {
    return { name: first.name, sport: first.sport || null, insert: parsed.insert };
  }
  return { name: typed, sport: null, insert: parsed.insert };
}

let doorMemory: { key: string; query: string } | null = null;

/** What was typed on the door, so leaving mid-search and coming back keeps it. */
export function readDoorQuery(key: string | null): string {
  if (!key || !doorMemory || doorMemory.key !== key) return "";
  return doorMemory.query;
}

export function writeDoorQuery(key: string | null, query: string): void {
  if (!key) return;
  doorMemory = query ? { key, query } : null;
}

export function clearDoorQuery(): void {
  doorMemory = null;
}
