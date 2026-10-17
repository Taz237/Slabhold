import { cardCategory } from "@/lib/card-category";

/** Public, Flipping, and not sold — the listing that can match a want. */
export function isPublicForSaleListing(card: {
  isPublic?: boolean | null;
  category?: string | null;
  sellPrice?: number | null;
  sellDate?: string | null;
}): boolean {
  const sold = card.sellPrice != null && Boolean(card.sellDate);
  return Boolean(card.isPublic) && cardCategory(card) === "flipping" && !sold;
}
