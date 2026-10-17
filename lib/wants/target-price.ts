const PRICE = /^(?:\d+|\d*\.\d+)$/;

export type TargetPriceResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

/** Empty is allowed (no target). 0, negatives, and non-numeric text are rejected. */
export function parseTargetPrice(raw: string): TargetPriceResult {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };
  if (!PRICE.test(text)) {
    return { ok: false, error: "Enter a price greater than 0." };
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: "Enter a price greater than 0." };
  }
  return { ok: true, value };
}
