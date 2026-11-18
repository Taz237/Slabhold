import { parallelSwatch } from "@/lib/cards/parallel-swatch";
import type { ProductParallel } from "@/lib/cards/product-data";

/**
 * The card photo's look, read on the phone from the straightened crop: the border's color and
 * whether the border throws a chrome rainbow (a Refractor, X-Fractor, Prizm Silver or Holo).
 * Pure: lib/scan/photo-look-browser.ts draws the photo, this reads the pixels. Nothing is sent
 * anywhere and no service is called.
 *
 * It is a hint, never an answer. It only reorders and trims "Which version?" (rankVersionsByLook):
 * it never names a parallel and never makes a card Base. When the photo is unclear (glare, a
 * shadow, a hand over the edge, a washed-out picture) there is no look, and the picker stays whole.
 */

export const LOOK_COLORS = ["red", "orange", "gold", "green", "aqua", "blue", "purple", "pink"] as const;
export type LookColor = (typeof LOOK_COLORS)[number];
export type LookBorder = LookColor | "white" | "black";

export type PhotoLook = {
  /** The border's color, white or black. Null when no one color holds most of the border. */
  border: LookBorder | null;
  /** "rainbow": the border walks the color wheel (chrome sheen). "flat": one even color. Null: can't tell. */
  sheen: "rainbow" | "flat" | null;
};

export type Pixels = { width: number; height: number; data: ArrayLike<number> };

/** Most of the border, or it isn't the border's color. */
const DOMINANT = 0.6;
/** A rainbow: this many hue buckets, each this share of the colored border pixels. */
const RAINBOW_BUCKETS = 4;
const RAINBOW_SHARE = 0.08;
/** And at least this share of the border is colored at all. */
const RAINBOW_COLORED = 0.4;
/** The smallest picture worth reading. */
const MIN_SIDE = 24;

/** Hue (0-360), saturation and value (0-1). */
function hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r / 255) hue = 60 * (((g - b) / 255 / delta) % 6);
    else if (max === g / 255) hue = 60 * ((b - r) / 255 / delta + 2);
    else hue = 60 * ((r - g) / 255 / delta + 4);
  }
  if (hue < 0) hue += 360;
  return [hue, max === 0 ? 0 : delta / max, max];
}

/** The same buckets as the phone's own border color (lib/ios/scanner.ts borderColorName). */
function colorOfHue(degrees: number): LookColor {
  if (degrees >= 345 || degrees < 12) return "red";
  if (degrees < 40) return "orange";
  if (degrees < 70) return "gold";
  if (degrees < 165) return "green";
  if (degrees < 200) return "aqua";
  if (degrees < 255) return "blue";
  if (degrees < 290) return "purple";
  return "pink";
}

type PixelClass = LookBorder | "grey";

function classify(r: number, g: number, b: number): PixelClass {
  const [hue, saturation, value] = hsv(r, g, b);
  if (value < 0.18) return "black";
  if (saturation < 0.15 && value > 0.78) return "white";
  if (saturation >= 0.35 && value >= 0.3) return colorOfHue(hue);
  return "grey";
}

/**
 * The look from the straightened crop's pixels (RGBA). Only the border band is read (from 1.5% to
 * 5% in from each edge): the player's photo in the middle never counts. Null when unclear.
 */
export function photoLookFromPixels(pixels: Pixels): PhotoLook | null {
  const { width, height, data } = pixels;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < MIN_SIDE || height < MIN_SIDE) return null;
  if (data.length < width * height * 4) return null;
  const side = Math.min(width, height);
  const outer = Math.max(1, Math.round(side * 0.015));
  const inner = Math.max(outer + 1, Math.round(side * 0.05));
  const counts = new Map<PixelClass, number>();
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      if (edge < outer || edge >= inner) continue;
      const at = (y * width + x) * 4;
      const kind = classify(data[at], data[at + 1], data[at + 2]);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      total += 1;
    }
  }
  if (total === 0) return null;
  const colored = LOOK_COLORS.map((color) => counts.get(color) ?? 0);
  const coloredTotal = colored.reduce((sum, count) => sum + count, 0);
  const rainbow =
    coloredTotal / total >= RAINBOW_COLORED && colored.filter((count) => count / coloredTotal >= RAINBOW_SHARE).length >= RAINBOW_BUCKETS;
  const [top, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const border = top !== "grey" && topCount / total >= DOMINANT ? top : null;
  const sheen = rainbow ? "rainbow" : border ? "flat" : null;
  if (!border && !sheen) return null;
  return { border, sheen };
}

/**
 * The phone's own border color (the native scanner's) beside the photo's. Agreeing, or only one
 * having a color, gives that color. Disagreeing is unclear: no look at all.
 */
export function withNativeBorder(look: PhotoLook | null, native: string | null | undefined): PhotoLook | null {
  const color = LOOK_COLORS.find((name) => name === native) ?? null;
  if (!color) return look;
  if (!look) return { border: color, sheen: null };
  if (look.border && look.border !== color) return null;
  return { ...look, border: color };
}

const BORDERS = new Set<string>([...LOOK_COLORS, "white", "black"]);

/** The look as the scan's POST body sent it. Anything unknown is dropped. */
export function lookFromBody(value: unknown): PhotoLook | null {
  if (!value || typeof value !== "object") return null;
  const { border, sheen } = value as { border?: unknown; sheen?: unknown };
  const look: PhotoLook = {
    border: typeof border === "string" && BORDERS.has(border) ? (border as LookBorder) : null,
    sheen: sheen === "rainbow" || sheen === "flat" ? sheen : null,
  };
  return look.border || look.sheen ? look : null;
}

/** Color words in parallel names, by the border color they print. Longer phrases first. */
const NAME_COLORS: [RegExp, LookBorder][] = [
  [/\b(red|ruby|crimson|maroon|cherry)\b/, "red"],
  [/\b(orange|bronze|copper)\b/, "orange"],
  [/\b(gold|yellow)\b/, "gold"],
  [/\b(green|lime|emerald)\b/, "green"],
  [/\b(aqua|teal)\b/, "aqua"],
  [/\b(blue|navy|sky)\b/, "blue"],
  [/\b(purple|violet|plum)\b/, "purple"],
  [/\b(pink|magenta|fuchsia)\b/, "pink"],
  [/\b(black|onyx)\b/, "black"],
  [/\bwhite\b/, "white"],
];

/** Colors that a photo's light can tip into each other. */
const NEAR: Record<LookColor, LookColor[]> = {
  red: ["pink", "orange"],
  orange: ["red", "gold"],
  gold: ["orange"],
  green: ["aqua"],
  aqua: ["green", "blue"],
  blue: ["aqua", "purple"],
  purple: ["blue", "pink"],
  pink: ["red", "purple"],
};

/** The plain chrome finishes, which lead the look-alikes ("Silver" before "Snakeskin"). */
const PLAIN_FINISH = new Set(["silver", "refractor", "holo", "prizm"]);

type Kind = "base" | "shimmer" | "neutral" | "color" | "pattern";

function kindOf(option: ProductParallel): { kind: Kind; colors: LookBorder[] } {
  const name = option.name.toLowerCase();
  if (name.trim() === "base") return { kind: "base", colors: [] };
  const colors = NAME_COLORS.filter(([pattern]) => pattern.test(name)).map(([, color]) => color);
  if (colors.length > 0) return { kind: "color", colors };
  const swatch = parallelSwatch(option.name).kind;
  if (swatch === "shimmer" || swatch === "stars") return { kind: "shimmer", colors: [] };
  if (swatch === "multi" || swatch === "solid" || swatch === "dark") return { kind: "pattern", colors: [] };
  return { kind: "neutral", colors: [] };
}

/** How many versions the picker shows once a clear look has ranked them, Base included (as a slab's "Which version?"). */
const SHOWN = 5;

/**
 * "Which version?" ranked by the photo's look: the closest first. A clear border color puts that
 * color first, its near colors next, then Base and the look-alikes; other colors drop off only
 * when some version carries the border's color. A rainbow sheen puts the chrome look-alikes ahead
 * of Base; a flat one puts Base first. With no print run read, numbered versions go last in their
 * group. Base stays on the list whenever it was there. No look: the list as it came, untouched.
 */
export function rankVersionsByLook(options: readonly ProductParallel[], look: PhotoLook | null, context: { runRead: boolean }): ProductParallel[] {
  if (!look || options.length === 0) return [...options];
  const rainbow = look.sheen === "rainbow";
  const color = look.border && look.border !== "white" && look.border !== "black" ? look.border : null;
  const rows = options.map((option, index) => ({ option, index, ...kindOf(option) }));
  const fits = (colors: LookBorder[], wanted: LookBorder) => colors.includes(wanted);
  const near = (colors: LookBorder[]) => Boolean(color) && colors.some((item) => NEAR[color!].includes(item as LookColor));
  const anyFit = color ? rows.some((row) => fits(row.colors, color) || near(row.colors)) : false;

  // Base and the look-alikes, in the order the sheen says.
  const plainTier = (kind: Kind): number => {
    if (rainbow) return kind === "shimmer" ? 0 : kind === "base" ? 1 : 2;
    return kind === "base" ? 0 : kind === "shimmer" ? 1 : 2;
  };
  const tier = (row: (typeof rows)[number]): number | null => {
    if (color) {
      if (fits(row.colors, color)) return 0;
      if (near(row.colors)) return 1;
      if (row.kind === "base" || row.kind === "shimmer" || row.kind === "neutral") return 2 + plainTier(row.kind) / 10;
      // Another color: off the list when some version carries the border's color.
      if (row.kind === "color" && anyFit) return null;
      return 3;
    }
    if (look.border === "black") {
      if (fits(row.colors, "black")) return 0;
      if (row.kind === "color" || row.kind === "pattern") return 2;
      return 1 + plainTier(row.kind) / 10;
    }
    // White, or no clear border color: Base and the look-alikes before any color.
    // A White parallel sits right behind Base: a white border is what Base prints too.
    if (fits(row.colors, "white")) return plainTier("base") + 0.05;
    if (row.kind === "color" || row.kind === "pattern") return 3;
    return plainTier(row.kind);
  };

  const words = (name: string) => name.trim().split(/\s+/).length;
  // The plain version of a color or finish leads its group: "Green Refractor" before "Green Lava",
  // "Silver" before "Snakeskin". What's left once the color words are gone is a plain finish, or nothing.
  const plain = (name: string) => {
    let rest = name.toLowerCase();
    for (const [pattern] of NAME_COLORS) rest = rest.replace(new RegExp(pattern.source, "g"), " ");
    const left = rest.replace(/\s+/g, " ").trim();
    return !left || PLAIN_FINISH.has(left) ? 0 : 1;
  };
  const ranked = rows
    .map((row) => ({ ...row, tier: tier(row) }))
    .filter((row): row is typeof row & { tier: number } => row.tier != null)
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        Number(!context.runRead && a.option.serialRun != null) - Number(!context.runRead && b.option.serialRun != null) ||
        plain(a.option.name) - plain(b.option.name) ||
        words(a.option.name) - words(b.option.name) ||
        a.index - b.index,
    )
    .map((row) => row.option);

  const shown = ranked.slice(0, SHOWN);
  // Base is never ranked off the picker: never Base on our say-so, and never Base out of reach.
  const base = options.find((option) => option.name.trim().toLowerCase() === "base");
  if (base && !shown.includes(base)) shown.splice(Math.min(shown.length, SHOWN - 1), 1, base);
  return shown;
}
