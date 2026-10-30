import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./client";

let client: SupabaseClient | null = null;
let pending: Promise<SupabaseClient | null> | null = null;

/**
 * The browser client, with supabase-js in its own chunk. The app-wide
 * providers load it after hydration, so it never delays the first paint.
 * Null when Supabase is not configured (local accounts).
 */
export function loadSupabaseBrowser(): Promise<SupabaseClient | null> {
  if (!getSupabaseConfig().configured) return Promise.resolve(null);
  pending ??= import("./browser").then(({ createSupabaseBrowser }) => {
    client = createSupabaseBrowser();
    return client;
  });
  return pending;
}

/** The client once loadSupabaseBrowser has resolved, else null. */
export function loadedSupabaseBrowser(): SupabaseClient | null {
  return client;
}
