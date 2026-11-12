import type { CompListing, SportsCard } from "@/lib/types";

const CONDITIONS = ["Raw NM", "Raw LP", "PSA 9", "PSA 10", "SGC 9.5"];

function jitter(base: number, index: number) {
  const wave = Math.sin(index * 1.7) * 0.14;
  return Math.max(8, Math.round(base * (1 + wave)));
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function mockCompsForCard(
  card: Pick<
    SportsCard,
    "playerName" | "year" | "setBrand" | "cardNumber" | "estimatedSellPrice"
  >,
): CompListing[] {
  const base = card.estimatedSellPrice || 120;
  return Array.from({ length: 6 }, (_, i) => {
    const price = jitter(base, i + card.year);
    return {
      id: `${card.playerName}-${card.cardNumber}-${i}`,
      itemId: `sample-${i}`,
      title: `${card.year} ${card.setBrand} ${card.playerName} #${card.cardNumber}`,
      soldPrice: price,
      soldDate: daysAgo(3 + i * 4),
      platform: "eBay" as const,
      condition: CONDITIONS[i % CONDITIONS.length],
      shipping: i % 3 === 0 ? 5.99 : 0,
      url: "",
    };
  });
}
