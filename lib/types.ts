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
  /**
   * Null when cards.open_to_offers is not in the database yet.
   * False is the default once the column exists.
   */
  openToOffers?: boolean | null;
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

type DetailCard = Pick<
  SportsCard,
  "cardNumber" | "noNumber" | "conditionType" | "grade" | "year" | "yearLabel"
> & { setBrand?: string | null };

/**
 * Fields pricing still needs. Display names only — nothing here is written back.
 * Order is year, set, number, grade.
 */
export function missingDetailFields(card: DetailCard): string[] {
  const missing: string[] = [];
  const label = (card.yearLabel ?? "").trim();
  if (!label && !(card.year > 0)) missing.push("year");
  if (typeof card.setBrand === "string" && !card.setBrand.trim()) missing.push("set");
  if (!card.noNumber && !card.cardNumber.trim()) missing.push("number");
  if (card.conditionType === "graded") {
    const text = (card.grade ?? "").trim();
    const hasCompany = /\b(PSA|BGS|SGC|CGC|TAG|HGA|Other)\b/i.test(text);
    const hasNumber = /\d+(?:\.\d+)?/.test(text);
    if (!text || /^raw/i.test(text) || !hasCompany || !hasNumber) missing.push("grade");
  }
  return missing;
}

/** Chip copy, e.g. "Needs: year, set". */
export function needsDetailsLabel(card: DetailCard): string {
  return `Needs: ${missingDetailFields(card).join(", ")}`;
}

/**
 * True when pricing needs more identity details: missing number (unless
 * no_number), graded without grader/grade, missing year, or a blank set.
 */
export function needsDetails(card: DetailCard): boolean {
  return missingDetailFields(card).length > 0;
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
