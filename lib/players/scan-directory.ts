/**
 * The scanner's player list: the roster file (directory.json, unchanged and first, so it wins any
 * tie), then the wider list (directory-more.json): retired, college and prospects, names and
 * sport only, each row marked `more`. Refresh the wider list with
 * `npx tsx scripts/build-player-directory-more.ts`. Sources and licences: SOURCES.md.
 *
 * The scanner uses a `more` row only to confirm a name the card printed on a line of its own,
 * exactly (lib/scan/raw-text.ts, lib/scan/match.ts). The name search, collecting settings and
 * player pages keep using the roster file alone (directory.ts).
 */
import { INDEXED_DIRECTORY, indexPlayer } from "./directory";
import type { DirectoryPlayer, IndexedDirectoryPlayer } from "./types";
import morePlayers from "./directory-more.json";

/** The wider list, by sport in the file. No teams. */
export const MORE_PLAYER_DIRECTORY: readonly DirectoryPlayer[] = Object.entries(morePlayers as Record<string, string[]>).flatMap(
  ([sport, names]) => names.map((name) => ({ name, sport })),
);

export const SCAN_DIRECTORY: readonly IndexedDirectoryPlayer[] = [
  ...INDEXED_DIRECTORY,
  ...MORE_PLAYER_DIRECTORY.map((player): IndexedDirectoryPlayer => ({ ...indexPlayer(player), more: true })),
];
