"use client";

import { useEffect, useState } from "react";
import type { SnapshotRow } from "@/lib/collection/value-series";
import {
  MOVER_HISTORY_DAYS,
  readCardValueHistory,
  readCollectionSnapshots,
  type CardHistory,
} from "@/lib/collection/value-history-read";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";

export { MOVER_HISTORY_DAYS, type CardHistory };

export type CollectionSnapshots = { rows: SnapshotRow[]; loading: boolean };

/** Saved daily collection values, oldest first. Own rows only (RLS). Off when a parent already has them. */
export function useCollectionSnapshots(enabled = true): CollectionSnapshots {
  const [state, setState] = useState<CollectionSnapshots>({ rows: [], loading: enabled });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadSupabaseBrowser()
      .then(async (supabase) => {
        const rows = supabase ? await readCollectionSnapshots(supabase) : [];
        if (!cancelled) setState({ rows, loading: false });
      })
      .catch(() => {
        // supabase-js failed to load: settle like a failed read, so the hero stops loading.
        if (!cancelled) setState({ rows: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}

/**
 * Daily per-card values for the last 30 days, for Top movers. An empty map when
 * the table is not there yet or the read fails: Top movers then uses the price paid.
 */
export function useCardValueHistory(enabled: boolean): CardHistory {
  const [history, setHistory] = useState<CardHistory>(() => new Map());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadSupabaseBrowser()
      .then(async (supabase) => {
        const next = supabase ? await readCardValueHistory(supabase) : null;
        if (!cancelled && next) setHistory(next);
      })
      // supabase-js failed to load: the map stays empty, so Top movers uses the price paid.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return history;
}
