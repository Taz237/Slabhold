import index from "@/lib/cards/data/checklists/index.json";
import { sameChecklistProduct, type ChecklistIndexEntry, type ChecklistProduct } from "./checklists";

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

/** The files for a year (or years) and a set, from the index. No file is read here. */
export function checklistFilesFor(
  card: { years: readonly string[]; setBrand: string; sport?: string },
  entries: readonly ChecklistIndexEntry[] = CHECKLIST_INDEX,
): string[] {
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
