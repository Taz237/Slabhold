"use client";

import { useSyncExternalStore } from "react";
import { useSocial } from "@/components/social-provider";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { createPollStore, type PollBackend, type PollStore } from "@/lib/social/poll-store";
import type { PollCounts } from "@/lib/social/polls";

/** One store per mode and viewer, so a sign-out never shows the last person's votes. */
const stores = new Map<string, PollStore>();

/** The backend loads with the first poll on screen, not with every page. */
async function backendFor(mode: "local" | "supabase"): Promise<PollBackend | null> {
  if (mode === "local") return (await import("@/lib/social/poll-local")).localPollBackend();
  const [supabase, remote] = await Promise.all([loadSupabaseBrowser(), import("@/lib/social/poll-remote")]);
  return supabase ? remote.remotePollBackend(supabase) : null;
}

function storeFor(mode: "local" | "supabase", viewerId: string | null): PollStore {
  const key = `${mode}:${viewerId ?? "signed-out"}`;
  let store = stores.get(key);
  if (!store) {
    store = createPollStore({
      async load(ids) {
        const backend = await backendFor(mode);
        return backend ? backend.load(ids) : new Map();
      },
      async vote(pollId, optionId) {
        const backend = await backendFor(mode);
        return backend ? backend.vote(pollId, optionId) : { error: "Couldn't save your vote. Try again." };
      },
    });
    stores.set(key, store);
  }
  return store;
}

/** The poll store for whoever is signed in, and whether it can be read yet. */
export function usePollStore(): { store: PollStore; ready: boolean } {
  const { mode, ready, user } = useSocial();
  return { store: storeFor(mode, user?.id ?? null), ready };
}

/** One poll's counts. Null until they load. */
export function usePollCounts(store: PollStore, pollId: string): PollCounts | null {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get(pollId),
    () => null,
  );
}
