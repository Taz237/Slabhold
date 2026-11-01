import "server-only";

import { rpcMissing } from "@/lib/social/collect-interests";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type PruneClient = {
  rpc(fn: "prune_invite_code_resets"): PromiseLike<{
    error: { code?: string; message: string } | null;
  }>;
};

/**
 * Daily cron: drop private.invite_code_resets rows older than 2 days.
 * The reset limit only looks back 24 hours. Never throws.
 */
export async function pruneInviteCodeResets(
  client: PruneClient | null = createSupabaseAdmin(),
): Promise<boolean> {
  if (!client) {
    console.warn("[invite_code_resets] prune skipped: no admin client");
    return false;
  }

  try {
    const { error } = await client.rpc("prune_invite_code_resets");
    if (error) {
      const message = rpcMissing(error)
        ? `migration isn't applied yet (${error.message})`
        : error.message;
      console.warn("[invite_code_resets] prune failed:", message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(
      "[invite_code_resets] prune failed:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}
