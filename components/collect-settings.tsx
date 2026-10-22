"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  NameSearch,
  SportChips,
  toggleName,
  toggleSport,
  useCollectSports,
  withoutName,
} from "@/components/collect-editor";
import { useSocial } from "@/components/social-provider";
import {
  canAddPick,
  interestWriteRows,
  persistInterestRows,
  PICK_LIMIT,
  PICK_LIMIT_MESSAGE,
  picksFromRows,
  schemaMissing,
  type InterestRow,
} from "@/lib/social/collect-interests";
import type { CollectInterest } from "@/lib/social/follow-rank";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export function CollectSettings() {
  const router = useRouter();
  const { user, ready, refreshSuggestions, mode } = useSocial();
  const [state, setState] = useState<"loading" | "missing" | "ready">("loading");
  const [sports, setSports] = useState<string[]>([]);
  const [names, setNames] = useState<CollectInterest[]>([]);
  const [catalogSports, setCatalogSports] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sportOptions = useCollectSports(catalogSports);

  useEffect(() => {
    if (!ready || !user || mode !== "supabase") return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    void supabase
      .from("profile_interests")
      .select("kind, value")
      .eq("user_id", user.id)
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        if (loadError) {
          if (!schemaMissing(loadError)) console.warn("profile_interests", loadError.message);
          setState("missing");
          return;
        }
        const rows = ((data ?? []) as { kind?: string; value?: string }[])
          .filter((row) => row.kind && row.value)
          .map((row) => ({ kind: row.kind, value: row.value }) as InterestRow);
        const picks = picksFromRows(rows);
        setSports(picks.filter((pick) => pick.kind === "sport").map((pick) => pick.value));
        setNames(picks.filter((pick) => pick.kind !== "sport"));
        setState("ready");
      });
    void supabase
      .from("card_catalog")
      .select("sport")
      .limit(400)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setCatalogSports(
          (data as { sport?: string | null }[]).map((row) => row.sport ?? "").filter(Boolean),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [mode, ready, user]);

  async function save() {
    if (!user) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) {
      setState("missing");
      return;
    }
    setSaving(true);
    setError(null);
    const picks = [
      ...sports.map((value) => ({ kind: "sport" as const, value })),
      ...names,
    ];
    const rows = interestWriteRows("complete", picks);
    const saved = await persistInterestRows(supabase, user.id, rows);
    setSaving(false);
    if (saved === "missing") {
      setState("missing");
      return;
    }
    if (saved === "limit") {
      setError(PICK_LIMIT_MESSAGE);
      return;
    }
    if (saved === "error") {
      setError("Could not save that.");
      return;
    }
    refreshSuggestions();
    router.push("/profile");
  }

  if (!ready) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (!user) return null;
  if (mode !== "supabase" || state === "missing") {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">What you collect</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Collecting preferences are not available in this browser yet.
        </p>
      </div>
    );
  }
  if (state === "loading") return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">What you collect</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Sports, teams, and players. This is what we use to suggest collectors.
      </p>
      <div className="mt-5">
        <SportChips
          sports={sportOptions}
          selected={sports}
          onToggle={(sport) => {
            const removing = sports.some((item) => item.toLowerCase() === sport.toLowerCase());
            if (!removing && !canAddPick(sports.length + names.length)) {
              setError(PICK_LIMIT_MESSAGE);
              return;
            }
            setError(null);
            setSports((current) => toggleSport(current, sport));
          }}
        />
      </div>
      <div className="mt-6">
        <NameSearch
          sports={sports}
          selected={names}
          onAdd={(hit) => {
            const exists = names.some(
              (pick) => pick.kind === hit.kind && pick.value.toLowerCase() === hit.value.toLowerCase(),
            );
            if (!exists && !canAddPick(sports.length + names.length)) {
              setError(PICK_LIMIT_MESSAGE);
              return;
            }
            setError(null);
            setNames((current) => toggleName(current, hit));
          }}
          onRemove={(hit) => {
            setError(null);
            setNames((current) => withoutName(current, hit));
          }}
        />
      </div>
      {sports.length + names.length >= PICK_LIMIT && !error ? (
        <p className="mt-3 text-sm text-zinc-500">{PICK_LIMIT_MESSAGE}</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-bold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
        >
          {saving ? "Saving" : "Save"}
        </button>
        <Link
          href="/profile"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-5 text-sm font-bold dark:border-white/15"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
