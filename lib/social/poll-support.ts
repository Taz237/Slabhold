/** Whether this database has the polls migration yet. Tiny, so the composer can ask without loading the rest. */

/** True when the poll functions or tables are not in this database yet. */
export function pollsMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42883" || error.code === "42P01") return true;
  return /could not find the function|schema cache/i.test(error.message ?? "");
}

let pollSupport: boolean | null = null;

type TableProbe = {
  from(table: string): { select(columns: string): { limit(count: number): PromiseLike<{ error: { code?: string; message?: string } | null }> } };
};

/** False until the polls migration is in this database. The poll button stays hidden until then. */
export async function postsSupportPolls(supabase: TableProbe): Promise<boolean> {
  if (pollSupport != null) return pollSupport;
  const { error } = await supabase.from("polls").select("id").limit(1);
  // Only a missing table turns polls off. Any other error leaves them on.
  pollSupport = !pollsMissing(error);
  return pollSupport;
}

export function resetPollSupport() {
  pollSupport = null;
}
