/** Drop collections the viewer blocked or that blocked the viewer. */
export function withoutBlocked<T extends { userId: string }>(
  rows: readonly T[],
  hiddenIds: ReadonlySet<string>,
): T[] {
  if (hiddenIds.size === 0) return [...rows];
  return rows.filter((row) => !hiddenIds.has(row.userId));
}
