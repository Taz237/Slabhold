/**
 * Bundled player directory for the collect-prompt name step.
 * Refresh with `node scripts/build-player-directory.mjs` (ESPN public rosters
 * plus the retired-star list in that script). Names, sport, and team only.
 */
import type { DirectoryPlayer } from "./types";
import players from "./directory.json";

export type { DirectoryPlayer };

export const PLAYER_DIRECTORY: readonly DirectoryPlayer[] = players;
