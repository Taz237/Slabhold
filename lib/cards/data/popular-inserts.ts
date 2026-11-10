import { setMatchPhrase } from "@/lib/comps/match";

/**
 * A short Slabhold seed of popular insert names (case hits), so they are one
 * tap on "Parallel or insert". Not an official checklist: names only, never a
 * print run. Saved like any custom parallel (parallel_is_custom = true), which
 * is enough for the sold-listings query to include the name.
 */
export type PopularInsert = {
  name: string;
  /** Other spellings people type. They pick the same chip and store `name`. */
  aliases: readonly string[];
  /** No official runs in this seed. */
  serialRun: null;
};

export const POPULAR_INSERTS: readonly PopularInsert[] = [
  { name: "Kaboom", aliases: ["Kaboom!"], serialRun: null },
  { name: "Downtown", aliases: [], serialRun: null },
  { name: "Color Blast", aliases: [], serialRun: null },
];

/** Lowercase, no punctuation, single spaces. "Kaboom!" and "kaboom" share a key. */
export function insertKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The seed insert this name means, or null. "Kaboom!" is Kaboom. */
export function seedInsert(name: string): PopularInsert | null {
  const key = insertKey(name);
  if (!key) return null;
  return (
    POPULAR_INSERTS.find(
      (item) => insertKey(item.name) === key || item.aliases.some((alias) => insertKey(alias) === key),
    ) ?? null
  );
}

/** The name to show and store: the seed spelling when it is a seed insert. */
export function canonicalInsertName(name: string): string {
  return seedInsert(name)?.name ?? name.trim().replace(/\s+/g, " ");
}

/** Same Panini words as setMaker on the Set step. */
const PANINI_WORDS =
  /\b(panini|prizm|select|mosaic|hoops|court kings|contenders|national treasures|immaculate|flawless|chronicles|spectra|phoenix|obsidian|revolution|certified)\b/;

type InsertFamily = "optic" | "donruss" | "absolute" | "panini";

function insertFamily(setBrand: string): InsertFamily | null {
  const phrase = setMatchPhrase(setBrand);
  if (!phrase) return null;
  const words = ` ${insertKey(phrase)} `;
  if (words.includes(" optic ")) return "optic";
  if (words.includes(" donruss ")) return "donruss";
  if (words.includes(" absolute ")) return "absolute";
  if (PANINI_WORDS.test(setBrand.toLowerCase())) return "panini";
  return null;
}

/** Inserts per set family, most likely first. Kaboom stays on close Panini picks. */
const FAMILY_INSERTS: Record<InsertFamily, readonly string[]> = {
  optic: ["Downtown", "Kaboom", "Color Blast"],
  donruss: ["Kaboom", "Downtown", "Color Blast"],
  absolute: ["Kaboom"],
  panini: ["Kaboom", "Color Blast"],
};

export type InsertChips = {
  /** "Inserts" when the set family has a mapping, "Popular inserts" otherwise. */
  label: "Inserts" | "Popular inserts";
  names: string[];
};

/** Insert chips for the set on screen. A set with no mapping still gets the popular row. */
export function insertsForSet(setBrand: string): InsertChips {
  const family = insertFamily(setBrand);
  if (family) return { label: "Inserts", names: [...FAMILY_INSERTS[family]] };
  return { label: "Popular inserts", names: POPULAR_INSERTS.map((item) => item.name) };
}

/**
 * Sets to lead with on the Set step once an insert is chosen. The rest of the
 * sets stay on the step and in the search sheet.
 */
const INSERT_LEAD_SETS: Record<string, readonly string[]> = {
  downtown: ["Donruss Optic", "Panini Donruss"],
  kaboom: ["Panini Donruss", "Donruss Optic", "Panini Absolute"],
  "color blast": ["Donruss Optic", "Panini Donruss"],
};

export function insertLeadSets(insert: string): string[] {
  const seed = seedInsert(insert);
  if (!seed) return [];
  return [...(INSERT_LEAD_SETS[insertKey(seed.name)] ?? [])];
}

/**
 * Find a seed insert at the end or start of a search like "Malik Nabers Kaboom".
 * Returns the insert and the text left for the player search.
 */
export function splitInsertFromQuery(query: string): { insert: string | null; rest: string } {
  const clean = query.trim().replace(/\s+/g, " ");
  const words = clean.split(" ").filter(Boolean);
  if (words.length === 0) return { insert: null, rest: "" };
  // Longest match first so "Color Blast" wins over a one-word guess.
  for (let size = Math.min(3, words.length); size >= 1; size -= 1) {
    const tail = seedInsert(words.slice(-size).join(" "));
    if (tail) return { insert: tail.name, rest: words.slice(0, -size).join(" ") };
    const head = seedInsert(words.slice(0, size).join(" "));
    if (head) return { insert: head.name, rest: words.slice(size).join(" ") };
  }
  return { insert: null, rest: clean };
}
