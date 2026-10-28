import { SETS } from "@/lib/card-options";
import { parallelMatchKey } from "@/lib/cards/parallels";
import { setMatchPhrase } from "@/lib/comps/match";

/**
 * Checklist parallels by product, from the official CSVs.
 * The JSON loads with a dynamic import so it stays out of the main bundle.
 * Panini only for now. Topps lands in topps-parallels.json later.
 */
export type ProductParallelRow = {
  subset: string;
  name: string;
  serialRun: number | null;
  /** Numbered, but the run changes card to card. */
  runVaries?: boolean;
};

export type ProductRecord = {
  sport: string;
  yearLabel: string;
  product: string;
  manufacturer: string;
  source?: string;
  official?: boolean;
  parallels: ProductParallelRow[];
};

export type ProductParallel = {
  name: string;
  serialRun: number | null;
  runVaries?: true;
};

let loading: Promise<readonly ProductRecord[]> | null = null;
let loaded: readonly ProductRecord[] | null = null;

/** Both checklist files, loaded once. */
export function loadProductData(): Promise<readonly ProductRecord[]> {
  if (loaded) return Promise.resolve(loaded);
  if (!loading) {
    loading = Promise.all([
      import("@/lib/cards/data/panini-parallels.json"),
      import("@/lib/cards/data/topps-parallels.json"),
    ])
      .then(([panini, topps]) => {
        loaded = [
          ...(jsonRows(panini) as ProductRecord[]),
          ...(jsonRows(topps) as ProductRecord[]),
        ];
        return loaded;
      })
      .catch((error) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

/** Already loaded, or null. Lets a screen skip the loading state on a revisit. */
export function peekProductData(): readonly ProductRecord[] | null {
  return loaded;
}

function jsonRows(mod: unknown): unknown[] {
  const value = (mod as { default?: unknown }).default ?? mod;
  return Array.isArray(value) ? value : [];
}

function startYear(label: string): number | null {
  const match = label.trim().match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

/** "2024" and "2024-25" are the same release year. "2023-24" is not. */
export function sameSeason(left: string, right: string): boolean {
  const a = startYear(left);
  const b = startYear(right);
  return a != null && a === b;
}

/** Product names that differ from the Add card spelling of the same set. */
const PHRASE_ALIASES: Record<string, string> = {
  optic: "donruss optic",
};

function productPhrase(name: string): string {
  const phrase = setMatchPhrase(name);
  return PHRASE_ALIASES[phrase] ?? phrase;
}

/** The SETS spelling when there is one ("Panini Hoops" saves as "Hoops"). */
export function storedSetName(product: string): string {
  const phrase = productPhrase(product);
  return SETS.find((name) => productPhrase(name) === phrase) ?? product;
}

/** Checklist names read the way collectors say them. "Set - Concourse - Blue" is "Concourse Blue". */
export function displayParallelName(name: string): string {
  return name
    .replace(/^Set\s+-\s+/i, "")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameSport(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function productsFor(
  data: readonly ProductRecord[],
  sport: string,
  yearLabel: string,
): ProductRecord[] {
  if (!startYear(yearLabel)) return [];
  return data.filter(
    (product) => sameSport(product.sport, sport) && sameSeason(product.yearLabel, yearLabel),
  );
}

export function productForSet(
  data: readonly ProductRecord[],
  sport: string,
  yearLabel: string,
  setBrand: string,
): ProductRecord | null {
  const phrase = productPhrase(setBrand);
  if (!phrase) return null;
  return (
    productsFor(data, sport, yearLabel).find(
      (product) => productPhrase(product.product) === phrase,
    ) ?? null
  );
}

/** Set names for this sport and year, in the Add card spelling. */
export function setNamesIn(
  data: readonly ProductRecord[],
  sport: string,
  yearLabel: string,
): string[] {
  const names: string[] = [];
  for (const product of productsFor(data, sport, yearLabel)) {
    const name = storedSetName(product.product);
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** Base first, then the checklist order. One row per name across subsets. */
export function parallelsIn(
  data: readonly ProductRecord[],
  sport: string,
  yearLabel: string,
  setBrand: string,
): ProductParallel[] {
  const product = productForSet(data, sport, yearLabel, setBrand);
  if (!product) return [];
  const seen = new Set<string>();
  const list: ProductParallel[] = [];
  for (const row of product.parallels) {
    const name = displayParallelName(row.name);
    const key = parallelMatchKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const item: ProductParallel = { name, serialRun: row.serialRun ?? null };
    if (row.runVaries) item.runVaries = true;
    list.push(item);
  }
  const baseIndex = list.findIndex((item) => parallelMatchKey(item.name) === "base");
  if (baseIndex > 0) list.unshift(...list.splice(baseIndex, 1));
  // Select has tiers and no plain Base row. Base still leads the list.
  if (baseIndex < 0) list.unshift({ name: "Base", serialRun: null });
  return list;
}

/** The checklist row for this parallel, or null when the checklist does not list it. */
export function parallelIn(
  data: readonly ProductRecord[],
  sport: string,
  yearLabel: string,
  setBrand: string,
  parallel: string,
): ProductParallel | null {
  const key = parallelMatchKey(displayParallelName(parallel));
  if (!key) return null;
  return (
    parallelsIn(data, sport, yearLabel, setBrand).find(
      (item) => parallelMatchKey(item.name) === key,
    ) ?? null
  );
}

/** The print run from the checklist. Null when unnumbered, unknown, or varies. */
export function serialRunIn(
  data: readonly ProductRecord[],
  sport: string,
  yearLabel: string,
  setBrand: string,
  parallel: string,
): number | null {
  const row = parallelIn(data, sport, yearLabel, setBrand, parallel);
  const run = row?.serialRun;
  return typeof run === "number" && Number.isFinite(run) && run >= 1 ? run : null;
}

export async function productSetNames(sport: string, yearLabel: string): Promise<string[]> {
  return setNamesIn(await loadProductData(), sport, yearLabel);
}

export async function productParallels(
  sport: string,
  yearLabel: string,
  setName: string,
): Promise<ProductParallel[]> {
  return parallelsIn(await loadProductData(), sport, yearLabel, setName);
}

export async function knownSerialRun(
  sport: string,
  yearLabel: string,
  setName: string,
  parallel: string,
): Promise<number | null> {
  return serialRunIn(await loadProductData(), sport, yearLabel, setName, parallel);
}
