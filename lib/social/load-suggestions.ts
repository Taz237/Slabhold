import type { SupabaseClient } from "@supabase/supabase-js";
import { rpcMissing } from "./collect-interests";
import { officialUpdatesUserId } from "./official-updates";
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

/**
 * How many collectors Home asks the server for: the rail's 8, then enough
 * for a few inline "Who to follow" cards (3 each) without repeating anyone.
 * Was 12, which left one inline card. suggest_collectors caps at 30.
 */
export const SUGGESTION_DISPLAY_LIMIT = 20;

/** First-run setup still lists the top 12. */
export const SETUP_SUGGESTION_LIMIT = 12;

/** Packed sport marks are not part of the sentence a collector sees. */
export function visibleSuggestionReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const cleaned = reason.replace(/[\u2060\u200B-\u200D\u2062\u2063]/g, "");
  return cleaned.trim() ? cleaned : null;
}

/** Null when the ranking function is not installed yet. Callers keep the old list. */
export async function loadServerSuggestions(
  supabase: SupabaseClient,
): Promise<ServerSuggestion[] | null> {
  const { data, error } = await supabase.rpc("suggest_collectors", {
    max_results: SUGGESTION_DISPLAY_LIMIT,
  });
  if (error) {
    if (!rpcMissing(error)) console.warn("suggest_collectors", error.message);
    return null;
  }
  const officialId = officialUpdatesUserId();
  return ((data ?? []) as RpcRow[])
    .filter((row) => Boolean(row.user_id && row.username))
    .filter((row) => !officialId || row.user_id?.toLowerCase() !== officialId)
    .map((row) => ({
      userId: row.user_id ?? "",
      username: row.username ?? "",
      displayName: row.display_name || row.username || "",
      avatarUrl: row.avatar_url ?? null,
      accent: row.accent ?? null,
      reason: visibleSuggestionReason(row.reason),
      score: Number(row.score ?? 0),
    }));
}
