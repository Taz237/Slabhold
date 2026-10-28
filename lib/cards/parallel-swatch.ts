/**
 * A color for a parallel chip. Pure, so any name gets a swatch and nothing throws.
 * Order: Base, multi-color patterns, the first color word in the name,
 * then Stars, then a shine word (Silver, Refractor, Prizm), then neutral.
 */
export type SwatchKind = "base" | "solid" | "shimmer" | "stars" | "multi" | "dark" | "neutral";

export type ParallelSwatch = {
  kind: SwatchKind;
  /** A CSS background value. */
  background: string;
  /** Draw a light ring so a dark or white dot still reads on its background. */
  ring?: boolean;
};

export const NEUTRAL_SWATCH: ParallelSwatch = {
  kind: "neutral",
  background: "linear-gradient(135deg, #a1a1aa 0%, #52525b 100%)",
};

const BASE_SWATCH: ParallelSwatch = {
  kind: "base",
  background: "linear-gradient(135deg, #fafafa 0%, #d4d4d8 100%)",
  ring: true,
};

const SHIMMER_SWATCH: ParallelSwatch = {
  kind: "shimmer",
  background:
    "linear-gradient(135deg, #f4f4f5 0%, #a1a1aa 30%, #fafafa 50%, #a1a1aa 70%, #e4e4e7 100%)",
};

/** Optic Stars: silver with small white star points. */
const STARS_SWATCH: ParallelSwatch = {
  kind: "stars",
  background:
    "radial-gradient(circle at 30% 30%, #ffffff 0 1.5px, transparent 2px), radial-gradient(circle at 70% 45%, #ffffff 0 1.5px, transparent 2px), radial-gradient(circle at 40% 72%, #ffffff 0 1px, transparent 1.5px), linear-gradient(135deg, #e4e4e7 0%, #a1a1aa 45%, #f4f4f5 60%, #71717a 100%)",
};

const MULTI_SWATCH: ParallelSwatch = {
  kind: "multi",
  background:
    "conic-gradient(from 45deg, #ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ec4899, #ef4444)",
};

const DARK_SWATCH: ParallelSwatch = {
  kind: "dark",
  background: "linear-gradient(135deg, #3f3f46 0%, #09090b 100%)",
  ring: true,
};

function solid(light: string, dark: string, ring = false): ParallelSwatch {
  const swatch: ParallelSwatch = {
    kind: "solid",
    background: `linear-gradient(135deg, ${light} 0%, ${dark} 100%)`,
  };
  if (ring) swatch.ring = true;
  return swatch;
}

const MULTI_WORDS = [
  "tie-dye",
  "tie dye",
  "disco",
  "camo",
  "checker",
  "rainbow",
  "tri-color",
  "tri color",
  "multi",
  "mosaic",
  "red white and blue",
  "red white & blue",
  "red, white",
  "kaleidoscope",
  "stained glass",
  "nebula",
];

/** Color words. Longer phrases win over their parts ("neon green" before "green"). */
const COLOR_WORDS: [string, ParallelSwatch][] = [
  ["neon green", solid("#a3e635", "#4d7c0f")],
  ["lime green", solid("#a3e635", "#4d7c0f")],
  ["light blue", solid("#7dd3fc", "#0284c7")],
  ["sky blue", solid("#7dd3fc", "#0284c7")],
  ["black", DARK_SWATCH],
  ["onyx", DARK_SWATCH],
  ["red", solid("#f87171", "#dc2626")],
  ["ruby", solid("#fb7185", "#be123c")],
  ["maroon", solid("#be123c", "#7f1d1d")],
  ["crimson", solid("#f87171", "#b91c1c")],
  ["gold", solid("#fde68a", "#d97706")],
  ["yellow", solid("#fde047", "#ca8a04")],
  ["bronze", solid("#fdba74", "#9a3412")],
  ["copper", solid("#fdba74", "#9a3412")],
  ["orange", solid("#fdba74", "#ea580c")],
  ["green", solid("#4ade80", "#15803d")],
  ["lime", solid("#a3e635", "#4d7c0f")],
  ["emerald", solid("#34d399", "#047857")],
  ["teal", solid("#5eead4", "#0f766e")],
  ["aqua", solid("#67e8f9", "#0e7490")],
  ["blue", solid("#60a5fa", "#1d4ed8")],
  ["sapphire", solid("#60a5fa", "#1e3a8a")],
  ["purple", solid("#c084fc", "#7e22ce")],
  ["violet", solid("#c084fc", "#6d28d9")],
  ["pink", solid("#f9a8d4", "#db2777")],
  ["magenta", solid("#f0abfc", "#a21caf")],
  ["white", solid("#ffffff", "#e4e4e7", true)],
  ["sepia", solid("#d6c3a5", "#78583a")],
];

const SHINE_WORDS = [
  "silver",
  "refractor",
  "prizm",
  "prizms",
  "holo",
  "chrome",
  "shimmer",
  "sparkle",
  "glitter",
  "ice",
  "hyper",
  "mojo",
  "wave",
  "pulsar",
  "scope",
  "lazer",
  "laser",
  "velocity",
  "shock",
  "speckle",
  "atomic",
  "x-fractor",
  "superfractor",
  "optic",
  "photon",
  "snakeskin",
  "zebra",
  "tiger",
  "elephant",
  "reactive",
  "genesis",
  "flash",
  "seismic",
  "power",
];

function wordIndex(text: string, word: string): number {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[^a-z])${escaped}(?=$|[^a-z])`).exec(text);
  if (!match) return -1;
  return match.index + (match[0].length - word.length);
}

export function parallelSwatch(name: string): ParallelSwatch {
  const text = String(name ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return NEUTRAL_SWATCH;
  if (text === "base") return BASE_SWATCH;
  // Pattern words also match inside a longer word ("Checkerboard").
  if (MULTI_WORDS.some((word) => text.includes(word))) return MULTI_SWATCH;

  let best: { index: number; length: number; swatch: ParallelSwatch } | null = null;
  for (const [word, swatch] of COLOR_WORDS) {
    const index = wordIndex(text, word);
    if (index < 0) continue;
    if (!best || index < best.index || (index === best.index && word.length > best.length)) {
      best = { index, length: word.length, swatch };
    }
  }
  if (best) return best.swatch;
  // "Red Stars" took its color above. Plain Stars is silver with stars.
  if (wordIndex(text, "stars") >= 0) return STARS_SWATCH;
  if (SHINE_WORDS.some((word) => wordIndex(text, word) >= 0)) return SHIMMER_SWATCH;
  return NEUTRAL_SWATCH;
}
