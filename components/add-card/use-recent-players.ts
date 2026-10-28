"use client";

import { useSyncExternalStore } from "react";
import {
  RECENT_PLAYERS_KEY,
  readRecentPlayers,
  rememberRecentPlayer,
} from "@/lib/cards/add-flow-players";

const listeners = new Set<() => void>();
let cache: { raw: string | null; list: string[] } = { raw: null, list: [] };
const EMPTY: string[] = [];

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function snapshot(): string[] {
  const store = storage();
  let raw: string | null = null;
  try {
    raw = store?.getItem(RECENT_PLAYERS_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, list: readRecentPlayers(store) };
  return cache.list;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Last 5 players picked on this device. Empty on the server. */
export function useRecentPlayers(): string[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

export function rememberPlayer(name: string): void {
  rememberRecentPlayer(storage(), name);
  for (const listener of listeners) listener();
}
