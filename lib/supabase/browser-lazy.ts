import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./client";

type BrowserModule = { createSupabaseBrowser: () => SupabaseClient | null };

/**
 * One shared client behind a lazy import. A failed load is never kept:
 * the next call imports again (a chunk can fail on a flaky network or
 * across a deploy).
 */
export function lazyBrowserClient(importBrowser: () => Promise<BrowserModule>, configured: () => boolean) {
  let client: SupabaseClient | null = null;
  let pending: Promise<SupabaseClient | null> | null = null;

  function load(): Promise<SupabaseClient | null> {
    if (!configured()) return Promise.resolve(null);
    pending ??= importBrowser()
      .then(({ createSupabaseBrowser }) => {
        client = createSupabaseBrowser();
        return client;
      })
      .catch((error: unknown) => {
        pending = null;
        throw error;
      });
    return pending;
  }

  return { load, loaded: () => client };
}

/**
 * loadSupabaseBrowser: the browser client, with supabase-js in its own chunk.
 * The app-wide providers load it after hydration, so it never delays the
 * first paint. Null when Supabase is not configured (local accounts).
 * loadedSupabaseBrowser: the client once that has resolved, else null.
 */
export const { load: loadSupabaseBrowser, loaded: loadedSupabaseBrowser } = lazyBrowserClient(
  () => import("./browser"),
  () => getSupabaseConfig().configured,
);
