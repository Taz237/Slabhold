/** Drop collections the viewer blocked or that blocked the viewer. */
export function withoutBlocked<T extends { userId: string }>(
  rows: readonly T[],
  hiddenIds: ReadonlySet<string>,
): T[] {
  if (hiddenIds.size === 0) return [...rows];
  return rows.filter((row) => !hiddenIds.has(row.userId));
}

/**
 * Combine block ids. leaderboard_hidden_ids returns uuids. A failed list hides
 * the board for that viewer.
 */
export function viewerBlockIds(
  results: readonly { error?: unknown; data?: unknown }[],
): Set<string> | null {
  if (results.some((result) => result.error)) return null;
  return blockedUserIds(results.map((result) => result.data));
}

export function blockedUserIds(lists: readonly unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === "string") {
        if (item.length > 0) ids.add(item);
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const blocker = (item as { blocker_id?: unknown }).blocker_id;
      if (typeof blocker === "string" && blocker.length > 0) ids.add(blocker);
    }
  }
  return ids;
}
