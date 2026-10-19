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

export function parallelIsListed(setBrand: string, parallel: string): boolean {
  const value = parallel.trim().toLowerCase();
  if (!value) return false;
  return parallelsForSet(setBrand).some((option) => option.toLowerCase() === value);
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
  const listed = parallelsForSet(input.setBrand).find(
    (option) => option.toLowerCase() === current.toLowerCase(),
  );
  if (listed) return { parallel: listed, parallelIsCustom: false, reset: false };
  if (input.parallelIsCustom) {
    return { parallel: input.parallel.trim() || "Base", parallelIsCustom: true, reset: false };
  }
  return { parallel: "Base", parallelIsCustom: false, reset: current.toLowerCase() !== "base" };
}
