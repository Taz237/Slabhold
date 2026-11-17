import { isRawGrade } from "./identity";
import type { RecentComp } from "./recent";

/** A card comped both raw and in a PSA 10 on this device. */
export type GradeGap = { raw: RecentComp; top: RecentComp };

/** Everything about the card except its grade, so raw and slabbed copies line up. */
function cardKey(item: RecentComp): string {
  const id = item.identity;
  return [id.playerName, id.yearLabel, id.setBrand, id.cardNumber, id.parallel || "Base", id.serialRun ?? ""]
    .map((part) => String(part).trim().toLowerCase())
    .join("|");
}

function isPsa10(grade: string): boolean {
  return /^psa\s*10$/i.test(grade.trim());
}

function priced(item: RecentComp): boolean {
  return item.payload.median != null && item.payload.median > 0 && item.payload.comps.length > 0;
}

/**
 * Pairs the saved comps of one card, raw and PSA 10, both with real sold
 * prices. Newest pair first. `rest` is every comp not in a pair, in order.
 */
export function gradeGaps(items: RecentComp[]): { gaps: GradeGap[]; rest: RecentComp[] } {
  const raws = new Map<string, RecentComp>();
  const tops = new Map<string, RecentComp>();
  for (const item of items) {
    if (!priced(item)) continue;
    const key = cardKey(item);
    if (isRawGrade(item.identity.grade)) {
      if (!raws.has(key)) raws.set(key, item);
    } else if (isPsa10(item.identity.grade) && !tops.has(key)) {
      tops.set(key, item);
    }
  }
  const gaps: GradeGap[] = [];
  const paired = new Set<string>();
  for (const item of items) {
    const key = cardKey(item);
    if (paired.has(key)) continue;
    const raw = raws.get(key);
    const top = tops.get(key);
    if (!raw || !top) continue;
    paired.add(key);
    gaps.push({ raw, top });
  }
  const used = new Set(gaps.flatMap((gap) => [gap.raw.key, gap.top.key]));
  return { gaps, rest: items.filter((item) => !used.has(item.key)) };
}

/** "91x" from $1.74 to $158.75. Null under 2x, where a multiple says little. */
export function gapMultiple(raw: number, top: number): string | null {
  if (!(raw > 0) || !(top > 0)) return null;
  const times = top / raw;
  if (times < 2) return null;
  return times >= 10 ? `${Math.round(times)}x` : `${Math.round(times * 10) / 10}x`;
}
