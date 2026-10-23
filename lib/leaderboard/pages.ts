type PageResult = { data: unknown; error: { message: string } | null };

export type PageQuery = {
  eq: (column: string, value: string) => PageQuery;
  gte: (column: string, value: string) => PageQuery;
  lt: (column: string, value: string) => PageQuery;
  is: (column: string, value: null) => PageQuery;
  in: (column: string, value: string[]) => PageQuery;
  order: (column: string) => PageQuery;
  range: (from: number, to: number) => PromiseLike<PageResult>;
};

export type PageAdmin = {
  from: (table: string) => { select: (columns: string) => PageQuery };
};

/** Chain every order column. A tie-break that is dropped makes OFFSET pages skip rows. */
export function orderPageQuery<Q extends { order: (column: string) => Q }>(
  query: Q,
  columns: readonly string[],
): Q {
  let next = query;
  for (const column of columns) next = next.order(column);
  return next;
}

function asRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
}

/** Read a table in pages. `orderBy` must be unique for the filtered rows. */
export async function pageRows(
  admin: PageAdmin,
  table: string,
  columns: string,
  orderBy: readonly string[],
  apply: (query: PageQuery) => PageQuery,
  pageSize = LEADERBOARD_PAGE_SIZE,
): Promise<Record<string, unknown>[]> {
  if (orderBy.length === 0) throw new Error(`leaderboard read of ${table} has no order`);
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += pageSize) {
    const query = orderPageQuery(apply(admin.from(table).select(columns)), orderBy);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = asRows(data);
    rows.push(...batch);
    pageExceededCap(table, rows.length, batch.length, pageSize);
    if (batch.length < pageSize) return rows;
  }
}

/** Stop and fail instead of returning a silently truncated read. */
export const LEADERBOARD_ROW_CAP = 20_000;

export const LEADERBOARD_PAGE_SIZE = 1000;

/**
 * A full page at the cap means more rows may exist. Throw so the board
 * shows an error instead of a partial ranking.
 */
export function pageExceededCap(
  table: string,
  loaded: number,
  batchLength: number,
  pageSize = LEADERBOARD_PAGE_SIZE,
  cap = LEADERBOARD_ROW_CAP,
): void {
  if (batchLength < pageSize) return;
  if (loaded >= cap) {
    throw new Error(`leaderboard read of ${table} hit the ${cap} row cap`);
  }
}
