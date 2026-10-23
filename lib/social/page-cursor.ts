/** Keyset cursor. `id` is the row id, or the follow edge's person id when the table has no id column. */
export type PageCursor = {
  createdAt: string;
  id: string;
};

function quoteFilterValue(value: string) {
  return `"${value.replaceAll('"', "")}"`;
}

/**
 * PostgREST `or` filter for rows strictly older than the cursor.
 * Same `created_at` ties break on `idColumn` descending, matching `.order(idColumn, { ascending: false })`.
 */
export function olderThanCursor(cursor: PageCursor, idColumn = "id"): string {
  const ts = quoteFilterValue(cursor.createdAt);
  const id = quoteFilterValue(cursor.id);
  return [`created_at.lt.${ts}`, `and(created_at.eq.${ts},${idColumn}.lt.${id})`].join(",");
}

/** Full page means another page may exist. The cursor is the oldest row in this page. */
export function pageAfter(
  rows: readonly { id: string; created_at: string }[],
  pageSize: number,
): { hasMore: boolean; cursor: PageCursor | null } {
  if (rows.length < pageSize) return { hasMore: false, cursor: null };
  const last = rows[rows.length - 1];
  if (!last?.id || !last.created_at) return { hasMore: false, cursor: null };
  return { hasMore: true, cursor: { createdAt: last.created_at, id: last.id } };
}
