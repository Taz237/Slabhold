/** Geist averages about 0.54em per character. A little over, so lines rarely run long. */
const CHAR_WIDTH = 0.56;
const SIZES = [84, 76, 68, 60, 54, 48, 44, 40, 36, 32] as const;

export type QuoteFit = {
  text: string;
  fontSize: number;
  lineHeight: number;
  lines: number;
};

/** Greedy word wrap at an estimated width. Long words take their own lines. */
function wrap(words: readonly string[], perLine: number): number {
  let lines = 0;
  let used = 0;
  for (const word of words) {
    const length = Array.from(word).length;
    if (used === 0) {
      lines += Math.max(1, Math.ceil(length / perLine));
      used = length % perLine || (length > 0 ? perLine : 0);
      continue;
    }
    if (used + 1 + length <= perLine) {
      used += 1 + length;
    } else {
      lines += Math.max(1, Math.ceil(length / perLine));
      used = length % perLine || perLine;
    }
  }
  return lines;
}

/**
 * Pick the biggest size that fits the box. When even the smallest size runs
 * over, drop whole words from the end and add an ellipsis, never part of a word.
 */
export function fitQuote(
  raw: string,
  box: { width: number; height: number; maxLines?: number; sizes?: readonly number[] },
): QuoteFit {
  const text = raw.replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ") : [];
  const sizes = box.sizes?.length ? box.sizes : SIZES;
  const cap = (fontSize: number, lineHeight: number) =>
    Math.max(1, Math.min(box.maxLines ?? Infinity, Math.floor(box.height / (fontSize * lineHeight))));
  for (const fontSize of sizes) {
    const lineHeight = fontSize >= 60 ? 1.1 : 1.22;
    const perLine = Math.max(1, Math.floor(box.width / (fontSize * CHAR_WIDTH)));
    const maxLines = cap(fontSize, lineHeight);
    const lines = wrap(words, perLine);
    if (lines <= maxLines) return { text, fontSize, lineHeight, lines: Math.max(1, lines) };
  }
  const fontSize = sizes[sizes.length - 1];
  const lineHeight = fontSize >= 60 ? 1.1 : 1.22;
  const perLine = Math.max(1, Math.floor(box.width / (fontSize * CHAR_WIDTH)));
  const maxLines = cap(fontSize, lineHeight);
  const kept = [...words];
  while (kept.length > 1 && wrap([...kept.slice(0, -1), `${kept[kept.length - 1]}…`], perLine) > maxLines) {
    kept.pop();
  }
  const clipped = `${kept.join(" ").replace(/[\s.,;:!?-]+$/, "")}…`;
  return { text: clipped, fontSize, lineHeight, lines: Math.min(maxLines, wrap(clipped.split(" "), perLine)) };
}
