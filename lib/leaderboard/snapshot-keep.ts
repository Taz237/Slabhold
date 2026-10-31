import { identityKey, type CardIdentity } from "./identity";

/** Identity columns already stored on a snapshot row, or about to be written. */
export type SnapshotIdentityRow = {
  card_key: string | null;
  player?: string | null;
  year?: string | null;
  year_label?: string | null;
  set_name?: string | null;
  parallel?: string | null;
  grade?: string | null;
  grader?: string | null;
  card_number?: string | null;
  serial_run?: string | null;
  is_auto?: boolean | null;
  is_relic?: boolean | null;
  grade_qualifier?: string | null;
  condition_type?: string | null;
  query_key?: string | null;
};

export type LineupSnapshot = {
  snapshotDate: string;
  median: number;
  nSales: number;
  identityKey: string;
  queryKey: string | null;
  isPublic: boolean;
  status?: string | null;
};

function storedIdentity(row: SnapshotIdentityRow): CardIdentity {
  return {
    player: row.player ?? "",
    year: row.year ?? "",
    yearLabel: row.year_label ?? "",
    setName: row.set_name ?? "",
    parallel: row.parallel ?? "",
    grade: row.grade ?? "",
    grader: row.grader ?? "",
    cardNumber: row.card_number ?? "",
    serialRun: row.serial_run ?? "",
    isAuto: row.is_auto === true,
    isRelic: row.is_relic === true,
    gradeQualifier: row.grade_qualifier ?? "",
    conditionType: row.condition_type ?? "",
  };
}

/** Same concatenation as public.card_snapshot_identity for a stored snapshot. */
export function storedIdentityKey(row: SnapshotIdentityRow): string {
  return identityKey(storedIdentity(row));
}

function filledQueryKey(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/**
 * True when today's existing row must stay. A null query key is not a change:
 * both keys have to be present and different. Identity always counts.
 */
export function snapshotIdentityDiffers(
  existing: SnapshotIdentityRow,
  incoming: SnapshotIdentityRow,
): boolean {
  if (storedIdentityKey(existing) !== storedIdentityKey(incoming)) return true;
  const oldKey = filledQueryKey(existing.query_key);
  const newKey = filledQueryKey(incoming.query_key);
  return oldKey != null && newKey != null && oldKey !== newKey;
}

/** Drop same-day writes that would replace a different identity or query key. */
export function rowsKeepingPriorIdentity<T extends SnapshotIdentityRow>(
  existing: readonly SnapshotIdentityRow[],
  incoming: readonly T[],
): T[] {
  const prior = new Map<string, SnapshotIdentityRow>();
  for (const row of existing) {
    if (row.card_key) prior.set(row.card_key, row);
  }
  return incoming.filter((row) => {
    const old = row.card_key ? prior.get(row.card_key) : undefined;
    if (!old) return true;
    return !snapshotIdentityDiffers(old, row);
  });
}

/**
 * Latest public trusted snapshot in the week whose identity and query key
 * still match the week-start row. The start median is the end only when no
 * such row exists. Mirrors leaderboard_rows chosen_end.
 */
export function chosenEndMedian(input: {
  start: LineupSnapshot;
  snapshots: readonly LineupSnapshot[];
  endDate: string;
}): number {
  const startKey = input.start.queryKey ?? null;
  const matches = input.snapshots.filter((row) => {
    if (!row.isPublic) return false;
    if (row.snapshotDate < input.start.snapshotDate || row.snapshotDate > input.endDate) return false;
    const status = row.status ?? "ok";
    if (status !== "ok" && status !== "sample") return false;
    if (!(row.median >= 5) || !(row.nSales >= 2)) return false;
    if (row.identityKey !== input.start.identityKey) return false;
    return (row.queryKey ?? null) === startKey;
  });
  matches.sort((a, b) => (a.snapshotDate < b.snapshotDate ? 1 : a.snapshotDate > b.snapshotDate ? -1 : 0));
  return matches[0]?.median ?? input.start.median;
}
