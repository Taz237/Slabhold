"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Star } from "lucide-react";
import { HunterPrompt } from "@/components/hunter-setting";
import { EmptyState } from "@/components/status";
import { money } from "@/lib/format";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { formatCardValueLabel } from "@/lib/value/format";
import type { CardValueResult } from "@/lib/value/types";

type WantItem = {
  id: string;
  label: string;
  targetPrice: number | null;
  value: CardValueResult | null;
  deal: boolean;
};

const WANT_LIST_TIMEOUT_MS = 10_000;

export function WantList() {
  const [wants, setWants] = useState<WantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), WANT_LIST_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const response = await fetch("/api/wants", { signal: controller.signal });
      const payload = (await response.json()) as { wants?: WantItem[]; error?: string };
      if (signal?.aborted) return;
      if (!response.ok) {
        setError(payload.error ?? "Couldn't load your want list.");
        setWants([]);
        return;
      }
      setWants(payload.wants ?? []);
    } catch {
      if (signal?.aborted) return;
      setError("Couldn't load your want list.");
      setWants([]);
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function remove(id: string) {
    const supabase = await loadSupabaseBrowser();
    if (!supabase) return;
    const { error: deleteError } = await supabase.from("want_list").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setWants((current) => current.filter((want) => want.id !== id));
  }

  let body: ReactNode;
  if (loading) {
    body = <div className="h-24 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />;
  } else if (error) {
    body = (
      <p className="text-sm text-rose-600 dark:text-rose-400">
        {error}{" "}
        <button type="button" onClick={() => void load()} className="font-semibold underline">
          Retry
        </button>
      </p>
    );
  } else if (wants.length === 0) {
    body = (
      <EmptyState
        icon={<Star className="h-5 w-5" />}
        title="Want list"
        detail="Star any card to track it here."
      />
    );
  } else {
    body = (
    <ul className="space-y-3">
      {wants.map((want) => (
        <li
          key={want.id}
          className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-5">{want.label}</p>
              <p className="mt-1 text-xs text-zinc-500">
                Target {want.targetPrice != null ? money(want.targetPrice) : "No target"}
              </p>
              <p className="mt-0.5 text-sm tabular-nums">{formatCardValueLabel(want.value)}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              {want.deal ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  Deal
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void remove(want.id)}
                className="text-xs font-semibold text-zinc-500 hover:text-rose-600"
              >
                Remove
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
    );
  }

  return (
    <div className="space-y-3">
      <HunterPrompt />
      {body}
    </div>
  );
}
