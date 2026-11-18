/**
 * Small checks on one sold title, shared by the matcher (match.ts) and the player lookup
 * (player-lookup.ts). Kept small on purpose: lib/comps/match is shared with the card pages,
 * and pulling more of it in here grows their bundles.
 */
export const TITLE_LOT = /\b(?:lot|lots|reprint|proxy|custom|you\s+pick|complete\s+set|team\s+set)\b|\bx[2-9]\b|\b\d+\s*cards?\b/i;
/** "/199", "#/199", "88/199". A season ("2025/26") is not a run. */
const TITLE_RUN = /(?:(\d{1,4})(\s*))?\/\s*(\d{1,4})\b/g;

/** The print runs a title names. */
export function titleRuns(title: string): number[] {
  const runs: number[] = [];
  for (const match of title.matchAll(TITLE_RUN)) {
    const left = match[1] ? Number(match[1]) : null;
    const right = Number(match[3]);
    if (left != null && left >= 1900 && (right === (left + 1) % 100 || right === left + 1)) continue;
    // "BCP-68 /10": the number before the space is the card #, and "/10" is the run. "68/10" is neither.
    if (left != null && left > right && !match[2]) continue;
    if (right > 0) runs.push(right);
  }
  return runs;
}
