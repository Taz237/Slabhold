"use client";

import { useEffect, useSyncExternalStore } from "react";
import { summaryStoreFor, useVouchGate, vouchBackendFor, type VouchMode } from "@/components/use-vouch-summary";
import { VOUCH_FAILED } from "@/lib/vouches/core";
import { createVouchStore, type VouchStore } from "@/lib/vouches/store";
import type { VouchBackend, VouchStatus } from "@/lib/vouches/types";

/**
 * The full vouch store, for screens where someone can read the list, vouch or reply. It shares its
 * counts with the trust line's store (./use-vouch-summary), so a save updates the line too.
 */

const stores = new Map<string, VouchStore>();
const UNAVAILABLE = { ok: false as const, error: VOUCH_FAILED, hint: null };

function storeFor(mode: VouchMode, viewerId: string | null): VouchStore {
  const key = `${mode}:${viewerId ?? "signed-out"}`;
  let store = stores.get(key);
  if (!store) {
    const call = async <T,>(run: (backend: VouchBackend) => Promise<T>, missing: T): Promise<T> => {
      const backend = await vouchBackendFor(mode);
      return backend ? run(backend) : missing;
    };
    store = createVouchStore(
      {
        summaries: (ids) => call((backend) => backend.summaries(ids), new Map()),
        list: (subjectId, options) => call((backend) => backend.list(subjectId, options), { rows: [], next: null }),
        status: (subjectId) => call((backend) => backend.status(subjectId), { canVouch: false, reason: null, mine: null }),
        upsert: (subjectId, rating, note) => call((backend) => backend.upsert(subjectId, rating, note), UNAVAILABLE),
        remove: (subjectId) => call((backend) => backend.remove(subjectId), UNAVAILABLE),
        reply: (vouchId, text) => call((backend) => backend.reply(vouchId, text), UNAVAILABLE),
      },
      undefined,
      summaryStoreFor(mode, viewerId),
    );
    stores.set(key, store);
  }
  return store;
}

/** The vouch store for whoever is signed in, behind the same gate as the trust line. */
export function useVouchStore(): { store: VouchStore; viewerId: string | null; supported: boolean; pending: boolean } {
  const { mode, viewerId, supported, pending } = useVouchGate();
  return { store: storeFor(mode, viewerId), viewerId, supported, pending };
}

/** Whether the signed-in reader can vouch for this person, and the vouch they left. Null until it loads. */
export function useVouchStatus(subjectId: string | null | undefined): VouchStatus | null {
  const { store, viewerId, supported } = useVouchStore();
  const id = supported && viewerId && subjectId && subjectId !== viewerId ? subjectId : null;
  useEffect(() => {
    if (id) store.requestStatus(id);
  }, [store, id]);
  return useSyncExternalStore(
    store.subscribe,
    () => (id ? store.status(id) : null),
    () => null,
  );
}
