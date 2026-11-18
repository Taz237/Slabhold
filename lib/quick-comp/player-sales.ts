import { listingLooksProfessionallyGraded, resolveListingGrade, titleHasPlayer, titleHashCardNumbers } from "@/lib/comps/match";
import type { TrawlSoldResult } from "@/lib/comps/types";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { titleParallel } from "@/lib/scan/scan-sales";
import { TITLE_LOT, titleRuns } from "@/lib/scan/title-facts";
import type { GradeCompany, PlayerSale } from "./player-feed";
import { safePhotoUrl } from "./photo";

/**
 * Sets a title can name, longest first so "Bowman Chrome" wins over "Bowman".
 * Shown as the title spells the family; never inferred from anything else.
 */
export const TITLE_SETS: readonly { label: string; pattern: RegExp }[] = [
  ["Topps Chrome Update", /\btopps\s+chrome\s+update\b/i],
  ["Bowman Chrome", /\bbowman\s+chrome\b/i],
  ["Bowman Draft", /\bbowman\s+draft\b/i],
  ["Bowman U", /\bbowman\s+u\b/i],
  ["Topps Chrome", /\btopps\s+chrome\b/i],
  ["Topps Update", /\btopps\s+update\b/i],
  ["Topps Now", /\btopps\s+now\b/i],
  ["Stadium Club", /\bstadium\s+club\b/i],
  ["Allen & Ginter", /\ballen\s*(?:&|and)\s*ginter\b/i],
  ["National Treasures", /\bnational\s+treasures\b/i],
  ["Prizm Draft Picks", /\bprizm\s+draft\s+picks?\b/i],
  ["Optic", /\boptic\b/i],
  ["Prizm", /\bprizm\b/i],
  ["Select", /\bselect\b/i],
  ["Mosaic", /\bmosaic\b/i],
  ["Contenders", /\bcontenders\b/i],
  ["Flawless", /\bflawless\b/i],
  ["Immaculate", /\bimmaculate\b/i],
  ["Spectra", /\bspectra\b/i],
  ["Obsidian", /\bobsidian\b/i],
  ["Phoenix", /\bphoenix\b/i],
  ["Chronicles", /\bchronicles\b/i],
  ["Origins", /\borigins\b/i],
  ["Absolute", /\babsolute\b/i],
  ["Certified", /\bcertified\b/i],
  ["Hoops", /\bhoops\b/i],
  ["Donruss", /\bdonruss\b/i],
  ["Finest", /\bfinest\b/i],
  ["Heritage", /\bheritage\b/i],
  ["Bowman", /\bbowman\b/i],
  ["Upper Deck", /\bupper\s+deck\b/i],
  ["Fleer", /\bfleer\b/i],
  ["Score", /\bscore\b/i],
  ["Leaf", /\bleaf\b/i],
  ["Topps", /\btopps\b/i],
].map(([label, pattern]) => ({ label: label as string, pattern: pattern as RegExp }));

export function titleSet(title: string): string | null {
  return TITLE_SETS.find((set) => set.pattern.test(title))?.label ?? null;
}

const TITLE_YEAR = /(?<![\d/#])(19[5-9]\d|20[0-3]\d)(?:\s*[-/]\s*(\d{2}))?(?!\d)(?!\s*\/\s*\d{3})/;

/** "2023" or "2023-24" when the title prints it. A run ("88/99") or a card # isn't a year. */
export function titleYear(title: string): string | null {
  const match = TITLE_YEAR.exec(title);
  if (!match) return null;
  const start = Number(match[1]);
  if (match[2] && Number(match[2]) === (start + 1) % 100) return `${start}-${match[2]}`;
  return String(start);
}

const AUTO = /\b(?:auto(?:graph(?:ed)?)?s?|signed|signature|rpa)\b/i;

export function titleIsAuto(title: string): boolean {
  return AUTO.test(title) && !/\bno\s+auto\b|\bnon[\s-]?auto\b/i.test(title);
}

function companyOf(grader: string | null): GradeCompany {
  const name = (grader ?? "").trim().toUpperCase();
  if (name === "PSA") return "PSA";
  if (name === "BGS" || name === "BECKETT" || name === "BVG") return "BGS";
  if (name === "SGC") return "SGC";
  return "other";
}

/** The grade the listing shows: eBay's grading field first, then the title. Graded with no grader is "Graded". */
export function saleGrade(result: TrawlSoldResult): { grade: string; company: GradeCompany } {
  if (!listingLooksProfessionallyGraded(result)) return { grade: "Raw", company: "raw" };
  const { grader, grade } = resolveListingGrade(result);
  if (!grader) return { grade: "Graded", company: "other" };
  const company = companyOf(grader);
  const name = company === "other" ? grader.trim().toUpperCase() : company;
  return { grade: grade ? `${name} ${grade}` : name, company };
}

function photoOf(result: TrawlSoldResult): string | null {
  const images = Array.isArray(result.details?.images) ? result.details!.images : [];
  for (const url of [result.image_url, ...images]) {
    const safe = safePhotoUrl(url);
    if (safe) return safe;
  }
  return null;
}

function price(result: TrawlSoldResult): number {
  const fromDetails = Number(result.details?.sale_price);
  const value = Number(result.sale_price);
  if (Number.isFinite(value) && value > 0) return value;
  return Number.isFinite(fromDetails) && fromDetails > 0 ? fromDetails : 0;
}

export const MAX_FEED_SALES = 100;

/** "Darius Acuff Jr." is in "Acuff Prizm Silver": the suffix isn't the last name. */
export function namesPlayer(title: string, player: string): boolean {
  if (titleHasPlayer(title, player)) return true;
  const bare = player.replace(/[,\s]+(?:jr|sr|ii|iii|iv)\.?$/i, "").trim();
  return bare !== player.trim() && bare.length > 0 && titleHasPlayer(title, bare);
}

/**
 * One player's sold listings as feed rows: titles that name the player, no lots
 * or reprints, a real price. Newest first. Every fact is what the title prints.
 */
export function playerSalesFrom(
  results: readonly TrawlSoldResult[],
  player: string,
  directory: readonly IndexedDirectoryPlayer[],
): PlayerSale[] {
  const seen = new Set<string>();
  const out: PlayerSale[] = [];
  for (const result of results) {
    const title = typeof result?.title === "string" ? result.title.trim() : "";
    if (!title || !namesPlayer(title, player) || TITLE_LOT.test(title)) continue;
    const amount = price(result);
    if (amount <= 0 || !result.date_sold) continue;
    const id = result.item_id || `${title}|${result.date_sold}|${amount}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const set = titleSet(title);
    const parallel = titleParallel(title, directory, set ?? "");
    const runs = titleRuns(title);
    const numbers = titleHashCardNumbers(title);
    out.push({
      id,
      title,
      price: amount,
      soldAt: result.date_sold,
      photo: photoOf(result),
      ...saleGrade(result),
      year: titleYear(title),
      set,
      number: numbers.length === 1 ? numbers[0] : null,
      auto: titleIsAuto(title),
      run: runs.length === 1 ? runs[0] : null,
      parallel: parallel && parallel !== "Base" && !/parallel not named/.test(parallel) ? parallel : null,
    });
  }
  return out.sort((a, b) => Date.parse(b.soldAt) - Date.parse(a.soldAt)).slice(0, MAX_FEED_SALES);
}
