import type { CompListing, IdentifyResult, SportsCard } from "./types";

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
  card: Pick<SportsCard, "playerName" | "year" | "setBrand" | "cardNumber" | "estimatedSellPrice">,
): CompListing[] {
  const base = card.estimatedSellPrice || 120;
  return Array.from({ length: 6 }, (_, i) => {
    const price = jitter(base, i + card.year);
    return {
      id: `${card.playerName}-${card.cardNumber}-${i}`,
      title: `${card.year} ${card.setBrand} ${card.playerName} #${card.cardNumber}`,
      soldPrice: price,
      soldDate: daysAgo(3 + i * 4),
      platform: "eBay" as const,
      condition: CONDITIONS[i % CONDITIONS.length],
      shipping: i % 3 === 0 ? 5.99 : 0,
    };
  });
}

export function averageComp(comps: CompListing[]) {
  if (!comps.length) return 0;
  return Math.round(comps.reduce((sum, c) => sum + c.soldPrice, 0) / comps.length);
}

const IDENTIFY_POOL: Omit<IdentifyResult, "comps" | "confidence">[] = [
  {
    playerName: "Victor Wembanyama",
    year: 2023,
    setBrand: "Panini Prizm",
    cardNumber: "136",
    sport: "Basketball",
    estimatedSellPrice: 185,
  },
  {
    playerName: "Caitlin Clark",
    year: 2024,
    setBrand: "Panini Prizm WNBA",
    cardNumber: "101",
    sport: "Basketball",
    estimatedSellPrice: 240,
  },
  {
    playerName: "Shohei Ohtani",
    year: 2018,
    setBrand: "Topps Update",
    cardNumber: "US1",
    sport: "Baseball",
    estimatedSellPrice: 310,
  },
];

export async function identifyFromPhoto(): Promise<IdentifyResult> {
  await new Promise((r) => setTimeout(r, 1600));
  const pick = IDENTIFY_POOL[Math.floor(Math.random() * IDENTIFY_POOL.length)];
  const comps = mockCompsForCard(pick);
  return {
    ...pick,
    confidence: 0.86 + Math.random() * 0.1,
    estimatedSellPrice: averageComp(comps),
    comps,
  };
}
