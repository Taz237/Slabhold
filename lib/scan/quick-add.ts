import { parseGrade, RAW_GRADE } from "@/lib/card-options";
import { insertNameOf } from "@/lib/cards/insert-name";
import type { CardInput } from "@/lib/types";
import { scanCompGrade } from "./comp";
import { readyToSave } from "./confirm";
import type { ScanGrade, ScanMatch } from "./match";

/**
 * One tap from the scan to the collection: the card as the scan read it (with the version the
 * collector picked), saved straight away. Only when every field the collection needs is there, and
 * the parallel was read or picked: never a silent Base. Anything else goes through Add card, which
 * asks for what's missing.
 */

export const QUICK_ADD_COPY = {
  add: "Add to my collection",
  added: "Added to your collection",
  /** The version isn't picked yet: the Add button says so instead of guessing Base. */
  pickFirst: "Pick your version first",
} as const;

/**
 * The match with the grade the sheet's Grade chip shows, so Add saves what the collector picked.
 * Unchanged keeps the slab's own read (qualifier, cert). Raw saves no grade. Another chip saves
 * that company and number; the cert stays only when the company is the same.
 */
export function matchWithChosenGrade(match: ScanMatch, chosen: string): ScanMatch {
  if (chosen === scanCompGrade(match)) return match;
  const parsed = parseGrade(chosen);
  if (parsed.company === RAW_GRADE) return { ...match, grade: null };
  // A chip we can't read as a company and number: keep the scan's own grade, never a half grade.
  if (!parsed.company || !parsed.number) return match;
  const grade: ScanGrade = {
    company: parsed.company,
    number: parsed.number,
    qualifier: "",
    certNumber: match.grade?.company === parsed.company ? match.grade.certNumber : "",
    authentic: false,
    autoGrade: "",
  };
  return { ...match, grade };
}

export function cardInputFromScan(
  match: ScanMatch,
  options: { photo: string | null; accent: string; isPublic: boolean; value?: number | null },
): CardInput | null {
  if (!readyToSave(match)) return null;
  const year = Number(/^(\d{4})/.exec(match.yearLabel.trim())?.[1] ?? Number.NaN);
  if (!Number.isFinite(year)) return null;
  const graded = Boolean(match.grade?.company);
  const grade = !graded
    ? ""
    : match.grade!.authentic && !match.grade!.number
      ? `${match.grade!.company} Authentic`
      : `${match.grade!.company} ${match.grade!.number}`;
  const serialNo = match.serialRun && /^\d+$/.test(match.serialNo) ? Number(match.serialNo) : null;
  return {
    playerName: match.playerName.trim(),
    year,
    yearLabel: match.yearLabel.trim(),
    setBrand: match.setBrand.trim(),
    setIsCustom: false,
    cardNumber: match.cardNumber.trim(),
    noNumber: false,
    grade,
    parallel: match.parallel.trim(),
    parallelIsCustom: false,
    serialRun: match.serialRun ?? null,
    serialNo,
    isRookie: match.isRookie,
    isAuto: match.isAuto,
    isRelic: Boolean(match.isRelic),
    conditionType: graded ? "graded" : "raw",
    gradeQualifier: graded ? (match.grade!.qualifier ?? "") : "",
    certNumber: graded ? (match.grade!.certNumber ?? "") : "",
    sport: match.sport,
    purchasePrice: null,
    purchaseDate: "",
    estimatedSellPrice: options.value && options.value > 0 ? options.value : 0,
    sellPrice: null,
    sellDate: null,
    notes: "",
    photoDataUrl: options.photo,
    accent: options.accent,
    // The insert the scan placed it in ("Rookie Code"), saved with it.
    ...(insertNameOf(match) ? { insertName: insertNameOf(match) } : {}),
    category: "pc",
    isPublic: options.isPublic,
  };
}
