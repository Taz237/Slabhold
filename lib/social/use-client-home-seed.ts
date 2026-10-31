"use client";

import { useEffect, useState } from "react";
import { sessionHinted } from "@/lib/auth/session-hint";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import type { HomeSeed } from "./home-seed";

/** Read Home's first screen in the browser only when nothing else will draw it soon. */
export function wantsClientHomeSeed(input: {
  serverSeed: HomeSeed | null;
  ready: boolean;
  configured: boolean;
  hinted: boolean;
}): boolean {
  return !input.serverSeed && !input.ready && input.configured && input.hinted;
}

/**
 * Home's first screen when the server didn't send one (a visit from inside
 * the app, or a server read that failed) and the site snapshot isn't in yet:
 * the browser reads the same viewer shell, first page, and engagement the
 * server would have. The timeline draws from it exactly as from a server
 * seed and hands over to the provider once its snapshot is ready.
 */
export function useClientHomeSeed(input: {
  serverSeed: HomeSeed | null;
  /** The provider has its snapshot: nothing to stand in for. */
  ready: boolean;
}): HomeSeed | null {
  const [clientSeed, setClientSeed] = useState<HomeSeed | null>(null);
  const wanted = !input.serverSeed && !input.ready;
  useEffect(() => {
    const go = wantsClientHomeSeed({
      serverSeed: null,
      ready: !wanted,
      configured: getSupabaseConfig().configured,
      hinted: sessionHinted(),
    });
    if (!go) return;
    let cancelled = false;
    void (async () => {
      const [client, { loadHomeSeed }] = await Promise.all([
        loadSupabaseBrowser(),
        import("./load-home-seed"),
      ]);
      if (!client || cancelled) return;
      const { data } = await client.auth.getSession();
      const user = data.session?.user;
      if (!user || cancelled) return;
      const seed = await loadHomeSeed(client, { id: user.id, email: user.email ?? "" }, "client");
      if (!cancelled && seed) setClientSeed(seed);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wanted]);
  return input.serverSeed ?? clientSeed;
}
