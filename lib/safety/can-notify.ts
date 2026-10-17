export type SafetyRelations = {
  /** True when either person blocked the other. */
  isBlocked(a: string, b: string): Promise<boolean>;
};

/**
 * False when either person blocked the other.
 * Mute is applied when the recipient reads, not from the sender's browser.
 * A missing actor (a sale alert) can still notify.
 */
export async function canNotify(
  relations: SafetyRelations,
  actorId: string | null,
  recipientId: string,
): Promise<boolean> {
  if (!actorId) return true;
  if (actorId === recipientId) return false;
  if (await relations.isBlocked(actorId, recipientId)) return false;
  return true;
}

type RpcError = { code?: string; message?: string };

export type SafetyRpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function missingFunction(error: RpcError | null) {
  if (!error) return false;
  return error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
}

/**
 * Adapter for canNotify. Uses can_interact, which checks auth.uid() against
 * the other id and returns whether that pair is clear to interact.
 * A failed check blocks the notification.
 */
export function supabaseSafety(supabase: SafetyRpc): SafetyRelations {
  return {
    async isBlocked(_actorId, otherId) {
      const { data, error } = await supabase.rpc("can_interact", { other: otherId });
      if (missingFunction(error)) return false;
      if (error) return true;
      return data !== true;
    },
  };
}
