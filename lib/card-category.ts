import type { CardCategory, SportsCard } from "@/lib/types";

const STORAGE_KEY = "slabhold.card-category.v1";

export function cardCategory(card: { category?: string | null }): CardCategory {
  return card.category === "pc" ? "pc" : "flipping";
}

/** Display copy only. Stored values stay `pc` and `flipping`. */
export function categoryLabel(category: CardCategory) {
  return category === "pc" ? "Personal" : "Flipping";
}

export function readCategoryOverrides(): Record<string, CardCategory> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    const overrides: Record<string, CardCategory> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (value === "pc" || value === "flipping") overrides[id] = value;
    }
    return overrides;
  } catch {
    return {};
  }
}

export function mergeCategories(cards: SportsCard[]) {
  const overrides = readCategoryOverrides();
  const columnPresent = cards.some((card) => card.category === "pc" || card.category === "flipping");
  const dirty: SportsCard[] = [];
  const merged = cards.map((card) => {
    const override = overrides[card.id];
    const category = override ?? cardCategory(card);
    if (columnPresent && override && override !== cardCategory(card)) {
      dirty.push({ ...card, category: override });
    }
    return { ...card, category };
  });
  return { cards: merged, dirty };
}

export function rememberCategory(id: string, category: CardCategory) {
  if (typeof window === "undefined") return;
  const overrides = readCategoryOverrides();
  overrides[id] = category;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}
