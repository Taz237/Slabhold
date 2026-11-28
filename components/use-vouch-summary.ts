"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSocial } from "@/components/social-provider";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import type { VouchSummary } from "@/lib/vouches/core";
import { createSummaryStore, type SummaryStore } from "@/lib/vouches/summary-store";
import { vouchesSupported, vouchSupportKnown } from "@/lib/vouches/support";
import type { VouchBackend } from "@/lib/vouches/types";

/**
 * What a trust line needs, and no more: whether this database has vouches, and a profile's counts.
 * Every profile loads this file, so saving, statuses and the list are in ./use-vouch-store.
 */

export type VouchMode = "local" | "supabase";
type Person = { id: string; username: string; displayName: string; avatarDataUrl?: string | null; accent?: string | null; createdAt?: string | null };

/** What local mode needs to know about this device's people. Refreshed as the provider learns more. */
type Chat = { senderId: string; receiverId: string; createdAt: string }[];
const localContext: { viewer: Person | null; people: Person[]; following: string[]; chat: Chat } = { viewer: null, people: [], following: [], chat: [] };

function setLocalContext(viewer: Person | null, people: Person[], following: string[], chat: Chat) {
  localContext.viewer = viewer;
  localContext.people = people;
  localContext.following = following;
  localContext.chat = chat;
}

/** The backend loads with the first trust line on screen, not with every page. */
export async function vouchBackendFor(mode: VouchMode): Promise<VouchBackend | null> {
  if (mode === "local") {
    const local = await import("@/lib/vouches/local");
    const person = (profile: Person) => ({
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
      chat: localContext.chat,
    });
  }
  const [supabase, remote] = await Promise.all([loadSupabaseBrowser(), import("@/lib/vouches/remote")]);
  return supabase ? remote.remoteVouchBackend(supabase) : null;
}

/** One store per mode and viewer, so a sign-out never shows the last person's vouch state. */
const stores = new Map<string, SummaryStore>();

export function summaryStoreFor(mode: VouchMode, viewerId: string | null): SummaryStore {
  const key = `${mode}:${viewerId ?? "signed-out"}`;
  let store = stores.get(key);
  if (!store) {
    store = createSummaryStore(async (ids) => {
      const backend = await vouchBackendFor(mode);
      return backend ? backend.summaries(ids) : new Map<string, VouchSummary>();
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
 * `supported` is false until this database has the vouches migration: every vouch screen renders
 * nothing until it is true. `pending` is true while that is still being found out, so a screen
 * can hold its place. Local mode always has vouches.
 */
export function useVouchGate(): { mode: VouchMode; viewerId: string | null; supported: boolean; pending: boolean } {
  const { mode, ready, user, profiles, followingOf, messages } = useSocial();
  const known = useSyncExternalStore(subscribeGate, vouchSupportKnown, () => null);
  useEffect(() => {
    if (ready && mode === "supabase") askGate();
  }, [ready, mode]);
  // Before any store's own requests: this effect is declared first, so it runs first.
  useEffect(() => {
    if (mode === "local") setLocalContext(user, profiles, user ? followingOf(user.id).map((profile) => profile.id) : [], messages);
  }, [mode, user, profiles, followingOf, messages]);
  const supported = ready && (mode === "local" || known === true);
  return { mode, viewerId: user?.id ?? null, supported, pending: !supported && (!ready || (mode === "supabase" && known === null)) };
}

/** One profile's vouch counts. Null until vouches are supported here and the counts have loaded. */
export function useVouchSummary(userId: string | null | undefined): { summary: VouchSummary | null; supported: boolean; pending: boolean } {
  const { mode, viewerId, supported, pending } = useVouchGate();
  const store = summaryStoreFor(mode, viewerId);
  const id = supported && userId ? userId : null;
  useEffect(() => {
    if (id) store.request(id);
  }, [store, id]);
  const summary = useSyncExternalStore(
    store.subscribe,
    () => (id ? store.get(id) : null),
    () => null,
  );
  return { summary, supported, pending };
}
