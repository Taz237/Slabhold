import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import type { ScanRead } from "./match";
import { scanReadFrom, type ScanCapture } from "./session";

/**
 * The phone sends each line's next best readings (Vision's second and third candidates, a
 * larger re-read of a serial or a slab label, the other frames' votes). They are used for one
 * thing only: to fill a field the best reading left open. The rules:
 *
 * - Only an open field (card #, print run, year) is filled. A field that was read is never changed.
 * - An alternate counts only if every field that was read stays exactly as it was.
 * - Every alternate that fills the field must give the same value; when they disagree it stays open.
 * - The alternate is read by the same reader as any line, so every scanner rule still applies:
 *   no SKU or cert as the card #, no maker word as the set, no jersey, rank or position line.
 *
 * The result is a capture with plain lines (the alternate swapped in), so the phone and the
 * server read the same card.
 */

/** Most alternate readings tried per scan. */
const MAX_TRIES = 36;

type Fields = {
  kind: string;
  player: string;
  set: string;
  number: string;
  serial: string;
  year: string;
  grade: string;
  cert: string;
  variety: string;
};

const FILLABLE = ["number", "serial", "year"] as const;
type Fillable = (typeof FILLABLE)[number];

function fieldsOf(read: ScanRead): Fields {
  if (read.kind === "slab") {
    const label = read.label;
    return {
      kind: "slab",
      player: label.playerText,
      set: label.setName || label.setText,
      number: label.cardNumber,
      serial: label.serial ? `${label.serial.number}/${label.serial.run}` : "",
      year: label.yearLabel,
      grade: `${label.grader} ${label.gradeNumber} ${label.gradeQualifier} ${label.autoGrade}`,
      cert: label.certNumber,
      variety: label.varietyText,
    };
  }
  const sides = [read.front, read.back].filter((side): side is NonNullable<typeof side> => Boolean(side));
  const serial = sides.map((side) => side.serial).find(Boolean) ?? null;
  return {
    kind: "raw",
    player: sides.flatMap((side) => [side.players[0]?.name ?? "", side.printedName]).join("|"),
    set: sides.map((side) => side.setNames.join(",")).join("|"),
    number: read.back?.cardNumber || read.front.cardNumber,
    serial: serial ? `${serial.number}/${serial.run}` : "",
    year: sides.map((side) => side.yearLabel).find(Boolean) ?? sides.map((side) => side.copyrightYear).find(Boolean) ?? "",
    grade: "",
    cert: "",
    variety: sides.map((side) => `${side.parallelWords.join(",")};${side.insert}`).join("|"),
  };
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Everything that was read is the same; only open fields may differ. One allowance: a garbled
 * line that had landed in a slab's variety text may leave it when the alternate replaces that line.
 */
function keepsWhatWasRead(before: Fields, after: Fields, replaced: string): boolean {
  return (Object.keys(before) as (keyof Fields)[]).every((key) => {
    if (!before[key] || before[key] === after[key]) return true;
    return key === "variety" && before.kind === "slab" && squash(before.variety.replace(replaced, " ")) === squash(after.variety);
  });
}

type Swap = { side: "lines" | "backLines"; index: number; text: string };

function swapped(capture: ScanCapture, swap: Swap): ScanCapture {
  const lines = [...(capture[swap.side] ?? [])];
  lines[swap.index] = swap.text;
  return { ...capture, [swap.side]: lines };
}

function swapsFor(capture: ScanCapture): Swap[] {
  const out: Swap[] = [];
  const add = (side: Swap["side"], alternates: string[][] | null | undefined) => {
    const lines = capture[side] ?? [];
    (alternates ?? []).forEach((list, index) => {
      if (index >= lines.length) return;
      for (const text of list) {
        // The fields an alternate may fill are all numbers: a reading with no digit can't help.
        if (text && text !== lines[index] && /\d/.test(text)) out.push({ side, index, text });
      }
    });
  };
  add("lines", capture.alternates);
  add("backLines", capture.backAlternates);
  return out.slice(0, MAX_TRIES);
}

/** The capture with alternates swapped in where they fill an open field, and no alternates left on it. */
export function withAlternates(capture: ScanCapture, directory: readonly IndexedDirectoryPlayer[]): ScanCapture {
  let current: ScanCapture = capture;
  const swaps = swapsFor(capture);
  if (swaps.length > 0) {
    for (const field of FILLABLE) {
      const before = fieldsOf(scanReadFrom(current, directory));
      if (before[field]) continue;
      const fills = new Map<string, Swap>();
      for (const swap of swaps) {
        const after = fieldsOf(scanReadFrom(swapped(current, swap), directory));
        const replaced = (current[swap.side] ?? [])[swap.index] ?? "";
        if (!after[field] || !keepsWhatWasRead(before, after, replaced)) continue;
        if (!fills.has(after[field])) fills.set(after[field], swap);
      }
      // One value, however many alternates gave it. Two different values: it stays open.
      if (fills.size === 1) current = swapped(current, [...fills.values()][0]);
    }
  }
  return { ...current, alternates: null, backAlternates: null };
}

export type { Fillable };
