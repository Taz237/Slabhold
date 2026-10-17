const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AuthorSafetyOptions = {
  /** Column that stores the author or actor id. Defaults to user_id. */
  authorColumn?: string;
  /**
   * Also hide authors the viewer muted.
   * Mute is for feeds, replies, collectors' posts, search, and notifications.
   */
  mute?: boolean;
  /** Keep rows whose author column is null (sale alerts have no actor). */
  keepNullAuthor?: boolean;
};

export type SafetyQuery = {
  not: (column: string, operator: string, value: string) => SafetyQuery;
  or: (filters: string) => SafetyQuery;
};

export type HiddenAuthorRpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

function uuidList(ids: readonly string[]): string[] {
  return ids.filter((id) => UUID_RE.test(id));
}

/**
 * Exclude authors returned by hidden_author_ids for the signed-in viewer.
 * The id list comes from SQL; the content query then applies NOT IN in SQL.
 * A null viewer (signed out) leaves the query unchanged.
 * The RPC itself uses auth.uid(), so this cannot filter as someone else.
 */
export function applyAuthorSafety<Q extends SafetyQuery>(
  query: Q,
  viewerId: string | null | undefined,
  hiddenAuthorIds: readonly string[],
  options?: AuthorSafetyOptions,
): Q {
  if (!viewerId) return query;
  const ids = uuidList(hiddenAuthorIds);
  if (ids.length === 0) return query;
  const column = options?.authorColumn ?? "user_id";
  const list = `(${ids.join(",")})`;
  if (options?.keepNullAuthor) {
    return query.or(`${column}.is.null,${column}.not.in.${list}`) as Q;
  }
  return query.not(column, "in", list) as Q;
}

export async function loadHiddenAuthorIds(
  supabase: HiddenAuthorRpc,
  applyMute: boolean,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("hidden_author_ids", {
    apply_mute: applyMute,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return data.filter((id): id is string => typeof id === "string");
}

/**
 * Load the viewer's hidden authors, then apply that exclusion on the query.
 * Returned as `{ query }` so awaiting this does not run a thenable PostgREST builder.
 */
export async function withAuthorSafety<Q extends SafetyQuery>(
  supabase: HiddenAuthorRpc,
  query: Q,
  viewerId: string | null | undefined,
  options?: AuthorSafetyOptions,
): Promise<{ query: Q }> {
  if (!viewerId) return { query };
  const ids = await loadHiddenAuthorIds(supabase, options?.mute === true);
  return { query: applyAuthorSafety(query, viewerId, ids, options) };
}
