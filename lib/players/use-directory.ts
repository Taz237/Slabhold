"use client";

import { useSyncExternalStore } from "react";
import type { IndexedDirectoryPlayer } from "./types";

export type PlayerDirectoryStatus = "loading" | "ready" | "error";

export type PlayerDirectorySnapshot = {
  players: readonly IndexedDirectoryPlayer[];
  status: PlayerDirectoryStatus;
  retry: () => void;
};

let started = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function startLoad() {
  if (started) return;
  started = true;
  void import("@/lib/players/directory")
    .then((mod) => {
      snapshot = {
        players: mod.INDEXED_DIRECTORY,
        status: "ready",
        retry: retryLoad,
      };
      emit();
    })
    .catch(() => {
      started = false;
      snapshot = { players: [], status: "error", retry: retryLoad };
      emit();
    });
}

function retryLoad() {
  if (snapshot.status === "loading") return;
  started = false;
  snapshot = INITIAL;
  emit();
  startLoad();
}

const INITIAL: PlayerDirectorySnapshot = {
  players: [],
  status: "loading",
  retry: retryLoad,
};

let snapshot: PlayerDirectorySnapshot = INITIAL;

function subscribe(listener: () => void) {
  listeners.add(listener);
  startLoad();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return INITIAL;
}

/** Loads the roster the first time the name search is on screen. */
export function usePlayerDirectory(): PlayerDirectorySnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
