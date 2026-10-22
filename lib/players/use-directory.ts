"use client";

import { useSyncExternalStore } from "react";
import type { DirectoryPlayer } from "./types";

export type PlayerDirectorySnapshot = {
  players: readonly DirectoryPlayer[];
  ready: boolean;
};

const EMPTY: PlayerDirectorySnapshot = { players: [], ready: false };

let snapshot: PlayerDirectorySnapshot = EMPTY;
let started = false;
const listeners = new Set<() => void>();

function emit(next: PlayerDirectorySnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function retain() {
  if (started) return;
  started = true;
  // Separate chunk so the collect step does not ship the roster in the main bundle.
  void import("@/lib/players/directory")
    .then((mod) => {
      emit({ players: mod.PLAYER_DIRECTORY, ready: true });
    })
    .catch(() => {
      emit({ players: [], ready: true });
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  retain();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return EMPTY;
}

/** Loads the roster the first time the name search is on screen. */
export function usePlayerDirectory(): PlayerDirectorySnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
