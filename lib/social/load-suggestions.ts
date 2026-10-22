import type { SupabaseClient } from "@supabase/supabase-js";
import { rpcMissing } from "./collect-interests";
import type { ServerSuggestion } from "./suggestion-order";

type RpcRow = {
  user_id?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
  accent?: string | null;
  reason?: string | null;
  score?: number | null;
};

/** Null when the ranking function is not installed yet. Callers keep the old list. */
export async function loadServerSuggestions(
  supabase: SupabaseClient,
): Promise<ServerSuggestion[] | null> {
  const { data, error } = await supabase.rpc("suggest_collectors", { max_results: 12 });
  if (error) {
    if (!rpcMissing(error)) console.warn("suggest_collectors", error.message);
    return null;
  }
  return ((data ?? []) as RpcRow[])
    .filter((row) => Boolean(row.user_id && row.username))
    .map((row) => ({
      userId: row.user_id ?? "",
      username: row.username ?? "",
      displayName: row.display_name || row.username || "",
      avatarUrl: row.avatar_url ?? null,
      accent: row.accent ?? null,
      reason: row.reason ?? null,
      score: Number(row.score ?? 0),
    }));
}
