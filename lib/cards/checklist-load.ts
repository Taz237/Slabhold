import index from "@/lib/cards/data/checklists/index.json";
import { sameChecklistProduct, type ChecklistIndexEntry, type ChecklistProduct } from "./checklists";
import { productPhrase } from "./product-data";

/**
 * Loads checklist files on demand, the way product-data.ts loads the parallel lists: a dynamic
 * import per product, so nothing here is in a page's first load and a scan only fetches the one
 * or two files for the year and set it read. Each file is kept after its first load.
 */

export const CHECKLIST_INDEX = index as readonly ChecklistIndexEntry[];

const loaded = new Map<string, Promise<ChecklistProduct | null>>();

function loadFile(file: string): Promise<ChecklistProduct | null> {
  let pending = loaded.get(file);
  if (!pending) {
    pending = import(`./data/checklists/${file}.json`)
      .then((mod) => ((mod as { default?: unknown }).default ?? mod) as ChecklistProduct)
      .catch(() => {
        // A file that failed to load is tried again next scan.
        loaded.delete(file);
        return null;
      });
    loaded.set(file, pending);
  }
  return pending;
}

/** Most files one scan loads: a set name a few sports share in one year. */
const MAX_FILES = 6;
/** No year read at all (a vintage card): every year of the set in its sport, up to this many. */
const MAX_ANY_YEAR_FILES = 80;
/**
 * Backs have printed a © year since about 1980 ("© 1981 TOPPS CHEWING GUM"), so a card with no year
 * anywhere is from before then. Later years are never searched: smaller loads, and no modern tribute
 * card (2026 Topps' Mantle #311) competes with the original.
 */
const LAST_YEARLESS_YEAR = 1980;

/**
 * The files for a year (or years) and a set, from the index. No file is read here. No years: every
 * year of that set, but only in a known sport (Topps is a set in four of them).
 */
export function checklistFilesFor(
  card: { years: readonly string[]; setBrand: string; sport?: string },
  entries: readonly ChecklistIndexEntry[] = CHECKLIST_INDEX,
): string[] {
  if (card.years.length === 0) {
    if (!card.sport) return [];
    const phrase = productPhrase(card.setBrand);
    return entries
      .filter((entry) => Boolean(phrase) && productPhrase(entry.product) === phrase && entry.sport.toLowerCase() === card.sport!.toLowerCase())
      .filter((entry) => Number(/^\d{4}/.exec(entry.yearLabel)?.[0] ?? Number.NaN) <= LAST_YEARLESS_YEAR)
      .map((entry) => entry.file)
      .slice(0, MAX_ANY_YEAR_FILES);
  }
  return entries
    .filter((entry) => card.years.some((yearLabel) => sameChecklistProduct(entry, { yearLabel, setBrand: card.setBrand })))
    .filter((entry) => !card.sport || entry.sport.toLowerCase() === card.sport.toLowerCase())
    .map((entry) => entry.file)
    .slice(0, MAX_FILES);
}

/** The checklists for the year and set a scan read. Empty when the store has none. */
export async function loadChecklistsFor(card: { years: readonly string[]; setBrand: string; sport?: string }): Promise<ChecklistProduct[]> {
  const products = await Promise.all(checklistFilesFor(card).map(loadFile));
  return products.filter((product): product is ChecklistProduct => Boolean(product));
}
