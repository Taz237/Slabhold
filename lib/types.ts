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
  purchasePrice: number;
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

/** True when the card is missing a number and the user did not opt out. */
export function cardNeedsDetails(
  card: Pick<SportsCard, "cardNumber" | "noNumber">,
): boolean {
  return !card.noNumber && !card.cardNumber.trim();
}
