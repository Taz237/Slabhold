import type { ProductParallelRow, ProductRecord } from "./product-data";

/**
 * Print runs for the Topps parallel lists we load, taken from the hobby-checklist lists already in
 * the repo (scripts/checklist-csv/*.parallels.json) that the app doesn't load. Run by
 * scripts/merge-print-runs.ts, which rewrites lib/cards/data/topps-parallels.json.
 *
 * Open beats wrong: a run is filled only when the other list agrees on exactly one run for that
 * name, in the matching base list. Nothing is overwritten, and a disagreement stays unknown. The
 * other list's numbered parallels this one lacks are added, so two parallels that share a run
 * (Gold and Gold Wave, both /50) stay two choices and a /50 read never names one on our say-so.
 */

export type RunSourceRow = { subset: string; name: string; serialRun: number | null; unsure?: true };

const DROPPED_WORDS = new Set(["refractor", "refractors", "parallel", "parallels", "border"]);
const SPELLINGS: Record<string, string> = { fuschia: "fuchsia", frozenfractors: "frozenfractor", superfractors: "superfractor" };

/** One key for a parallel's name in both lists: no Refractor, Parallel or Border, any word order. */
export function mergeKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/\bray\s*wave\b/g, "raywave")
    .replace(/\bx[\s-]*fractor/g, "xfractor")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => SPELLINGS[word] ?? word);
  const kept = words.filter((word) => !DROPPED_WORDS.has(word));
  // "Refractor Parallel" is the plain Refractor: keep "refractor" when nothing else is left.
  const plain = words.filter((word) => word === "refractor" || word === "refractors").map(() => "refractor");
  return (kept.length > 0 ? kept : plain.length > 0 ? [plain[0]] : words).sort().join(" ");
}

/**
 * The page sometimes runs two rows together: "Purple RayWave Refractor /250  Aqua Refractor" with
 * the second row's run. Split them. It also leaves a run and the odds in a name with no run
 * ("Refractor /499 (1:20 Hobby", "SuperFractor 1/1 (1:10,243 Hobby"): read the run from the name.
 * A run that isn't one ("/-5") leaves that parallel unknown.
 */
export function splitGluedRows(rows: readonly RunSourceRow[]): RunSourceRow[] {
  const out: RunSourceRow[] = [];
  for (const source of rows) {
    const name = source.name
      .replace(/\s*\(\s*1:[\d,]+.*$/i, "")
      .replace(/\b1\s*\/\s*1\b/, "/1")
      .trim();
    const row = { ...source, name };
    const alone = /^(.*?)\s*\/\s*(-?\d+)$/.exec(name);
    if (alone) {
      const run = Number(alone[2]);
      if (source.serialRun != null && run > 0 && run !== source.serialRun) {
        out.push({ subset: row.subset, name: alone[1].trim(), serialRun: null, unsure: true });
      } else {
        out.push(run > 0 ? { subset: row.subset, name: alone[1].trim(), serialRun: run } : { subset: row.subset, name: alone[1].trim(), serialRun: null, unsure: true });
      }
      continue;
    }
    const glued = /^(.*?)\s*\/\s*(-?\d+)\s+(\S.*)$/.exec(name);
    if (!glued) {
      out.push(row);
      continue;
    }
    const run = Number(glued[2]);
    out.push(run > 0 ? { subset: row.subset, name: glued[1].trim(), serialRun: run } : { subset: row.subset, name: glued[1].trim(), serialRun: null, unsure: true });
    out.push({ subset: row.subset, name: glued[3].trim(), serialRun: row.serialRun });
  }
  return out;
}

/** The other list's base subsets for one of ours. Null: a variation or insert list, never filled. */
export function subsetsFor(subset: string): string[] | null {
  const key = subset.trim().toLowerCase();
  if (key === "base") return ["base", "base chrome", "base paper"];
  if (key === "base and paper prospects" || key === "paper prospects") return ["base paper", "paper prospects"];
  if (key === "chrome prospects" || key === "bowman chrome prospects") return ["chrome prospects", "bowman chrome prospects"];
  return null;
}

const isBase = (name: string) => mergeKey(name) === "base";

export type MergeResult = {
  record: ProductRecord & { runsFrom?: string };
  filled: string[];
  added: string[];
  conflicts: string[];
  unmatched: string[];
};

function runLabel(runs: readonly (number | null)[]): string {
  return runs.map((run) => (run == null ? "unnumbered" : String(run))).sort((a, b) => Number(a) - Number(b)).join(", ");
}

export function mergePrintRuns(record: ProductRecord, source: { source?: string; parallels: readonly RunSourceRow[] }): MergeResult {
  const empty: MergeResult = { record, filled: [], added: [], conflicts: [], unmatched: [] };
  // A list that already has its print runs is left as it is.
  if (record.parallels.some((row) => row.serialRun != null)) return empty;
  const rows = splitGluedRows(source.parallels);
  const filled: string[] = [];
  const conflicts: string[] = [];
  const unmatched: string[] = [];
  const runsIn = (subsets: readonly string[], key: string) => {
    const found = rows.filter((row) => subsets.includes(row.subset.trim().toLowerCase()) && mergeKey(row.name) === key);
    return { found, runs: [...new Set(found.map((row) => row.serialRun))], unsure: found.some((row) => row.unsure) };
  };

  const parallels: ProductParallelRow[] = record.parallels.map((row) => {
    const subsets = subsetsFor(row.subset);
    if (!subsets || row.runVaries || isBase(row.name)) return row;
    const { found, runs, unsure } = runsIn(subsets, mergeKey(row.name));
    if (found.length === 0) {
      unmatched.push(`${row.subset}: ${row.name}`);
      return row;
    }
    if (runs.length > 1 || unsure) {
      conflicts.push(`${row.subset}: ${row.name} (${runLabel(runs)})`);
      return row;
    }
    if (runs[0] == null) return row;
    filled.push(`${row.subset}: ${row.name} /${runs[0]}`);
    return { ...row, serialRun: runs[0] };
  });

  // The other list's numbered parallels this one lacks, per base subset we have.
  const added: string[] = [];
  const ours = [...new Set(record.parallels.map((row) => row.subset))];
  for (const subset of ours) {
    const subsets = subsetsFor(subset);
    if (!subsets) continue;
    const have = new Set(parallels.filter((row) => row.subset === subset).map((row) => mergeKey(row.name)));
    const prefixes = record.parallels.find((row) => row.subset === subset && row.cardPrefixes)?.cardPrefixes;
    for (const row of rows) {
      if (!subsets.includes(row.subset.trim().toLowerCase()) || row.serialRun == null || isBase(row.name)) continue;
      const key = mergeKey(row.name);
      if (have.has(key)) continue;
      const { runs, unsure } = runsIn(subsets, key);
      if (runs.length !== 1 || unsure) continue;
      have.add(key);
      parallels.push({ subset, name: row.name, serialRun: row.serialRun, ...(prefixes ? { cardPrefixes: prefixes } : {}) });
      added.push(`${subset}: ${row.name} /${row.serialRun}`);
    }
  }

  if (filled.length === 0 && added.length === 0) return { ...empty, conflicts, unmatched };
  return { record: { ...record, parallels, ...(source.source ? { runsFrom: source.source } : {}) }, filled, added, conflicts, unmatched };
}
