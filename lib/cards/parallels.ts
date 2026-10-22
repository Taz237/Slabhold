import { setMatchPhrase } from "@/lib/comps/match";

/** The old single list. Unknown and custom sets use this. */
export const GENERIC_PARALLELS = [
  "Base",
  "Silver",
  "Refractor",
  "Gold",
  "Green",
  "Blue",
  "Red",
  "Pink",
  "Purple",
  "Orange",
  "Black",
  "White",
  "Holo",
  "Cracked Ice",
  "Wave",
  "Scope",
  "Shimmer",
  "Mojo",
  "Camo",
  "Tie-Dye",
  "Disco",
] as const;

const CHROME_PARALLELS = [
  "Base",
  "Refractor",
  "X-Fractor",
  "Prism Refractor",
  "Sepia",
  "Pink",
  "Purple",
  "Blue",
  "Green",
  "Gold",
  "Orange",
  "Red",
  "Black",
  "Atomic",
  "Speckle",
  "Wave",
  "Mojo",
  "Superfractor",
] as const;

/**
 * Keyed by setMatchPhrase (manufacturer words like "Panini" dropped).
 * A longer saved name such as "Topps Chrome Sapphire" uses the same family
 * when the phrase starts with that key.
 */
export const PARALLELS_BY_SET: Record<string, readonly string[]> = {
  prizm: [
    "Base",
    "Silver",
    "Hyper",
    "Red White & Blue",
    "Red",
    "Blue",
    "Green",
    "Orange",
    "Purple",
    "Pink",
    "Gold",
    "Black",
    "Mojo",
    "Disco",
    "Fast Break",
    "Choice",
    "Snakeskin",
    "Neon Green",
    "Ice",
    "Wave",
    "Shimmer",
    "Lazer",
    "Camo",
    "Tie-Dye",
  ],
  "topps chrome": CHROME_PARALLELS,
  "bowman chrome": CHROME_PARALLELS,
  donruss: [
    "Base",
    "Blue Press Proof",
    "Green Press Proof",
    "Purple Press Proof",
    "Red Press Proof",
    "Yellow Press Proof",
    "Silver Press Proof",
    "Gold Press Proof",
    "Black Press Proof",
    "Optic Preview",
    "Optic Preview Pink",
    "Optic Preview Holo",
    "Optic Preview Black",
    "Optic Preview Blue",
    "Optic Preview Gold",
    "Optic Preview Green",
    "Optic Preview Purple",
    "Optic Preview Red",
    "Optic Preview Silver",
    "Blue Scope",
    "Green Velocity",
    "Red Wave",
    "Purple",
    "Green Pandora",
    "Gold Ice",
  ],
  "donruss optic": [
    "Base",
    "Holo",
    "Silver Holo",
    "Red",
    "Blue",
    "Green",
    "Orange",
    "Purple",
    "Pink",
    "Gold",
    "Black",
    "Shock",
    "Velocity",
    "Fast Break",
    "Rated Rookie",
  ],
  select: [
    "Base",
    "Silver",
    "Tri-Color",
    "Tie-Dye",
    "Zebra",
    "Elephant",
    "Blue",
    "Red",
    "Green",
    "Orange",
    "Purple",
    "Gold",
    "Black",
    "Concourse",
    "Premier",
    "Courtside",
    "Field Level",
  ],
  mosaic: [
    "Base",
    "Silver",
    "Reactive",
    "Genesis",
    "Camo",
    "Stained Glass",
    "Blue",
    "Red",
    "Green",
    "Orange",
    "Gold",
    "Black",
  ],
};

/** Normalized set family, or null when the set should use the generic list. */
export function parallelSetFamily(setBrand: string): string | null {
  const phrase = setMatchPhrase(setBrand);
  if (!phrase) return null;
  const keys = Object.keys(PARALLELS_BY_SET).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (phrase === key || phrase.startsWith(`${key} `)) return key;
  }
  return null;
}

export function parallelsForSet(setBrand: string): readonly string[] {
  const family = parallelSetFamily(setBrand);
  return family ? PARALLELS_BY_SET[family] : GENERIC_PARALLELS;
}

/**
 * Hyphens and spaces are the same parallel.
 * "Optic Preview-Pink" and "Optic Preview Pink" share one key.
 * Listed names such as "Tie-Dye" keep their hyphen in the key's source spelling.
 */
export function parallelMatchKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extra names that store and display as the listed parallel.
 * "Optic Preview-Pink", "Optic Preview Pink Prizm", and
 * "Optic Rated Rookies Preview Pink" are Optic Preview Pink.
 */
export const PARALLEL_ALIASES: Record<string, readonly string[]> = {
  "optic preview pink": [
    "Pink Optic Preview Holo",
    "Optic Preview-Pink",
    "Optic Preview Pink Prizm",
    "Optic Rated Rookies Preview Pink",
  ],
};

/** Aliases for this parallel name. Empty when it has none. */
export function parallelAliasNames(parallel: string): readonly string[] {
  return PARALLEL_ALIASES[parallelMatchKey(parallel)] ?? [];
}

/** The listed spelling for this parallel, or null when the set does not offer it. */
export function listedParallel(setBrand: string, parallel: string): string | null {
  const key = parallelMatchKey(parallel);
  if (!key) return null;
  const options = parallelsForSet(setBrand);
  const exact = options.find((option) => parallelMatchKey(option) === key);
  if (exact) return exact;
  for (const option of options) {
    if (parallelAliasNames(option).some((alias) => parallelMatchKey(alias) === key)) {
      return option;
    }
  }
  return null;
}

export function parallelIsListed(setBrand: string, parallel: string): boolean {
  return listedParallel(setBrand, parallel) != null;
}

/**
 * One display string for a parallel.
 * A listed name uses the list spelling. Anything else turns hyphens into spaces
 * so "Optic Preview-Pink" and "Optic Preview Pink" read the same.
 */
export function canonicalParallelName(setBrand: string, parallel: string): string {
  const trimmed = parallel.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const listed = listedParallel(setBrand, trimmed);
  if (listed) return listed;
  return trimmed.replace(/[-–—]+/g, " ").replace(/\s+/g, " ").trim();
}

/** What to store when someone picks or types a parallel. */
export function parallelChoice(
  setBrand: string,
  parallel: string,
): { parallel: string; parallelIsCustom: boolean } {
  const name = canonicalParallelName(setBrand, parallel) || "Base";
  const listed = listedParallel(setBrand, name);
  return {
    parallel: listed ?? name,
    parallelIsCustom: listed == null,
  };
}

/**
 * Keep the parallel when the new set still lists it, or when it is custom.
 * Otherwise go back to Base.
 */
export function parallelAfterSetChange(input: {
  parallel: string;
  parallelIsCustom: boolean;
  setBrand: string;
}): { parallel: string; parallelIsCustom: boolean; reset: boolean } {
  const current = input.parallel.trim() || "Base";
  const listed = listedParallel(input.setBrand, current);
  if (listed) return { parallel: listed, parallelIsCustom: false, reset: false };
  if (input.parallelIsCustom) {
    const custom = canonicalParallelName(input.setBrand, input.parallel) || "Base";
    return { parallel: custom, parallelIsCustom: true, reset: false };
  }
  return { parallel: "Base", parallelIsCustom: false, reset: current.toLowerCase() !== "base" };
}
