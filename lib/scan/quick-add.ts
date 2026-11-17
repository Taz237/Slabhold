import type { CardInput } from "@/lib/types";
import { readyToSave } from "./confirm";
import type { ScanMatch } from "./match";

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
    isRelic: false,
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
    category: "pc",
    isPublic: options.isPublic,
  };
}
