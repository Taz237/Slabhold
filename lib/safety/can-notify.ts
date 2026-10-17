export type SafetyRelations = {
  isBlocked(a: string, b: string): Promise<boolean>;
  /** True when `viewer` muted `author`. One direction only. */
  isMuted(viewer: string, author: string): Promise<boolean>;
};

/**
 * False when either person blocked the other, or the recipient muted the actor.
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
  if (await relations.isMuted(recipientId, actorId)) return false;
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

/** Adapter for canNotify. A failed check blocks the notification. */
export function supabaseSafety(supabase: SafetyRpc): SafetyRelations {
  return {
    async isBlocked(a, b) {
      const { data, error } = await supabase.rpc("is_blocked", { a, b });
      if (missingFunction(error)) return false;
      if (error) return true;
      return data === true;
    },
    async isMuted(viewer, author) {
      const { data, error } = await supabase.rpc("is_muted", { viewer, author });
      if (missingFunction(error)) return false;
      if (error) return true;
      return data === true;
    },
  };
}
