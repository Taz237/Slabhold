/**
 * Bundled player directory for the collect-prompt name step.
 * Refresh with `node scripts/build-player-directory.mjs` (ESPN public rosters
 * plus the retired-star list in that script). Names, sport, and team only.
 * Normalized names are computed once, when this chunk loads.
 */
import { normInterest } from "@/lib/social/follow-rank";
import { collapseInitials } from "./initials";
import type { DirectoryPlayer, IndexedDirectoryPlayer } from "./types";
import players from "./directory.json";

export type { DirectoryPlayer, IndexedDirectoryPlayer };

export const PLAYER_DIRECTORY: readonly DirectoryPlayer[] = players;

export const INDEXED_DIRECTORY: readonly IndexedDirectoryPlayer[] = players.map((player) => {
  const norm = normInterest(player.name);
  const words = norm ? norm.split(" ") : [];
  const joined = collapseInitials(words);
  const indexed: IndexedDirectoryPlayer = {
    name: player.name,
    sport: player.sport,
    norm,
    words,
  };
  if (joined !== words) indexed.joined = joined;
  if (player.team) indexed.team = player.team;
  return indexed;
});
