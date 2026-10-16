export type CardStatus = "held" | "sold";

export type CardCategory = "flipping" | "pc";

export type ConditionType = "raw" | "graded";

export type SportsCard = {
  id: string;
  playerName: string;
  year: number;
  /** Display year or season, e.g. "2023-24". */
  yearLabel: string;
  setBrand: string;
  setIsCustom: boolean;
  cardNumber: string;
  noNumber: boolean;
  grade: string;
  parallel: string;
  parallelIsCustom: boolean;
  serialRun: number | null;
  serialNo: number | null;
  isRookie: boolean;
  isAuto: boolean;
  isRelic: boolean;
  conditionType: ConditionType;
  gradeQualifier: string;
  certNumber: string;
  sport: string;
  /** Null when the owner left "What you paid" empty. */
  purchasePrice: number | null;
  purchaseDate: string;
  estimatedSellPrice: number;
  sellPrice: number | null;
  sellDate: string | null;
  notes: string;
  photoDataUrl: string | null;
  accent: string;
  category?: CardCategory;
  isPublic?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CardInput = Omit<SportsCard, "id" | "createdAt" | "updatedAt">;

export type CompListing = {
  id: string;
  itemId: string;
  title: string;
  soldPrice: number;
  soldDate: string;
  platform: "eBay";
  condition: string;
  shipping: number | null;
  url: string;
};

export type IdentifyResult = {
  playerName: string;
  year: number;
  setBrand: string;
  cardNumber: string;
  sport: string;
  estimatedSellPrice: number;
  confidence: number;
  comps: CompListing[];
};

export type PortfolioFilter = "all" | "held" | "sold" | "profit" | "loss";

/**
 * True when pricing needs more identity details: missing number (unless
 * no_number), graded without grader/grade, or missing year.
 */
export function needsDetails(
  card: Pick<
    SportsCard,
    | "cardNumber"
    | "noNumber"
    | "conditionType"
    | "grade"
    | "year"
    | "yearLabel"
  >,
): boolean {
  if (!card.noNumber && !card.cardNumber.trim()) return true;
  if (card.conditionType === "graded") {
    const text = (card.grade ?? "").trim();
    if (!text || /^raw/i.test(text)) return true;
    const hasCompany = /\b(PSA|BGS|SGC|CGC|TAG|HGA|Other)\b/i.test(text);
    const hasNumber = /\d+(?:\.\d+)?/.test(text);
    if (!hasCompany || !hasNumber) return true;
  }
  const label = (card.yearLabel ?? "").trim();
  if (!label && !(card.year > 0)) return true;
  return false;
}

/** @deprecated Prefer needsDetails */
export function cardNeedsDetails(
  card: Pick<
    SportsCard,
    | "cardNumber"
    | "noNumber"
    | "conditionType"
    | "grade"
    | "year"
    | "yearLabel"
  >,
): boolean {
  return needsDetails(card);
}
