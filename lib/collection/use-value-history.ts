"use client";

import { useEffect, useState } from "react";
import { addDays } from "@/lib/chart/range";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import { CARD_VALUE_HISTORY_TABLE, numericFromUnknown } from "@/lib/collection/card-value-history";
import type { SnapshotRow } from "@/lib/collection/value-series";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export type CollectionSnapshots = { rows: SnapshotRow[]; loading: boolean };

/** Saved daily collection values, oldest first. Own rows only (RLS). Off when a parent already has them. */
export function useCollectionSnapshots(enabled = true): CollectionSnapshots {
  const [state, setState] = useState<CollectionSnapshots>({ rows: [], loading: enabled });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const supabase = createSupabaseBrowser();
    if (!supabase) {
      queueMicrotask(() => {
        if (!cancelled) setState({ rows: [], loading: false });
      });
      return;
    }
    void supabase
      .from("collection_snapshots")
      .select("snapshot_date, value")
      .order("snapshot_date", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        setState({
          rows: error
            ? []
            : (data ?? []).map((row) => ({
                snapshot_date: String(row.snapshot_date),
                value: Number(row.value) || 0,
              })),
          loading: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}

/** Days of per-card history read for Top movers. */
export const MOVER_HISTORY_DAYS = 30;

export type CardHistory = Map<string, { date: string; value: number }[]>;

/**
 * Daily per-card values for the last 30 days, for Top movers. An empty map when
 * the table is not there yet or the read fails: Top movers then uses the price paid.
 */
export function useCardValueHistory(enabled: boolean): CardHistory {
  const [history, setHistory] = useState<CardHistory>(() => new Map());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    const since = addDays(snapshotDateInNewYork(), -MOVER_HISTORY_DAYS);
    void supabase
      .from(CARD_VALUE_HISTORY_TABLE)
      .select("card_id, snapshot_date, median")
      .gte("snapshot_date", since)
      .order("snapshot_date", { ascending: true })
      .limit(5000)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const next: CardHistory = new Map();
        for (const row of data as { card_id: string; snapshot_date: string; median: unknown }[]) {
          const value = numericFromUnknown(row.median);
          if (value == null) continue;
          const list = next.get(row.card_id) ?? [];
          list.push({ date: String(row.snapshot_date), value });
          next.set(row.card_id, list);
        }
        setHistory(next);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return history;
}
