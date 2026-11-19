import { parallelMatchKey } from "@/lib/cards/parallels";
import type { ProductParallel } from "@/lib/cards/product-data";
import type { SoldsState } from "./comp";
import type { ParallelPick } from "./confirm";
import type { ScanMatch } from "./match";
import { isUnnamedLabel } from "./scan-sales";

/**
 * "Pick your version": the list the price screen shows while a card's version is open
 * (components/scan/sheet-parts.tsx). With no serial read it is every version on the checklist for
 * the card and set, each with its print run; the ones recent sales name come first with their
 * price, the rest say "No recent sales". With a serial read (03/10) it is only the versions at
 * that print run. Open beats wrong: nothing here names the parallel, except a read serial that
 * exactly one version fits.
 */

export const VERSION_COPY = {
  title: "Pick your version",
  noSales: "No recent sales",
  /** Sales whose titles name no version: shown, never a version to pick. */
  unnamed: "Sales that name no version",
} as const;

/** More rows than this and the list opens short, with "Show all". */
export const VERSION_ROWS_SHOWN = 12;

export type VersionRow = ProductParallel & {
  /** Recent sales that name this version. 0: none. */
  nSales: number;
  lastPriceCents: number | null;
  /** Shown before "Show all": it has sales, or the scan ranked it close. */
  lead: boolean;
};

const key = (name: string) => parallelMatchKey(name) || name.trim().toLowerCase();

/** The card's serial was read, and nothing says the read is shaky. */
function runRead(match: Pick<ScanMatch, "serialRun" | "runUnsure">): boolean {
  return match.serialRun != null && !match.runUnsure;
}

/**
 * The versions the card can be. No serial read: the whole checklist list, the scan's closest
 * first. A serial read: only the versions at that print run. An autograph, a variation and a
 * numbered card are never an unnumbered Base. No list of ours: what the scan offered, as before.
 */
export function versionChoicesFor(match: ScanMatch): ProductParallel[] {
  const offered = match.parallelOptions.length > 0 ? match.parallelOptions : match.parallel ? [{ name: match.parallel, serialRun: match.serialRun }] : [];
  const neverPlain = match.serialRun != null || match.isAuto || Boolean(match.subset);
  const listed = (match.versions ?? []).filter((option) => !(neverPlain && option.serialRun == null && !option.runVaries && key(option.name) === "base"));
  if (listed.length === 0) return offered;
  if (runRead(match)) {
    const fits = listed.filter((option) => option.serialRun === match.serialRun || option.runVaries);
    return fits.length > 0 ? fits : offered;
  }
  const out: ProductParallel[] = [];
  for (const option of [...offered, ...listed]) {
    if (!out.some((item) => key(item.name) === key(option.name))) out.push(listed.find((item) => key(item.name) === key(option.name)) ?? option);
  }
  return out;
}

/**
 * The one version a read serial names: exactly one on the checklist at that print run. Null with
 * no serial, a shaky one, or two versions at the run (Green /10 and FOTL Green /10): the collector picks.
 */
export function versionFromSerial(match: ScanMatch): ParallelPick {
  // A slab's version is read again from its label once the collector picks: never picked for them here.
  if (match.grade || !runRead(match) || !match.versions?.length) return null;
  const fits = match.versions.filter((option) => option.serialRun === match.serialRun);
  if (fits.length !== 1 || match.versions.some((option) => option.runVaries)) return null;
  return { name: fits[0].name, serialRun: fits[0].serialRun };
}

/**
 * The list's rows: the versions recent sales name first, with their newest price, then the rest
 * in the checklist's order. A parallel only the sales name joins the list. Sales that name no
 * version come back apart: shown, never picked.
 */
export function versionRows(
  choices: readonly ProductParallel[],
  match: Pick<ScanMatch, "parallelOptions" | "serialRun">,
  solds: SoldsState | undefined,
): { rows: VersionRow[]; unnamed: { label: string; nSales: number; lastPriceCents?: number | null }[] } {
  const comp = solds?.status === "done" ? solds.comp : null;
  const groups: { label: string; nSales: number; lastPriceCents?: number | null }[] =
    comp && (comp.status === "ok" || comp.status === "split") ? [...(comp.groups ?? [])] : [];
  const ranked = new Set(match.parallelOptions.map((option) => key(option.name)));
  const rows: VersionRow[] = choices.map((option) => ({ ...option, nSales: 0, lastPriceCents: null, lead: ranked.has(key(option.name)) }));
  for (const group of groups) {
    if (isUnnamedLabel(group.label)) continue;
    let row = rows.find((item) => key(item.name) === key(group.label));
    if (!row) {
      row = { name: group.label, serialRun: match.serialRun, nSales: 0, lastPriceCents: null, lead: true };
      rows.push(row);
    }
    row.nSales += group.nSales;
    row.lastPriceCents = group.lastPriceCents ?? row.lastPriceCents;
    row.lead = true;
  }
  const sold = rows.filter((row) => row.nSales > 0);
  const rest = rows.filter((row) => row.nSales === 0);
  return { rows: [...sold, ...rest], unnamed: groups.filter((group) => isUnnamedLabel(group.label)) };
}

/** The rows shown before "Show all": every row of a short list; of a long one, the leads (or its first few). */
export function versionRowsShown(rows: readonly VersionRow[]): VersionRow[] {
  if (rows.length <= VERSION_ROWS_SHOWN) return [...rows];
  const lead = rows.filter((row) => row.lead);
  return lead.length > 0 ? lead : rows.slice(0, 8);
}
