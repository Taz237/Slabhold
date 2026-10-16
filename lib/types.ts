export type CardStatus = "held" | "sold";

export type CardCategory = "flipping" | "pc";

export type SportsCard = {
  id: string;
  playerName: string;
  year: number;
  setBrand: string;
  cardNumber: string;
  grade: string;
  parallel: string;
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
  title: string;
  soldPrice: number;
  soldDate: string;
  platform: "eBay";
  condition: string;
  shipping: number | null;
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
