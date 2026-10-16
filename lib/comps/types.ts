import type { CompListing } from "@/lib/types";
import type { ValuePoint } from "@/lib/value-history";

export type TrawlSale = {
  date_sold: string;
  sale_price: number;
  shipping_price?: number | null;
  currency?: string | null;
  condition?: string | null;
};

export type TrawlGrading = {
  graded: boolean;
  grader: string | null;
  grade: string | null;
  condition: string | null;
};

export type TrawlItemDetails = {
  site?: string;
  item_id?: string;
  listing_state?: string | null;
  condition_raw?: string | null;
  grading?: TrawlGrading | null;
  sale_price?: number | null;
  best_offer_accepted?: boolean | null;
  sales?: TrawlSale[] | null;
  item_link?: string | null;
};

export type TrawlSoldResult = {
  title: string;
  sale_price: number;
  shipping_price: number | null;
  currency: string;
  condition: string;
  condition_raw: string | null;
  date_sold: string;
  buying_format: string;
  item_id: string;
  item_link: string;
  image_url: string | null;
  details?: TrawlItemDetails | null;
};

export type TrawlSoldResponse = {
  site: string;
  currency: string;
  query: string[];
  count: number;
  credits_charged: number;
  results: TrawlSoldResult[];
  error?: string;
};

export type SoldCompCard = {
  id: string;
  playerName: string;
  year: number;
  setBrand: string;
  cardNumber?: string;
  grade?: string;
  estimatedSellPrice?: number;
};

export type CleanedSale = {
  itemId: string;
  title: string;
  price: number;
  currency: string | null;
  soldAt: string;
  grader: string | null;
  grade: string | null;
  url: string;
};

export type SoldCompsPayload = {
  comps: CompListing[];
  history: ValuePoint[];
  median: number | null;
  p25: number | null;
  p75: number | null;
  count: number;
  source: "trawl" | "sample" | "off";
  cached: boolean;
  fetchedAt: string | null;
  query: string;
  lowConfidence: boolean;
  sample: boolean;
};
