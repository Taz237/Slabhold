/** Whether this database has the vouches migration yet. Tiny, so any screen can ask without loading the rest. */

type DbError = { code?: string; message?: string } | null;

/** True when the vouch functions or tables are not in this database yet. */
export function vouchesMissing(error: DbError): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42883" || error.code === "42P01") return true;
  return /could not find the function|schema cache/i.test(error.message ?? "");
}

let support: boolean | null = null;
let asking: Promise<boolean> | null = null;

type RpcProbe = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: DbError }>;
};

/**
 * False until the vouches migration is in this database. Every vouch screen renders nothing until
 * this is true. An empty vouch_summaries call is the probe: it reads no rows.
 *
 * A clear answer (it worked, or the function is missing) is kept for the session. Anything else
 * (offline, a timeout) reads as "not yet" and is asked again next time.
 */
export async function vouchesSupported(supabase: RpcProbe): Promise<boolean> {
  if (support != null) return support;
  if (asking) return asking;
  asking = (async () => {
    try {
      const { error } = await supabase.rpc("vouch_summaries", { p_user_ids: [] });
      if (!error) support = true;
      else if (vouchesMissing(error)) support = false;
      return support ?? false;
    } catch {
      return false;
    } finally {
      asking = null;
    }
  })();
  return asking;
}

/** The answer so far, without asking: null until the probe has a clear one. */
export function vouchSupportKnown(): boolean | null {
  return support;
}

export function resetVouchSupport() {
  support = null;
  asking = null;
}
