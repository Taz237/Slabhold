"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSocial } from "@/components/social-provider";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import type { VouchSummary } from "@/lib/vouches/rules";
import { createVouchStore, type VouchStore } from "@/lib/vouches/store";
import { vouchesSupported, vouchSupportKnown } from "@/lib/vouches/support";
import type { VouchBackend, VouchStatus } from "@/lib/vouches/types";

type Mode = "local" | "supabase";
type Viewer = { id: string; username: string; displayName: string; avatarDataUrl?: string | null; accent?: string | null; createdAt?: string | null };

/** One store per mode and viewer, so a sign-out never shows the last person's vouch state. */
const stores = new Map<string, VouchStore>();
/** What local mode needs to know about this device's people. Refreshed as the provider learns more. */
const localContext: { viewer: Viewer | null; people: Viewer[]; following: string[] } = { viewer: null, people: [], following: [] };

function setLocalContext(viewer: Viewer | null, people: Viewer[], following: string[]) {
  localContext.viewer = viewer;
  localContext.people = people;
  localContext.following = following;
}

/** The backend loads with the first trust line on screen, not with every page. */
async function backendFor(mode: Mode): Promise<VouchBackend | null> {
  if (mode === "local") {
    const local = await import("@/lib/vouches/local");
    const person = (profile: Viewer) => ({
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarDataUrl ?? null,
      accent: profile.accent ?? null,
      createdAt: profile.createdAt ?? null,
    });
    return local.localVouchBackend({
      viewer: localContext.viewer ? person(localContext.viewer) : null,
      people: localContext.people.map(person),
      following: localContext.following,
    });
  }
  const [supabase, remote] = await Promise.all([loadSupabaseBrowser(), import("@/lib/vouches/remote")]);
  return supabase ? remote.remoteVouchBackend(supabase) : null;
}

const UNAVAILABLE = { ok: false as const, error: "Couldn't save that. Try again.", hint: null };

function storeFor(mode: Mode, viewerId: string | null): VouchStore {
  const key = `${mode}:${viewerId ?? "signed-out"}`;
  let store = stores.get(key);
  if (!store) {
    const call = async <T,>(run: (backend: VouchBackend) => Promise<T>, missing: T): Promise<T> => {
      const backend = await backendFor(mode);
      return backend ? run(backend) : missing;
    };
    store = createVouchStore({
      summaries: (ids) => call((backend) => backend.summaries(ids), new Map<string, VouchSummary>()),
      list: (subjectId, options) => call((backend) => backend.list(subjectId, options), { rows: [], next: null }),
      status: (subjectId) => call((backend) => backend.status(subjectId), { canVouch: false, reason: null, mine: null }),
      upsert: (subjectId, rating, note) => call((backend) => backend.upsert(subjectId, rating, note), UNAVAILABLE),
      remove: (subjectId) => call((backend) => backend.remove(subjectId), UNAVAILABLE),
      reply: (vouchId, text) => call((backend) => backend.reply(vouchId, text), UNAVAILABLE),
    });
    stores.set(key, store);
  }
  return store;
}

/** Whether this database has vouches yet. Asked once per session, shared by every screen. */
const gateListeners = new Set<() => void>();
let gateAsked = false;

function subscribeGate(listener: () => void) {
  gateListeners.add(listener);
  return () => {
    gateListeners.delete(listener);
  };
}

function askGate() {
  if (gateAsked || vouchSupportKnown() != null) return;
  gateAsked = true;
  void loadSupabaseBrowser()
    .then((supabase) => (supabase ? vouchesSupported(supabase) : false))
    .catch(() => false)
    .finally(() => {
      // No clear answer (offline): the next screen that mounts asks again.
      if (vouchSupportKnown() == null) gateAsked = false;
      for (const listener of gateListeners) listener();
    });
}

/**
 * The vouch store for whoever is signed in. `supported` is false until this database has the
 * vouches migration: every vouch screen renders nothing until it is true. Local mode always has them.
 */
export function useVouchStore(): { store: VouchStore; supported: boolean } {
  const { mode, ready, user, profiles, followingOf } = useSocial();
  const known = useSyncExternalStore(subscribeGate, vouchSupportKnown, () => null);
  useEffect(() => {
    if (ready && mode === "supabase") askGate();
  }, [ready, mode]);
  // Before the store's own requests: this hook's effect is declared first, so it runs first.
  useEffect(() => {
    if (mode === "local") setLocalContext(user, profiles, user ? followingOf(user.id).map((profile) => profile.id) : []);
  }, [mode, user, profiles, followingOf]);
  return { store: storeFor(mode, user?.id ?? null), supported: ready && (mode === "local" || known === true) };
}

/** One profile's vouch counts. Null until vouches are supported here and the counts have loaded. */
export function useVouchSummary(userId: string | null | undefined): { summary: VouchSummary | null; supported: boolean } {
  const { store, supported } = useVouchStore();
  const id = supported && userId ? userId : null;
  useEffect(() => {
    if (id) store.request(id);
  }, [store, id]);
  const summary = useSyncExternalStore(
    store.subscribe,
    () => (id ? store.summary(id) : null),
    () => null,
  );
  return { summary, supported };
}

/** Whether the signed-in reader can vouch for this person, and the vouch they left. Null until it loads. */
export function useVouchStatus(subjectId: string | null | undefined): VouchStatus | null {
  const { store, supported } = useVouchStore();
  const { user } = useSocial();
  const id = supported && user && subjectId && subjectId !== user.id ? subjectId : null;
  useEffect(() => {
    if (id) store.requestStatus(id);
  }, [store, id]);
  return useSyncExternalStore(
    store.subscribe,
    () => (id ? store.status(id) : null),
    () => null,
  );
}
