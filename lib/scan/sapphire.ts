/**
 * Sapphire Edition: a separate product of the same checklist (same players, same card #s), sold
 * as its own set. Some cards print "SAPPHIRE"; many don't, and then only sold titles can tell.
 * It is never guessed from the card's look.
 */

/** The sets that have a Sapphire Edition. */
export const SAPPHIRE_BASES = ["Bowman Chrome", "Bowman U Chrome", "Bowman Draft", "Topps Chrome"] as const;

/**
 * The first card year each set had a Sapphire Edition. A card from before it can't be one, so it
 * is never asked. Checked against release coverage (Nov 2026):
 * - Topps Chrome: 2016, the first Topps Chrome Sapphire Edition.
 * - Bowman Draft: 2019, the first Sapphire Edition of any Bowman set.
 * - Bowman Chrome: 2020. Bowman Sapphire Edition (the flagship's, with the BCP Chrome prospects
 *   sellers list as Bowman Chrome Sapphire) began in 2020; Bowman Chrome's own began in 2021.
 * - Bowman U Chrome: 2023 football, 2023-24 basketball.
 */
export const SAPPHIRE_FIRST_YEAR: Record<(typeof SAPPHIRE_BASES)[number], number> = {
  "Topps Chrome": 2016,
  "Bowman Draft": 2019,
  "Bowman Chrome": 2020,
  "Bowman U Chrome": 2023,
};

/**
 * The Sapphire Edition this card could be, or null: its set has one, and the card's year isn't
 * before that edition existed. A card whose year wasn't read is still asked. "2023-24" counts as 2023.
 */
export function sapphireOptionFor(setBrand: string, yearLabel: string): string | null {
  const base = SAPPHIRE_BASES.find((name) => same(name, setBrand));
  if (!base) return null;
  const year = Number(/^(\d{4})/.exec(yearLabel.trim())?.[1] ?? Number.NaN);
  if (Number.isFinite(year) && year < SAPPHIRE_FIRST_YEAR[base]) return null;
  return `${base} Sapphire`;
}

const same = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

/** "Bowman U Chrome" → "Bowman U Chrome Sapphire". Null for a set with no Sapphire Edition, or one that already is. */
export function sapphireOf(setBrand: string): string | null {
  const base = SAPPHIRE_BASES.find((name) => same(name, setBrand));
  return base ? `${base} Sapphire` : null;
}

/** "Bowman U Chrome Sapphire" → "Bowman U Chrome". Null when the set isn't a Sapphire Edition. */
export function sapphireBase(setBrand: string): string | null {
  return SAPPHIRE_BASES.find((name) => same(`${name} Sapphire`, setBrand)) ?? null;
}

export function isSapphireSet(setBrand: string): boolean {
  return sapphireBase(setBrand) != null;
}

/** The set is one with a Sapphire Edition, or is that edition. In these, "Sapphire" names the product, never a parallel. */
export function inSapphireFamily(setBrand: string): boolean {
  return sapphireOf(setBrand) != null || isSapphireSet(setBrand);
}

export const SAPPHIRE_WORD = /\bsapphire\b/i;

/** The set as sellers search it: "Bowman Sapphire" for any Bowman one, else the full name. */
export function sapphireSearchSet(setBrand: string): string {
  if (!isSapphireSet(setBrand)) return setBrand;
  return /^bowman\b/i.test(setBrand) ? "Bowman Sapphire" : setBrand;
}

/** A sold title with the product word taken out, so "Sapphire Black /10" reads as Black. */
export function withoutSapphire(title: string): string {
  return title.replace(/\bsapphire(?:\s+edition)?\b/gi, " ").replace(/\s+/g, " ").trim();
}
