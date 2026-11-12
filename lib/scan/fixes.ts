import { compactNorm, normInterest } from "@/lib/social/follow-rank";
import { identityKey, type ScanMatch, type ScanMatchResult, type ScanRead } from "./match";

/**
 * Learning from fixes. When collectors change the scanner's top pick for the
 * same read, the next scan of that read starts on what they chose.
 *
 * Text keys only: what was read (player, year, set, number, parallel words)
 * and the card chosen. Never a photo, a cert number or a card id. A boost
 * needs at least 2 different collectors (scan_fix_boosts in the migration),
 * moves a card to the top and can fill an open parallel, but never overrides
 * what the card itself showed and never marks a match settled.
 * Off until NEXT_PUBLIC_SCAN_FIXES is exactly "1" (after the migration is applied).
 */

export const MIN_COLLECTORS = 2;
const MAX_KEY = 300;

export type ScanFix = {
  readKey: string;
  wrongIdentity: string;
  rightIdentity: string;
  rightParallel: string;
};

export type FixBoost = {
  readKey: string;
  rightIdentity: string;
  rightParallel: string;
  collectors: number;
};

export function scanFixesEnabled(
  env: { NEXT_PUBLIC_SCAN_FIXES?: string } = { NEXT_PUBLIC_SCAN_FIXES: process.env.NEXT_PUBLIC_SCAN_FIXES },
): boolean {
  return env.NEXT_PUBLIC_SCAN_FIXES === "1";
}

function words(text: string): string {
  return normInterest(text);
}

/** What was read, as one text key. Empty without a player: nothing to learn from. */
export function readKeyOf(read: ScanRead): string {
  let parts: string[];
  if (read.kind === "slab") {
    const label = read.label;
    if (!label.playerText.trim()) return "";
    parts = [
      "slab",
      words(label.playerText),
      label.yearLabel,
      words(label.setName || label.setText),
      label.cardNumber.toLowerCase(),
      words(label.varietyText),
    ];
  } else {
    const sides = [read.front, read.back].filter((side) => side != null);
    const player = sides.map((side) => side.players[0]?.name ?? "").find(Boolean) ?? "";
    if (!player) return "";
    const year = sides.map((side) => side.yearLabel).find(Boolean) ?? "";
    const set = sides.map((side) => side.setNames[0] ?? "").find(Boolean) ?? "";
    const number = (read.back?.cardNumber || read.front.cardNumber).toLowerCase();
    const parallel = [...new Set(sides.flatMap((side) => side.parallelWords.map(words)))].sort().join(" ");
    parts = ["raw", words(player), year, words(set), number, parallel];
  }
  return parts.join("|").slice(0, MAX_KEY);
}

export function identityKeyOf(match: Pick<ScanMatch, "playerName" | "yearLabel" | "setBrand" | "cardNumber">): string {
  return identityKey(match);
}

/** The fix to record when the collector confirmed something other than the scan's pick. */
export function fixFrom(readKey: string, before: ScanMatch, after: ScanMatch): ScanFix | null {
  if (!readKey) return null;
  const wrong = identityKeyOf(before);
  const right = identityKeyOf(after);
  const parallel = after.parallel.trim();
  if (wrong === right && parallel === before.parallel.trim()) return null;
  if (!right.replace(/\|/g, "")) return null;
  return { readKey, wrongIdentity: wrong, rightIdentity: right, rightParallel: parallel };
}

/** The scan's matches with what collectors chose for this read moved up. */
export function applyFixBoosts(result: ScanMatchResult, readKey: string, boosts: readonly FixBoost[]): ScanMatchResult {
  const best = boosts
    .filter((boost) => boost.readKey === readKey && boost.collectors >= MIN_COLLECTORS)
    .sort((a, b) => b.collectors - a.collectors)[0];
  if (!best) return result;
  const index = result.matches.findIndex((match) => identityKeyOf(match) === best.rightIdentity);
  if (index < 0) return result;
  let chosen = result.matches[index];
  if (best.rightParallel && chosen.sureness.parallel !== "sure") {
    const key = compactNorm(normInterest(best.rightParallel));
    const option = chosen.parallelOptions.find((item) => compactNorm(normInterest(item.name)) === key);
    if (option) {
      chosen = {
        ...chosen,
        parallel: option.name,
        serialRun: chosen.serialRun ?? option.serialRun,
        sureness: { ...chosen.sureness, parallel: "likely" },
        parallelOptions: [option, ...chosen.parallelOptions.filter((item) => item !== option)],
      };
    }
  }
  if (index === 0 && chosen === result.matches[0]) return result;
  const matches = [chosen, ...result.matches.filter((_, i) => i !== index)];
  return { ...result, matches, settled: index === 0 ? result.settled : false };
}
